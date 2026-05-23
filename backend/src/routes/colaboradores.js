const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

const publicColumns = `
  id, matricula, nome_completo, nome_preferido, cpf, telefone_whatsapp, email, cargo, setor,
  unidade, tipo_colaborador, status, data_admissao, perfil, primeiro_acesso, senha_temporaria,
  data_ultima_troca_senha
`;

router.get('/me', authenticateToken, (req, res) => {
  db.get(`SELECT ${publicColumns} FROM colaboradores WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    res.json(row);
  });
});

router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  db.all(`SELECT ${publicColumns} FROM colaboradores ORDER BY nome_completo`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    res.json(rows);
  });
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade, tipo_colaborador, status, data_admissao, senha, perfil } = req.body;
  if (!matricula || !nome_completo || !perfil) {
    return res.status(400).json({ error: 'Campos obrigatorios ausentes' });
  }

  const senha_hash = await bcrypt.hash(senha || 'log20', 10);
  const stmt = `INSERT INTO colaboradores (
      matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade,
      tipo_colaborador, status, data_admissao, senha_hash, perfil, primeiro_acesso,
      senha_temporaria, data_ultima_troca_senha
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, true, null)`;

  db.run(stmt, [matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade, tipo_colaborador, status, data_admissao, senha_hash, perfil], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Matricula ja cadastrada' });
      }
      return res.status(500).json({ error: 'Erro ao salvar colaborador' });
    }
    res.json({ id: this.lastID });
  });
});

router.put('/:id', authenticateToken, (req, res) => {
  const id = Number(req.params.id);
  if (req.user.perfil !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade, tipo_colaborador, status, data_admissao, senha, perfil, resetarSenha } = req.body;
  db.get('SELECT * FROM colaboradores WHERE id = ?', [id], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    if (!user) return res.status(404).json({ error: 'Colaborador nao encontrado' });

    let senha_hash = user.senha_hash;
    let primeiro_acesso = user.primeiro_acesso;
    let senha_temporaria = user.senha_temporaria;
    let data_ultima_troca_senha = user.data_ultima_troca_senha;

    if (req.user.perfil === 'admin' && resetarSenha) {
      senha_hash = await bcrypt.hash('log20', 10);
      primeiro_acesso = true;
      senha_temporaria = true;
      data_ultima_troca_senha = null;
    } else if (senha) {
      senha_hash = await bcrypt.hash(senha, 10);
      primeiro_acesso = false;
      senha_temporaria = false;
      data_ultima_troca_senha = new Date().toISOString();
    }

    const nextStatus = req.user.perfil === 'admin' ? (status || user.status) : user.status;
    const nextPerfil = req.user.perfil === 'admin' ? (perfil || user.perfil) : user.perfil;
    const stmt = `UPDATE colaboradores
      SET nome_completo = ?, cpf = ?, telefone_whatsapp = ?, email = ?, cargo = ?, setor = ?,
          unidade = ?, tipo_colaborador = ?, status = ?, data_admissao = ?, senha_hash = ?,
          perfil = ?, primeiro_acesso = ?, senha_temporaria = ?, data_ultima_troca_senha = ?
      WHERE id = ?`;

    db.run(stmt, [
      nome_completo || user.nome_completo,
      cpf || user.cpf,
      telefone_whatsapp || user.telefone_whatsapp,
      email || user.email,
      cargo || user.cargo,
      setor || user.setor,
      unidade || user.unidade,
      tipo_colaborador || user.tipo_colaborador,
      nextStatus,
      data_admissao || user.data_admissao,
      senha_hash,
      nextPerfil,
      primeiro_acesso,
      senha_temporaria,
      data_ultima_troca_senha,
      id
    ], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: 'Erro atualizando colaborador' });
      res.json({ changed: this.changes });
    });
  });
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM colaboradores WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao excluir colaborador' });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
