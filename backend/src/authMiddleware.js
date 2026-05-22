require('./config/env');

const jwt = require('jsonwebtoken');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET nao configurado no backend/.env');
  }
  return process.env.JWT_SECRET;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token nao fornecido' });

  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalido' });
    req.user = user;
    next();
  });
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.perfil)) {
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

