const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importWorkbook } = require('../../scripts/importRotogramaXlsx');
const { normalizeCoordinatePair } = require('../utils/rotogramaCoordinates');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ext !== 'xlsx') {
      return callback(new Error('Apenas arquivos .xlsx sao permitidos'));
    }
    return callback(null, true);
  }
});

function uploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo excede o limite de 300 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload do arquivo' });
}

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

async function canEditRotograma(user) {
  if (!user?.id) return false;
  const permission = await db.get(
    `SELECT id FROM permissoes_colaboradores
     WHERE colaborador_id = ? AND permissao = ? AND COALESCE(ativo, true) = true`,
    [user.id, 'rotograma_editar']
  );
  return Boolean(permission);
}

async function requireRotogramaEditor(req, res, next) {
  try {
    if (!await canEditRotograma(req.user)) {
      return res.status(403).json({ error: 'Edição do Rotograma não autorizada para esta matrícula.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao validar permissão de edição do Rotograma.' });
  }
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function auditChange(req, entidade, entidadeId, acao, before, after) {
  await db.run(
    `INSERT INTO rotograma_auditoria
      (colaborador_id, matricula, entidade, entidade_id, acao, antes_json, depois_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      req.user.matricula,
      entidade,
      entidadeId,
      acao,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    ]
  );
}

function buildListWhere(query, isAdmin = false) {
  const filters = [
    'COALESCE(r.ativo, true) = true',
    "r.classificacao_rota IN ('ATENÇÃO', 'OK')"
  ];
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

  if (query.origem) {
    filters.push('COALESCE(r.origem, \'\') = ?');
    params.push(String(query.origem));
  }

  if (query.destino) {
    filters.push('COALESCE(r.destino, r.cidade, r.nome, \'\') = ?');
    params.push(String(query.destino));
  }

  if (query.nivel_risco) {
    filters.push('LOWER(COALESCE(r.nivel_risco, r.classificacao_rota, \'\')) LIKE ?');
    params.push(`%${String(query.nivel_risco).toLowerCase()}%`);
  }

  if (query.classificacao) {
    const classification = String(query.classificacao).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (classification === 'atencao') {
      filters.push("r.classificacao_rota = 'ATENÇÃO'");
    } else if (classification === 'ok') {
      filters.push("r.classificacao_rota = 'OK'");
    }
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
  let segment = null;
  const start = normalizeCoordinatePair(row.latitude, row.longitude);
  const end = normalizeCoordinatePair(row.fim_latitude, row.fim_longitude);
  if (start.valid && end.valid) {
    segment = [
      [Number(start.latitude), Number(start.longitude)],
      [Number(end.latitude), Number(end.longitude)]
    ];
  }
  return {
    ...row,
    ordem: row.ordem === null || row.ordem === undefined ? null : Number(row.ordem),
    segment,
    maps_url: row.latitude && row.longitude
      ? `https://www.google.com/maps?q=${encodeURIComponent(row.latitude)},${encodeURIComponent(row.longitude)}`
      : null
  };
}

function parseMapPath(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => Array.isArray(item) && item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1])))
      .map((item) => [Number(item[0]), Number(item[1])]);
  } catch {
    return [];
  }
}

