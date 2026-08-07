const fs = require('fs');
const path = require('path');
const db = require('./db');

const ROTOGRAMA_MAP_MIGRATION = path.join(__dirname, '../migrations/024_rotograma_mapa.sql');

async function ensureRuntimeSchema({
  database = db,
  usePostgres = Boolean(process.env.DATABASE_URL)
} = {}) {
  if (!usePostgres) return { applied: false, reason: 'sqlite' };

  const sql = fs.readFileSync(ROTOGRAMA_MAP_MIGRATION, 'utf8');
  await database.query(sql);
  return { applied: true, migration: path.basename(ROTOGRAMA_MAP_MIGRATION) };
}

module.exports = {
  ROTOGRAMA_MAP_MIGRATION,
  ensureRuntimeSchema
};
