const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const query = `SELECT a.*, c.matricula, c.nome_completo FROM atendimentos a LEFT JOIN colaboradores c ON a.colaborador_id = c.id ORDER BY a.data_hora DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    res.json(rows);
  });
});

router.post('/', authenticateToken, (req, res) => {
  const { telefone, mensagem, categoria } = req.body;
  const now = new Date().toISOString();
  db.run('INSERT INTO atendimentos (colaborador_id, telefone, mensagem, categoria, status, data_hora) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, telefone, mensagem, categoria || 'Geral', 'Pendente', now], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao criar atendimento' });
    res.json({ id: this.lastID });
  });
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const { resposta, status } = req.body;
  db.run('UPDATE atendimentos SET resposta = ?, status = ? WHERE id = ?', [resposta, status || 'Concluído', Number(req.params.id)], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao atualizar atendimento' });
    res.json({ changed: this.changes });
  });
});

module.exports = router;
