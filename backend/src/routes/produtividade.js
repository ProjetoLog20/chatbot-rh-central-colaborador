const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importWorkbook } = require('../../scripts/importRvXlsx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['xlsx'].includes(ext)) {
      return callback(new Error('Apenas arquivos .xlsx sao permitidos'));
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

const selectProdutividade = `
  SELECT
    p.*,
    c.nome_preferido,
    c.cargo,
    c.setor,
    c.unidade,
    c.tipo_colaborador
  FROM produtividade_colaboradores p
  JOIN colaboradores c ON c.id = p.colaborador_id
`;

const listColumns = [
  'matricula',
  'nome_completo',
  'cpf',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'funcao_rv',
  'caixas',
  'entregas',
  'percentual_devolucao',
  'meta_devolucao',
  'bateu_devolucao',
  'recargas',
  'mapas',
  'bonus',
  'antiga_rv',
  'nova_rv',
  'diferenca_rv',
  'valor_total_previsto',
  'status_produtividade'
];

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeBool(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's'].includes(text)) return true;
  if (['false', '0', 'nao', 'não', 'n'].includes(text)) return false;
  return null;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildAdminFilters(query) {
  const { busca, competencia, funcao_rv, status_produtividade, bateu_devolucao } = query;
  const filters = [];
  const params = [];

  if (busca) {
    const text = String(busca).trim().toLowerCase();
    const doc = digits(text);
    if (doc) {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ? OR p.cpf LIKE ? OR p.cpf LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${doc}%`, `%${text}%`);
    } else {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`);
    }
  }

  for (const [column, value] of Object.entries({ competencia, funcao_rv, status_produtividade })) {
    if (!value) continue;
    filters.push(`LOWER(COALESCE(p.${column}, '')) LIKE ?`);
    params.push(`%${String(value).toLowerCase()}%`);
  }

  const devolucao = normalizeBool(bateu_devolucao);
  if (devolucao !== null) {
    filters.push('p.bateu_devolucao = ?');
    params.push(devolucao);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

function summarize(rows) {
  const summary = rows.reduce((result, row) => {
    const funcao = String(row.funcao_rv || '').toLowerCase();
    result.colaboradores.add(row.colaborador_id);
    if (funcao.includes('motorista')) result.motoristas.add(row.colaborador_id);
    if (funcao.includes('ajudante')) result.ajudantes.add(row.colaborador_id);
    result.valor_total_nova_rv += numberValue(row.nova_rv);
    result.valor_total_antiga_rv += numberValue(row.antiga_rv);
    result.diferenca_total += numberValue(row.diferenca_rv);
    if (row.bateu_devolucao === true || row.bateu_devolucao === 1) result.total_bateu_devolucao += 1;
    if (row.bateu_devolucao === false || row.bateu_devolucao === 0) result.total_nao_bateu_devolucao += 1;
    result.total_recargas += numberValue(row.recargas);
    result.total_mapas += numberValue(row.mapas);
    return result;
  }, {
    colaboradores: new Set(),
    motoristas: new Set(),
    ajudantes: new Set(),
    valor_total_nova_rv: 0,
    valor_total_antiga_rv: 0,
    diferenca_total: 0,
    total_bateu_devolucao: 0,
    total_nao_bateu_devolucao: 0,
    total_recargas: 0,
    total_mapas: 0
  });

  return {
    total_colaboradores: summary.colaboradores.size,
    total_motoristas: summary.motoristas.size,
    total_ajudantes: summary.ajudantes.size,
    valor_total_nova_rv: Number(summary.valor_total_nova_rv.toFixed(2)),
    valor_total_antiga_rv: Number(summary.valor_total_antiga_rv.toFixed(2)),
    diferenca_total: Number(summary.diferenca_total.toFixed(2)),
    total_bateu_devolucao: summary.total_bateu_devolucao,
    total_nao_bateu_devolucao: summary.total_nao_bateu_devolucao,
    total_recargas: Number(summary.total_recargas.toFixed(2)),
    total_mapas: Number(summary.total_mapas.toFixed(2))
  };
}

function toCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    listColumns.join(';'),
    ...rows.map((row) => listColumns.map((column) => escape(row[column])).join(';'))
  ].join('\n');
}

async function getAdminRows(query) {
  const { where, params } = buildAdminFilters(query);
  return db.all(`${selectProdutividade} ${where} ORDER BY p.competencia DESC, p.nome_completo`, params);
}

router.get('/meu', authenticateToken, async (req, res) => {
  try {
    const { available, modulo } = await ensureModuleAvailable('premio_produtividade', req.user);
    if (!available) return res.status(503).json(maintenancePayload(modulo));

    const rows = await db.all(
      `${selectProdutividade}
       WHERE p.colaborador_id = ?
       ORDER BY p.competencia DESC, p.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar produtividade' });
  }
});

router.get('/admin/resumo', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    return res.json(summarize(rows));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar resumo de produtividade' });
  }
});

router.get('/admin/exportar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_produtividade_rv.csv"');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    return res.send(toCsv(rows));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao exportar produtividade' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    return res.json({ rows, summary: summarize(rows) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar produtividade' });
  }
});

router.get('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const colaboradorId = Number(req.params.colaboradorId);
    const rows = await db.all(
      `${selectProdutividade}
       WHERE p.colaborador_id = ?
       ORDER BY p.competencia DESC, p.created_at DESC`,
      [colaboradorId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produtividade nao encontrada' });
    return res.json({ colaborador: rows[0], registros: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao abrir produtividade' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  try {
    const result = await importWorkbook({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      criadoPor: req.user.id
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao importar RV' });
  }
});

module.exports = router;
