const express = require('express');
const OpenAI = require('openai');
const db = require('../db');
const { authenticateToken } = require('../authMiddleware');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_ITEMS = 8;
const FALLBACK_REPLY = 'Tive uma instabilidade agora. Tente novamente em alguns instantes ou procure o RH.';
const DISABLED_REPLY = 'A IA do Yuri está temporariamente desativada. Caso precise de apoio, procure o RH.';
const MISSING_KEY_REPLY = 'A IA do Yuri ainda não foi configurada no servidor. Procure o administrador.';
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

function normalizeQuestion(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,;:]+$/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function similarityScore(a, b) {
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLength);
}

function isQuestionMatch(userQuestion, storedQuestion) {
  if (!userQuestion || !storedQuestion) return false;
  if (userQuestion === storedQuestion) return true;
  if (userQuestion.includes(storedQuestion) || storedQuestion.includes(userQuestion)) return true;
  return similarityScore(userQuestion, storedQuestion) >= 0.75;
}

async function findRegisteredAnswer(message) {
  const normalizedMessage = normalizeQuestion(message);
  if (!normalizedMessage) return null;

  const rows = await db.all(
    `SELECT id, pergunta, resposta
     FROM respostas_chatbot
     WHERE COALESCE(ativo, 1) = 1
     ORDER BY COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) DESC, id DESC`
  );

  const normalizedRows = rows.map((row) => ({
    ...row,
    normalizedPergunta: normalizeQuestion(row.pergunta)
  }));

  return normalizedRows.find((row) => row.normalizedPergunta === normalizedMessage)
    || normalizedRows.find((row) => isQuestionMatch(normalizedMessage, row.normalizedPergunta))
    || null;
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

  const aiEnabled = isAiEnabled();
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  console.log('[YURI] pergunta:', message);
  console.log('[YURI] IA habilitada:', aiEnabled);
  console.log('[YURI] OpenAI key configurada:', hasOpenAiKey);

  let faqMatch = null;
  try {
    faqMatch = await findRegisteredAnswer(message);
  } catch (error) {
    console.error('[YURI] erro ao buscar resposta cadastrada:', error.message);
  }

  console.log('[YURI] resposta cadastrada encontrada:', Boolean(faqMatch));

  if (faqMatch?.resposta) {
    console.log('[YURI] source:', 'resposta_cadastrada');
    return res.json({ reply: faqMatch.resposta, source: 'resposta_cadastrada' });
  }

  if (!aiEnabled) {
    console.log('[YURI] source:', 'fallback');
    return res.json({ reply: DISABLED_REPLY, source: 'fallback' });
  }

  if (isSensitiveRequest(message)) {
    console.log('[YURI] source:', 'fallback');
    return res.json({ reply: SENSITIVE_REPLY, source: 'fallback' });
  }

  if (!hasOpenAiKey) {
    console.log('[YURI] source:', 'fallback');
    return res.json({ reply: MISSING_KEY_REPLY, source: 'fallback' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
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
    const source = reply ? 'openai' : 'fallback';
    console.log('[YURI] source:', source);
    return res.json({ reply: reply || FALLBACK_REPLY, source });
  } catch (error) {
    console.error('[YURI] erro OpenAI:', error.message);
    console.log('[YURI] source:', 'fallback');
    return res.json({ reply: FALLBACK_REPLY, source: 'fallback' });
  }
});

module.exports = router;
