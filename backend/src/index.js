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
const errorHandler = require('./errorHandler');

const app = express();
const PORT = process.env.PORT || 4000;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:4000',
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
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

// Serve static files from frontend dist
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

// SPA fallback for frontend routes (not API)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
});
