const express = require('express');
const { authenticateToken } = require('../authMiddleware');
const { yuriLimiter } = require('../security');
const { answerQuestion } = require('../services/chatbotService');

const router = express.Router();
const MAX_QUESTION_LENGTH = 1200;

router.use(authenticateToken, yuriLimiter);

function getQuestion(req) {
  return String(req.method === 'GET' ? req.query.question || '' : req.body.question || '').trim();
}

function validateQuestion(req, res) {
  const question = getQuestion(req);
  if (!question) {
    res.status(400).json({ error: 'Pergunta e obrigatoria' });
    return null;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: 'Pergunta muito longa' });
    return null;
  }
  return question;
}

router.get('/assistance', async (req, res) => {
  try {
    const question = validateQuestion(req, res);
    if (!question) return;
    res.setHeader('Deprecation', 'true');
    res.setHeader('Cache-Control', 'no-store');
    const result = await answerQuestion({
      question,
      user: req.user
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erro no assistente' });
  }
});

router.post('/assistance', async (req, res) => {
  try {
    const question = validateQuestion(req, res);
    if (!question) return;
    res.setHeader('Deprecation', 'true');
    const result = await answerQuestion({
      question,
      user: req.user,
      previousResponseId: req.body.previousResponseId
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erro no assistente' });
  }
});

module.exports = router;
