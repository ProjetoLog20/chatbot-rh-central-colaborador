require('./config/env');

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const colaboradoresRoutes = require('./routes/colaboradores');
const prontuarioRoutes = require('./routes/prontuario');
const chatRoutes = require('./routes/chatbot');
const respostasRoutes = require('./routes/respostas');
const importsRoutes = require('./routes/imports');
const atendimentosRoutes = require('./routes/atendimentos');
const acoesRoutes = require('./routes/acoes');
const errorHandler = require('./errorHandler');

const app = express();
const port = process.env.PORT || 4000;

// CORS configuration: more permissive for dev, can be restricted in production
app.use(cors({
  origin(origin, callback) {
    // In production, restrict origins if NODE_ENV is set
    if (process.env.NODE_ENV === 'production') {
      if (!origin || origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }
      return callback(new Error('Origem não permitida pelo CORS'));
    }
    // In development, allow all origins
    return callback(null, true);
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve frontend static assets
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// Explicitly serve /assets to ensure they bypass other middleware
app.use('/assets', express.static(path.join(frontendDist, 'assets')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/prontuario_motoristas', prontuarioRoutes);
app.use('/api/chatbot', chatRoutes);
app.use('/api/respostas_chatbot', respostasRoutes);
app.use('/api/import', importsRoutes);
app.use('/api/atendimentos', atendimentosRoutes);
app.use('/api/acoes', acoesRoutes);

// SPA fallback: serve index.html for all routes that aren't API or static files
app.get('*', (req, res) => {
  // Don't serve index.html for API routes or already-handled static files
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    return res.sendFile(path.join(frontendDist, 'index.html'));
  }
  res.status(404).send('Not found');
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
