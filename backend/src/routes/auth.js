const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../authMiddleware');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { matricula, senha } = req.body;
  if (!matricula || !senha) {
    return res.status(400).json({ error: 'Matrícula e senha são obrigatórias' });
  }

  try {
    const sql = `
      SELECT id, matricula, nome_completo, senha_hash, perfil, tipo_colaborador, status
      FROM colaboradores
      WHERE matricula = $1
    `;

    const result = await db.query(sql, [matricula]);
    const usuario = result.rows ? result.rows[0] : null;

    if (!usuario || !usuario.senha_hash) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        matricula: usuario.matricula,
        perfil: usuario.perfil
      },
      getJwtSecret(),
      { expiresIn: '8h' }
    );

    const usuarioResponse = {
      id: usuario.id,
      matricula: usuario.matricula,
      nome_completo: usuario.nome_completo,
      perfil: usuario.perfil,
      tipo_colaborador: usuario.tipo_colaborador,
      status: usuario.status
    };

    res.json({ token, usuario: usuarioResponse });
  } catch (error) {
    console.error('ERRO LOGIN:', error);
    return res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

module.exports = router;
