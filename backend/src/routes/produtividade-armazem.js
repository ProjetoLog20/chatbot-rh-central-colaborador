const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');

const router = express.Router();

const selectArmazem = `
  SELECT
    p.*,
    c.nome_preferido,
    c.unidade
  FROM produtividade_armazem_colaboradores p
  JOIN colaboradores c ON c.id = p.colaborador_id
`;

const listColumns = [
  'id',
  'colaborador_id',
  'matricula',
  'nome_completo',
  'cpf',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'funcao_armazem',
  'cargo',
  'setor',
  'pontos',
  'faixa',
  'rv_antiga',
  'rv_nova',
  'erros',
  'valor_total_previsto',
  'status_produtividade',
  'origem_calculo',
  'status_auditoria',
  'metodo_cruzamento',
  'confianca_cruzamento',
  'mensagem_rh'
];

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildAdminFilters(query) {
  const { busca, competencia, funcao_armazem, status_produtividade, status_auditoria, origem_calculo } = query;
  const filters = [];
  const params = [];

  if (busca) {
    const text = String(busca).trim().toLowerCase();
    const doc = digits(text);
    if (doc) {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ? OR LOWER(COALESCE(p.competencia, \'\')) LIKE ? OR p.cpf LIKE ? OR p.cpf LIKE ? OR LOWER(COALESCE(p.usuario_wms, \'\')) LIKE ? OR LOWER(COALESCE(p.codigo_operacional, \'\')) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${text}%`, `%${doc}%`, `%${text}%`, `%${text}%`, `%${text}%`);
    } else {
      filters.push('(LOWER(p.nome_completo) LIKE ? OR LOWER(p.matricula) LIKE ? OR LOWER(COALESCE(p.competencia, \'\')) LIKE ? OR LOWER(COALESCE(p.usuario_wms, \'\')) LIKE ? OR LOWER(COALESCE(p.codigo_operacional, \'\')) LIKE ?)');
      params.push(`%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`);
    }
  }

  for (const [column, value] of Object.entries({ competencia, funcao_armazem, status_produtividade, status_auditoria, origem_calculo })) {
    if (!value) continue;
    filters.push(`LOWER(COALESCE(p.${column}, '')) LIKE ?`);
    params.push(`%${String(value).toLowerCase()}%`);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

function summarize(rows) {
  const summary = rows.reduce((result, row) => {
    const funcao = String(row.funcao_armazem || '').toLowerCase();
    result.colaboradores.add(row.colaborador_id);
    if (funcao.includes('ajudante')) result.ajudantes.add(row.colaborador_id);
    if (funcao.includes('empilhadeira')) result.operadores.add(row.colaborador_id);
    if (funcao.includes('amarrador')) result.amarradores.add(row.colaborador_id);
    result.valor_total_previsto += numberValue(row.valor_total_previsto);
    result.valor_total_rv_antiga += numberValue(row.rv_antiga);
    result.valor_total_rv_nova += numberValue(row.rv_nova);
    if (String(row.status_auditoria || '').toLowerCase() === 'revisar_cruzamento') result.total_baixa_confianca += 1;
    if (row.competencia) result.competencias.add(row.competencia);
    if (row.funcao_armazem) result.porFuncao.set(row.funcao_armazem, (result.porFuncao.get(row.funcao_armazem) || 0) + 1);
    if (row.status_produtividade) result.porStatus.set(row.status_produtividade, (result.porStatus.get(row.status_produtividade) || 0) + 1);
    return result;
  }, {
    colaboradores: new Set(),
    ajudantes: new Set(),
    operadores: new Set(),
    amarradores: new Set(),
    valor_total_previsto: 0,
    valor_total_rv_antiga: 0,
    valor_total_rv_nova: 0,
    total_baixa_confianca: 0,
    competencias: new Set(),
    porFuncao: new Map(),
    porStatus: new Map()
  });

  return {
    total_colaboradores_com_rv: summary.colaboradores.size,
    total_ajudantes: summary.ajudantes.size,
    total_operadores_empilhadeira: summary.operadores.size,
    total_amarradores: summary.amarradores.size,
    valor_total_previsto: Number(summary.valor_total_previsto.toFixed(2)),
    valor_total_rv_antiga: Number(summary.valor_total_rv_antiga.toFixed(2)),
    valor_total_rv_nova: Number(summary.valor_total_rv_nova.toFixed(2)),
    total_baixa_confianca: summary.total_baixa_confianca,
    competencias_disponiveis: [...summary.competencias].sort().reverse(),
    total_por_funcao: Object.fromEntries(summary.porFuncao),
    total_por_status: Object.fromEntries(summary.porStatus)
  };
}

function toCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    listColumns.join(';'),
    ...rows.map((row) => listColumns.map((column) => escape(row[column])).join(';'))
  ].join('\n');
}

async function ensureProductivityModules(req, res) {
  const geral = await ensureModuleAvailable('premio_produtividade', req.user);
  if (!geral.available) {
    res.status(503).json(maintenancePayload(geral.modulo));
    return false;
  }

  const armazem = await ensureModuleAvailable('premio_produtividade_armazem', req.user);
  if (!armazem.available) {
    res.status(503).json(maintenancePayload(armazem.modulo));
    return false;
  }

  return true;
}

async function getAdminRows(query) {
  const { where, params } = buildAdminFilters(query);
  return db.all(`${selectArmazem} ${where} ORDER BY p.competencia DESC, p.nome_completo`, params);
}

router.get('/meu', authenticateToken, async (req, res) => {
  try {
    const available = await ensureProductivityModules(req, res);
    if (!available) return;

    const rows = await db.all(
      `${selectArmazem}
       WHERE p.colaborador_id = ?
       ORDER BY p.competencia DESC, p.funcao_armazem, p.created_at DESC`,
      [req.user.id]
    );

    return res.json({
      rows,
      message: rows.length ? null : 'Voce ainda nao possui dados de Premio de Produtividade do Armazem para este periodo.'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar produtividade do armazem' });
  }
});

router.get('/admin/resumo', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    return res.json(summarize(rows));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar resumo de produtividade do armazem' });
  }
});

router.get('/admin/exportar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_produtividade_armazem.csv"');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    return res.send(toCsv(rows));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao exportar produtividade do armazem' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    return res.json({ rows, summary: summarize(rows) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar produtividade do armazem' });
  }
});

router.get('/admin/:colaboradorId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const colaboradorId = Number(req.params.colaboradorId);
    const rows = await db.all(
      `${selectArmazem}
       WHERE p.colaborador_id = ?
       ORDER BY p.competencia DESC, p.created_at DESC`,
      [colaboradorId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produtividade do armazem nao encontrada' });
    return res.json({ colaborador: rows[0], registros: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao abrir produtividade do armazem' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), (req, res) => {
  return res.status(410).json({
    error: 'Importacao da RV do Armazem desativada. Preencha a variavel manualmente.'
  });
});

module.exports = router;
