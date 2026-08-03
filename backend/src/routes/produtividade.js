const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleAvailable, maintenancePayload } = require('../moduleConfig');
const { importWorkbook, previewWorkbook } = require('../../scripts/importRvXlsx');
const { createPreview, getPreview, removePreview } = require('../importPreviewStore');
const { publishPrizeUpdateNotification } = require('../services/prizeNotificationService');

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

function parseManualNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/\s/g, '').replace('R$', '').replace('%', '');
  if (!text) return null;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
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

async function getAdminSummaryRows(query) {
  const summaryQuery = { ...query };

  if (!summaryQuery.competencia) {
    const latest = await db.get(
      `SELECT competencia
       FROM produtividade_colaboradores
       WHERE COALESCE(competencia, '') <> ''
       ORDER BY periodo_fim DESC NULLS LAST, updated_at DESC
       LIMIT 1`
    );
    if (latest?.competencia) summaryQuery.competencia = latest.competencia;
  }

  const rows = await getAdminRows(summaryQuery);
  return { rows, competencia: summaryQuery.competencia || null };
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
    const { rows, competencia } = await getAdminSummaryRows(req.query);
    return res.json({ ...summarize(rows), competencia_selecionada: competencia });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar resumo de produtividade' });
  }
});

router.get('/admin/msim', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  return res.status(410).json({ error: 'Painel MSIM desativado.' });
});

router.get('/admin/exportar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await getAdminRows(req.query);
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_produtividade_rota_van.csv"');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    return res.send(`\uFEFF${toCsv(rows)}`);
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

router.put('/admin/registro/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM produtividade_colaboradores WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro de produtividade nao encontrado' });

    const valorTotal = parseManualNumber(req.body.valor_total_previsto);
    const rvNova = parseManualNumber(req.body.rv_nova ?? req.body.nova_rv);
    const bonus = parseManualNumber(req.body.bonus);
    const valorRecarga = parseManualNumber(req.body.valor_recarga);
    const extra = parseManualNumber(req.body.extra);

    const nextValorTotal = valorTotal ?? numberValue(existing.valor_total_previsto);
    const nextRvNova = rvNova ?? nextValorTotal;
    const nextBonus = bonus ?? numberValue(existing.bonus);
    const nextValorRecarga = valorRecarga ?? numberValue(existing.valor_recarga);
    const nextExtra = extra ?? numberValue(existing.extra);
    const nextStatus = String(req.body.status_produtividade || existing.status_produtividade || (nextValorTotal > 0 ? 'Elegivel' : 'Sem premio')).trim();
    const mensagemRh = req.body.mensagem_rh !== undefined ? String(req.body.mensagem_rh || '') : existing.mensagem_rh;

    await db.run(
      `UPDATE produtividade_colaboradores
       SET valor_total_previsto = ?, rv_nova = ?, nova_rv = ?, bonus = ?, valor_recarga = ?, extra = ?,
           status_produtividade = ?, mensagem_rh = ?, status_auditoria = 'ok',
           metodo_cruzamento = COALESCE(metodo_cruzamento, 'edicao_manual_rh'),
           confianca_cruzamento = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextValorTotal, nextRvNova, nextRvNova, nextBonus, nextValorRecarga, nextExtra, nextStatus, mensagemRh, id]
    );

    const updated = await db.get(`${selectProdutividade} WHERE p.id = ?`, [id]);
    return res.json({ message: 'Premio de produtividade atualizado manualmente.', registro: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar premio de produtividade' });
  }
});

router.post('/importar', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  try {
    const selectedCompetencia = String(req.body.competencia || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedCompetencia)) {
      return res.status(400).json({ error: 'Selecione a competência do arquivo no formato mês/ano.' });
    }
    const preview = await previewWorkbook({ buffer: req.file.buffer, competencia: selectedCompetencia });
    const requestedType = String(req.body.tipo || '').trim().toLowerCase();
    if (!['rota', 'van'].includes(requestedType)) {
      return res.status(400).json({ error: 'Informe se o arquivo pertence a Rota ou VAN.' });
    }
    if (preview.tipoDetectado !== requestedType) {
      return res.status(400).json({
        error: `A planilha foi reconhecida como ${preview.tipoDetectado === 'van' ? 'VAN' : 'Rota'}, mas foi enviada pelo botão de ${requestedType === 'van' ? 'VAN' : 'Rota'}.`
      });
    }
    const staged = createPreview({
      type: 'rota',
      userId: req.user.id,
      buffer: Buffer.from(req.file.buffer),
      originalName: req.file.originalname,
      planType: requestedType,
      competencia: selectedCompetencia
    });
    return res.json({
      status: 'aguardando_confirmacao',
      preview_token: staged.token,
      expira_em_minutos: staged.expiresInMinutes,
      arquivo: req.file.originalname,
      tipo: requestedType,
      competencia_selecionada: selectedCompetencia,
      preview
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao ler a RV para conferencia' });
  }
});

router.post('/importar/aprovar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const staged = getPreview(req.body.preview_token, req.user.id, 'rota');
  if (!staged) return res.status(410).json({ error: 'A conferencia expirou ou ja foi utilizada. Leia o arquivo novamente.' });
  try {
    const result = await importWorkbook({
      buffer: staged.buffer,
      originalName: staged.originalName,
      criadoPor: req.user.id,
      competencia: staged.competencia
    });
    const notificationResult = await publishPrizeUpdateNotification({
      createdBy: req.user.id,
      competence: staged.competencia,
      source: staged.planType
    });
    removePreview(req.body.preview_token);
    return res.json({
      status: 'publicado',
      ...result,
      notificacao_id: notificationResult.notification.id
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao publicar a RV conferida' });
  }
});

module.exports = router;