function shapeSupportZone(row) {
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusKm: Number(row.raio_km || 8),
    active: boolValue(row.ativo)
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

router.get('/opcoes', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT origem, destino, cidade, nome
       FROM rotogramas
       WHERE COALESCE(ativo, true) = true
         AND classificacao_rota IN ('ATENÇÃO', 'OK')
       ORDER BY origem, destino, cidade, nome`
    );

    const origens = [...new Set(rows.map((row) => row.origem).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const destinos = [...new Set(rows.map((row) => row.destino || row.cidade || row.nome).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    res.json({ origens, destinos });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar opcoes de rotogramas' });
  }
});

router.get('/mapa-geral', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const routes = await db.all(
      `SELECT id, nome, origem, destino, cidade, classificacao_rota, nivel_risco,
              distancia_km, duracao_minutos, map_path_json
       FROM rotogramas
       WHERE COALESCE(ativo, true) = true
         AND classificacao_rota IN ('ATENÃ‡ÃƒO', 'OK')
       ORDER BY nome`
    );
    const points = await db.all(
      `SELECT id, rotograma_id, latitude, longitude, fim_latitude, fim_longitude, ordem
       FROM rotograma_pontos_risco
       WHERE COALESCE(latitude, '') <> '' AND COALESCE(longitude, '') <> ''
       ORDER BY rotograma_id, COALESCE(ordem, id), id`
    );
    const grouped = new Map();
    points.forEach((point) => {
      const normalized = normalizeCoordinatePair(point.latitude, point.longitude);
      if (!normalized.valid) return;
      if (!grouped.has(point.rotograma_id)) grouped.set(point.rotograma_id, []);
      grouped.get(point.rotograma_id).push([Number(normalized.latitude), Number(normalized.longitude)]);
    });
    const payload = routes.map((route) => {
      const cachedPath = parseMapPath(route.map_path_json);
      const positions = cachedPath.length ? cachedPath : (grouped.get(route.id) || []);
      const center = positions.length
        ? [
          positions.reduce((sum, item) => sum + item[0], 0) / positions.length,
          positions.reduce((sum, item) => sum + item[1], 0) / positions.length
        ]
        : null;
      return {
        ...route,
        map_path_json: undefined,
        center,
        start: positions[0] || null,
        end: positions[positions.length - 1] || null,
        hasOfficialGeometry: cachedPath.length > 1
      };
    }).filter((route) => route.center);
    return res.json(payload);
  } catch (error) {
    console.error(`[${req.requestId}] Falha ao carregar mapa geral dos rotogramas:`, error.message || error);
    return res.status(500).json({ error: 'Erro ao carregar o mapa geral dos rotogramas.' });
  }
});

router.get('/areas-suporte', authenticateToken, ensureRotogramaAvailable, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM rotograma_areas_suporte
       WHERE rotograma_id IS NULL AND COALESCE(ativo, true) = true
       ORDER BY nome`
    );
    return res.json(rows.map(shapeSupportZone));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar as regiÃµes de suporte.' });
  }
});

router.get('/admin/resumo', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const importacao = await db.get(
      'SELECT * FROM rotograma_importacoes WHERE COALESCE(ativo, true) = true ORDER BY created_at DESC LIMIT 1'
    );
    const resumo = await db.get(
      `SELECT
        COUNT(*) AS total_rotas,
        SUM(CASE WHEN classificacao_rota = 'ATENÇÃO' THEN 1 ELSE 0 END) AS total_atencao,
        SUM(CASE WHEN classificacao_rota = 'OK' THEN 1 ELSE 0 END) AS total_ok
       FROM rotogramas
       WHERE COALESCE(ativo, true) = true
         AND classificacao_rota IN ('ATENÇÃO', 'OK')`
    );
    const detalhes = importacao?.detalhes_json ? JSON.parse(importacao.detalhes_json) : {};

    res.json({
      total_rotas: Number(resumo?.total_rotas || 0),
      total_atencao: Number(resumo?.total_atencao || detalhes.total_atencao || 0),
      total_ok: Number(resumo?.total_ok || detalhes.total_ok || 0),
      rotas_ignoradas: Number(detalhes.ignoradas_por_classificacao || 0),
      abas_ignoradas: detalhes.abas_ignoradas || [],
      erros: detalhes.erros || [],
      ultima_importacao: importacao?.created_at || null,
      arquivo: importacao?.arquivo || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar resumo de importacao dos rotogramas' });
  }
});

