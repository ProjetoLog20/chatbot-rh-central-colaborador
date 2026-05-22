const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'db.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    cpf TEXT,
    telefone_whatsapp TEXT,
    email TEXT,
    cargo TEXT,
    setor TEXT,
    unidade TEXT,
    tipo_colaborador TEXT,
    status TEXT,
    data_admissao TEXT,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS prontuario_motoristas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    pontuacao_atual INTEGER,
    faixa_atual TEXT,
    pontos_de_atencao TEXT,
    orientacoes TEXT,
    observacoes TEXT,
    data_atualizacao TEXT,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS historico_pontuacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    pontuacao_anterior INTEGER,
    pontuacao_nova INTEGER,
    faixa_anterior TEXT,
    faixa_nova TEXT,
    motivo TEXT,
    responsavel TEXT,
    data_alteracao TEXT,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS respostas_chatbot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL,
    ativo INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS atendimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER,
    telefone TEXT,
    mensagem TEXT,
    resposta TEXT,
    categoria TEXT,
    status TEXT,
    data_hora TEXT,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acoes_comunicacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    imagem_url TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    data_evento TEXT,
    criado_em TEXT,
    atualizado_em TEXT
  )`);

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuario_motoristas_colaborador ON prontuario_motoristas(colaborador_id)');

  db.all('PRAGMA table_info(atendimentos)', [], (err, columns) => {
    if (err) {
      console.error('Erro ao verificar schema de atendimentos:', err.message);
      return;
    }

    const colaboradorColumn = columns.find((column) => column.name === 'colaborador_id');
    if (!colaboradorColumn || colaboradorColumn.notnull === 0) return;

    db.serialize(() => {
      db.run('ALTER TABLE atendimentos RENAME TO atendimentos_old');
      db.run(`CREATE TABLE atendimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        colaborador_id INTEGER,
        telefone TEXT,
        mensagem TEXT,
        resposta TEXT,
        categoria TEXT,
        status TEXT,
        data_hora TEXT,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
      )`);
      db.run(`INSERT INTO atendimentos (id, colaborador_id, telefone, mensagem, resposta, categoria, status, data_hora)
        SELECT id, colaborador_id, telefone, mensagem, resposta, categoria, status, data_hora FROM atendimentos_old`);
      db.run('DROP TABLE atendimentos_old');
    });
  });
});

module.exports = db;
