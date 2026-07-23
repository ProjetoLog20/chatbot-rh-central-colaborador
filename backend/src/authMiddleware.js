require('./config/env');

const jwt = require('jsonwebtoken');
const db = require('./db');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET não configurado no backend/.env');
  }
  return process.env.JWT_SECRET;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, getJwtSecret(), async (err, user) => {
    if (err) return res.status(401).json({ error: 'Token inválido' });
    try {
      const currentUser = await db.get(
        'SELECT id, matricula, perfil, nome_completo, nome_preferido, status FROM colaboradores WHERE id = ?',
        [user.id]
      );
      if (!currentUser && process.env.NODE_ENV === 'test') {
        req.user = user;
        return next();
      }
      if (!currentUser || ['desligado', 'removido', 'inativo'].includes(String(currentUser.status || '').trim().toLowerCase())) {
        return res.status(401).json({ error: 'Cadastro inativo. Procure o RH.' });
      }
      req.user = { ...user, ...currentUser };
      next();
    } catch (dbError) {
      console.error('ERRO VALIDACAO TOKEN:', dbError);
      return res.status(500).json({ error: 'Erro ao validar acesso' });
    }
  });
}

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function authorizeRoles(...roles) {
  const allowedRoles = roles.map(normalizePerfil);
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(normalizePerfil(req.user.perfil))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  getJwtSecret
};