router.get('/permissoes', authenticateToken, async (req, res) => {
  try {
    res.json({ pode_editar: await canEditRotograma(req.user) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar permissão do Rotograma.' });
  }
});

router.put('/:id/manual', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const before = await db.get(
      'SELECT * FROM rotogramas WHERE id = ? AND COALESCE(ativo, true) = true',
      [req.params.id]
    );
    if (!before) return res.status(404).json({ error: 'Rotograma não encontrado.' });

    const classification = text(req.body.classificacao_rota, 30).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (!['ATENCAO', 'OK'].includes(classification)) {
      return res.status(400).json({ error: 'Classificação deve ser ATENÇÃO ou OK.' });
    }
    const storedClassification = classification === 'ATENCAO' ? 'ATENÃ‡ÃƒO' : 'OK';

    await db.run(
      `UPDATE rotogramas SET
        nome = ?, origem = ?, destino = ?, cidade = ?, classificacao_rota = ?,
        nivel_risco = ?, observacao = ?, data_atualizacao = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        text(req.body.nome, 160),
        text(req.body.origem, 160),
        text(req.body.destino, 160),
        text(req.body.cidade, 160),
        storedClassification,
        text(req.body.nivel_risco, 50),
        text(req.body.observacao, 1000),
        new Date().toISOString().slice(0, 10),
        req.params.id
      ]
    );
    const after = await db.get('SELECT * FROM rotogramas WHERE id = ?', [req.params.id]);
    await auditChange(req, 'rotograma', Number(req.params.id), 'atualizar', before, after);
    return res.json(after);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar o Rotograma.' });
  }
});

router.put('/:id/geometria', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const route = await db.get('SELECT * FROM rotogramas WHERE id = ?', [req.params.id]);
    if (!route) return res.status(404).json({ error: 'Rotograma nÃ£o encontrado.' });
    const path = Array.isArray(req.body.path) ? req.body.path : [];
    const normalizedPath = path
      .filter((item) => Array.isArray(item) && item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1])))
      .map((item) => [Number(item[0]), Number(item[1])]);
    if (normalizedPath.length < 2 || normalizedPath.length > 20000) {
      return res.status(400).json({ error: 'A geometria deve conter entre 2 e 20.000 coordenadas.' });
    }
    await db.run(
      `UPDATE rotogramas SET map_path_json = ?, distancia_km = ?, duracao_minutos = ?,
       geometry_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(normalizedPath), Number(req.body.distanceKm) || null, Number(req.body.durationMinutes) || null, req.params.id]
    );
    const after = await db.get('SELECT * FROM rotogramas WHERE id = ?', [req.params.id]);
    await auditChange(req, 'geometria_rota', Number(req.params.id), 'atualizar', { map_path_json: route.map_path_json }, { map_path_json: after.map_path_json });
    return res.json({ ok: true, mapPath: normalizedPath });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao salvar a geometria da rota.' });
  }
});

