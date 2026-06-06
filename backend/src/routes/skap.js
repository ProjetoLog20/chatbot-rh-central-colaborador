const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { importWorkbook, calculateLevel, parsePercent } = require('../../scripts/importSkapXlsx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

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

async function upsertSkap(colaborador, payload) {
  const proficiencia = parsePercent(payload.proficiencia ?? payload.proficiencia_percentual ?? payload.progresso_percentual);
  const level = calculateLevel(proficiencia);
  const existing = await db.get('SELECT * FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  const values = [
    level.nivel_skap,
    level.nivel_skap,
    proficiencia,
    parsePercent(payload.atingimento_habilidade_tecnica ?? payload.habilidades_tecnicas_percentual),
    String(payload.observacao_habilidade_tecnica || ''),
    parsePercent(payload.atingimento_habilidade_especifica ?? payload.habilidades_especificas_percentual),
    String(payload.observacao_habilidade_especifica || ''),
    parsePercent(payload.atingimento_habilidade_empoderamento ?? payload.habilidades_empoderamento_percentual),
    String(payload.observacao_habilidade_empoderamento || ''),
    proficiencia,
    level.proximo_nivel,
    level.percentual_para_proximo_nivel,
    String(payload.plano_acao || ''),
    level.status_skap,
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
           plano_acao = ?, status_skap = ?, data_avaliacao = ?,
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
        plano_acao, status_skap, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [colaborador.id, ...values]
    );
  }

  const current = await db.get('SELECT id FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  if (!existing || existing.nivel_skap !== level.nivel_skap || Number(existing.proficiencia ?? -1) !== proficiencia) {
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
        existing ? 'Alteracao de nivel/proficiencia via painel SKAP' : 'Primeira avaliacao SKAP',
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

router.post('/importar', authenticateToken, authorizeRoles('admin'), upload.single('file'), handleImport);
router.post('/admin/import', authenticateToken, authorizeRoles('admin'), upload.single('file'), handleImport);

module.exports = router;
