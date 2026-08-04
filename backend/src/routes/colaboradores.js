const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();
const ALLOWED_PROFILES = new Set(['admin', 'motorista', 'colaborador']);
const INACTIVE_STATUSES = new Set(['desligado', 'removido', 'inativo']);

const publicColumns = `
  id, matricula, nome_completo, nome_preferido, cpf, telefone_whatsapp, email, cargo, setor,
  unidade, tipo_colaborador, status, data_admissao, perfil, primeiro_acesso, senha_temporaria,
  data_ultima_troca_senha, usuario_wms, codigo_operacional, wms_vinculo_status
`;

function text(value) {
  return value === undefined || value === null ? null : String(value).trim() || null;
}

function normalizeProfile(value) {
  return String(value || '').trim().toLowerCase();
}

function isInactive(status) {
  return INACTIVE_STATUSES.has(String(status || '').trim().toLowerCase());
}

async function protectLastAdmin(user, nextProfile, nextStatus) {
  if (normalizeProfile(user.perfil) !== 'admin') return;
  if (normalizeProfile(nextProfile) === 'admin' && !isInactive(nextStatus)) return;
  const row = await db.get(
    `SELECT COUNT(*) AS total FROM colaboradores
     WHERE LOWER(TRIM(perfil)) = 'admin'
       AND LOWER(TRIM(COALESCE(status, 'ativo'))) NOT IN ('desligado', 'removido', 'inativo')`
  );
  if (Number(row?.total || 0) <= 1) {
    const error = new Error('O ultimo administrador ativo nao pode ser desligado ou perder o perfil de administrador.');
    error.status = 409;
    throw error;
  }
}

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const row = await db.get(`SELECT ${publicColumns} FROM colaboradores WHERE id = ?`, [req.user.id]);
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const rows = await db.all(`SELECT ${publicColumns} FROM colaboradores ORDER BY nome_completo`);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const matricula = text(req.body.matricula);
  const nomeCompleto = text(req.body.nome_completo);
  const perfil = normalizeProfile(req.body.perfil);
  if (!matricula || !nomeCompleto || !ALLOWED_PROFILES.has(perfil)) {
    return res.status(400).json({ error: 'Matricula, nome completo e perfil de acesso valido sao obrigatorios.' });
  }

  try {
    const senhaHash = await bcrypt.hash(text(req.body.senha) || 'log20', 10);
    const result = await db.run(
      `INSERT INTO colaboradores (
        matricula, nome_completo, nome_preferido, cpf, telefone_whatsapp, email, cargo, setor, unidade,
        tipo_colaborador, status, data_admissao, senha_hash, perfil, primeiro_acesso, senha_temporaria,
        data_ultima_troca_senha, usuario_wms, codigo_operacional, wms_vinculo_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, true, null, ?, ?, ?)`,
      [
        matricula, nomeCompleto, text(req.body.nome_preferido), text(req.body.cpf),
        text(req.body.telefone_whatsapp), text(req.body.email), text(req.body.cargo),
        text(req.body.setor), text(req.body.unidade), text(req.body.tipo_colaborador),
        text(req.body.status) || 'Ativo', text(req.body.data_admissao), senhaHash, perfil,
        text(req.body.usuario_wms), text(req.body.codigo_operacional),
        text(req.body.usuario_wms) || text(req.body.codigo_operacional) ? 'manual_admin' : null
      ]
    );
    const created = await db.get(`SELECT ${publicColumns} FROM colaboradores WHERE id = ?`, [result.lastID]);
    return res.status(201).json({ colaborador: created, senha_temporaria: text(req.body.senha) || 'log20' });
  } catch (error) {
    if (/unique|duplicate/i.test(error.message || '')) {
      return res.status(409).json({ error: 'Matricula, usuario On Demand ou codigo operacional ja cadastrado.' });
    }
    console.error('ERRO CRIAR COLABORADOR:', error);
    return res.status(500).json({ error: 'Erro ao salvar colaborador' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  const isAdmin = normalizeProfile(req.user.perfil) === 'admin';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Cadastro invalido' });
  if (!isAdmin && req.user.id !== id) return res.status(403).json({ error: 'Acesso negado' });

  const selfServiceFields = new Set(['nome_preferido', 'telefone_whatsapp', 'email']);
  if (!isAdmin && Object.keys(req.body || {}).some((field) => !selfServiceFields.has(field))) {
    return res.status(403).json({ error: 'Somente nome preferido, telefone e email podem ser alterados pelo colaborador' });
  }

  try {
    const user = await db.get('SELECT * FROM colaboradores WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado' });

    const nextProfile = isAdmin && req.body.perfil !== undefined ? normalizeProfile(req.body.perfil) : user.perfil;
    if (!ALLOWED_PROFILES.has(normalizeProfile(nextProfile))) {
      return res.status(400).json({ error: 'Perfil de acesso invalido.' });
    }
    const nextStatus = isAdmin && req.body.status !== undefined ? text(req.body.status) || user.status : user.status;
    await protectLastAdmin(user, nextProfile, nextStatus);
    if (isAdmin && id === req.user.id && (normalizeProfile(nextProfile) !== 'admin' || isInactive(nextStatus))) {
      return res.status(409).json({ error: 'Voce nao pode retirar o proprio acesso de administrador.' });
    }

    const shouldResetPassword = isAdmin && req.body.resetarSenha === true;
    let senhaHash = user.senha_hash;
    let primeiroAcesso = user.primeiro_acesso;
    let senhaTemporaria = user.senha_temporaria;
    let dataTroca = user.data_ultima_troca_senha;
    if (shouldResetPassword) {
      senhaHash = await bcrypt.hash('log20', 10);
      primeiroAcesso = true;
      senhaTemporaria = true;
      dataTroca = null;
    } else if (isAdmin && text(req.body.senha)) {
      senhaHash = await bcrypt.hash(text(req.body.senha), 10);
      primeiroAcesso = true;
      senhaTemporaria = true;
      dataTroca = null;
    }

    const value = (field) => (isAdmin || selfServiceFields.has(field)) && req.body[field] !== undefined
      ? text(req.body[field])
      : user[field];
    const nextWmsUser = value('usuario_wms');
    const nextOperationalCode = value('codigo_operacional');
    const nextWmsStatus = isAdmin && (req.body.usuario_wms !== undefined || req.body.codigo_operacional !== undefined)
      ? (nextWmsUser || nextOperationalCode ? 'manual_admin' : null)
      : user.wms_vinculo_status;
    await db.run(
      `UPDATE colaboradores SET
        matricula = ?, nome_completo = ?, nome_preferido = ?, cpf = ?, telefone_whatsapp = ?, email = ?,
        cargo = ?, setor = ?, unidade = ?, tipo_colaborador = ?, status = ?, data_admissao = ?, perfil = ?,
        senha_hash = ?, primeiro_acesso = ?, senha_temporaria = ?, data_ultima_troca_senha = ?,
        usuario_wms = ?, codigo_operacional = ?, wms_vinculo_status = ?
       WHERE id = ?`,
      [
        value('matricula') || user.matricula, value('nome_completo') || user.nome_completo,
        value('nome_preferido'), value('cpf'), value('telefone_whatsapp'), value('email'),
        value('cargo'), value('setor'), value('unidade'), value('tipo_colaborador'), nextStatus,
        value('data_admissao'), nextProfile, senhaHash, primeiroAcesso, senhaTemporaria, dataTroca,
        nextWmsUser, nextOperationalCode, nextWmsStatus, id
      ]
    );
    const updated = await db.get(`SELECT ${publicColumns} FROM colaboradores WHERE id = ?`, [id]);
    return res.json({
      colaborador: updated,
      ...(shouldResetPassword ? { reset_realizado: true, senha_temporaria: 'log20' } : {})
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (/unique|duplicate/i.test(error.message || '')) {
      return res.status(409).json({ error: 'Matricula, usuario On Demand ou codigo operacional ja cadastrado.' });
    }
    console.error('ERRO ATUALIZAR COLABORADOR:', error);
    return res.status(500).json({ error: 'Erro atualizando colaborador' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(409).json({ error: 'Voce nao pode remover o proprio cadastro.' });
  try {
    const user = await db.get('SELECT * FROM colaboradores WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado' });
    await protectLastAdmin(user, user.perfil, 'Removido');
    const revokedHash = await bcrypt.hash(`revogado-${Date.now()}-${id}`, 10);
    await db.run(
      `UPDATE colaboradores SET status = 'Removido', senha_hash = ?, primeiro_acesso = false,
       senha_temporaria = false, usuario_wms = NULL, codigo_operacional = NULL,
       wms_vinculo_status = 'revogado_remocao' WHERE id = ?`,
      [revokedHash, id]
    );
    return res.json({ removed: 1, historico_preservado: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('ERRO REMOVER COLABORADOR:', error);
    return res.status(500).json({ error: 'Erro ao remover colaborador' });
  }
});

module.exports = router;
