const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

function parseOptions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Bases antigas podem guardar opcoes separadas por virgula ou quebra de linha.
  }
  return String(value).split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
}

function validateAnswer(question, answer) {
  const note = answer.nota === undefined || answer.nota === null || answer.nota === '' ? null : Number(answer.nota);
  const textAnswer = String(answer.resposta_texto || '').trim().slice(0, 4000);
  const optionAnswer = String(answer.resposta_opcao || '').trim().slice(0, 500);
  const hasAnswer = note !== null || Boolean(textAnswer) || Boolean(optionAnswer);

  if (question.obrigatoria && !hasAnswer) return { error: `Responda a pergunta obrigatoria: ${question.pergunta}` };
  if (!hasAnswer) return { value: null };
  if (question.tipo === 'nota' && (!Number.isInteger(note) || note < 1 || note > 5)) {
    return { error: `A nota de "${question.pergunta}" deve estar entre 1 e 5.` };
  }
  if (question.tipo === 'sim_nao' && !['sim', 'nao', 'não'].includes(optionAnswer.toLowerCase())) {
    return { error: `Selecione Sim ou Nao em "${question.pergunta}".` };
  }
  if (['opcao', 'multipla_escolha'].includes(question.tipo)) {
    const options = parseOptions(question.opcoes);
    if (!options.includes(optionAnswer)) return { error: `Selecione uma opcao valida em "${question.pergunta}".` };
  }
  return { value: { note, textAnswer, optionAnswer } };
}

router.get('/ativa', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, titulo, descricao, status, anonima, data_inicio, data_fim 
       FROM pesquisas_clima 
       WHERE status = 'ativa' 
       AND (data_inicio IS NULL OR data_inicio <= NOW())
       AND (data_fim IS NULL OR data_fim >= NOW())
       ORDER BY data_inicio DESC
       LIMIT 1`,
      []
    );

    const pesquisa = result.rows?.[0];
    if (!pesquisa) {
      return res.json({ pesquisa: null, mensagem: 'Nenhuma pesquisa de clima disponível no momento.' });
    }

    const perguntasResult = await db.query(
      `SELECT id, pergunta, tipo, ordem, obrigatoria, opcoes 
       FROM perguntas_clima 
       WHERE pesquisa_id = $1 AND ativa = true
       ORDER BY ordem ASC`,
      [pesquisa.id]
    );

    const jaRespondeu = await db.query(
      `SELECT COUNT(*) as total FROM pesquisa_clima_participacoes
       WHERE pesquisa_id = $1 AND colaborador_id = $2`,
      [pesquisa.id, req.user.id]
    );

    res.json({
      pesquisa,
      perguntas: perguntasResult.rows || [],
      jaRespondeu: parseInt(jaRespondeu.rows?.[0]?.total || 0) > 0
    });
  } catch (error) {
    console.error('ERRO AO BUSCAR PESQUISA ATIVA:', error);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});

router.post('/responder', authenticateToken, async (req, res) => {
  try {
    const { pesquisa_id, respostas } = req.body;
    if (!pesquisa_id || !respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const result = await db.withTransaction(async (transaction) => {
      const surveyResult = await transaction.query(
        `SELECT id, anonima FROM pesquisas_clima
         WHERE id = $1 AND status = 'ativa'
           AND (data_inicio IS NULL OR data_inicio <= CURRENT_TIMESTAMP)
           AND (data_fim IS NULL OR data_fim >= CURRENT_TIMESTAMP)
         FOR UPDATE`,
        [pesquisa_id]
      );
      const survey = surveyResult.rows?.[0];
      if (!survey) return { status: 409, error: 'Esta pesquisa nao esta disponivel para respostas.' };

      const questionsResult = await transaction.query(
        `SELECT id, pergunta, tipo, obrigatoria, opcoes
         FROM perguntas_clima WHERE pesquisa_id = $1 AND ativa = true ORDER BY ordem, id`,
        [pesquisa_id]
      );
      const questions = questionsResult.rows || [];
      const answersByQuestion = new Map();
      for (const answer of respostas) {
        const questionId = Number(answer?.pergunta_id);
        if (!Number.isInteger(questionId) || answersByQuestion.has(questionId)) {
          return { status: 400, error: 'A lista de respostas contem perguntas invalidas ou duplicadas.' };
        }
        answersByQuestion.set(questionId, answer);
      }

      const validated = [];
      for (const question of questions) {
        const answer = answersByQuestion.get(Number(question.id)) || {};
        const validation = validateAnswer(question, answer);
        if (validation.error) return { status: 400, error: validation.error };
        if (validation.value) validated.push({ question, ...validation.value });
        answersByQuestion.delete(Number(question.id));
      }
      if (answersByQuestion.size) return { status: 400, error: 'Uma resposta nao pertence a esta pesquisa.' };

      const participationResult = await transaction.query(
        `INSERT INTO pesquisa_clima_participacoes (pesquisa_id, colaborador_id)
         VALUES ($1, $2)
         ON CONFLICT (pesquisa_id, colaborador_id) DO NOTHING
         RETURNING pesquisa_id`,
        [pesquisa_id, req.user.id]
      );
      if (!participationResult.rows?.[0]) return { status: 409, error: 'Voce ja respondeu esta pesquisa.' };

      for (const answer of validated) {
        await transaction.query(
          `INSERT INTO respostas_clima
           (pesquisa_id, pergunta_id, colaborador_id, nota, resposta_texto, resposta_opcao, comentario)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [pesquisa_id, answer.question.id, survey.anonima ? null : req.user.id,
            answer.note, answer.textAnswer || null, answer.optionAnswer || null, answer.textAnswer || null]
        );
      }
      return { status: 200 };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });

    res.json({ mensagem: 'Pesquisa respondida com sucesso!' });
  } catch (error) {
    console.error('ERRO AO RESPONDER PESQUISA:', error);
    res.status(500).json({ error: 'Erro ao responder pesquisa' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [allResult, activeResult] = await Promise.all([
      db.query(
        `SELECT id, titulo, descricao, status, anonima, data_inicio, data_fim, created_at 
         FROM pesquisas_clima 
         ORDER BY created_at DESC`,
        []
      ),
      db.query(
        `SELECT id, titulo, descricao, status, anonima, data_inicio, data_fim 
         FROM pesquisas_clima 
         WHERE status = 'ativa' 
         AND (data_inicio IS NULL OR data_inicio <= NOW())
         AND (data_fim IS NULL OR data_fim >= NOW())
         ORDER BY data_inicio DESC
         LIMIT 1`,
        []
      ),
    ]);

    res.json({
      pesquisas: allResult.rows || [],
      pesquisaAtiva: activeResult.rows?.[0] || null,
    });
  } catch (error) {
    console.error('ERRO AO BUSCAR ADMIN PESQUISAS:', error);
    res.status(500).json({ error: 'Erro ao buscar pesquisas admin' });
  }
});

