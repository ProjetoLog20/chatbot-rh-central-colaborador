const db = require('../db');

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5-mini';

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

async function getKnowledgeBase() {
  await ensureRespostasColumns();
  return all(
    'SELECT categoria, pergunta, resposta FROM respostas_chatbot WHERE ativo = 1 ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC LIMIT 50'
  );
}

async function ensureRespostasColumns() {
  for (const sql of [
    'ALTER TABLE respostas_chatbot ADD COLUMN created_at TIMESTAMP',
    'ALTER TABLE respostas_chatbot ADD COLUMN updated_at TIMESTAMP'
  ]) {
    try {
      await run(sql);
    } catch (error) {
      if (!/duplicate column|already exists/i.test(String(error?.message || error))) {
        throw error;
      }
    }
  }
}

async function getUserProfile(user) {
  if (!user?.id) return user || null;

  const profile = await get(
    `SELECT id, matricula, nome_completo, nome_preferido, telefone_whatsapp, cargo, setor, unidade, status, perfil
     FROM colaboradores
     WHERE id = ?`,
    [user.id]
  );

  if (!profile) return user;

  const prontuario = await get(
    `SELECT pontuacao_ponderada, faixa, cor_faixa, status_prontuario
     FROM prontuarios_motoristas
     WHERE colaborador_id = ?`,
    [profile.id]
  );

  return { ...profile, prontuario };
}

