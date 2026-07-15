const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();
const categories = new Set(['novidade', 'comunicado', 'premio', 'manutencao', 'seguranca', 'prazo', 'reconhecimento']);
const priorities = new Set(['normal', 'importante', 'urgente']);
const statuses = new Set(['rascunho', 'publicado', 'arquivado']);

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('T', ' ').replace('Z', '');
}

function safeLink(value) {
  const link = text(value, 500);
  if (!link) return null;
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizePayload(body = {}) {
  const categoria = categories.has(body.categoria) ? body.categoria : 'comunicado';
  const prioridade = priorities.has(body.prioridade) ? body.prioridade : 'normal';
  const status = statuses.has(body.status) ? body.status : 'rascunho';
  const paraTodos = flag(body.para_todos);
  const paraAdmin = flag(body.para_admin);
  const paraMotorista = flag(body.para_motorista);
  const paraColaborador = flag(body.para_colaborador);

  return {
    titulo: text(body.titulo, 140),
    mensagem: text(body.mensagem, 3000),
    categoria,
    prioridade,
    status,
    para_todos: paraTodos || (!paraAdmin && !paraMotorista && !paraColaborador) ? 1 : 0,
    para_admin: paraAdmin,
    para_motorista: paraMotorista,
    para_colaborador: paraColaborador,
    link_url: safeLink(body.link_url),
    link_texto: text(body.link_texto, 80) || null,
    inicio_em: optionalDate(body.inicio_em),
    fim_em: optionalDate(body.fim_em)
  };
}

function audienceClause(perfil) {
  const normalized = String(perfil || '').trim().toLowerCase();
  if (normalized === 'admin') return '(n.para_todos = 1 OR n.para_admin = 1)';
  if (normalized === 'motorista') return '(n.para_todos = 1 OR n.para_motorista = 1)';
  return '(n.para_todos = 1 OR n.para_colaborador = 1)';
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT n.*, CASE WHEN l.notificacao_id IS NULL THEN 0 ELSE 1 END AS lida, l.lida_em
       FROM notificacoes n
       LEFT JOIN notificacoes_leituras l
         ON l.notificacao_id = n.id AND l.colaborador_id = ?
       WHERE n.status = 'publicado'
         AND (n.inicio_em IS NULL OR n.inicio_em <= CURRENT_TIMESTAMP)
         AND (n.fim_em IS NULL OR n.fim_em >= CURRENT_TIMESTAMP)
         AND ${audienceClause(req.user.perfil)}
       ORDER BY CASE n.prioridade WHEN 'urgente' THEN 1 WHEN 'importante' THEN 2 ELSE 3 END,
                COALESCE(n.inicio_em, n.created_at) DESC,
                n.id DESC
       LIMIT 100`,
      [req.user.id]
    );

    const naoLidas = rows.filter((item) => !Number(item.lida)).length;
    return res.json({ nao_lidas: naoLidas, notificacoes: rows });
  } catch (error) {
    console.error('Erro ao listar notificacoes:', error);
    return res.status(500).json({ error: 'Erro ao listar notificacoes' });
  }
});

router.post('/:id/ler', authenticateToken, async (req, res) => {
  try {
    const notificacao = await db.get(
      `SELECT n.id FROM notificacoes n
       WHERE n.id = ? AND n.status = 'publicado'
         AND ${audienceClause(req.user.perfil)}`,
      [req.params.id]
    );
    if (!notificacao) return res.status(404).json({ error: 'Notificacao nao encontrada' });

    await db.run(
      `INSERT INTO notificacoes_leituras (notificacao_id, colaborador_id, lida_em)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(notificacao_id, colaborador_id) DO UPDATE SET lida_em = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id]
    );
    return res.json({ lida: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao marcar notificacao como lida' });
  }
});

router.post('/ler-todas', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT n.id FROM notificacoes n
       WHERE n.status = 'publicado'
         AND (n.inicio_em IS NULL OR n.inicio_em <= CURRENT_TIMESTAMP)
         AND (n.fim_em IS NULL OR n.fim_em >= CURRENT_TIMESTAMP)
         AND ${audienceClause(req.user.perfil)}`
    );
    for (const item of rows) {
      await db.run(
        `INSERT INTO notificacoes_leituras (notificacao_id, colaborador_id, lida_em)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(notificacao_id, colaborador_id) DO UPDATE SET lida_em = CURRENT_TIMESTAMP`,
        [item.id, req.user.id]
      );
    }
    return res.json({ lidas: rows.length });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao marcar notificacoes como lidas' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT n.*,
              COUNT(l.id) AS total_leituras
       FROM notificacoes n
       LEFT JOIN notificacoes_leituras l ON l.notificacao_id = n.id
       GROUP BY n.id
       ORDER BY n.created_at DESC, n.id DESC`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar notificacoes administrativas' });
  }
});

router.post('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const payload = normalizePayload(req.body);
  if (!payload.titulo || !payload.mensagem) {
    return res.status(400).json({ error: 'Titulo e mensagem sao obrigatorios' });
  }
  if (payload.inicio_em && payload.fim_em && payload.fim_em < payload.inicio_em) {
    return res.status(400).json({ error: 'A data final deve ser posterior a data inicial' });
  }

  try {
    const result = await db.run(
      `INSERT INTO notificacoes
       (titulo, mensagem, categoria, prioridade, status, para_todos, para_admin,
        para_motorista, para_colaborador, link_url, link_texto, inicio_em, fim_em, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.titulo, payload.mensagem, payload.categoria, payload.prioridade, payload.status,
        payload.para_todos, payload.para_admin, payload.para_motorista, payload.para_colaborador,
        payload.link_url, payload.link_texto, payload.inicio_em, payload.fim_em, req.user.id]
    );
    const created = await db.get('SELECT * FROM notificacoes WHERE id = ?', [result.lastID]);
    return res.status(201).json(created);
  } catch (error) {
    console.error('Erro ao criar notificacao:', error);
    return res.status(500).json({ error: 'Erro ao criar notificacao' });
  }
});

router.put('/admin/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const payload = normalizePayload(req.body);
  if (!payload.titulo || !payload.mensagem) {
    return res.status(400).json({ error: 'Titulo e mensagem sao obrigatorios' });
  }

  try {
    const existing = await db.get('SELECT id FROM notificacoes WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Notificacao nao encontrada' });
    await db.run(
      `UPDATE notificacoes SET
       titulo = ?, mensagem = ?, categoria = ?, prioridade = ?, status = ?,
       para_todos = ?, para_admin = ?, para_motorista = ?, para_colaborador = ?,
       link_url = ?, link_texto = ?, inicio_em = ?, fim_em = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [payload.titulo, payload.mensagem, payload.categoria, payload.prioridade, payload.status,
        payload.para_todos, payload.para_admin, payload.para_motorista, payload.para_colaborador,
        payload.link_url, payload.link_texto, payload.inicio_em, payload.fim_em, req.params.id]
    );
    return res.json(await db.get('SELECT * FROM notificacoes WHERE id = ?', [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar notificacao' });
  }
});

router.delete('/admin/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await db.run('DELETE FROM notificacoes WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Notificacao nao encontrada' });
    return res.json({ deleted: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao excluir notificacao' });
  }
});

module.exports = router;
