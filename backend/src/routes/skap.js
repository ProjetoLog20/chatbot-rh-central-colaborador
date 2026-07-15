const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { importWorkbook, calculateLevel, parsePercent } = require('../../scripts/importSkapXlsx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
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
    return res.status(400).json({ error: 'Arquivo excede o limite de 12 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload do arquivo' });
}

function normalizeLevel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'ouro') return 'Ouro';
  if (text === 'prata') return 'Prata';
  return 'Bronze';
}

function baseSkapSelect(whereClause = '') {
  return `
    SELECT
      c.id,
      c.id AS colaborador_id,
      c.matricula,
      c.nome_completo,
      c.cargo,
      c.setor,
      c.unidade,
      c.tipo_colaborador,
      s.id AS avaliacao_id,
      s.nivel_skap,
      s.nivel_original,
      s.progresso_percentual,
      s.atingimento_habilidade_tecnica,
      s.observacao_habilidade_tecnica,
      s.atingimento_habilidade_especifica,
      s.observacao_habilidade_especifica,
      s.atingimento_habilidade_empoderamento,
      s.observacao_habilidade_empoderamento,
      s.proficiencia,
      s.proximo_nivel,
      s.percentual_para_proximo_nivel,
      s.plano_acao,
      s.status_skap,
      s.proficiencia_percentual,
      s.habilidades_tecnicas_percentual,
      s.habilidades_especificas_percentual,
      s.habilidades_empoderamento_percentual,
      s.observacao_lideranca,
      s.data_avaliacao,
      s.updated_at,
      s.atualizado_em
    FROM colaboradores c
    LEFT JOIN skap_avaliacoes s ON s.colaborador_id = c.id
    ${whereClause}
  `;
}

async function getHistorico(colaboradorId) {
  return db.all(
    `SELECT id, nivel_anterior, nivel_novo, progresso_anterior, progresso_novo, motivo, data_avaliacao, criado_em
     FROM skap_historico
     WHERE colaborador_id = ?
     ORDER BY criado_em DESC`,
    [colaboradorId]
  );
}

function shapeSkap(row) {
  if (!row) return null;
  const proficiencia = Number(row.proficiencia ?? row.proficiencia_percentual ?? row.progresso_percentual ?? 0);
  const calculated = calculateLevel(proficiencia);
  return {
    ...row,
    nivel_skap: row.nivel_skap ? normalizeLevel(row.nivel_skap) : calculated.nivel_skap,
    proficiencia,
    proximo_nivel: row.proximo_nivel ?? calculated.proximo_nivel,
    percentual_para_proximo_nivel: row.percentual_para_proximo_nivel ?? calculated.percentual_para_proximo_nivel,
    status_skap: row.status_skap || calculated.status_skap,
    atingimento_habilidade_tecnica: Number(row.atingimento_habilidade_tecnica ?? row.habilidades_tecnicas_percentual ?? 0),
    atingimento_habilidade_especifica: Number(row.atingimento_habilidade_especifica ?? row.habilidades_especificas_percentual ?? 0),
    atingimento_habilidade_empoderamento: Number(row.atingimento_habilidade_empoderamento ?? row.habilidades_empoderamento_percentual ?? 0)
  };
}

function normalizePercentInput(value) {
  const parsed = parsePercent(value);
  return Math.max(0, Math.min(100, parsed));
}

