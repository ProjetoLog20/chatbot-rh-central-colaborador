const fs = require('fs');
const path = require('path');
const db = require('./db');

const ROTOGRAMA_MAP_MIGRATION = path.join(__dirname, '../migrations/024_rotograma_mapa.sql');
const PLANOS_MELHORIA_MIGRATION = path.join(__dirname, '../migrations/025_planos_melhoria_yuri.sql');
const PESQUISA_CLIMA_INTEGRIDADE_MIGRATION = path.join(__dirname, '../migrations/026_pesquisa_clima_integridade.sql');
const BANCO_HORAS_MIGRATION = path.join(__dirname, '../migrations/028_banco_horas_mvp.sql');

async function ensureRuntimeSchema({
  database = db,
  usePostgres = Boolean(process.env.DATABASE_URL)
} = {}) {
  if (!usePostgres) return { applied: false, reason: 'sqlite' };

  const migrations = [
    ROTOGRAMA_MAP_MIGRATION,
    PLANOS_MELHORIA_MIGRATION,
    PESQUISA_CLIMA_INTEGRIDADE_MIGRATION,
    BANCO_HORAS_MIGRATION
  ];
  for (const migration of migrations) {
    const sql = fs.readFileSync(migration, 'utf8');
    await database.query(sql);
  }
  return { applied: true, migration: migrations.map((item) => path.basename(item)).join(', ') };
}

module.exports = {
  ROTOGRAMA_MAP_MIGRATION,
  PLANOS_MELHORIA_MIGRATION,
  PESQUISA_CLIMA_INTEGRIDADE_MIGRATION,
  BANCO_HORAS_MIGRATION,
  ensureRuntimeSchema
};
