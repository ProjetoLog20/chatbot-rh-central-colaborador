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
    const result = await db.query(
      'SELECT * FROM colaboradores WHERE matricula = $1',
      [matricula]
    );

    const usuario = result.rows ? result.rows[0] : null;
    if (!usuario || !usuario.senha_hash) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    const valid = await bcrypt.compare(senha, usuario.senha_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Matrícula ou senha inválidos' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        matricula: usuario.matricula,
        perfil: usuario.perfil,
        nome_completo: usuario.nome_completo
      },
      getJwtSecret(),
      { expiresIn: '8h' }
    );

    res.json({ token, perfil: usuario.perfil, nome_completo: usuario.nome_completo });
  } catch (error) {
    console.error('ERRO LOGIN:', error);
    return res.status(500).json({
      error: 'Erro no banco de dados',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

module.exports = router;
