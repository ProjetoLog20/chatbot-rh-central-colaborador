const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../authMiddleware');

const router = express.Router();
const PERMISSIONS = ['planos_melhoria_grau_1', 'planos_melhoria_grau_2', 'planos_melhoria_grau_3'];

function text(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function parseLabels(value) {
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

async function getAccess(userId) {
  const result = await db.query(
    `SELECT permissao FROM permissoes_colaboradores
     WHERE colaborador_id = $1 AND ativo = true AND permissao = ANY($2::text[])
     ORDER BY permissao LIMIT 1`,
    [userId, PERMISSIONS]
  );
  const permission = result.rows?.[0]?.permissao;
  if (!permission) return null;
  return Number(permission.at(-1));
}

async function requirePlanAccess(req, res, next) {
  try {
    req.planGrade = await getAccess(req.user.id);
    if (!req.planGrade) return res.status(403).json({ error: 'Você não possui acesso ao Plano de Melhorias do Yuri.' });
    next();
  } catch (error) {
    console.error('Erro ao validar acesso aos planos:', error);
    res.status(500).json({ error: 'Erro ao validar acesso ao plano.' });
  }
}

function requireGradeOne(req, res, next) {
  if (req.planGrade !== 1) return res.status(403).json({ error: 'Somente administradores Grau 1 podem realizar esta alteração.' });
  next();
}

async function audit(userId, cardId, action, details = {}) {
  await db.query(
    `INSERT INTO planos_melhoria_auditoria (colaborador_id, card_id, acao, detalhes)
     VALUES ($1, $2, $3, $4)`,
    [userId, cardId || null, action, JSON.stringify(details)]
  );
}

router.get('/access', authenticateToken, async (req, res) => {
  try {
    const grade = await getAccess(req.user.id);
    res.json({ allowed: Boolean(grade), grade });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar acesso ao plano.' });
  }
});

router.use(authenticateToken, requirePlanAccess);

router.get('/', async (req, res) => {
  try {
    const [bucketsResult, membersResult, cardsResult, commentsResult] = await Promise.all([
      db.query(`SELECT id, titulo, descricao, ordem, cor FROM planos_melhoria_buckets WHERE ativo = true ORDER BY ordem, id`),
      db.query(
        `SELECT c.id, c.matricula, COALESCE(c.nome_preferido, c.nome_completo) AS nome,
                c.cargo, RIGHT(p.permissao, 1)::integer AS grau
         FROM permissoes_colaboradores p
         JOIN colaboradores c ON c.id = p.colaborador_id
         WHERE p.ativo = true AND p.permissao = ANY($1::text[])
         ORDER BY grau, nome`,
        [PERMISSIONS]
      ),
      db.query(
        `SELECT card.id, card.bucket_id, card.titulo, card.descricao, card.responsavel_id,
                COALESCE(responsavel.nome_preferido, responsavel.nome_completo) AS responsavel,
                card.prioridade, card.prazo, card.etiquetas,
                card.checklist_concluidos, card.checklist_total
         FROM planos_melhoria_cards card
         LEFT JOIN colaboradores responsavel ON responsavel.id = card.responsavel_id
         WHERE card.arquivado = false
           AND ($1::integer <> 2 OR card.responsavel_id = $2)
         ORDER BY card.updated_at DESC, card.id DESC`,
        [req.planGrade, req.user.id]
      ),
      db.query(
        `SELECT comentario.id, comentario.card_id,
                COALESCE(autor.nome_preferido, autor.nome_completo, 'Usuário') AS autor,
                comentario.comentario, comentario.created_at
         FROM planos_melhoria_comentarios comentario
         LEFT JOIN colaboradores autor ON autor.id = comentario.autor_id
         ORDER BY comentario.created_at`,
        []
      )
    ]);

    const commentsByCard = new Map();
    for (const item of commentsResult.rows || []) {
      const comments = commentsByCard.get(item.card_id) || [];
      comments.push({ id: item.id, author: item.autor, text: item.comentario, date: item.created_at });
      commentsByCard.set(item.card_id, comments);
    }

    res.json({
      grade: req.planGrade,
      currentMember: {
        id: req.user.id,
        matricula: req.user.matricula,
        name: req.user.nome_preferido || req.user.nome_completo,
        grade: req.planGrade
      },
      columns: (bucketsResult.rows || []).map((item) => ({ id: item.id, title: item.titulo, hint: item.descricao, tone: item.cor, order: item.ordem })),
      members: (membersResult.rows || []).map((item) => ({ id: item.id, matricula: item.matricula, name: item.nome, grade: item.grau, role: item.cargo || 'Administrador' })),
      cards: (cardsResult.rows || []).map((item) => ({
        id: item.id,
        column: item.bucket_id,
        title: item.titulo,
        description: item.descricao || '',
        ownerId: item.responsavel_id,
        owner: item.responsavel || 'Sem responsável',
        priority: item.prioridade,
        dueDate: item.prazo,
        labels: parseLabels(item.etiquetas),
        checklist: { done: item.checklist_concluidos, total: item.checklist_total },
        comments: commentsByCard.get(item.id) || []
      }))
    });
  } catch (error) {
    console.error('Erro ao carregar plano de melhorias:', error);
    res.status(500).json({ error: 'Erro ao carregar o plano de melhorias.' });
  }
});

router.post('/buckets', requireGradeOne, async (req, res) => {
  const title = text(req.body.title, 80);
  if (!title) return res.status(400).json({ error: 'Informe o nome da coluna.' });
  try {
    const orderResult = await db.query(`SELECT COALESCE(MAX(ordem), 0) + 10 AS ordem FROM planos_melhoria_buckets`);
    const result = await db.query(
      `INSERT INTO planos_melhoria_buckets (titulo, descricao, ordem, cor, criado_por)
       VALUES ($1, 'Etapa personalizada', $2, 'rose', $3)
       RETURNING id, titulo, descricao, ordem, cor`,
      [title, orderResult.rows[0].ordem, req.user.id]
    );
    const item = result.rows[0];
    await audit(req.user.id, null, 'bucket_criado', { id: item.id, titulo: item.titulo });
    res.status(201).json({ id: item.id, title: item.titulo, hint: item.descricao, tone: item.cor, order: item.ordem });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar a coluna.' });
  }
});

router.post('/members', requireGradeOne, async (req, res) => {
  const matricula = text(req.body.matricula, 30);
  const grade = Number(req.body.grade);
  if (!matricula || ![1, 2, 3].includes(grade)) return res.status(400).json({ error: 'Informe uma matrícula e um grau válidos.' });
  try {
    const collaboratorResult = await db.query(
      `SELECT id, matricula, COALESCE(nome_preferido, nome_completo) AS nome, cargo
       FROM colaboradores WHERE matricula = $1 AND LOWER(COALESCE(status, 'ativo')) NOT IN ('desligado', 'removido', 'inativo')`,
      [matricula]
    );
    const collaborator = collaboratorResult.rows?.[0];
    if (!collaborator) return res.status(404).json({ error: 'Matrícula não encontrada ou inativa.' });
    await db.query(`UPDATE permissoes_colaboradores SET ativo = false WHERE colaborador_id = $1 AND permissao = ANY($2::text[])`, [collaborator.id, PERMISSIONS]);
    await db.query(
      `INSERT INTO permissoes_colaboradores (colaborador_id, permissao, ativo)
       VALUES ($1, $2, true)
       ON CONFLICT (colaborador_id, permissao) DO UPDATE SET ativo = true`,
      [collaborator.id, `planos_melhoria_grau_${grade}`]
    );
    await audit(req.user.id, null, 'membro_adicionado', { matricula, grade });
    res.status(201).json({ id: collaborator.id, matricula, name: collaborator.nome, grade, role: collaborator.cargo || 'Administrador' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar o administrador.' });
  }
});

router.post('/cards', requireGradeOne, async (req, res) => {
  const title = text(req.body.title, 160);
  if (!title || !req.body.column) return res.status(400).json({ error: 'Informe o título e a coluna.' });
  try {
    const result = await db.query(
      `INSERT INTO planos_melhoria_cards
       (bucket_id, titulo, descricao, responsavel_id, prioridade, prazo, etiquetas,
        checklist_concluidos, checklist_total, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.body.column, title, text(req.body.description, 3000), req.body.ownerId || null,
       text(req.body.priority, 20) || 'Média', req.body.dueDate || null,
       JSON.stringify(req.body.labels || []), Number(req.body.checklist?.done || 0),
       Number(req.body.checklist?.total || 0), req.user.id]
    );
    await audit(req.user.id, result.rows[0].id, 'card_criado', { titulo: title });
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar a atividade.' });
  }
});

router.put('/cards/:id', requireGradeOne, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE planos_melhoria_cards SET bucket_id=$1, titulo=$2, descricao=$3,
       responsavel_id=$4, prioridade=$5, prazo=$6, etiquetas=$7,
       checklist_concluidos=$8, checklist_total=$9, updated_at=NOW()
       WHERE id=$10 AND arquivado=false RETURNING id`,
      [req.body.column, text(req.body.title, 160), text(req.body.description, 3000),
       req.body.ownerId || null, text(req.body.priority, 20), req.body.dueDate || null,
       JSON.stringify(req.body.labels || []), Number(req.body.checklist?.done || 0),
       Number(req.body.checklist?.total || 0), req.params.id]
    );
    if (!result.rows?.[0]) return res.status(404).json({ error: 'Atividade não encontrada.' });
    await audit(req.user.id, Number(req.params.id), 'card_atualizado');
    res.json({ message: 'Atividade atualizada.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar a atividade.' });
  }
});

router.patch('/cards/:id/status', async (req, res) => {
  try {
    const cardResult = await db.query(`SELECT responsavel_id FROM planos_melhoria_cards WHERE id=$1 AND arquivado=false`, [req.params.id]);
    const card = cardResult.rows?.[0];
    if (!card) return res.status(404).json({ error: 'Atividade não encontrada.' });
    if (req.planGrade === 3 || (req.planGrade === 2 && card.responsavel_id !== req.user.id)) return res.status(403).json({ error: 'Você não pode alterar esta atividade.' });
    if (req.planGrade === 2) {
      const bucketResult = await db.query(`SELECT titulo FROM planos_melhoria_buckets WHERE id=$1`, [req.body.column]);
      const title = String(bucketResult.rows?.[0]?.titulo || '').toLowerCase();
      if (!['em andamento', 'aguardando conferência'].includes(title)) return res.status(403).json({ error: 'O Grau 2 pode apenas iniciar a atividade ou dar o OK.' });
    }
    await db.query(`UPDATE planos_melhoria_cards SET bucket_id=$1, updated_at=NOW() WHERE id=$2`, [req.body.column, req.params.id]);
    await audit(req.user.id, Number(req.params.id), 'status_alterado', { bucket: req.body.column });
    res.json({ message: 'Andamento atualizado.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar o andamento.' });
  }
});

router.post('/cards/:id/comments', async (req, res) => {
  const comment = text(req.body.comment, 1200);
  if (!comment) return res.status(400).json({ error: 'Escreva um comentário.' });
  try {
    const cardResult = await db.query(`SELECT responsavel_id FROM planos_melhoria_cards WHERE id=$1 AND arquivado=false`, [req.params.id]);
    const card = cardResult.rows?.[0];
    if (!card) return res.status(404).json({ error: 'Atividade não encontrada.' });
    if (req.planGrade === 3 || (req.planGrade === 2 && card.responsavel_id !== req.user.id)) return res.status(403).json({ error: 'Você não pode comentar nesta atividade.' });
    const result = await db.query(
      `INSERT INTO planos_melhoria_comentarios (card_id, autor_id, comentario)
       VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.params.id, req.user.id, comment]
    );
    await audit(req.user.id, Number(req.params.id), 'comentario_adicionado');
    res.status(201).json({ id: result.rows[0].id, author: req.user.nome_preferido || req.user.nome_completo, text: comment, date: result.rows[0].created_at });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar o comentário.' });
  }
});

module.exports = router;
