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
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origem nao permitida pelo CORS'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/prontuario_motoristas', prontuarioRoutes);
app.use('/api/chatbot', chatRoutes);
app.use('/api/respostas_chatbot', respostasRoutes);
app.use('/api/import', importsRoutes);
app.use('/api/atendimentos', atendimentosRoutes);
app.use('/api/acoes', acoesRoutes);

const frontendDistPath = path.resolve(__dirname, '../..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
