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
const PORT = process.env.PORT || 4000;

// CORS configuration: more permissive for dev, can be restricted in production
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // In production, be more restrictive
    if (process.env.NODE_ENV === 'production') {
      // Allow same-origin requests and configured frontend URLs
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        'localhost',
        '127.0.0.1',
        // Add your production domain here
      ].filter(Boolean);
      
      if (allowedOrigins.some(allowed => origin.includes(allowed))) {
        return callback(null, true);
      }
      return callback(new Error('Origem não permitida pelo CORS'));
    }
    
    // In development, allow all origins
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/prontuario_motoristas', prontuarioRoutes);
app.use('/api/chatbot', chatRoutes);
app.use('/api/respostas_chatbot', respostasRoutes);
app.use('/api/import', importsRoutes);
app.use('/api/atendimentos', atendimentosRoutes);
app.use('/api/acoes', acoesRoutes);

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