router.get('/admin/lista', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, titulo, descricao, status, anonima, data_inicio, data_fim, created_at 
       FROM pesquisas_clima 
       ORDER BY created_at DESC`,
      []
    );

    res.json(result.rows || []);
  } catch (error) {
    console.error('ERRO AO LISTAR PESQUISAS:', error);
    res.status(500).json({ error: 'Erro ao listar pesquisas' });
  }
});

router.patch('/:id/ativar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const found = await db.withTransaction(async (transaction) => {
      await transaction.query(
        `UPDATE pesquisas_clima SET status = 'encerrada' WHERE status = 'ativa' AND id <> $1`,
        [id]
      );
      const result = await transaction.query(
        `UPDATE pesquisas_clima SET status = 'ativa' WHERE id = $1 RETURNING id`,
        [id]
      );
      return Boolean(result.rows?.[0]);
    });
    if (!found) return res.status(404).json({ error: 'Pesquisa nao encontrada' });
    res.json({ mensagem: 'Pesquisa ativada com sucesso' });
  } catch (error) {
    console.error('ERRO AO ATIVAR PESQUISA:', error);
    res.status(500).json({ error: 'Erro ao ativar pesquisa' });
  }
});

router.get('/:id/perguntas', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, pergunta, tipo, ordem, obrigatoria, opcoes, ativa 
       FROM perguntas_clima 
       WHERE pesquisa_id = $1
       ORDER BY ordem ASC`,
      [id]
    );

    res.json(result.rows || []);
  } catch (error) {
    console.error('ERRO AO BUSCAR PERGUNTAS:', error);
    res.status(500).json({ error: 'Erro ao buscar perguntas' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { titulo, descricao, anonima, data_inicio, data_fim, status, defaultQuestions } = req.body;
    if (!titulo) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    const pesquisaStatus = status === 'ativa' ? 'ativa' : 'rascunho';
    const result = await db.query(
      `INSERT INTO pesquisas_clima (titulo, descricao, status, anonima, data_inicio, data_fim, criado_por) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [titulo, descricao || null, pesquisaStatus, anonima || false, data_inicio || null, data_fim || null, req.user.id]
    );

    const pesquisaId = result.rows[0].id;
    if (defaultQuestions) {
      const defaultPerguntas = [
        { pergunta: 'Como você avalia o seu ambiente de trabalho?', tipo: 'nota', ordem: 1, obrigatoria: true },
        { pergunta: 'Você se sente valorizado pelo seu gestor?', tipo: 'sim_nao', ordem: 2, obrigatoria: true },
        { pergunta: 'Qual é sua principal sugestão de melhoria?', tipo: 'texto', ordem: 3, obrigatoria: false },
        { pergunta: 'Como você avalia a comunicação interna?', tipo: 'nota', ordem: 4, obrigatoria: true },
      ];

      for (const pergunta of defaultPerguntas) {
        await db.query(
          `INSERT INTO perguntas_clima (pesquisa_id, pergunta, tipo, ordem, obrigatoria, ativa) 
           VALUES ($1, $2, $3, $4, $5, true)`,
          [pesquisaId, pergunta.pergunta, pergunta.tipo, pergunta.ordem, pergunta.obrigatoria]
        );
      }
    }

    res.json({ id: pesquisaId, mensagem: 'Pesquisa criada com sucesso' });
  } catch (error) {
    console.error('ERRO AO CRIAR PESQUISA:', error);
    res.status(500).json({ error: 'Erro ao criar pesquisa' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descricao, status, anonima, data_inicio, data_fim } = req.body;

    await db.query(
      `UPDATE pesquisas_clima 
       SET titulo = COALESCE($1, titulo), 
           descricao = COALESCE($2, descricao), 
           status = COALESCE($3, status), 
           anonima = COALESCE($4, anonima),
           data_inicio = COALESCE($5, data_inicio),
           data_fim = COALESCE($6, data_fim)
       WHERE id = $7`,
      [titulo, descricao, status, anonima, data_inicio, data_fim, id]
    );

    res.json({ mensagem: 'Pesquisa atualizada com sucesso' });
  } catch (error) {
    console.error('ERRO AO ATUALIZAR PESQUISA:', error);
    res.status(500).json({ error: 'Erro ao atualizar pesquisa' });
  }
});

router.post('/:id/perguntas', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pergunta, tipo, ordem, obrigatoria, opcoes } = req.body;
    if (!pergunta || !tipo) {
      return res.status(400).json({ error: 'Pergunta e tipo são obrigatórios' });
    }

    const result = await db.query(
      `INSERT INTO perguntas_clima (pesquisa_id, pergunta, tipo, ordem, obrigatoria, opcoes) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [id, pergunta, tipo, ordem || 1, obrigatoria ?? true, opcoes || null]
    );

    res.json({ id: result.rows[0].id, mensagem: 'Pergunta adicionada com sucesso' });
  } catch (error) {
    console.error('ERRO AO ADICIONAR PERGUNTA:', error);
    res.status(500).json({ error: 'Erro ao adicionar pergunta' });
  }
});

