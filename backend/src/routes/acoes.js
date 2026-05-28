const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/acoes');
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
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

function normalizeCategory(categoria) {
  const value = String(categoria || '').trim().toLowerCase();
  if (value === 'cafe' || value === 'cafe_com_gerente') return 'cafe_com_gerente';
  return 'cipa';
}

function imageToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function normalizeActive(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1') return 1;
  if (String(value).toLowerCase() === 'true') return 1;
  return 0;
}

router.get('/publicas', authenticateToken, async (req, res) => {
  try {
    const rows = await allDb(
      `SELECT id, categoria, titulo, descricao, imagem_url, data_evento
       FROM acoes_comunicacao
       WHERE ativo = 1
       ORDER BY COALESCE(data_evento, criado_em) DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar acoes' });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await allDb(
      `SELECT * FROM acoes_comunicacao
       ORDER BY COALESCE(data_evento, criado_em) DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar acoes' });
  }
});

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('imagem'),
  handleUploadError,
  async (req, res) => {
    const { titulo, descricao, categoria, data_evento, ativo } = req.body;
    if (!titulo || !descricao) {
      return res.status(400).json({ error: 'Titulo e descricao sao obrigatorios' });
    }
    if (!req.file) return res.status(400).json({ error: 'Imagem e obrigatoria' });

    const now = new Date().toISOString();
    const imagemUrl = imageToDataUrl(req.file);

    try {
      const result = await runDb(
        `INSERT INTO acoes_comunicacao (categoria, titulo, descricao, imagem_url, ativo, data_evento, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizeCategory(categoria),
          titulo.trim(),
          descricao.trim(),
          imagemUrl,
          ativo === '0' ? 0 : 1,
          data_evento || null,
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

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('imagem'),
  handleUploadError,
  async (req, res) => {
    const id = Number(req.params.id);
    const { titulo, descricao, categoria, data_evento, ativo } = req.body;

    try {
      const current = await getDb('SELECT * FROM acoes_comunicacao WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Acao nao encontrada' });

      const imagemUrl = req.file ? imageToDataUrl(req.file) : current.imagem_url;

      await runDb(
        `UPDATE acoes_comunicacao
         SET categoria = ?, titulo = ?, descricao = ?, imagem_url = ?, ativo = ?, data_evento = ?, atualizado_em = ?
         WHERE id = ?`,
        [
          normalizeCategory(categoria || current.categoria),
          titulo ? titulo.trim() : current.titulo,
          descricao ? descricao.trim() : current.descricao,
          imagemUrl,
          normalizeActive(ativo, current.ativo),
          data_evento === undefined ? current.data_evento : data_evento || null,
          new Date().toISOString(),
          id
        ]
      );

      res.json({ changed: 1, imagem_url: imagemUrl });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar acao' });
    }
  }
);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);

  try {
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
