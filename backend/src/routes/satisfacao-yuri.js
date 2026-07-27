const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const router = express.Router();

function currentCycle() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date()).slice(0, 7);
}

async function ensureTable() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS satisfacao_yuri (
      id SERIAL PRIMARY KEY,
      colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      ciclo TEXT NOT NULL,
      nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
      comentario TEXT,
      respondido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (colaborador_id, ciclo)
    )
  `);
}

router.get('/status', authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const ciclo = currentCycle();
    const resposta = await db.get(
      'SELECT nota, respondido_em FROM satisfacao_yuri WHERE colaborador_id = ? AND ciclo = ?',
      [req.user.id, ciclo]
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ciclo, respondida: Boolean(resposta) });
  } catch (error) {
    console.error('Erro ao consultar satisfação do Yuri:', error);
    res.status(500).json({ error: 'Erro ao consultar pesquisa de satisfação' });
  }
});

router.post('/responder', authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const nota = Number(req.body.nota);
    const comentario = String(req.body.comentario || '').trim().slice(0, 1000);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ error: 'Selecione uma nota de 1 a 5.' });
    }

    const ciclo = currentCycle();
    const existente = await db.get(
      'SELECT id FROM satisfacao_yuri WHERE colaborador_id = ? AND ciclo = ?',
      [req.user.id, ciclo]
    );
    if (existente) {
      return res.status(409).json({ error: 'Você já respondeu a pesquisa deste mês.' });
    }

    await db.run(
      `INSERT INTO satisfacao_yuri (colaborador_id, ciclo, nota, comentario)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, ciclo, nota, comentario || null]
    );
    res.status(201).json({ ciclo, respondida: true });
  } catch (error) {
    if (String(error.code) === '23505' || String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Você já respondeu a pesquisa deste mês.' });
    }
    console.error('Erro ao registrar satisfação do Yuri:', error);
    res.status(500).json({ error: 'Erro ao registrar pesquisa de satisfação' });
  }
});

router.get('/admin/resumo', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await ensureTable();
    const ciclo = String(req.query.ciclo || currentCycle()).trim();
    if (!/^\d{4}-\d{2}$/.test(ciclo)) {
      return res.status(400).json({ error: 'Ciclo inválido. Use AAAA-MM.' });
    }

    const respostas = await db.all(
      `SELECT s.nota, COUNT(*) AS quantidade
       FROM satisfacao_yuri s
       INNER JOIN colaboradores c ON c.id = s.colaborador_id
       WHERE s.ciclo = ?
         AND COALESCE(LOWER(TRIM(c.status)), 'ativo') NOT IN ('desligado', 'removido', 'inativo')
         AND c.matricula NOT IN ('1000', '2000', '3000', '99999')
       GROUP BY s.nota
       ORDER BY nota`,
      [ciclo]
    );
    const summary = await db.get(
      `SELECT COUNT(*) AS total, AVG(s.nota) AS media
       FROM satisfacao_yuri s
       INNER JOIN colaboradores c ON c.id = s.colaborador_id
       WHERE s.ciclo = ?
         AND COALESCE(LOWER(TRIM(c.status)), 'ativo') NOT IN ('desligado', 'removido', 'inativo')
         AND c.matricula NOT IN ('1000', '2000', '3000', '99999')`,
      [ciclo]
    );
    const audience = await db.get(
      `SELECT COUNT(*) AS total
       FROM colaboradores
       WHERE COALESCE(LOWER(TRIM(status)), 'ativo') NOT IN ('desligado', 'removido', 'inativo')
         AND matricula NOT IN ('1000', '2000', '3000', '99999')`
    );

    const total = Number(summary?.total || 0);
    const totalUsuariosAtivos = Number(audience?.total || 0);
    const media = Number(summary?.media || 0);
    const porNota = Object.fromEntries([1, 2, 3, 4, 5].map((nota) => [nota, 0]));
    respostas.forEach((item) => {
      porNota[Number(item.nota)] = Number(item.quantidade || 0);
    });
    const satisfeitos = porNota[4] + porNota[5];

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ciclo,
      total_respostas: total,
      total_usuarios_ativos: totalUsuariosAtivos,
      participacao_percentual: totalUsuariosAtivos
        ? Number(((total / totalUsuariosAtivos) * 100).toFixed(1))
        : 0,
      indice_geral_percentual: total ? Number(((media / 5) * 100).toFixed(1)) : 0,
      satisfacao_percentual: total ? Number(((satisfeitos / total) * 100).toFixed(1)) : 0,
      distribuicao: [1, 2, 3, 4, 5].map((nota) => ({
        nota,
        quantidade: porNota[nota],
        percentual: total ? Number(((porNota[nota] / total) * 100).toFixed(1)) : 0
      }))
    });
  } catch (error) {
    console.error('Erro ao consultar resultados da satisfação do Yuri:', error);
    res.status(500).json({ error: 'Erro ao consultar resultados da pesquisa' });
  }
});

module.exports = router;
