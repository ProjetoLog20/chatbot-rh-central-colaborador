const express = require('express');
const OpenAI = require('openai');
const { authenticateToken } = require('../authMiddleware');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_ITEMS = 8;
const FALLBACK_REPLY = 'Tive uma instabilidade agora. Tente novamente em alguns instantes ou procure o RH.';
const DISABLED_REPLY = 'Oi! Eu sou o Yuri, assistente de RH da LOG20. A IA esta temporariamente desativada. Caso precise de apoio, procure o RH.';
const SENSITIVE_REPLY = 'Por seguranca, nao posso consultar ou revelar dados sensiveis nem informacoes de outro colaborador. Quando o assunto envolver contestacao, pagamento, prontuario, SKAP, premio ou dados pessoais, procure o RH para conferencia.';

const BASE_PROMPT = [
  'Voce e Yuri, a cobrinha mascote da LOG20 Cascavel e Assistente de RH da Central do Colaborador.',
  'Responda de forma simples, educada, acolhedora e objetiva.',
  'Ajude colaboradores com duvidas sobre primeiro acesso, senha temporaria, Pesquisa de Clima, SKAP, Prontuario do Motorista, Premio de Produtividade, 3Rs, Campeao de Seguranca, Ouvidoria e uso da Central.',
  'Nao invente dados.',
  'Nao revele informacoes de outros colaboradores.',
  'Nao prometa alterar dados sozinho.',
  'Respeite as regras de perfil do sistema.',
  'Quando o assunto envolver contestacao, pagamento, prontuario, SKAP, premio, dados pessoais ou algo sensivel, oriente o colaborador a procurar o RH.',
  'Use no maximo 2 paragrafos curtos.'
].join('\n');

function isAiEnabled() {
  return String(process.env.YURI_AI_ENABLED || '').toLowerCase() === 'true';
}

function sanitizeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[token oculto]')
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, 'OPENAI_API_KEY=[oculta]')
    .replace(/DATABASE_URL\s*=\s*\S+/gi, 'DATABASE_URL=[oculta]')
    .slice(0, maxLength)
    .trim();
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeText(item?.content || item?.text || '', 700)
    }))
    .filter((item) => item.content);
}

function getUserContext(user) {
  const name = user?.nome_preferido || user?.nome_completo || 'colaborador';
  return [
    `Usuario logado: ${name}`,
    `ID interno: ${user?.id || 'nao informado'}`,
    `Perfil: ${user?.perfil || 'nao informado'}`
  ].join('\n');
}

function isSensitiveRequest(message) {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const asksOtherPerson =
    /(outro|outra|colega|colaborador|funcionario|motorista|ajudante).*(dados|cpf|salario|pagamento|senha|matricula|prontuario|skap|premio)/.test(normalized) ||
    /(dados|cpf|salario|pagamento|senha|matricula|prontuario|skap|premio).*(outro|outra|colega|colaborador|funcionario|motorista|ajudante)/.test(normalized);

  const sensitiveTopic = /(contest|discord|confer|revis|pagamento|salario|cpf|senha|token|dados pessoais|prontuario|skap|premio|produtividade)/.test(normalized);

  return asksOtherPerson || sensitiveTopic;
}

router.post('/chat', authenticateToken, async (req, res) => {
  const rawMessage = String(req.body?.message || '');
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Mensagem muito longa' });
  }

  const message = sanitizeText(rawMessage);
  const history = sanitizeHistory(req.body?.history);

  if (!message) {
    return res.status(400).json({ error: 'Mensagem obrigatoria' });
  }

  if (!isAiEnabled()) {
    return res.json({ reply: DISABLED_REPLY });
  }

  if (isSensitiveRequest(message)) {
    return res.json({ reply: SENSITIVE_REPLY });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ reply: FALLBACK_REPLY });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: BASE_PROMPT },
        { role: 'system', content: `Contexto permitido do usuario:\n${getUserContext(req.user)}` },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.35,
      max_tokens: 450
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    return res.json({ reply: reply || FALLBACK_REPLY });
  } catch (error) {
    console.error('Erro ao consultar OpenAI para o Yuri');
    return res.json({ reply: FALLBACK_REPLY });
  }
});

module.exports = router;
