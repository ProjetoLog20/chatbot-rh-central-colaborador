const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../authMiddleware');

const router = express.Router();

router.post('/login', (req, res) => {
  const { matricula, senha } = req.body;
  if (!matricula || !senha) {
    return res.status(400).json({ error: 'Matrícula e senha são obrigatórias' });
  }

  const query = 'SELECT * FROM colaboradores WHERE matricula = ?';
  db.get(query, [matricula], (err, user) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    if (!user) return res.status(401).json({ error: 'Matrícula ou senha inválidos' });

    bcrypt.compare(senha, user.senha_hash, (compareErr, valid) => {
      if (compareErr) return res.status(500).json({ error: 'Erro de autenticação' });
      if (!valid) return res.status(401).json({ error: 'Matrícula ou senha inválidos' });

      const token = jwt.sign(
        {
          id: user.id,
          matricula: user.matricula,
          perfil: user.perfil,
          nome_completo: user.nome_completo
        },
        getJwtSecret(),
        { expiresIn: '8h' }
      );

      res.json({ token, perfil: user.perfil, nome_completo: user.nome_completo });
    });
  });
});

module.exports = router;
