const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importOnDemand } = require('../../scripts/importOnDemandArmazemCsv');
const { createPreview, getPreview, removePreview } = require('../importPreviewStore');
const { publishPrizeUpdateNotification } = require('../services/prizeNotificationService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, path.extname(file.originalname || '').toLowerCase() === '.csv');
  }
});

function uploadCsv(req, res, next) {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'operator_file', maxCount: 1 }
  ])(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'O CSV excede o limite de 8 MB.' });
    if (error) return res.status(400).json({ error: 'Erro ao receber o arquivo On Demand.' });
    req.file = req.files?.file?.[0];
    req.operatorFile = req.files?.operator_file?.[0];
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo de produtividade do armazém no formato CSV.' });
    next();
  });
}

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

function parseManualNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value).trim().replace(/\s/g, '').replace('R$', '').replace('%', '');
  if (!text) return 0;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function trim(value) {
  return String(value ?? '').trim();
}

function shapeArmazemRow(row) {
  if (!row) return row;
  let original = {};
  try {
    original = typeof row.dados_originais_json === 'string'
      ? JSON.parse(row.dados_originais_json)
      : row.dados_originais_json || {};
  } catch {
    original = {};
  }
  return {
    ...row,
    tarefas_detalhadas: Array.isArray(original.atividades) ? original.atividades : []
  };
}

function manualPayload(body, colaborador, existing = {}) {
  const valorTotal = parseManualNumber(body.valor_total_previsto ?? existing.valor_total_previsto);
  const rvNova = parseManualNumber(body.rv_nova ?? existing.rv_nova ?? valorTotal);
  const rvAntiga = parseManualNumber(body.rv_antiga ?? existing.rv_antiga);
  const status = trim(body.status_produtividade ?? existing.status_produtividade) || (valorTotal > 0 ? 'Elegivel' : 'Sem premio');

  return {
    colaborador_id: colaborador.id,
    competencia: trim(body.competencia ?? existing.competencia),
    periodo_inicio: trim(body.periodo_inicio ?? existing.periodo_inicio) || null,
    periodo_fim: trim(body.periodo_fim ?? existing.periodo_fim) || null,
    matricula: trim(colaborador.matricula),
    nome_completo: trim(colaborador.nome_completo),
    cpf: trim(colaborador.cpf),
    funcao_armazem: trim(body.funcao_armazem ?? existing.funcao_armazem),
    cargo: trim(body.cargo ?? existing.cargo ?? colaborador.cargo),
    setor: trim(body.setor ?? existing.setor ?? colaborador.setor),
    tipo_colaborador: trim(body.tipo_colaborador ?? existing.tipo_colaborador ?? colaborador.tipo_colaborador),
    perfil: trim(body.perfil ?? existing.perfil ?? colaborador.perfil),
    usuario_wms: trim(body.usuario_wms ?? existing.usuario_wms),
    codigo_operacional: trim(body.codigo_operacional ?? existing.codigo_operacional),
    pontos: parseManualNumber(body.pontos ?? existing.pontos),
    faixa: trim(body.faixa ?? existing.faixa),
    rv_antiga: rvAntiga,
    rv_nova: rvNova,
    erros: parseManualNumber(body.erros ?? existing.erros),
    valor_total_previsto: valorTotal,
    indicador_1: trim(body.indicador_1 ?? existing.indicador_1),
    indicador_2: trim(body.indicador_2 ?? existing.indicador_2),
    indicador_3: trim(body.indicador_3 ?? existing.indicador_3),
    status_produtividade: status,
    origem_calculo: trim(body.origem_calculo ?? existing.origem_calculo) || 'manual_rh',
    status_auditoria: 'ok',
    metodo_cruzamento: 'manual_rh',
    confianca_cruzamento: 1,
    observacao_cruzamento: trim(body.observacao_cruzamento ?? existing.observacao_cruzamento),
    mensagem_rh: trim(body.mensagem_rh ?? existing.mensagem_rh),
    dados_originais_json: JSON.stringify({ origem: 'manual_rh', atualizado_em: new Date().toISOString() })
  };
}

