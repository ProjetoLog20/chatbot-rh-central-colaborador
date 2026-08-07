require('./config/env');

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const colaboradoresRoutes = require('./routes/colaboradores');
const prontuarioRoutes = require('./routes/prontuario');
const chatRoutes = require('./routes/chatbot');
const yuriRoutes = require('./routes/yuri');
const respostasRoutes = require('./routes/respostas');
const importsRoutes = require('./routes/imports');
const atendimentosRoutes = require('./routes/atendimentos');
const acoesRoutes = require('./routes/acoes');
const pesquisaClimaRoutes = require('./routes/pesquisa-clima');
const skapRoutes = require('./routes/skap');
const produtividadeRoutes = require('./routes/produtividade');
const produtividadeArmazemRoutes = require('./routes/produtividade-armazem');
const modulosRoutes = require('./routes/modulos');
const campeoesSegurancaRoutes = require('./routes/campeoes-seguranca');
const rotogramasRoutes = require('./routes/rotogramas');
const notificacoesRoutes = require('./routes/notificacoes');
const satisfacaoYuriRoutes = require('./routes/satisfacao-yuri');
const { incrementAccessCounter, getAccessMetrics } = require('./accessCounter');
const { authenticateToken, authorizeRoles } = require('./authMiddleware');
const errorHandler = require('./errorHandler');
const { geoRestriction } = require('./geoRestriction');
const { firstAccessLimiter, loginLimiter, preventSensitiveCaching, requestId, securityHeaders } = require('./security');
const { ensureRuntimeSchema } = require('./runtimeSchema');

const app = express();
const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV === 'production') {
  // O Render encaminha o IP original no primeiro proxy confiavel.
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(requestId);
app.use(securityHeaders());

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://localhost:4001',
      'https://chatbot-rh-central-colaborador-preset.onrender.com',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
};

app.use('/api', cors(corsOptions));
app.use('/api', preventSensitiveCaching);
app.use('/api', geoRestriction);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(async (req, res, next) => {
  const isAssetRequest = /\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|map)$/i.test(req.path);
  const isPageView = req.method === 'GET' && !req.path.startsWith('/api') && !isAssetRequest;
  if (process.env.ACCESS_COUNTER_ENABLED !== 'false' && isPageView) {
    incrementAccessCounter(req).catch(() => {});
  }
  next();
});

app.get('/api/health', async (req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    console.error(`[${req.requestId}] Falha no health check:`, error);
    return res.status(503).json({ status: 'degraded', database: 'error' });
  }
});

app.get('/api/admin/acessos', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const metrics = await getAccessMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Erro ao consultar acessos:', error);
    res.status(500).json({ error: 'Erro ao consultar contador de acessos' });
  }
});

// API routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/primeiro-acesso', firstAccessLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/prontuario', prontuarioRoutes);
app.use('/api/prontuario_motoristas', prontuarioRoutes);
app.use('/api/chatbot', chatRoutes);
app.use('/api/yuri', yuriRoutes);
app.use('/api/respostas_chatbot', respostasRoutes);
app.use('/api/import', importsRoutes);
app.use('/api/atendimentos', atendimentosRoutes);
app.use('/api/acoes', acoesRoutes);
app.use('/api/acoes-encontros', acoesRoutes);
app.use('/api/admin/acoes-encontros', acoesRoutes);
app.use('/api/pesquisa-clima', pesquisaClimaRoutes);
app.use('/api/skap', skapRoutes);
app.use('/api/produtividade', produtividadeRoutes);
app.use('/api/produtividade-armazem', produtividadeArmazemRoutes);
app.use('/api', modulosRoutes);
app.use('/api/campeoes-seguranca', campeoesSegurancaRoutes);
app.use('/api/rotogramas', rotogramasRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/satisfacao-yuri', satisfacaoYuriRoutes);

// Serve static files from frontend dist
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

// SPA fallback for frontend routes (not API)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(errorHandler);

if (require.main === module) {
  ensureRuntimeSchema()
    .then((result) => {
      if (result.applied) console.log(`Schema atualizado: ${result.migration}`);
      app.listen(PORT, () => {
        console.log(`Backend rodando em http://localhost:${PORT}`);
        console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
      });
    })
    .catch((error) => {
      console.error('Falha ao preparar o schema do banco:', error.message || error);
      process.exit(1);
    });
}

module.exports = app;
