const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  db.all('SELECT * FROM respostas_chatbot ORDER BY categoria, pergunta', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    res.json(rows);
  });
});

router.post('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const { categoria, pergunta, resposta, ativo } = req.body;
  if (!pergunta || !resposta) {
    return res.status(400).json({ error: 'Pergunta e resposta são obrigatórias' });
  }
  db.run('INSERT INTO respostas_chatbot (categoria, pergunta, resposta, ativo) VALUES (?, ?, ?, ?)', [categoria || 'geral', pergunta, resposta, ativo ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao salvar resposta' });
    res.json({ id: this.lastID });
  });
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { categoria, pergunta, resposta, ativo } = req.body;
  db.run('UPDATE respostas_chatbot SET categoria = ?, pergunta = ?, resposta = ?, ativo = ? WHERE id = ?', [categoria || 'geral', pergunta, resposta, ativo ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao atualizar resposta' });
    res.json({ changed: this.changes });
  });
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM respostas_chatbot WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao excluir resposta' });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
