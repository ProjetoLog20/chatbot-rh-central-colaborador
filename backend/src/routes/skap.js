const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

const criteriaColumns = [
  'atendimento',
  'cinco_s',
  'retorno_rota',
  'seguranca',
  'evolucao_atendimento',
  'evolucao_cinco_s',
  'evolucao_retorno_rota',
  'evolucao_seguranca',
  'empoderamento',
  'longa_distancia',
  'campeao_seguranca',
  'autonomia'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return stripAccents(value).trim().toLowerCase();
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function cell(row, key) {
  return row[normalizeKey(key)];
}

function trim(value) {
  return String(value ?? '').trim();
}

function normalizeCriterion(value) {
  const normalized = normalizeText(value).replace(/\s+/g, '_');
  if (['concluido', 'ok', 'sim'].includes(normalized)) return 'concluido';
  if (['em_evolucao', 'evolucao'].includes(normalized)) return 'em_evolucao';
  return 'pendente';
}

function criterionScore(value) {
  if (value === 'concluido') return 100;
  if (value === 'em_evolucao') return 50;
  return 0;
}

function normalizeLevel(value) {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  if (['bronze', 'inicial', 'atendimento basico'].includes(normalized)) return 'bronze';
  if (['prata', 'verde', 'evolucao', 'atendimento proativo'].includes(normalized)) return 'prata';
  if (['ouro', 'avancado', 'empoderamento'].includes(normalized)) return 'ouro';
  if (normalized.includes('atendimento basico')) return 'bronze';
  if (normalized.includes('atendimento proativo') || normalized.includes('evolucao')) return 'prata';
  if (normalized.includes('empoderamento') || normalized.includes('avancado')) return 'ouro';
  return normalized || 'bronze';
}

function parseNumber(value) {
  const text = trim(value).replace('%', '').replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = trim(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function calculateProgressFromPayload(payload) {
  const filled = criteriaColumns
    .map((column) => payload[column])
    .filter((value) => trim(value) !== '')
    .map(normalizeCriterion);

  if (!filled.length) return 0;
  return Number((filled.reduce((sum, value) => sum + criterionScore(value), 0) / filled.length).toFixed(2));
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
      s.proficiencia_percentual,
      s.habilidades_tecnicas_percentual,
      s.habilidades_especificas_percentual,
      s.habilidades_empoderamento_percentual,
      s.atendimento,
      s.cinco_s,
      s.retorno_rota,
      s.seguranca,
      s.evolucao_atendimento,
      s.evolucao_cinco_s,
      s.evolucao_retorno_rota,
      s.evolucao_seguranca,
      s.empoderamento,
      s.longa_distancia,
      s.campeao_seguranca,
      s.autonomia,
      s.observacao_lideranca,
      s.data_avaliacao
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

async function upsertSkap(colaborador, payload) {
  const existing = await db.get(
    'SELECT id, nivel_skap, progresso_percentual FROM skap_avaliacoes WHERE colaborador_id = ?',
    [colaborador.id]
  );

  const normalizedPayload = {};
  for (const column of criteriaColumns) {
    normalizedPayload[column] = normalizeCriterion(payload[column]);
  }

  const nivelSkap = normalizeLevel(payload.nivel_skap || payload.nivel_original);
  const progresso = payload.progresso_percentual !== undefined && payload.progresso_percentual !== ''
    ? parseNumber(payload.progresso_percentual)
    : calculateProgressFromPayload(payload);

  const values = [
    nivelSkap,
    trim(payload.nivel_original),
    progresso,
    parseNumber(payload.proficiencia_percentual),
    parseNumber(payload.habilidades_tecnicas_percentual),
    parseNumber(payload.habilidades_especificas_percentual),
    parseNumber(payload.habilidades_empoderamento_percentual),
    trim(payload.cargo) || colaborador.cargo,
    trim(payload.atividade),
    trim(payload.tempo_de_casa),
    ...criteriaColumns.map((column) => normalizedPayload[column]),
    trim(payload.observacao_lideranca),
    parseDate(payload.data_avaliacao)
  ];

  if (existing) {
    await db.run(
      `UPDATE skap_avaliacoes
       SET nivel_skap = ?, nivel_original = ?, progresso_percentual = ?,
           proficiencia_percentual = ?, habilidades_tecnicas_percentual = ?,
           habilidades_especificas_percentual = ?, habilidades_empoderamento_percentual = ?,
           cargo = ?, atividade = ?, tempo_de_casa = ?,
           atendimento = ?, cinco_s = ?, retorno_rota = ?, seguranca = ?,
           evolucao_atendimento = ?, evolucao_cinco_s = ?, evolucao_retorno_rota = ?,
           evolucao_seguranca = ?, empoderamento = ?, longa_distancia = ?,
           campeao_seguranca = ?, autonomia = ?, observacao_lideranca = ?,
           data_avaliacao = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE colaborador_id = ?`,
      [...values, colaborador.id]
    );
  } else {
    await db.run(
      `INSERT INTO skap_avaliacoes (
        colaborador_id, nivel_skap, nivel_original, progresso_percentual,
        proficiencia_percentual, habilidades_tecnicas_percentual,
        habilidades_especificas_percentual, habilidades_empoderamento_percentual,
        cargo, atividade, tempo_de_casa,
        atendimento, cinco_s, retorno_rota, seguranca,
        evolucao_atendimento, evolucao_cinco_s, evolucao_retorno_rota, evolucao_seguranca,
        empoderamento, longa_distancia, campeao_seguranca, autonomia,
        observacao_lideranca, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [colaborador.id, ...values]
    );
  }

  const previousLevel = existing?.nivel_skap ? normalizeLevel(existing.nivel_skap) : null;
  if (!existing || previousLevel !== nivelSkap) {
    const current = await db.get('SELECT id FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
    await db.run(
      `INSERT INTO skap_historico (
        colaborador_id, avaliacao_id, nivel_anterior, nivel_novo,
        progresso_anterior, progresso_novo, motivo, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colaborador.id,
        current.id,
        previousLevel,
        nivelSkap,
        existing?.progresso_percentual ?? null,
        progresso,
        existing ? 'Alteracao de nivel via painel SKAP' : 'Primeira avaliacao SKAP',
        parseDate(payload.data_avaliacao)
      ]
    );
  }

  return { created: !existing, updated: Boolean(existing) };
}

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { busca, nivel, setor, cargo, unidade, tipo_colaborador } = req.query;
  const filters = [];
  const params = [];

  if (busca) {
    filters.push('(LOWER(c.nome_completo) LIKE ? OR LOWER(c.matricula) LIKE ?)');
    params.push(`%${String(busca).toLowerCase()}%`, `%${String(busca).toLowerCase()}%`);
  }
  if (nivel) {
    const normalizedLevel = normalizeLevel(nivel);
    if (normalizedLevel === 'prata') {
      filters.push('s.nivel_skap IN (?, ?)');
      params.push('prata', 'verde');
    } else {
      filters.push('s.nivel_skap = ?');
      params.push(normalizedLevel);
    }
  }
  for (const [column, value] of Object.entries({ setor, cargo, unidade, tipo_colaborador })) {
    if (value) {
      filters.push(`LOWER(c.${column}) LIKE ?`);
      params.push(`%${String(value).toLowerCase()}%`);
    }
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.all(`${baseSkapSelect(where)} ORDER BY c.nome_completo`, params);
  res.json(rows);
});

router.get('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const colaboradorId = Number(req.params.colaboradorId);
  const detalhe = await db.get(`${baseSkapSelect('WHERE c.id = ?')}`, [colaboradorId]);
  if (!detalhe) return res.status(404).json({ error: 'Colaborador nao encontrado' });
  const historico = await getHistorico(colaboradorId);
  res.json({ ...detalhe, historico });
});

router.put('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const colaboradorId = Number(req.params.colaboradorId);
  const colaborador = await db.get('SELECT * FROM colaboradores WHERE id = ?', [colaboradorId]);
  if (!colaborador) return res.status(404).json({ error: 'Colaborador nao encontrado' });

  const result = await upsertSkap(colaborador, req.body);
  res.json({ message: 'Avaliacao SKAP atualizada.', ...result });
});

router.post('/admin/import', authenticateToken, authorizeRoles('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets.IMPORTAR_SKAP || workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);
  const errors = [];
  let created = 0;
  let updated = 0;
  let ignored = 0;

  for (const [index, row] of rows.entries()) {
    const matricula = trim(cell(row, 'matricula'));
    if (!matricula) {
      ignored += 1;
      errors.push({ linha: index + 2, error: 'Matricula vazia' });
      continue;
    }

    try {
      const colaborador = await db.get('SELECT * FROM colaboradores WHERE matricula = ?', [matricula]);
      if (!colaborador) {
        ignored += 1;
        errors.push({ linha: index + 2, matricula, error: 'Matricula nao encontrada' });
        continue;
      }

      const result = await upsertSkap(colaborador, row);
      if (result.created) created += 1;
      if (result.updated) updated += 1;
    } catch (error) {
      ignored += 1;
      errors.push({ linha: index + 2, matricula, error: error.message });
    }
  }

  res.json({ total: rows.length, created, updated, ignored, errors });
});

router.get('/meu', authenticateToken, async (req, res) => {
  const detalhe = await db.get(`${baseSkapSelect('WHERE c.id = ?')}`, [req.user.id]);
  if (!detalhe) return res.status(404).json({ error: 'SKAP nao encontrado' });
  const historico = await getHistorico(req.user.id);
  res.json({ ...detalhe, historico });
});

module.exports = router;