router.post('/:id/areas-suporte', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const route = await db.get('SELECT id FROM rotogramas WHERE id = ?', [req.params.id]);
    if (!route) return res.status(404).json({ error: 'Rotograma nÃ£o encontrado.' });
    const coordinates = normalizeCoordinatePair(req.body.latitude, req.body.longitude);
    const radiusKm = Number(req.body.radiusKm || req.body.raio_km);
    if (!coordinates.valid) return res.status(400).json({ error: 'Coordenadas invÃ¡lidas para a regiÃ£o atendida.' });
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) return res.status(400).json({ error: 'O raio deve ficar entre 1 e 100 km.' });
    const result = await db.run(
      `INSERT INTO rotograma_areas_suporte (rotograma_id, nome, latitude, longitude, raio_km, observacao, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, text(req.body.nome || 'RegiÃ£o com suporte', 120), coordinates.latitude, coordinates.longitude, radiusKm, text(req.body.observacao, 500), true]
    );
    const created = await db.get('SELECT * FROM rotograma_areas_suporte WHERE id = ?', [result.lastID]);
    await auditChange(req, 'area_suporte', created.id, 'criar', null, created);
    return res.status(201).json(shapeSupportZone(created));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao criar a Ã¡rea de suporte.' });
  }
});

router.put('/:id/areas-suporte/:zoneId', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const before = await db.get('SELECT * FROM rotograma_areas_suporte WHERE id = ? AND rotograma_id = ?', [req.params.zoneId, req.params.id]);
    if (!before) return res.status(404).json({ error: 'Ãrea de suporte nÃ£o encontrada.' });
    const coordinates = normalizeCoordinatePair(req.body.latitude, req.body.longitude);
    const radiusKm = Number(req.body.radiusKm || req.body.raio_km);
    if (!coordinates.valid || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
      return res.status(400).json({ error: 'Informe coordenadas vÃ¡lidas e raio entre 1 e 100 km.' });
    }
    await db.run(
      `UPDATE rotograma_areas_suporte SET nome = ?, latitude = ?, longitude = ?, raio_km = ?,
       observacao = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND rotograma_id = ?`,
      [text(req.body.nome || 'RegiÃ£o com suporte', 120), coordinates.latitude, coordinates.longitude, radiusKm, text(req.body.observacao, 500), req.body.active === false ? false : true, req.params.zoneId, req.params.id]
    );
    const after = await db.get('SELECT * FROM rotograma_areas_suporte WHERE id = ?', [req.params.zoneId]);
    await auditChange(req, 'area_suporte', after.id, 'atualizar', before, after);
    return res.json(shapeSupportZone(after));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar a Ã¡rea de suporte.' });
  }
});

router.delete('/:id/areas-suporte/:zoneId', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const before = await db.get('SELECT * FROM rotograma_areas_suporte WHERE id = ? AND rotograma_id = ?', [req.params.zoneId, req.params.id]);
    if (!before) return res.status(404).json({ error: 'Ãrea de suporte nÃ£o encontrada.' });
    await auditChange(req, 'area_suporte', before.id, 'excluir', before, null);
    await db.run('DELETE FROM rotograma_areas_suporte WHERE id = ? AND rotograma_id = ?', [req.params.zoneId, req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao excluir a Ã¡rea de suporte.' });
  }
});

router.post('/:id/pontos/manual', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const route = await db.get(
      'SELECT id, cidade FROM rotogramas WHERE id = ? AND COALESCE(ativo, true) = true',
      [req.params.id]
    );
    if (!route) return res.status(404).json({ error: 'Rotograma não encontrado.' });

    const coordinates = normalizeCoordinatePair(req.body.latitude, req.body.longitude);
    if ((req.body.latitude || req.body.longitude) && !coordinates.valid) {
      return res.status(400).json({ error: 'Latitude ou longitude inválida para a região atendida.' });
    }
    const result = await db.run(
      `INSERT INTO rotograma_pontos_risco
        (rotograma_id, tipo_ponto, descricao, nivel_risco, rodovia_endereco, orientacao,
         latitude, longitude, fim_latitude, fim_longitude, trecho_nivel, ordem,
         velocidade_permitida, velocidade_segura, cidade, origem_aba)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        text(req.body.tipo_ponto, 80),
        text(req.body.descricao, 300),
        text(req.body.nivel_risco, 50),
        text(req.body.rodovia_endereco, 300),
        text(req.body.orientacao, 1000),
        coordinates.valid ? coordinates.latitude : '',
        coordinates.valid ? coordinates.longitude : '',
        normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).valid ? normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).latitude : '',
        normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).valid ? normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).longitude : '',
        text(req.body.trecho_nivel || req.body.nivel_risco, 50),
        Number(req.body.ordem) || null,
        text(req.body.velocidade_permitida, 50),
        text(req.body.velocidade_segura, 50),
        text(req.body.cidade || route.cidade, 160),
        'Edição manual'
      ]
    );
    const created = await db.get(
      'SELECT * FROM rotograma_pontos_risco WHERE id = ?',
      [result.lastID]
    );
    await auditChange(req, 'ponto_risco', created.id, 'criar', null, created);
    return res.status(201).json(shapePoint(created));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao adicionar ponto de risco.' });
  }
});

