require('./config/env');

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const usePostgres = Boolean(process.env.DATABASE_URL);
let sqliteDb = null;
let pool = null;

function normalizeSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function connectSqlite() {
  const sqlite3 = require('sqlite3').verbose();
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const dbFile = path.join(dataDir, 'db.sqlite');
  sqliteDb = new sqlite3.Database(dbFile);
  sqliteDb.serialize(() => {
    sqliteDb.run('PRAGMA foreign_keys = ON');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS colaboradores (
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

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS prontuario_motoristas (
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

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS historico_pontuacao (
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

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS respostas_chatbot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      pergunta TEXT NOT NULL,
      resposta TEXT NOT NULL,
      ativo INTEGER DEFAULT 1
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS atendimentos (
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

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS acoes_comunicacao (
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

    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuario_motoristas_colaborador ON prontuario_motoristas(colaborador_id)');
  });

  return sqliteDb;
}

function connectPostgres() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || /sslmode=require/i.test(process.env.DATABASE_URL || '')
      ? { rejectUnauthorized: false }
      : false,
  });
  return pool;
}

const client = usePostgres ? connectPostgres() : connectSqlite();

function all(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (usePostgres) {
    const query = normalizeSql(sql);
    if (callback) {
      pool.query(query, params).then((result) => callback(null, result.rows)).catch(callback);
      return;
    }
    return pool.query(query, params).then((result) => result.rows);
  }

  if (callback) {
    sqliteDb.all(sql, params, callback);
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (usePostgres) {
    const query = normalizeSql(sql);
    if (callback) {
      pool.query(query, params).then((result) => callback(null, result.rows[0])).catch(callback);
      return;
    }
    return pool.query(query, params).then((result) => result.rows[0]);
  }

  if (callback) {
    sqliteDb.get(sql, params, callback);
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const postgresRunner = async () => {
    const query = normalizeSql(sql);
    const result = await pool.query(query, params);
    const ctx = { lastID: null, changes: result.rowCount };

    if (result.command === 'INSERT') {
      if (result.rows?.[0]?.id !== undefined) {
        ctx.lastID = result.rows[0].id;
      } else {
        const last = await pool.query('SELECT LASTVAL() AS id');
        ctx.lastID = last.rows?.[0]?.id || null;
      }
    }

    return ctx;
  };

  if (usePostgres) {
    if (callback) {
      postgresRunner()
        .then((ctx) => callback.call(ctx, null))
        .catch(callback);
      return;
    }
    return postgresRunner();
  }

  if (callback) {
    sqliteDb.run(sql, params, function (err) {
      callback.call(this, err);
    });
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function query(sql, params = []) {
  if (usePostgres) {
    return pool.query(normalizeSql(sql), params);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve({ rows });
    });
  });
}

function serialize(fn) {
  if (!usePostgres && typeof sqliteDb.serialize === 'function') {
    return sqliteDb.serialize(fn);
  }
  return fn();
}

function close(callback) {
  if (usePostgres) {
    if (callback) return pool.end(callback);
    return pool.end();
  }

  if (callback) return sqliteDb.close(callback);
  return new Promise((resolve, reject) => {
    sqliteDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  all,
  get,
  run,
  query,
  serialize,
  close,
};