function buildPercentIssues(rows) {
  const issues = [];
  const fields = [
    'proficiencia',
    'proficiencia_percentual',
    'atingimento_habilidade_tecnica',
    'habilidades_tecnicas_percentual',
    'atingimento_habilidade_especifica',
    'habilidades_especificas_percentual',
    'atingimento_habilidade_empoderamento',
    'habilidades_empoderamento_percentual',
    'percentual_para_proximo_nivel'
  ];
  const pairs = [
    ['proficiencia', 'proficiencia_percentual'],
    ['atingimento_habilidade_tecnica', 'habilidades_tecnicas_percentual'],
    ['atingimento_habilidade_especifica', 'habilidades_especificas_percentual'],
    ['atingimento_habilidade_empoderamento', 'habilidades_empoderamento_percentual']
  ];

  rows.forEach((row) => {
    fields.forEach((field) => {
      const value = Number(row[field]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        issues.push({
          colaborador_id: row.colaborador_id,
          matricula: row.matricula,
          nome_completo: row.nome_completo,
          campo: field,
          valor: row[field],
          problema: 'Percentual fora do intervalo 0-100'
        });
      }
    });

    pairs.forEach(([primary, mirror]) => {
      if (Math.abs(Number(row[primary] || 0) - Number(row[mirror] || 0)) > 0.01) {
        issues.push({
          colaborador_id: row.colaborador_id,
          matricula: row.matricula,
          nome_completo: row.nome_completo,
          campo: `${primary} / ${mirror}`,
          valor: `${row[primary]} / ${row[mirror]}`,
          problema: 'Campos percentuais divergentes'
        });
      }
    });
  });

  return issues;
}

async function upsertSkap(colaborador, payload) {
  const proficiencia = normalizePercentInput(payload.proficiencia ?? payload.proficiencia_percentual ?? payload.progresso_percentual);
  const tecnica = normalizePercentInput(payload.atingimento_habilidade_tecnica ?? payload.habilidades_tecnicas_percentual);
  const especifica = normalizePercentInput(payload.atingimento_habilidade_especifica ?? payload.habilidades_especificas_percentual);
  const empoderamento = normalizePercentInput(payload.atingimento_habilidade_empoderamento ?? payload.habilidades_empoderamento_percentual);
  const level = calculateLevel(proficiencia);
  const existing = await db.get('SELECT * FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  const values = [
    level.nivel_skap,
    level.nivel_skap,
    proficiencia,
    tecnica,
    String(payload.observacao_habilidade_tecnica || ''),
    especifica,
    String(payload.observacao_habilidade_especifica || ''),
    empoderamento,
    String(payload.observacao_habilidade_empoderamento || ''),
    proficiencia,
    level.proximo_nivel,
    level.percentual_para_proximo_nivel,
    String(payload.plano_acao || ''),
    level.status_skap,
    proficiencia,
    tecnica,
    especifica,
    empoderamento,
    payload.data_avaliacao || new Date().toISOString().slice(0, 10)
  ];

  if (existing) {
    await db.run(
      `UPDATE skap_avaliacoes
       SET nivel_skap = ?, nivel_original = ?, progresso_percentual = ?,
           atingimento_habilidade_tecnica = ?, observacao_habilidade_tecnica = ?,
           atingimento_habilidade_especifica = ?, observacao_habilidade_especifica = ?,
           atingimento_habilidade_empoderamento = ?, observacao_habilidade_empoderamento = ?,
           proficiencia = ?, proximo_nivel = ?, percentual_para_proximo_nivel = ?,
           plano_acao = ?, status_skap = ?,
           proficiencia_percentual = ?, habilidades_tecnicas_percentual = ?,
           habilidades_especificas_percentual = ?, habilidades_empoderamento_percentual = ?,
           data_avaliacao = ?,
           atualizado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE colaborador_id = ?`,
      [...values, colaborador.id]
    );
  } else {
    await db.run(
      `INSERT INTO skap_avaliacoes (
        colaborador_id, nivel_skap, nivel_original, progresso_percentual,
        atingimento_habilidade_tecnica, observacao_habilidade_tecnica,
        atingimento_habilidade_especifica, observacao_habilidade_especifica,
        atingimento_habilidade_empoderamento, observacao_habilidade_empoderamento,
        proficiencia, proximo_nivel, percentual_para_proximo_nivel,
        plano_acao, status_skap,
        proficiencia_percentual, habilidades_tecnicas_percentual,
        habilidades_especificas_percentual, habilidades_empoderamento_percentual,
        data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [colaborador.id, ...values]
    );
  }

  const current = await db.get('SELECT id FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  const percentChanged = [
    ['proficiencia', proficiencia],
    ['atingimento_habilidade_tecnica', tecnica],
    ['atingimento_habilidade_especifica', especifica],
    ['atingimento_habilidade_empoderamento', empoderamento]
  ].some(([field, value]) => Number(existing?.[field] ?? -1) !== value);

  if (!existing || existing.nivel_skap !== level.nivel_skap || percentChanged) {
    await db.run(
      `INSERT INTO skap_historico (
        colaborador_id, avaliacao_id, nivel_anterior, nivel_novo,
        progresso_anterior, progresso_novo, motivo, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colaborador.id,
        current.id,
        existing?.nivel_skap || null,
        level.nivel_skap,
        existing?.proficiencia ?? existing?.progresso_percentual ?? null,
        proficiencia,
        existing ? 'Alteracao de percentuais/nivel via painel SKAP' : 'Primeira avaliacao SKAP',
        payload.data_avaliacao || new Date().toISOString().slice(0, 10)
      ]
    );
  }

  return { created: !existing, updated: Boolean(existing) };
}