router.put('/:id/pontos/:pointId/manual', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const before = await db.get(
      'SELECT * FROM rotograma_pontos_risco WHERE id = ? AND rotograma_id = ?',
      [req.params.pointId, req.params.id]
    );
    if (!before) return res.status(404).json({ error: 'Ponto de risco não encontrado.' });

    const coordinates = normalizeCoordinatePair(req.body.latitude, req.body.longitude);
    if ((req.body.latitude || req.body.longitude) && !coordinates.valid) {
      return res.status(400).json({ error: 'Latitude ou longitude inválida para a região atendida.' });
    }
    await db.run(
      `UPDATE rotograma_pontos_risco SET
        tipo_ponto = ?, descricao = ?, nivel_risco = ?, rodovia_endereco = ?, orientacao = ?,
        latitude = ?, longitude = ?, fim_latitude = ?, fim_longitude = ?, trecho_nivel = ?, ordem = ?,
        velocidade_permitida = ?, velocidade_segura = ?, cidade = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND rotograma_id = ?`,
      [
        text(req.body.tipo_ponto, 80),
        text(req.body.descricao, 300),
        text(req.body.nivel_risco, 50),
        text(req.body.rodovia_endereco, 300),
        text(req.body.orientacao, 1000),
        coordinates.valid ? coordinates.latitude : '',
        coordinates.valid ? coordinates.longitude : '',
        normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).valid ? normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).latitude : '',
        normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).valid ? normalizeCoordinatePair(req.body.fim_latitude, req.body.fim_longitude).longitude : '',
        text(req.body.trecho_nivel || req.body.nivel_risco, 50),
        Number(req.body.ordem) || null,
        text(req.body.velocidade_permitida, 50),
        text(req.body.velocidade_segura, 50),
        text(req.body.cidade, 160),
        req.params.pointId,
        req.params.id
      ]
    );
    const after = await db.get('SELECT * FROM rotograma_pontos_risco WHERE id = ?', [req.params.pointId]);
    await auditChange(req, 'ponto_risco', after.id, 'atualizar', before, after);
    return res.json(shapePoint(after));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar ponto de risco.' });
  }
});

router.delete('/:id/pontos/:pointId/manual', authenticateToken, requireRotogramaEditor, async (req, res) => {
  try {
    const before = await db.get(
      'SELECT * FROM rotograma_pontos_risco WHERE id = ? AND rotograma_id = ?',
      [req.params.pointId, req.params.id]
    );
    if (!before) return res.status(404).json({ error: 'Ponto de risco não encontrado.' });
    await auditChange(req, 'ponto_risco', before.id, 'excluir', before, null);
    await db.run('DELETE FROM rotograma_pontos_risco WHERE id = ? AND rotograma_id = ?', [req.params.pointId, req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao excluir ponto de risco.' });
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

router.post('/importar', authenticateToken, authorizeRoles('admin'), upload.single('file'), uploadError, async (req, res) => {
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
    const resumo = await db.get(
      "SELECT id FROM rotogramas WHERE id = ? AND COALESCE(ativo, true) = true AND classificacao_rota IN ('ATENÇÃO', 'OK')",
      [req.params.id]
    );
    if (!resumo) return res.status(404).json({ error: 'Rotograma nao encontrado' });
    const points = await db.all(
      'SELECT * FROM rotograma_pontos_risco WHERE rotograma_id = ? ORDER BY COALESCE(ordem, id), id',
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
    const resumo = await db.get(
      "SELECT * FROM rotogramas WHERE id = ? AND COALESCE(ativo, true) = true AND classificacao_rota IN ('ATENÇÃO', 'OK')",
      [req.params.id]
    );
    if (!resumo) return res.status(404).json({ error: 'Rotograma nao encontrado' });

    const [pontos, telefones, checklist, supportZones] = await Promise.all([
      db.all('SELECT * FROM rotograma_pontos_risco WHERE rotograma_id = ? ORDER BY COALESCE(ordem, id), id', [req.params.id]),
      db.all('SELECT * FROM rotograma_telefones WHERE rotograma_id = ? ORDER BY orgao', [req.params.id]),
      db.all('SELECT * FROM rotograma_checklist WHERE rotograma_id = ? ORDER BY id', [req.params.id]),
      db.all('SELECT * FROM rotograma_areas_suporte WHERE (rotograma_id = ? OR rotograma_id IS NULL) AND COALESCE(ativo, true) = true ORDER BY rotograma_id, nome, id', [req.params.id])
    ]);

    const payload = {
      resumo,
      pontos: pontos.map(shapePoint),
      telefones,
      checklist,
      mapPath: parseMapPath(resumo.map_path_json),
      mapMetrics: {
        distanceKm: resumo.distancia_km === null ? null : Number(resumo.distancia_km),
        durationMinutes: resumo.duracao_minutos === null ? null : Number(resumo.duracao_minutos),
        updatedAt: resumo.geometry_updated_at || null
      },
      supportZones: supportZones.map(shapeSupportZone)
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
    console.error(`[${req.requestId}] Falha ao carregar detalhe do rotograma ${req.params.id}:`, error.message || error);
    return res.status(500).json({ error: 'Erro ao carregar detalhe do rotograma' });
  }
});

module.exports = router;
