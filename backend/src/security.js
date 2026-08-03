const crypto = require('crypto');
const helmet = require('helmet');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 15552000, includeSubDomains: true }
      : false
  });
}

function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[a-zA-Z0-9._:-]{1,100}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function preventSensitiveCaching(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

function rateLimitHandler(req, res) {
  return res.status(429).json({
    error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    request_id: req.requestId
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler
});

const firstAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler
});

const yuriLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator(req) {
    const userId = req.user?.id || req.user?.matricula;
    return userId ? `usuario:${userId}` : `ip:${ipKeyGenerator(req.ip)}`;
  },
  handler: rateLimitHandler
});

module.exports = {
  firstAccessLimiter,
  loginLimiter,
  preventSensitiveCaching,
  requestId,
  securityHeaders,
  yuriLimiter
};