router.get('/meu', authenticateToken, async (req, res) => {
  const detalhe = await db.get(`${baseSkapSelect('WHERE c.id = ?')}`, [req.user.id]);
  if (!detalhe?.avaliacao_id) return res.status(404).json({ error: 'Voce ainda nao possui avaliacao SKAP registrada.' });
  const historico = await getHistorico(req.user.id);
  res.json({ ...shapeSkap(detalhe), historico });
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { busca, nivel, setor, cargo, unidade, tipo_colaborador } = req.query;
  const filters = ['s.id IS NOT NULL'];
  const params = [];

  if (busca) {
    filters.push('(LOWER(c.nome_completo) LIKE ? OR LOWER(c.matricula) LIKE ?)');
    params.push(`%${String(busca).toLowerCase()}%`, `%${String(busca).toLowerCase()}%`);
  }
  if (nivel) {
    filters.push('LOWER(s.nivel_skap) = ?');
    params.push(String(normalizeLevel(nivel)).toLowerCase());
  }
  for (const [column, value] of Object.entries({ setor, cargo, unidade, tipo_colaborador })) {
    if (value) {
      filters.push(`LOWER(COALESCE(c.${column}, '')) LIKE ?`);
      params.push(`%${String(value).toLowerCase()}%`);
    }
  }

  const rows = await db.all(`${baseSkapSelect(`WHERE ${filters.join(' AND ')}`)} ORDER BY c.nome_completo`, params);
  res.json(rows.map(shapeSkap));
});

router.get('/admin/check-percentuais', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all(`${baseSkapSelect('WHERE s.id IS NOT NULL')} ORDER BY c.nome_completo`);
    const shaped = rows.map(shapeSkap);
    const issues = buildPercentIssues(shaped);
    return res.json({
      total_avaliacoes: shaped.length,
      total_problemas: issues.length,
      problemas: issues
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao checar percentuais SKAP' });
  }
});

router.get('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const colaboradorId = Number(req.params.colaboradorId);
  const detalhe = await db.get(`${baseSkapSelect('WHERE c.id = ?')}`, [colaboradorId]);
  if (!detalhe) return res.status(404).json({ error: 'Colaborador nao encontrado' });
  if (!detalhe.avaliacao_id) return res.status(404).json({ error: 'SKAP nao encontrado' });
  const historico = await getHistorico(colaboradorId);
  res.json({ ...shapeSkap(detalhe), historico });
});

router.put('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const colaboradorId = Number(req.params.colaboradorId);
  const colaborador = await db.get('SELECT * FROM colaboradores WHERE id = ?', [colaboradorId]);
  if (!colaborador) return res.status(404).json({ error: 'Colaborador nao encontrado' });
  const result = await upsertSkap(colaborador, req.body);
  res.json({ message: 'Avaliacao SKAP atualizada.', ...result });
});

async function handleImport(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
  try {
    const result = await importWorkbook({ buffer: req.file.buffer });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao importar SKAP' });
  }
}

router.post('/importar', authenticateToken, authorizeRoles('admin'), upload.single('file'), uploadError, handleImport);
router.post('/admin/import', authenticateToken, authorizeRoles('admin'), upload.single('file'), uploadError, handleImport);

module.exports = router;