function tokenize(text) {
  const stopWords = new Set([
    'a', 'ao', 'as', 'com', 'como', 'da', 'de', 'do', 'dos', 'e', 'em', 'esta', 'estao', 'estou', 'meu', 'minha',
    'o', 'os', 'para', 'que', 'saber', 'sobre', 'um', 'uma', 'voce'
  ]);
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function findDirectAnswer(question, knowledgeBase) {
  const questionTokens = tokenize(question);
  if (!questionTokens.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  knowledgeBase.forEach((row) => {
    const rowTokens = new Set(tokenize(`${row.categoria} ${row.pergunta} ${row.resposta}`));
    const score = questionTokens.reduce((total, token) => total + (rowTokens.has(token) ? 1 : 0), 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  });

  return bestScore > 0 ? bestMatch : null;
}

function hasAnyToken(question, tokens) {
  const questionTokens = tokenize(question);
  return tokens.some((token) => questionTokens.includes(token));
}

function isContestQuestion(question) {
  return (
    hasAnyToken(question, ['contestar', 'contestacao', 'discordo', 'conferencia', 'conferir', 'revisao', 'revisar', 'errado']) &&
    hasAnyToken(question, ['premio', 'produtividade', 'prontuario', 'skap'])
  );
}

function getContextualAnswer(question, user) {
  if (hasAnyToken(question, ['ola', 'ajuda', 'fazer', 'funciona', 'assistente'])) {
    return {
      resposta: [
        'Eu sou o Yuri, assistente de RH da LOG20. Posso ajudar com Pesquisa de Clima, SKAP, Campeão de Segurança, 3Rs, Prêmio de Produtividade, prontuário, ouvidoria, primeiro acesso e informações gerais da Central.',
        user?.perfil === 'motorista'
          ? 'Tambem consigo orientar voce sobre o resumo do seu prontuario.'
          : 'Se a sua dúvida envolver dados pessoais ou algo que não esteja disponível, procure o RH.'
      ].join(' '),
      origem: 'contexto_usuario',
      categoria: 'Ajuda'
    };
  }

  if (hasAnyToken(question, ['pessoal', 'dados', 'cpf', 'telefone', 'email', 'salario', 'senha'])) {
    return {
      resposta: 'Essas informacoes ficam disponiveis somente para voce e para os administradores autorizados. Se precisar conferir ou corrigir algo, procure o RH.',
      origem: 'contexto_usuario',
      categoria: 'Dados pessoais'
    };
  }

  if (isContestQuestion(question)) {
    return {
      resposta: 'Caso não concorde ou não entenda alguma informação, procure o RH para conferência.',
      origem: 'contexto_usuario',
      categoria: 'Conferencia RH'
    };
  }

  if (hasAnyToken(question, ['prontuario', 'pontuacao', 'motorista'])) {
    if (!user?.prontuario) {
      return {
        resposta: 'Essa informação ainda não está disponível na sua central. Caso precise de apoio, procure o RH.',
        origem: 'contexto_usuario',
        categoria: 'Prontuario'
      };
    }

    const prontuario = user.prontuario;
    return {
      resposta: [
        `Seu prontuário consta com pontuação ponderada ${prontuario.pontuacao_ponderada ?? 'não informada'} e faixa ${prontuario.faixa || 'não informada'}.`,
        `Classificação da faixa: ${prontuario.cor_faixa || 'sem_faixa'}. Status: ${prontuario.status_prontuario || 'não informado'}. Caso não concorde ou não entenda alguma informação, procure o RH para conferência.`
      ].join(' '),
      origem: 'contexto_usuario',
      categoria: 'Prontuario'
    };
  }

  return null;
}

function buildKnowledgeText(rows) {
  if (!rows.length) return 'Nenhuma resposta cadastrada no painel do RH.';
  return rows
    .map((row) => `Categoria: ${row.categoria || 'geral'}\nPergunta: ${row.pergunta}\nResposta oficial: ${row.resposta}`)
    .join('\n\n');
}

function buildUserContext(user) {
  if (!user) return 'Usuário autenticado, sem dados adicionais disponíveis.';
  const lines = [
    `Nome: ${user.nome_completo || 'não informado'}`,
    `Nome preferido: ${user.nome_preferido || 'não informado'}`,
    `Perfil: ${user.perfil || 'não informado'}`,
    `Matrícula: ${user.matricula || 'não informada'}`,
    `Cargo: ${user.cargo || 'não informado'}`,
    `Setor: ${user.setor || 'não informado'}`,
    `Unidade: ${user.unidade || 'não informada'}`,
      `Status: ${user.status || 'não informado'}`
  ];

  if (user.prontuario) {
    lines.push(
      `Prontuário do colaborador - pontuação ponderada: ${user.prontuario.pontuacao_ponderada ?? 'não informada'}`,
      `Prontuário do colaborador - faixa: ${user.prontuario.faixa || 'não informada'}`,
      `Prontuário do colaborador - cor da faixa: ${user.prontuario.cor_faixa || 'sem_faixa'}`
    );
  }

  return lines.join('\n');
}

function extractOutputText(responseBody) {
  if (responseBody.output_text) return responseBody.output_text.trim();

  const message = responseBody.output?.find((item) => item.type === 'message');
  const textContent = message?.content?.find((item) => item.type === 'output_text');
  return textContent?.text?.trim() || '';
}

async function askOpenAI({ question, knowledgeBase, user, previousResponseId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const payload = {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    instructions: [
      'Voce e Yuri, a cobrinha mascote da LOG20 Cascavel e assistente virtual de RH da Central do Colaborador.',
      'Sua personalidade e humana, simpatica, educada, direta, acolhedora e profissional.',
      'Use linguagem simples, tom de apoio ao colaborador e evite termos tecnicos.',
      'Responda em portugues do Brasil, com tom claro, acolhedor e objetivo.',
      'Priorize as respostas oficiais cadastradas pelo RH na base de conhecimento.',
      'Ajude com Pesquisa de Clima, SKAP, Campeão de Segurança, 3Rs, Prêmio de Produtividade, Prontuário do Colaborador, Ouvidoria, primeiro acesso, senha temporária e informações gerais da Central.',
      'Use o contexto do usuário apenas para personalizar orientações permitidas.',
      'Não mostre dados de outro colaborador e respeite as regras de perfil do sistema.',
      'Não prometa alterar dados sozinho.',
      'Se o usuário perguntar sobre dados pessoais, responda: "Essas informações ficam disponíveis somente para você e para os administradores autorizados."',
      'Se a informação não estiver disponível, responda: "Essa informação ainda não está disponível na sua central. Caso precise de apoio, procure o RH."',
      'Quando o assunto for contestação de prêmio, prontuário ou SKAP, responda: "Caso não concorde ou não entenda alguma informação, procure o RH para conferência."',
      'Se a base não tiver informação suficiente, oriente o colaborador a procurar o RH/Admin em vez de inventar políticas internas.',
      'Não exponha dados sensíveis.',
      'Use no maximo 2 paragrafos curtos.'
    ].join('\n'),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Contexto do usuário:\n${buildUserContext(user)}`,
              `Base oficial do RH:\n${buildKnowledgeText(knowledgeBase)}`,
              `Pergunta do colaborador:\n${question}`
            ].join('\n\n')
          }
        ]
      }
    ],
    max_output_tokens: 450,
    store: true
  };

  if (previousResponseId) {
    payload.previous_response_id = previousResponseId;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || 'Falha ao consultar a IA';
    throw new Error(message);
  }

  return {
    resposta: extractOutputText(body),
    responseId: body.id
  };
}

async function logAttendance({ user, question, answer, category, status }) {
  if (!user?.id) return;

  try {
    await run(
      `INSERT INTO atendimentos (colaborador_id, telefone, mensagem, resposta, categoria, status, data_hora)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [
        user.id,
        user.telefone_whatsapp || '',
        question,
        answer,
        category || 'Chat IA',
        status || 'Respondido'
      ]
    );
  } catch (err) {
    console.error('Erro ao registrar atendimento:', err.message);
  }
}

async function answerQuestion({ question, user, previousResponseId }) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    const err = new Error('Pergunta e obrigatoria');
    err.status = 400;
    throw err;
  }

  const [knowledgeBase, enrichedUser] = await Promise.all([
    getKnowledgeBase(),
    getUserProfile(user)
  ]);
  const directAnswer = findDirectAnswer(cleanQuestion, knowledgeBase);

  try {
    const aiAnswer = await askOpenAI({
      question: cleanQuestion,
      knowledgeBase,
      user: enrichedUser,
      previousResponseId
    });

    if (aiAnswer?.resposta) {
      const result = {
        resposta: aiAnswer.resposta,
        origem: 'ia',
        responseId: aiAnswer.responseId
      };

      await logAttendance({
        user: enrichedUser,
        question: cleanQuestion,
        answer: result.resposta,
        category: directAnswer?.categoria || 'Chat IA',
        status: 'Respondido por IA'
      });

      return result;
    }
  } catch (err) {
    console.error('Erro ao consultar OpenAI:', err.message);
  }

  const contextualAnswer = getContextualAnswer(cleanQuestion, enrichedUser);
  if (contextualAnswer) {
    await logAttendance({
      user: enrichedUser,
      question: cleanQuestion,
      answer: contextualAnswer.resposta,
      category: contextualAnswer.categoria,
      status: 'Respondido pelo contexto'
    });

    return contextualAnswer;
  }

  if (directAnswer) {
    const result = {
      resposta: directAnswer.resposta,
      origem: 'base_conhecimento',
      categoria: directAnswer.categoria
    };

    await logAttendance({
      user: enrichedUser,
      question: cleanQuestion,
      answer: result.resposta,
      category: directAnswer.categoria,
      status: 'Respondido pela base'
    });

    return result;
  }

  const result = {
    resposta: 'Essa informação ainda não está disponível na sua central. Caso precise de apoio, procure o RH.',
    origem: 'fallback'
  };

  await logAttendance({
    user: enrichedUser,
    question: cleanQuestion,
    answer: result.resposta,
    category: 'Não classificado',
    status: 'Pendente'
  });

  return result;
}

module.exports = {
  answerQuestion
};