router.get('/:id/dashboard', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const totalRespostasResult = await db.query(
      `SELECT COUNT(*) as total FROM pesquisa_clima_participacoes WHERE pesquisa_id = $1`,
      [id]
    );

    const notasResult = await db.query(
      `SELECT AVG(CAST(nota AS FLOAT)) as media, 
              COUNT(CASE WHEN nota = 5 THEN 1 END) as muito_satisfeito,
              COUNT(CASE WHEN nota = 4 THEN 1 END) as satisfeito,
              COUNT(CASE WHEN nota = 3 THEN 1 END) as neutro,
              COUNT(CASE WHEN nota = 2 THEN 1 END) as insatisfeito,
              COUNT(CASE WHEN nota = 1 THEN 1 END) as muito_insatisfeito
       FROM respostas_clima WHERE pesquisa_id = $1 AND nota IS NOT NULL`,
      [id]
    );

    const comentariosResult = await db.query(
      `SELECT COALESCE(NULLIF(resposta_texto, ''), comentario) AS comentario FROM respostas_clima
       WHERE pesquisa_id = $1 AND COALESCE(NULLIF(resposta_texto, ''), comentario) IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      total_respostas: parseInt(totalRespostasResult.rows?.[0]?.total || 0),
      media_satisfacao: parseFloat(notasResult.rows?.[0]?.media || 0).toFixed(2),
      distribuicao: {
        muito_satisfeito: parseInt(notasResult.rows?.[0]?.muito_satisfeito || 0),
        satisfeito: parseInt(notasResult.rows?.[0]?.satisfeito || 0),
        neutro: parseInt(notasResult.rows?.[0]?.neutro || 0),
        insatisfeito: parseInt(notasResult.rows?.[0]?.insatisfeito || 0),
        muito_insatisfeito: parseInt(notasResult.rows?.[0]?.muito_insatisfeito || 0)
      },
      comentarios: comentariosResult.rows || []
    });
  } catch (error) {
    console.error('ERRO AO BUSCAR DASHBOARD:', error);
    res.status(500).json({ error: 'Erro ao buscar dashboard' });
  }
});

module.exports = router;
