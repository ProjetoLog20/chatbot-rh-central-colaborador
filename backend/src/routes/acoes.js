const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/acoes');
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
let schemaReady = null;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Apenas imagens .jpg, .jpeg, .png ou .webp sao permitidas'));
    }
    return callback(null, true);
  }
});

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Imagem excede o limite de 5 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload da imagem' });
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function ensureActionsSchema() {
  if (!process.env.DATABASE_URL) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await runDb('ALTER TABLE acoes_comunicacao ADD COLUMN IF NOT EXISTS responsavel TEXT');
      await runDb('ALTER TABLE acoes_comunicacao ADD COLUMN IF NOT EXISTS encaminhamento TEXT');
      await runDb("ALTER TABLE acoes_comunicacao ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'publicado'");
      await runDb(
        `UPDATE acoes_comunicacao
         SET status = CASE WHEN COALESCE(ativo, 1) = 1 THEN 'publicado' ELSE 'oculto' END
         WHERE status IS NULL OR status = ''`
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

function normalizeCategory(categoria) {
  const value = String(categoria || '').trim().toLowerCase();
  if (value === 'cafe' || value === 'cafe_com_gerente') return 'cafe_com_gerente';
  if (value === 'comite' || value === 'comite_de_gente' || value === 'comitê de gente') return 'comite_de_gente';
  return 'cipa';
}

function imageToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function normalizeActive(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1') return 1;
  if (String(value).toLowerCase() === 'true') return 1;
  if (String(value).toLowerCase() === 'sim') return 1;
  return 0;
}

function normalizeStatus(value, active) {
  const status = String(value || '').trim();
  if (status) return status;
  return active ? 'publicado' : 'oculto';
}

function resolvePublication({ ativo, publicado, status }, fallbackActive = 1) {
  const statusText = String(status || '').trim().toLowerCase();
  if (statusText === 'publicado') {
    return { active: 1, status: 'publicado' };
  }
  if (['oculto', 'rascunho', 'inativo'].includes(statusText)) {
    return { active: 0, status: statusText };
  }

  const active = normalizeActive(publicado ?? ativo, fallbackActive);
  return { active, status: normalizeStatus(status, active) };
}

function rowSelect() {
  return `id, categoria, titulo, descricao, imagem_url, data_evento, data_evento AS data_acao,
    responsavel, encaminhamento, COALESCE(status, CASE WHEN ativo = 1 THEN 'publicado' ELSE 'oculto' END) AS status,
    ativo, ativo AS publicado`;
}

function actionForResponse(row) {
  if (!row) return row;

  // Imagens antigas e novas ficam armazenadas como data URL. Nao envie o
  // Base64 junto com cada listagem: isso fazia a resposta publica ultrapassar
  // varios megabytes e falhar em proxies/hospedagens com limite de payload.
  if (row.imagem_url?.startsWith('data:')) {
    return { ...row, imagem_url: `/api/acoes-encontros/${row.id}/imagem` };
  }

  return row;
}

async function listPublicActions(req, res) {
  try {
    await ensureActionsSchema();
    const params = [];
    const filters = [`(COALESCE(ativo, 0) = 1 OR LOWER(COALESCE(status, '')) = 'publicado')`];
    if (req.query.categoria) {
      filters.push('categoria = ?');
      params.push(normalizeCategory(req.query.categoria));
    }

    const rows = await allDb(
      `SELECT ${rowSelect()}
       FROM acoes_comunicacao
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(data_evento, criado_em) DESC, id DESC`,
      params
    );
    res.json(rows.map(actionForResponse));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar acoes' });
  }
}

async function listAdminActions(req, res) {
  try {
    await ensureActionsSchema();
    const params = [];
    const filters = [];
    if (req.query.categoria) {
      filters.push('categoria = ?');
      params.push(normalizeCategory(req.query.categoria));
    }

    const rows = await allDb(
      `SELECT ${rowSelect()}, criado_em, atualizado_em
       FROM acoes_comunicacao
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY COALESCE(data_evento, criado_em) DESC, id DESC`,
      params
    );
    res.json(rows.map(actionForResponse));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar acoes' });
  }
}

router.get('/publicas', listPublicActions);

router.get('/:id/imagem', async (req, res) => {
  try {
    const row = await getDb('SELECT imagem_url FROM acoes_comunicacao WHERE id = ?', [Number(req.params.id)]);
    if (!row?.imagem_url) return res.status(404).end();

    if (!row.imagem_url.startsWith('data:')) {
      return res.redirect(row.imagem_url);
    }

    const match = row.imagem_url.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return res.status(404).end();

    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar imagem da acao' });
  }
});

function ensureAdmin(req, res, next) {
  authenticateToken(req, res, (err) => {
    if (err) return;
    authorizeRoles('admin')(req, res, next);
  });
}

router.get('/', async (req, res) => {
  if (req.baseUrl.endsWith('/acoes-encontros') && !req.baseUrl.includes('/admin/')) {
    return listPublicActions(req, res);
  }

  return ensureAdmin(req, res, () => listAdminActions(req, res));
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  return listAdminActions(req, res);
});

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('imagem'),
  handleUploadError,
  async (req, res) => {
    const { titulo, descricao, categoria, data_evento, data_acao, responsavel, encaminhamento, status, ativo, publicado } = req.body;
    if (!titulo || !descricao) {
      return res.status(400).json({ error: 'Titulo e descricao sao obrigatorios' });
    }

    const now = new Date().toISOString();
    const imagemUrl = req.file ? imageToDataUrl(req.file) : '';
    const publication = resolvePublication({ ativo, publicado, status }, 1);

    try {
      await ensureActionsSchema();
      const result = await runDb(
        `INSERT INTO acoes_comunicacao
         (categoria, titulo, descricao, imagem_url, ativo, data_evento, responsavel, encaminhamento, status, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizeCategory(categoria),
          titulo.trim(),
          descricao.trim(),
          imagemUrl,
          publication.active,
          data_acao || data_evento || null,
          responsavel?.trim() || null,
          encaminhamento?.trim() || null,
          publication.status,
          now,
          now
        ]
      );
      res.json({ id: result.id, imagem_url: imagemUrl });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao salvar acao' });
    }
  }
);

async function updateAction(req, res) {
  const id = Number(req.params.id);
  const { titulo, descricao, categoria, data_evento, data_acao, responsavel, encaminhamento, status, ativo, publicado } = req.body;

  try {
    await ensureActionsSchema();
    const current = await getDb('SELECT * FROM acoes_comunicacao WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Acao nao encontrada' });

    const imagemUrl = req.file ? imageToDataUrl(req.file) : current.imagem_url;
    const publication = resolvePublication(
      { ativo, publicado, status: status === undefined ? current.status : status },
      current.ativo
    );

    await runDb(
      `UPDATE acoes_comunicacao
       SET categoria = ?, titulo = ?, descricao = ?, imagem_url = ?, ativo = ?, data_evento = ?,
           responsavel = ?, encaminhamento = ?, status = ?, atualizado_em = ?
       WHERE id = ?`,
      [
        normalizeCategory(categoria || current.categoria),
        titulo ? titulo.trim() : current.titulo,
        descricao ? descricao.trim() : current.descricao,
        imagemUrl,
        publication.active,
        data_acao === undefined && data_evento === undefined ? current.data_evento : data_acao || data_evento || null,
        responsavel === undefined ? current.responsavel : responsavel?.trim() || null,
        encaminhamento === undefined ? current.encaminhamento : encaminhamento?.trim() || null,
        publication.status,
        new Date().toISOString(),
        id
      ]
    );

    res.json({ changed: 1, imagem_url: imagemUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar acao' });
  }
}

const updateActionMiddlewares = [
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('imagem'),
  handleUploadError,
  updateAction
];

router.put('/:id', ...updateActionMiddlewares);
router.patch('/:id', ...updateActionMiddlewares);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);

  try {
    await ensureActionsSchema();
    const current = await getDb('SELECT * FROM acoes_comunicacao WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Acao nao encontrada' });

    await runDb('DELETE FROM acoes_comunicacao WHERE id = ?', [id]);
    if (current.imagem_url?.startsWith('/uploads/acoes/')) {
      const filePath = path.join(__dirname, '../../', current.imagem_url.replace(/^\/+/, ''));
      fs.unlink(filePath, () => {});
    }

    res.json({ deleted: 1 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir acao' });
  }
});

module.exports = router;
