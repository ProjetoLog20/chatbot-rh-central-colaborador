const express = require('express');
const { authenticateToken } = require('../authMiddleware');
const { answerQuestion } = require('../services/chatbotService');

const router = express.Router();

router.get('/assistance', authenticateToken, async (req, res) => {
  try {
    const result = await answerQuestion({
      question: req.query.question || '',
      user: req.user
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erro no assistente' });
  }
});

router.post('/assistance', authenticateToken, async (req, res) => {
  try {
    const result = await answerQuestion({
      question: req.body.question || '',
      user: req.user,
      previousResponseId: req.body.previousResponseId
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erro no assistente' });
  }
});

module.exports = router;

