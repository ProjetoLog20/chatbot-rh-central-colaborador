const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

router.get('/me', authenticateToken, (req, res) => {
  const query = `SELECT p.*, c.matricula, c.nome_completo, c.cargo, c.unidade FROM prontuario_motoristas p
    JOIN colaboradores c ON p.colaborador_id = c.id
    WHERE c.id = ?`;

  db.get(query, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    if (!row) return res.status(404).json({ error: 'Prontuário não encontrado' });
    if (req.user.perfil !== 'motorista' && req.user.perfil !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    res.json(row);
  });
});

router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const query = `SELECT p.id, p.colaborador_id, c.matricula, c.nome_completo, p.pontuacao_atual, p.faixa_atual, p.data_atualizacao FROM prontuario_motoristas p
    JOIN colaboradores c ON p.colaborador_id = c.id
    ORDER BY c.nome_completo`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    res.json(rows);
  });
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { pontuacao_atual, faixa_atual, pontos_de_atencao, orientacoes, observacoes, motivo } = req.body;

  db.get('SELECT * FROM prontuario_motoristas WHERE id = ?', [id], (err, prontuario) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });
    if (!prontuario) return res.status(404).json({ error: 'Prontuário não encontrado' });

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const stmt = `UPDATE prontuario_motoristas SET pontuacao_atual = ?, faixa_atual = ?, pontos_de_atencao = ?, orientacoes = ?, observacoes = ?, data_atualizacao = ? WHERE id = ?`;

    db.run(stmt, [pontuacao_atual ?? prontuario.pontuacao_atual, faixa_atual || prontuario.faixa_atual, pontos_de_atencao || prontuario.pontos_de_atencao, orientacoes || prontuario.orientacoes, observacoes || prontuario.observacoes, now, id], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: 'Erro atualizando prontuário' });

      if ((pontuacao_atual && pontuacao_atual !== prontuario.pontuacao_atual) || (faixa_atual && faixa_atual !== prontuario.faixa_atual)) {
        db.run(`INSERT INTO historico_pontuacao (colaborador_id, pontuacao_anterior, pontuacao_nova, faixa_anterior, faixa_nova, motivo, responsavel, data_alteracao)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [prontuario.colaborador_id, prontuario.pontuacao_atual, pontuacao_atual ?? prontuario.pontuacao_atual, prontuario.faixa_atual, faixa_atual || prontuario.faixa_atual, motivo || 'Atualização administrativa', req.user.nome_completo, now]);
      }

      res.json({ changed: this.changes });
    });
  });
});

module.exports = router;
