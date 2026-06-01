const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

function ensureRespostasColumns(callback) {
  const statements = [
    'ALTER TABLE respostas_chatbot ADD COLUMN created_at TIMESTAMP',
    'ALTER TABLE respostas_chatbot ADD COLUMN updated_at TIMESTAMP'
  ];

  let index = 0;
  function next(err) {
    if (err && !/duplicate column|already exists/i.test(String(err.message || err))) {
      return callback(err);
    }

    if (index >= statements.length) return callback();
    db.run(statements[index], [], next);
    index += 1;
  }

  next();
}

router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  ensureRespostasColumns((columnErr) => {
    if (columnErr) return res.status(500).json({ error: 'Erro ao preparar respostas do chatbot' });

    db.all('SELECT * FROM respostas_chatbot ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
      return res.json(rows);
    });
  });
});

router.get('/sugestoes', authenticateToken, (req, res) => {
  ensureRespostasColumns((columnErr) => {
    if (columnErr) return res.status(500).json({ error: 'Erro ao preparar sugestoes do chatbot' });

    db.all(
      `SELECT id, categoria, pergunta
       FROM respostas_chatbot
       WHERE ativo = 1
       ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
       LIMIT 20`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao carregar sugestoes do chatbot' });
        return res.json(rows);
      }
    );
  });
});

router.post('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const { categoria, pergunta, resposta, ativo } = req.body;
  if (!pergunta || !resposta) {
    return res.status(400).json({ error: 'Pergunta e resposta sao obrigatorias' });
  }

  ensureRespostasColumns((columnErr) => {
    if (columnErr) return res.status(500).json({ error: 'Erro ao preparar respostas do chatbot' });

    db.run(
      'INSERT INTO respostas_chatbot (categoria, pergunta, resposta, ativo, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [categoria || 'geral', pergunta, resposta, ativo ? 1 : 0],
      function (err) {
        if (err) return res.status(500).json({ error: 'Erro ao salvar resposta' });
        return res.json({ id: this.lastID });
      }
    );
  });
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { categoria, pergunta, resposta, ativo } = req.body;

  ensureRespostasColumns((columnErr) => {
    if (columnErr) return res.status(500).json({ error: 'Erro ao preparar respostas do chatbot' });

    db.run(
      'UPDATE respostas_chatbot SET categoria = ?, pergunta = ?, resposta = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [categoria || 'geral', pergunta, resposta, ativo ? 1 : 0, id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Erro ao atualizar resposta' });
        return res.json({ changed: this.changes });
      }
    );
  });
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM respostas_chatbot WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao excluir resposta' });
    return res.json({ deleted: this.changes });
  });
});

module.exports = router;
