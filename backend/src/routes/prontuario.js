const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { importWorkbook } = require('../../scripts/importProntuarioXls');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) {
      return callback(new Error('Apenas arquivos .xls ou .xlsx sao permitidos'));
    }
    return callback(null, true);
  }
});

function uploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo excede o limite de 20 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload do arquivo' });
}

const uploadSingleFile = [upload.single('file'), uploadError];

const selectProntuario = `
  SELECT
    p.*,
    c.nome_completo,
    c.nome_preferido,
    c.setor,
    c.unidade,
    COALESCE(p.matricula, c.matricula) AS matricula,
    COALESCE(p.cargo, c.cargo) AS cargo
  FROM prontuarios_motoristas p
  JOIN colaboradores c ON c.id = p.colaborador_id
`;

const csvColumns = [
  'matricula',
  'nome_completo',
  'nome_condutor',
  'cpf',
  'cargo',
  'status_prontuario',
  'pontuacao_cnh',
  'vencimento_cnh',
  'pontuacao_ponderada',
  'faixa',
  'cor_faixa',
  'quantidade_sonolencia',
  'acidentes_fai',
  'acidentes_lti',
  'acidentes_mdi',
  'acidentes_mti',
  'capotamentos',
  'colisoes',
  'tombamentos',
  'multa_grave',
  'multa_gravissima',
  'multa_leve',
  'multa_media',
  'advertencias',
  'suspensoes',
  'telemetria_excesso_velocidade_1',
  'telemetria_excesso_velocidade_2',
  'telemetria_excesso_velocidade_3',
  'telemetria_forca_g',
  'telemetria_frenagem_brusca',
  'regiao_geo',
  'atividade',
  'empresa',
  'operacao',
  'data_importacao'
];

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function buildAdminFilters(query) {
  const { busca, faixa, cor_faixa, status, cargo, operacao, atividade } = query;
  const filters = [];
  const params = [];

  if (busca) {
    const text = String(busca).trim().toLowerCase();
    const doc = digits(text);
    if (doc) {
      filters.push('(LOWER(c.nome_completo) LIKE ? OR LOWER(COALESCE(p.matricula, c.matricula)) LIKE ? OR p.cpf LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${doc}%`);
    } else {
      filters.push('(LOWER(c.nome_completo) LIKE ? OR LOWER(COALESCE(p.matricula, c.matricula)) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`);
    }
  }

  for (const [column, value] of Object.entries({
    faixa,
    cor_faixa,
    status_prontuario: status,
    cargo,
    operacao,
    atividade
  })) {
    if (value) {
      filters.push(`LOWER(COALESCE(p.${column}, '')) LIKE ?`);
      params.push(`%${String(value).toLowerCase()}%`);
    }
  }

  return {
    where: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

function summarize(rows) {
  const summary = {
    total: rows.length,
    colors: { verde: 0, amarelo: 0, vermelho: 0, sem_faixa: 0 },
    faixas: {}
  };

  rows.forEach((row) => {
    const color = row.cor_faixa || 'sem_faixa';
    if (!summary.colors[color]) summary.colors[color] = 0;
    summary.colors[color] += 1;
    const faixa = row.faixa || 'Sem faixa';
    summary.faixas[faixa] = (summary.faixas[faixa] || 0) + 1;
  });

  return summary;
}

function toCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    csvColumns.join(';'),
    ...rows.map((row) => csvColumns.map((column) => escape(row[column])).join(';'))
  ].join('\n');
}

async function listAdmin(req, res) {
  const { where, params } = buildAdminFilters(req.query);
  const rows = await db.all(`${selectProntuario} ${where} ORDER BY c.nome_completo`, params);
  res.json({ rows, summary: summarize(rows) });
}

router.get('/meu', authenticateToken, async (req, res) => {
  try {
    const row = await db.get(`${selectProntuario} WHERE p.colaborador_id = ?`, [req.user.id]);
    if (!row) {
      return res.status(404).json({ error: 'Voce ainda nao possui prontuario registrado.' });
    }
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar prontuario' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const row = await db.get(`${selectProntuario} WHERE p.colaborador_id = ?`, [req.user.id]);
    if (!row) {
      return res.status(404).json({ error: 'Voce ainda nao possui prontuario registrado.' });
    }
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar prontuario' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await listAdmin(req, res);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar prontuarios' });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all(`${selectProntuario} ORDER BY c.nome_completo`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar prontuarios' });
  }
});

router.get('/admin/exportar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { where, params } = buildAdminFilters(req.query);
    const rows = await db.all(`${selectProntuario} ${where} ORDER BY c.nome_completo`, params);
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_prontuarios_motoristas.csv"');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    return res.send(toCsv(rows));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao exportar prontuarios' });
  }
});

router.get('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const colaboradorId = Number(req.params.colaboradorId);
    const row = await db.get(`${selectProntuario} WHERE p.colaborador_id = ?`, [colaboradorId]);
    if (!row) return res.status(404).json({ error: 'Prontuario nao encontrado' });
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao abrir prontuario' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  try {
    const result = await importWorkbook({
      buffer: req.file.buffer,
      originalName: req.file.originalname
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao importar prontuario' });
  }
});

module.exports = router;
