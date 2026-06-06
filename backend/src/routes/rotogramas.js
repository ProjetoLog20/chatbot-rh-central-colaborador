const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importWorkbook } = require('../../scripts/importRotogramaXlsx');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

async function ensureRotogramaAvailable(req, res, next) {
  try {
    const availability = await ensureModuleAvailable('rotograma_seguro', req.user);
    if (!availability.available) return res.status(503).json(maintenancePayload(availability.modulo));
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao validar modulo de rotogramas' });
  }
}

function boolValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isAdminUser(user) {
  return String(user?.perfil || '').trim().toLowerCase() === 'admin';
}

function buildListWhere(query, isAdmin = false) {
  const filters = [];
  const params = [];

  if (query.busca) {
    filters.push(`(
      LOWER(COALESCE(r.nome, '')) LIKE ?
      OR LOWER(COALESCE(r.origem, '')) LIKE ?
      OR LOWER(COALESCE(r.destino, '')) LIKE ?
      OR LOWER(COALESCE(r.cidade, '')) LIKE ?
      OR EXISTS (
        SELECT 1 FROM rotograma_pontos_risco p
        WHERE p.rotograma_id = r.id
          AND (
            LOWER(COALESCE(p.descricao, '')) LIKE ?
            OR LOWER(COALESCE(p.rodovia_endereco, '')) LIKE ?
            OR LOWER(COALESCE(p.orientacao, '')) LIKE ?
          )
      )
    )`);
    const search = `%${String(query.busca).toLowerCase()}%`;
    params.push(search, search, search, search, search, search, search);
  }

  if (query.cidade) {
    filters.push('LOWER(COALESCE(r.cidade, r.destino, r.nome, \'\')) LIKE ?');
    params.push(`%${String(query.cidade).toLowerCase()}%`);
  }

  if (query.nivel_risco) {
    filters.push('LOWER(COALESCE(r.nivel_risco, r.classificacao_rota, \'\')) LIKE ?');
    params.push(`%${String(query.nivel_risco).toLowerCase()}%`);
  }

  if (query.status) {
    filters.push('LOWER(COALESCE(r.status, \'\')) = ?');
    params.push(String(query.status).toLowerCase());
  }

  if (query.tipo_ponto) {
    filters.push(`EXISTS (
      SELECT 1 FROM rotograma_pontos_risco p
      WHERE p.rotograma_id = r.id AND LOWER(COALESCE(p.tipo_ponto, '')) LIKE ?
    )`);
    params.push(`%${String(query.tipo_ponto).toLowerCase()}%`);
  }

  if (query.rodovia) {
    filters.push(`EXISTS (
      SELECT 1 FROM rotograma_pontos_risco p
      WHERE p.rotograma_id = r.id AND LOWER(COALESCE(p.rodovia_endereco, '')) LIKE ?
    )`);
    params.push(`%${String(query.rodovia).toLowerCase()}%`);
  }

  if (boolValue(query.rota_critica)) {
    filters.push(`EXISTS (
      SELECT 1 FROM rotograma_pontos_risco p
      WHERE p.rotograma_id = r.id AND LOWER(COALESCE(p.nivel_risco, '')) IN ('alto', 'critico', 'crítico')
    )`);
  }

  if (isAdmin && boolValue(query.area_rural)) {
    filters.push(`EXISTS (
      SELECT 1 FROM rotograma_materiais m
      WHERE LOWER(COALESCE(m.tipo, '')) = 'rural'
        AND LOWER(COALESCE(m.dados_json, '') || COALESCE(m.descricao, '')) LIKE '%' || LOWER(COALESCE(r.cidade, r.destino, r.nome, '')) || '%'
    )`);
  }

  if (isAdmin && boolValue(query.lista_vermelha)) {
    filters.push(`EXISTS (
      SELECT 1 FROM rotograma_materiais m
      WHERE LOWER(COALESCE(m.tipo, '')) = 'lista_vermelha'
    )`);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

function shapePoint(row) {
  return {
    ...row,
    maps_url: row.latitude && row.longitude
      ? `https://www.google.com/maps?q=${encodeURIComponent(row.latitude)},${encodeURIComponent(row.longitude)}`
      : null
  };
}

router.get('/', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const { where, params } = buildListWhere(req.query, isAdminUser(req.user));
    const rows = await db.all(
      `SELECT
        r.*,
        COUNT(DISTINCT p.id) AS pontos_risco_count,
        COUNT(DISTINCT t.id) AS telefones_count
       FROM rotogramas r
       LEFT JOIN rotograma_pontos_risco p ON p.rotograma_id = r.id
       LEFT JOIN rotograma_telefones t ON t.rotograma_id = r.id
       ${where}
       GROUP BY r.id
       ORDER BY r.nome`,
      params
    );
    res.json(rows.map((row) => ({
      ...row,
      pontos_risco_count: Number(row.pontos_risco_count || 0),
      telefones_count: Number(row.telefones_count || 0)
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar rotogramas' });
  }
});

router.get('/materiais', authenticateToken, authorizeRoles('admin'), ensureRotogramaAvailable, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM rotograma_materiais ORDER BY tipo, titulo');
    res.json(rows.map((row) => ({
      ...row,
      dados: row.dados_json ? JSON.parse(row.dados_json) : []
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar materiais de seguranca' });
  }
});

router.get('/admin/importacoes', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM rotograma_importacoes ORDER BY created_at DESC LIMIT 20');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar importacoes de rotograma' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
  try {
    const result = await importWorkbook({ buffer: req.file.buffer });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao importar rotograma' });
  }
});

router.get('/:id/pontos', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const points = await db.all(
      'SELECT * FROM rotograma_pontos_risco WHERE rotograma_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json(points.map(shapePoint));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar pontos de risco' });
  }
});

router.get('/:id', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const isAdmin = isAdminUser(req.user);
    const resumo = await db.get('SELECT * FROM rotogramas WHERE id = ?', [req.params.id]);
    if (!resumo) return res.status(404).json({ error: 'Rotograma nao encontrado' });

    const [pontos, telefones, checklist] = await Promise.all([
      db.all('SELECT * FROM rotograma_pontos_risco WHERE rotograma_id = ? ORDER BY id', [req.params.id]),
      db.all('SELECT * FROM rotograma_telefones WHERE rotograma_id = ? ORDER BY orgao', [req.params.id]),
      db.all('SELECT * FROM rotograma_checklist WHERE rotograma_id = ? ORDER BY id', [req.params.id])
    ]);

    const payload = {
      resumo,
      pontos: pontos.map(shapePoint),
      telefones,
      checklist
    };

    if (isAdmin) {
      const [premissas, materiais] = await Promise.all([
        db.all('SELECT * FROM rotograma_premissas ORDER BY categoria, titulo'),
        db.all('SELECT * FROM rotograma_materiais ORDER BY tipo, titulo')
      ]);

      payload.premissas = premissas;
      payload.materiais = materiais.map((row) => ({
        ...row,
        dados: row.dados_json ? JSON.parse(row.dados_json) : []
      }));
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar detalhe do rotograma' });
  }
});

module.exports = router;
