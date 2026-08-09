require('../src/config/env');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const CONFIRMATION = 'EU_VERIFIQUEI_O_SCHEMA';

function checksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function baseline() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL nao configurada.');
  if (process.env.MIGRATION_BASELINE_CONFIRM !== CONFIRMATION) {
    throw new Error(`Operacao recusada. Defina MIGRATION_BASELINE_CONFIRM=${CONFIRMATION} somente depois de verificar o schema.`);
  }

  const through = String(process.env.MIGRATION_BASELINE_THROUGH || '').trim();
  if (!/^\d{3}_.+\.sql$/.test(through)) {
    throw new Error('Defina MIGRATION_BASELINE_THROUGH com o ultimo arquivo ja aplicado, por exemplo 025_planos_melhoria_yuri.sql.');
  }

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
  if (!files.includes(through)) throw new Error(`Migration de baseline inexistente: ${through}`);
  const selected = files.filter((file) => file.localeCompare(through) <= 0);

  await db.withTransaction(async (transaction) => {
    await transaction.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const existing = await transaction.query('SELECT COUNT(*)::integer AS total FROM schema_migrations');
    if (Number(existing.rows?.[0]?.total || 0) > 0) throw new Error('O baseline ja possui registros; operacao cancelada.');

    for (const filename of selected) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      await transaction.query(
        'INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)',
        [filename, checksum(sql)]
      );
    }
  });

  console.log(`Baseline registrado ate ${through}. Nenhum SQL de negocio foi reaplicado.`);
}

baseline()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Falha ao registrar baseline:', error.message || error);
    await db.close().catch(() => {});
    process.exit(1);
  });
