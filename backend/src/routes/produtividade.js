const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importWorkbook } = require('../../scripts/importRvXlsx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['xlsx', 'xlsm'].includes(ext)) {
      return callback(new Error('Apenas arquivos .xlsx ou .xlsm sao permitidos'));
    }
    return callback(null, true);
  }
});

function uploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo excede o limite de 35 MB' });
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
  'codigo_rv',
  'nome_rv',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'funcao_rv',
  'cargo',
  'setor',
  'caixas',
  'entregas',
  'percentual_devolucao',
  'meta_devolucao',
  'bateu_devolucao',
  'recargas',
  'mapas',
  'valor_recarga',
  'bonus',
  'valor_total_previsto',
  'status_produtividade',
  'status_auditoria',
  'metodo_cruzamento',
  'confianca_cruzamento',
  'mensagem_rh'
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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function msimFunctionForProdutividade(funcaoRv, cargo) {
  const text = normalizeText(`${funcaoRv || ''} ${cargo || ''}`);
  if (text.includes('ajudante')) return 'Ajudante Distribuicao';
  if (text.includes('motorista')) return 'Motorista Caminhao Distribuicao';
  return null;
}

function statusMsim(percentual) {
  if (percentual === null || percentual === undefined) return 'Sem MSIM';
  return Number(percentual) >= 80 ? 'Positivo' : 'Negativo';
}

function buildAdminFilters(query) {
  const { busca, competencia, funcao_rv, status_produtividade, bateu_devolucao, status_auditoria } = query;
  const filters = [];
  const params = [];

  if (busca) {
    const text = String(busca).trim().toLowerCase();
    const doc = digits(text);
    if (doc) {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ? OR LOWER(COALESCE(p.competencia, \'\')) LIKE ? OR p.cpf LIKE ? OR p.cpf LIKE ? OR LOWER(COALESCE(p.nome_rv, \'\')) LIKE ? OR LOWER(COALESCE(p.codigo_rv, \'\')) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${text}%`, `%${doc}%`, `%${text}%`, `%${text}%`, `%${text}%`);
    } else {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ? OR LOWER(COALESCE(p.competencia, \'\')) LIKE ? OR LOWER(COALESCE(p.nome_rv, \'\')) LIKE ? OR LOWER(COALESCE(p.codigo_rv, \'\')) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`);
    }
  }

  for (const [column, value] of Object.entries({ competencia, funcao_rv, status_produtividade, status_auditoria })) {
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
    result.valor_total_previsto += numberValue(row.valor_total_previsto);
    if (row.bateu_devolucao === true || row.bateu_devolucao === 1) result.total_bateu_devolucao += 1;
    if (row.bateu_devolucao === false || row.bateu_devolucao === 0) result.total_nao_bateu_devolucao += 1;
    result.total_recargas += numberValue(row.recargas);
    result.total_mapas += numberValue(row.mapas);
    if (String(row.status_auditoria || '').toLowerCase() === 'revisar_cruzamento') result.total_baixa_confianca += 1;
    if (row.competencia) result.competencias.add(row.competencia);
    return result;
  }, {
    colaboradores: new Set(),
    motoristas: new Set(),
    ajudantes: new Set(),
    valor_total_previsto: 0,
    total_bateu_devolucao: 0,
    total_nao_bateu_devolucao: 0,
    total_recargas: 0,
    total_mapas: 0,
    total_baixa_confianca: 0,
    competencias: new Set()
  });

  return {
    total_colaboradores: summary.colaboradores.size,
    total_colaboradores_com_rv: summary.colaboradores.size,
    total_motoristas: summary.motoristas.size,
    total_ajudantes: summary.ajudantes.size,
    valor_total_previsto: Number(summary.valor_total_previsto.toFixed(2)),
    valor_total_nova_rv: Number(summary.valor_total_previsto.toFixed(2)),
    valor_total_rv_nova: Number(summary.valor_total_previsto.toFixed(2)),
    valor_total_antiga_rv: 0,
    valor_total_rv_antiga: 0,
    diferenca_total: 0,
    valor_total_diferenca: 0,
    total_bateu_devolucao: summary.total_bateu_devolucao,
    total_nao_bateu_devolucao: summary.total_nao_bateu_devolucao,
    total_recargas: Number(summary.total_recargas.toFixed(2)),
    total_mapas: Number(summary.total_mapas.toFixed(2)),
    total_baixa_confianca: summary.total_baixa_confianca,
    competencias_disponiveis: [...summary.competencias].sort().reverse()
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

async function getMsimRows(query) {
  const rows = await getAdminRows(query);
  const grouped = new Map();

  rows.forEach((row) => {
    const funcaoMsim = msimFunctionForProdutividade(row.funcao_rv, row.cargo);
    if (!funcaoMsim || !row.competencia) return;
    const key = `${row.colaborador_id}|${row.competencia}|${funcaoMsim}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        colaborador_id: row.colaborador_id,
        competencia: row.competencia,
        funcionario: row.nome_completo,
        matricula: row.matricula,
        funcao: funcaoMsim,
        caxaria_mensal: 0,
        valor_total_mensal_premio: 0
      });
    }

    const item = grouped.get(key);
    item.caxaria_mensal += numberValue(row.caixas);
    item.valor_total_mensal_premio += numberValue(row.valor_total_previsto);
  });

  const msimRows = await db.all(
    `SELECT unidade, funcao, competencia, valor_msim
     FROM produtividade_msim_mensal
     WHERE unidade = ?`,
    ['CASCAVEL PR']
  );
  const msimMap = new Map(
    msimRows.map((row) => [`${normalizeText(row.funcao)}|${row.competencia}`, numberValue(row.valor_msim)])
  );

  return [...grouped.values()]
    .map((item) => {
      const valorMsim = msimMap.get(`${normalizeText(item.funcao)}|${item.competencia}`) || null;
      const percentual = valorMsim
        ? Number(((item.valor_total_mensal_premio / valorMsim) * 100).toFixed(2))
        : null;
      return {
        ...item,
        caxaria_mensal: Number(item.caxaria_mensal.toFixed(2)),
        valor_total_mensal_premio: Number(item.valor_total_mensal_premio.toFixed(2)),
        valor_msim_mes: valorMsim,
        percentual_msim: percentual,
        status_msim: statusMsim(percentual)
      };
    })
    .sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)) || a.funcionario.localeCompare(b.funcionario));
}

router.get('/meu', authenticateToken, async (req, res) => {
  try {
    const { available, modulo } = await ensureModuleAvailable('premio_produtividade', req.user);
    if (!available) return res.status(503).json(maintenancePayload(modulo));

    const rows = await db.all(
      `${selectProdutividade}
       WHERE p.colaborador_id = ?
       ORDER BY p.competencia DESC, p.funcao_rv, p.created_at DESC`,
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

router.get('/admin/msim', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getMsimRows(req.query);
    const summary = rows.reduce((acc, row) => {
      acc.total_registros += 1;
      if (row.status_msim === 'Positivo') acc.positivos += 1;
      if (row.status_msim === 'Negativo') acc.negativos += 1;
      acc.valor_total_mensal_premio += numberValue(row.valor_total_mensal_premio);
      return acc;
    }, { total_registros: 0, positivos: 0, negativos: 0, valor_total_mensal_premio: 0 });

    return res.json({
      rows,
      summary: {
        ...summary,
        valor_total_mensal_premio: Number(summary.valor_total_mensal_premio.toFixed(2))
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar Atingimento Mensal MSIM' });
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
