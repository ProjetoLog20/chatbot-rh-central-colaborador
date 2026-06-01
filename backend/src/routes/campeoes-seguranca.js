const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/campeoes');
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Apenas imagens JPG, JPEG ou PNG sao permitidas'));
    }
    return callback(null, true);
  }
});

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Imagem excede o limite de 3 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload da foto' });
}

function boolValue(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'sim';
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase() === 'publicado' ? 'publicado' : 'rascunho';
}

function runDb(sql, params = []) {
  return db.run(sql, params);
}

function deleteLocalPhoto(fotoUrl) {
  if (!fotoUrl?.startsWith('/uploads/campeoes/')) return;
  const filePath = path.join(__dirname, '../../', fotoUrl.replace(/^\/+/, ''));
  fs.unlink(filePath, () => {});
}

function savePhoto(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase() === '.png' ? '.png' : '.jpg';
  const filename = `campeao_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, file.buffer);
  // Render Free pode limpar arquivos locais em novos deploys. Futuramente trocar este ponto por Supabase Storage.
  return `/uploads/campeoes/${filename}`;
}

function shape(row) {
  if (!row) return null;
  return {
    ...row,
    log_on_100: boolValue(row.log_on_100),
    participacao_matinais: boolValue(row.participacao_matinais),
    sem_acidentes: boolValue(row.sem_acidentes),
    sem_fluxo_punitivo: boolValue(row.sem_fluxo_punitivo)
  };
}

function payloadFromBody(body, file, current = null, user = null) {
  const removePhoto = boolValue(body.remover_foto);
  let fotoUrl = current?.foto_url || null;

  if (removePhoto) {
    deleteLocalPhoto(current?.foto_url);
    fotoUrl = null;
  }

  if (file) {
    deleteLocalPhoto(current?.foto_url);
    fotoUrl = savePhoto(file);
  }

  return {
    colaborador_id: body.colaborador_id || null,
    competencia: String(body.competencia || current?.competencia || '').trim(),
    nome_colaborador: String(body.nome_colaborador || current?.nome_colaborador || '').trim(),
    matricula: String(body.matricula || current?.matricula || '').trim(),
    cargo: String(body.cargo || current?.cargo || '').trim(),
    setor: String(body.setor || current?.setor || '').trim(),
    foto_url: fotoUrl,
    motivo_reconhecimento: String(body.motivo_reconhecimento || current?.motivo_reconhecimento || '').trim(),
    log_on_100: boolValue(body.log_on_100),
    participacao_matinais: boolValue(body.participacao_matinais),
    sem_acidentes: boolValue(body.sem_acidentes),
    sem_fluxo_punitivo: boolValue(body.sem_fluxo_punitivo),
    observacao: String(body.observacao || '').trim(),
    status: normalizeStatus(body.status || current?.status),
    criado_por: current?.criado_por || user?.id || null
  };
}

router.get('/publicos', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT *
       FROM campeoes_seguranca
       WHERE status = 'publicado'
       ORDER BY competencia DESC, created_at DESC, id DESC`
    );
    return res.json(rows.map(shape));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar campeoes de seguranca' });
  }
});

router.get('/admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT *
       FROM campeoes_seguranca
       ORDER BY competencia DESC, created_at DESC, id DESC`
    );
    return res.json(rows.map(shape));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar campeoes de seguranca' });
  }
});

router.post('/admin', authenticateToken, authorizeRoles('admin'), upload.single('foto'), handleUploadError, async (req, res) => {
  try {
    const payload = payloadFromBody(req.body, req.file, null, req.user);
    if (!payload.competencia || !payload.nome_colaborador || !payload.motivo_reconhecimento) {
      deleteLocalPhoto(payload.foto_url);
      return res.status(400).json({ error: 'Competencia, colaborador e motivo sao obrigatorios' });
    }

    const result = await runDb(
      `INSERT INTO campeoes_seguranca (
        colaborador_id, competencia, nome_colaborador, matricula, cargo, setor, foto_url,
        motivo_reconhecimento, log_on_100, participacao_matinais, sem_acidentes,
        sem_fluxo_punitivo, observacao, status, criado_por, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        payload.colaborador_id,
        payload.competencia,
        payload.nome_colaborador,
        payload.matricula,
        payload.cargo,
        payload.setor,
        payload.foto_url,
        payload.motivo_reconhecimento,
        payload.log_on_100,
        payload.participacao_matinais,
        payload.sem_acidentes,
        payload.sem_fluxo_punitivo,
        payload.observacao,
        payload.status,
        payload.criado_por
      ]
    );
    return res.json({ id: result.lastID, foto_url: payload.foto_url });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao cadastrar campeao de seguranca' });
  }
});

router.put('/admin/:id', authenticateToken, authorizeRoles('admin'), upload.single('foto'), handleUploadError, async (req, res) => {
  const id = Number(req.params.id);

  try {
    const current = await db.get('SELECT * FROM campeoes_seguranca WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Campeao nao encontrado' });

    const payload = payloadFromBody(req.body, req.file, current, req.user);
    if (!payload.competencia || !payload.nome_colaborador || !payload.motivo_reconhecimento) {
      return res.status(400).json({ error: 'Competencia, colaborador e motivo sao obrigatorios' });
    }

    await runDb(
      `UPDATE campeoes_seguranca
       SET colaborador_id = ?, competencia = ?, nome_colaborador = ?, matricula = ?,
           cargo = ?, setor = ?, foto_url = ?, motivo_reconhecimento = ?,
           log_on_100 = ?, participacao_matinais = ?, sem_acidentes = ?,
           sem_fluxo_punitivo = ?, observacao = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        payload.colaborador_id,
        payload.competencia,
        payload.nome_colaborador,
        payload.matricula,
        payload.cargo,
        payload.setor,
        payload.foto_url,
        payload.motivo_reconhecimento,
        payload.log_on_100,
        payload.participacao_matinais,
        payload.sem_acidentes,
        payload.sem_fluxo_punitivo,
        payload.observacao,
        payload.status,
        id
      ]
    );
    return res.json({ changed: 1, foto_url: payload.foto_url });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar campeao de seguranca' });
  }
});

router.delete('/admin/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);

  try {
    const current = await db.get('SELECT * FROM campeoes_seguranca WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Campeao nao encontrado' });

    await runDb('DELETE FROM campeoes_seguranca WHERE id = ?', [id]);
    deleteLocalPhoto(current.foto_url);
    return res.json({ deleted: 1 });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao excluir campeao de seguranca' });
  }
});

module.exports = router;
