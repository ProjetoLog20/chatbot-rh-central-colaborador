const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { parseBancoHorasFile } = require('../services/bancoHorasParser');
const {
  approveImport,
  classifyImportDay,
  createDraft,
  getCollaboratorPublishedDetail,
  getImportDetail,
  linkIdentity,
  listCollaboratorsWithPublishedData,
  listImports,
  updateBalance
} = require('../services/bancoHorasService');

const router = express.Router();
const allowedExtensions = new Set(['.pdf', '.xls', '.xlsx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return callback(new Error('Envie um arquivo PDF, XLS ou XLSX gerado pelo Kairos.'));
    }
    return callback(null, true);
  }
});

function uploadReport(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'O relatório excede o limite de 12 MB.', code: 'ARQUIVO_MUITO_GRANDE' });
    }
    return res.status(400).json({ error: error.message || 'Não foi possível receber o relatório.', code: 'UPLOAD_INVALIDO' });
  });
}

function numberId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${label} inválido.`);
    error.status = 400;
    error.code = 'IDENTIFICADOR_INVALIDO';
    throw error;
  }
  return id;
}

function sendError(res, error) {
  const explicitStatus = Number(error?.status);
  const databaseConflict = !explicitStatus && /duplicate|unique/i.test(error?.message || '');
  const status = explicitStatus || (databaseConflict ? 409 : 500);
  const safeStatus = status >= 400 && status < 500 ? status : 500;
  if (safeStatus === 500) console.error('ERRO BANCO DE HORAS:', error);
  return res.status(safeStatus).json({
    error: safeStatus === 500
      ? 'Erro interno ao processar o Banco de Horas.'
      : databaseConflict
        ? 'Os dados enviados entram em conflito com um registro já existente.'
        : error.message,
    code: safeStatus === 500
      ? 'ERRO_INTERNO'
      : databaseConflict
        ? 'DADOS_DUPLICADOS'
        : error.code || 'BANCO_HORAS_INVALIDO',
    ...(safeStatus !== 500 && !databaseConflict && error.details ? { detalhes: error.details } : {})
  });
}

function invalidReport(error) {
  const controlled = new Error(error?.message || 'Não foi possível interpretar o relatório enviado.');
  controlled.status = 400;
  controlled.code = 'RELATORIO_INVALIDO';
  return controlled;
}

router.use('/admin', authenticateToken, authorizeRoles('admin'));

router.get('/admin/importacoes', async (req, res) => {
  try {
    return res.json({ importacoes: await listImports() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/admin/importacoes', uploadReport, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione um relatório do Kairos.', code: 'ARQUIVO_AUSENTE' });
  let parsed;
  try {
    const filename = path.basename(req.file.originalname || 'relatorio-kairos');
    try {
      parsed = await parseBancoHorasFile({ buffer: req.file.buffer, filename });
    } catch (error) {
      throw invalidReport(error);
    }
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const conferencia = await createDraft({ parsed, filename, fileHash, userId: req.user.id });
    return res.status(201).json({
      status: 'aguardando_conferencia',
      message: 'Relatório lido. Confira os vínculos e resolva as pendências antes de publicar.',
      conferencia
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/admin/importacoes/:id', async (req, res) => {
  try {
    return res.json(await getImportDetail(numberId(req.params.id, 'Importação')));
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/admin/importacoes/:id/vinculo', async (req, res) => {
  try {
    const detail = await linkIdentity({
      importId: numberId(req.params.id, 'Importação'),
      normalizedName: req.body.nome_kairos_normalizado,
      kairosRegistration: req.body.matricula_kairos,
      collaboratorId: numberId(req.body.colaborador_id, 'Colaborador'),
      reason: req.body.justificativa,
      userId: req.user.id
    });
    return res.json({ message: 'Vínculo confirmado e registrado na conferência.', conferencia: detail });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/admin/importacoes/:id/saldos/:saldoId', async (req, res) => {
  try {
    const detail = await updateBalance({
      importId: numberId(req.params.id, 'Importação'),
      balanceId: numberId(req.params.saldoId, 'Saldo'),
      values: {
        saldo_anterior: req.body.saldo_anterior,
        debito: req.body.debito,
        credito: req.body.credito
      },
      reason: req.body.justificativa,
      userId: req.user.id
    });
    return res.json({ message: 'Saldo corrigido. Os valores derivados foram recalculados.', conferencia: detail });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/admin/importacoes/:id/dias/:diaId', async (req, res) => {
  try {
    const detail = await classifyImportDay({
      importId: numberId(req.params.id, 'Importação'),
      dayId: numberId(req.params.diaId, 'Dia'),
      classification: req.body.classificacao,
      correctedPunches: req.body.batidas,
      reason: req.body.justificativa,
      userId: req.user.id
    });
    return res.json({ message: 'Dia classificado e registrado na auditoria.', conferencia: detail });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/admin/importacoes/:id/aprovar', async (req, res) => {
  try {
    const detail = await approveImport({
      importId: numberId(req.params.id, 'Importação'),
      revision: req.body.revisao,
      userId: req.user.id
    });
    return res.json({
      status: 'publicado',
      message: 'Relatório aprovado e publicado para consulta administrativa.',
      conferencia: detail
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/admin/colaboradores', async (req, res) => {
  try {
    return res.json({ colaboradores: await listCollaboratorsWithPublishedData() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/admin/colaboradores/:id', async (req, res) => {
  try {
    return res.json(await getCollaboratorPublishedDetail(
      numberId(req.params.id, 'Colaborador'),
      req.query.mes
    ));
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
