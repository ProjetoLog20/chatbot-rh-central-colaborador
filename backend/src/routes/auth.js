const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../authMiddleware');

const router = express.Router();

function isFirstAccess(usuario) {
  return Boolean(usuario.primeiro_acesso) || Boolean(usuario.senha_temporaria);
}

function buildUserResponse(usuario) {
  return {
    id: usuario.id,
    matricula: usuario.matricula,
    nome_completo: usuario.nome_completo,
    nome_preferido: usuario.nome_preferido,
    perfil: usuario.perfil,
    tipo_colaborador: usuario.tipo_colaborador,
    status: usuario.status,
    primeiro_acesso: Boolean(usuario.primeiro_acesso),
    senha_temporaria: Boolean(usuario.senha_temporaria)
  };
}

function isInactiveStatus(status) {
  return ['desligado', 'removido', 'inativo'].includes(String(status || '').trim().toLowerCase());
}

router.post('/login', async (req, res) => {
  const { matricula, senha } = req.body;
  if (!matricula || !senha) {
    return res.status(400).json({ error: 'Matrícula e senha são obrigatórias' });
  }

  try {
    const usuario = await db.get(
      `SELECT id, matricula, nome_completo, nome_preferido, senha_hash, perfil, tipo_colaborador, status, primeiro_acesso, senha_temporaria
       FROM colaboradores
       WHERE matricula = ?`,
      [matricula]
    );

    if (!usuario || !usuario.senha_hash) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    if (isInactiveStatus(usuario.status)) {
      return res.status(403).json({ error: 'Cadastro inativo. Procure o RH.' });
    }

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    if (isFirstAccess(usuario)) {
      return res.json({
        requiresPasswordChange: true,
        matricula: usuario.matricula,
        nome_completo: usuario.nome_completo,
        perfil: usuario.perfil
      });
    }

    const usuarioResponse = buildUserResponse({
      ...usuario,
      primeiro_acesso: false,
      senha_temporaria: false
    });

    const token = jwt.sign(
      {
        id: usuario.id,
        matricula: usuario.matricula,
        perfil: usuario.perfil,
        nome_completo: usuario.nome_completo,
        nome_preferido: usuario.nome_preferido,
        primeiro_acesso: false,
        senha_temporaria: false
      },
      getJwtSecret(),
      { expiresIn: '8h' }
    );

    return res.json({ token, usuario: usuarioResponse });
  } catch (error) {
    console.error('ERRO LOGIN:', error);
    return res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

router.post('/primeiro-acesso', async (req, res) => {
  const { matricula, senhaAtual, nomePreferido, novaSenha, confirmarSenha } = req.body;

  if (!nomePreferido || nomePreferido.trim().length < 2) {
    return res.status(400).json({ error: 'Informe como voce deseja ser chamado.' });
  }

  if (!novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  if (novaSenha === 'log20') {
    return res.status(400).json({ error: 'A nova senha não pode ser igual à senha temporária.' });
  }

  if (novaSenha !== confirmarSenha) {
    return res.status(400).json({ error: 'As senhas não coincidem.' });
  }

  try {
    const usuario = await db.get(
      'SELECT id, matricula, senha_hash, status FROM colaboradores WHERE matricula = ?',
      [matricula]
    );

    if (!usuario) {
      return res.status(404).json({ error: 'Matrícula não encontrada.' });
    }
    if (isInactiveStatus(usuario.status)) {
      return res.status(403).json({ error: 'Cadastro inativo. Procure o RH.' });
    }

    const senhaOk = await bcrypt.compare(senhaAtual || '', usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Senha atual invalida.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await db.run(
      `UPDATE colaboradores
       SET nome_preferido = ?,
           senha_hash = ?,
           primeiro_acesso = false,
           senha_temporaria = false,
           data_ultima_troca_senha = CURRENT_TIMESTAMP
       WHERE matricula = ?`,
      [nomePreferido.trim(), senhaHash, matricula]
    );

    return res.json({ message: 'Acesso configurado com sucesso.' });
  } catch (error) {
    console.error('ERRO PRIMEIRO ACESSO:', error);
    return res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

module.exports = router;