const manualColumns = [
  'colaborador_id',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'matricula',
  'nome_completo',
  'cpf',
  'funcao_armazem',
  'cargo',
  'setor',
  'tipo_colaborador',
  'perfil',
  'usuario_wms',
  'codigo_operacional',
  'pontos',
  'faixa',
  'rv_antiga',
  'rv_nova',
  'erros',
  'valor_total_previsto',
  'indicador_1',
  'indicador_2',
  'indicador_3',
  'status_produtividade',
  'origem_calculo',
  'status_auditoria',
  'metodo_cruzamento',
  'confianca_cruzamento',
  'observacao_cruzamento',
  'mensagem_rh',
  'dados_originais_json'
];

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
  const rows = await db.all(`${selectArmazem} ${where} ORDER BY p.competencia DESC, p.nome_completo`, params);
  return rows.map(shapeArmazemRow);
}

router.get('/meu', authenticateToken, async (req, res) => {
  try {
    const available = await ensureProductivityModules(req, res);
    if (!available) return;

    const rows = await db.all(
      `${selectArmazem}
       WHERE p.colaborador_id = ?
         AND COALESCE(p.publicado, true) = true
       ORDER BY p.competencia DESC, p.funcao_armazem, p.created_at DESC`,
      [req.user.id]
    );

    return res.json({
      rows: rows.map(shapeArmazemRow),
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
    const shapedRows = rows.map(shapeArmazemRow);
    return res.json({ colaborador: shapedRows[0], registros: shapedRows });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao abrir produtividade do armazem' });
  }
});

router.post('/admin/manual', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const matricula = trim(req.body.matricula);
    if (!matricula || !trim(req.body.competencia) || !trim(req.body.funcao_armazem)) {
      return res.status(400).json({ error: 'Matricula, competencia e funcao do armazem sao obrigatorias' });
    }

    const colaborador = await db.get('SELECT * FROM colaboradores WHERE matricula = ?', [matricula]);
    if (!colaborador) return res.status(404).json({ error: 'Colaborador nao encontrado pela matricula informada' });

    const existing = await db.get(
      'SELECT * FROM produtividade_armazem_colaboradores WHERE colaborador_id = ? AND competencia = ? AND funcao_armazem = ?',
      [colaborador.id, trim(req.body.competencia), trim(req.body.funcao_armazem)]
    );
    const payload = manualPayload(req.body, colaborador, existing || {});

    if (existing) {
      const assignments = manualColumns.filter((column) => column !== 'colaborador_id').map((column) => `${column} = ?`);
      await db.run(
        `UPDATE produtividade_armazem_colaboradores
         SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...manualColumns.filter((column) => column !== 'colaborador_id').map((column) => payload[column]), existing.id]
      );
      const updated = await db.get(`${selectArmazem} WHERE p.id = ?`, [existing.id]);
      return res.json({ message: 'Lancamento manual do armazem atualizado.', registro: shapeArmazemRow(updated) });
    }

    const columns = ['importacao_id', ...manualColumns];
    const result = await db.run(
      `INSERT INTO produtividade_armazem_colaboradores (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
      [null, ...manualColumns.map((column) => payload[column])]
    );
    const insertedId = result.lastID;
    const inserted = insertedId
      ? await db.get(`${selectArmazem} WHERE p.id = ?`, [insertedId])
      : await db.get(
        `${selectArmazem} WHERE p.colaborador_id = ? AND p.competencia = ? AND p.funcao_armazem = ?`,
        [payload.colaborador_id, payload.competencia, payload.funcao_armazem]
      );
    return res.json({ message: 'Lancamento manual do armazem criado.', registro: shapeArmazemRow(inserted) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao salvar lancamento manual do armazem' });
  }
});

router.put('/admin/registro/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM produtividade_armazem_colaboradores WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro de produtividade do armazem nao encontrado' });

    const colaborador = await db.get('SELECT * FROM colaboradores WHERE id = ?', [existing.colaborador_id]);
    if (!colaborador) return res.status(404).json({ error: 'Colaborador vinculado nao encontrado' });

    const payload = manualPayload(req.body, colaborador, existing);
    const assignments = manualColumns.filter((column) => column !== 'colaborador_id').map((column) => `${column} = ?`);
    await db.run(
      `UPDATE produtividade_armazem_colaboradores
       SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...manualColumns.filter((column) => column !== 'colaborador_id').map((column) => payload[column]), id]
    );

    const updated = await db.get(`${selectArmazem} WHERE p.id = ?`, [id]);
    return res.json({ message: 'Produtividade do armazem atualizada manualmente.', registro: shapeArmazemRow(updated) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar produtividade do armazem' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), uploadCsv, async (req, res) => {
  const temporaryFile = path.join(os.tmpdir(), `yuri-ondemand-${crypto.randomUUID()}.csv`);
  const temporaryOperatorFile = path.join(os.tmpdir(), `yuri-operadores-${crypto.randomUUID()}.csv`);
  try {
    await fs.promises.writeFile(temporaryFile, req.file.buffer);
    if (req.operatorFile) await fs.promises.writeFile(temporaryOperatorFile, req.operatorFile.buffer);
    const report = await importOnDemand(temporaryFile, {
      operatorFile: req.operatorFile ? temporaryOperatorFile : undefined,
      competencia: trim(req.body.competencia) || undefined,
      createMissing: false,
      activateModule: false,
      allowMissingValues: false,
      dryRun: true,
      originalFilename: path.basename(req.file.originalname),
      createdBy: req.user.id
    });
    const staged = createPreview({
      type: 'armazem',
      userId: req.user.id,
      buffer: Buffer.from(req.file.buffer),
      operatorBuffer: req.operatorFile ? Buffer.from(req.operatorFile.buffer) : null,
      originalName: path.basename(req.file.originalname),
      operatorOriginalName: req.operatorFile ? path.basename(req.operatorFile.originalname) : null,
      competencia: report.competencia
    });
    return res.json({
      status: 'aguardando_confirmacao',
      preview_token: staged.token,
      expira_em_minutos: staged.expiresInMinutes,
      message: `RV combinada lida: ${report.crossed.length} vínculo(s) confirmado(s) e ${report.ignored} ignorado(s). Confira tarefas, indicadores e ajustes antes de publicar.`,
      report: {
        competencia: report.competencia,
        periodo: report.periodo,
        linhas_csv: report.linhasCsv,
        linhas_operadores_csv: report.linhasOperadoresCsv,
        linhas_operadores_validas: report.linhasOperadoresValidas,
        usuarios_operadores: report.usuariosOperadores,
        colaboradores_no_csv: report.colaboradoresNoCsv,
        criados: 0,
        atualizados: 0,
        ignorados: report.ignored,
        nao_encontrados: report.notFound,
        excluidos_regra_oficial: report.excludedByOfficialRules,
        tarefas_sem_valor: report.missingValues,
        cruzamentos: report.crossed,
        linhas: report.preview
      }
    });
  } catch (error) {
    console.error('ERRO IMPORTAR ON DEMAND:', error);
    return res.status(400).json({ error: error.message || 'Erro ao importar o arquivo On Demand.' });
  } finally {
    await fs.promises.unlink(temporaryFile).catch(() => {});
    await fs.promises.unlink(temporaryOperatorFile).catch(() => {});
  }
});

router.post('/importar/aprovar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const staged = getPreview(req.body.preview_token, req.user.id, 'armazem');
  if (!staged) return res.status(410).json({ error: 'A conferencia expirou ou ja foi utilizada. Leia o arquivo novamente.' });
  const temporaryFile = path.join(os.tmpdir(), `yuri-ondemand-${crypto.randomUUID()}.csv`);
  const temporaryOperatorFile = path.join(os.tmpdir(), `yuri-operadores-${crypto.randomUUID()}.csv`);
  try {
    await fs.promises.writeFile(temporaryFile, staged.buffer);
    if (staged.operatorBuffer) await fs.promises.writeFile(temporaryOperatorFile, staged.operatorBuffer);
    const report = await importOnDemand(temporaryFile, {
      operatorFile: staged.operatorBuffer ? temporaryOperatorFile : undefined,
      competencia: staged.competencia,
      createMissing: false,
      activateModule: false,
      allowMissingValues: false,
      originalFilename: staged.originalName,
      createdBy: req.user.id
    });
    const notificationResult = await publishPrizeUpdateNotification({
      createdBy: req.user.id,
      competence: report.competencia,
      source: 'armazem'
    });
    removePreview(req.body.preview_token);
    return res.json({
      status: 'publicado',
      message: `RV do armazém publicada: ${report.created} criado(s), ${report.updated} atualizado(s) e ${report.ignored} ignorado(s).`,
      report,
      notificacao_id: notificationResult.notification.id
    });
  } catch (error) {
    console.error('ERRO APROVAR ON DEMAND:', error);
    return res.status(400).json({ error: error.message || 'Erro ao publicar o On Demand conferido.' });
  } finally {
    await fs.promises.unlink(temporaryFile).catch(() => {});
    await fs.promises.unlink(temporaryOperatorFile).catch(() => {});
  }
});

module.exports = router;
