require('../src/config/env');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const migrationsDir = path.join(__dirname, '../migrations');

function migrationFiles() {
  return fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function ensureLedger() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function isExistingDatabaseWithoutLedger() {
  const applied = await db.query('SELECT COUNT(*)::integer AS total FROM schema_migrations');
  if (Number(applied.rows?.[0]?.total || 0) > 0) return false;
  const existing = await db.query("SELECT to_regclass('public.colaboradores') AS table_name");
  return Boolean(existing.rows?.[0]?.table_name);
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Defina a variavel no backend/.env ou no ambiente.');
  }

  await ensureLedger();
  if (await isExistingDatabaseWithoutLedger()) {
    throw new Error(
      'Banco existente sem historico de migrations. Execute primeiro o baseline controlado; nenhuma migration foi reaplicada.'
    );
  }

  const appliedResult = await db.query('SELECT filename, checksum_sha256 FROM schema_migrations');
  const applied = new Map((appliedResult.rows || []).map((row) => [row.filename, row.checksum_sha256]));

  for (const filename of migrationFiles()) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const currentChecksum = checksum(sql);
    if (applied.has(filename)) {
      if (applied.get(filename) !== currentChecksum) {
        throw new Error(`Migration ja aplicada foi alterada: ${filename}`);
      }
      continue;
    }

    console.log(`Aplicando migracao: ${filename}`);
    await db.withTransaction(async (transaction) => {
      await transaction.query(sql);
      await transaction.query(
        'INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)',
        [filename, currentChecksum]
      );
    });
  }

  console.log('Migrations aplicadas com sucesso.');
}

runMigrations()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Falha ao aplicar migrations:', error.message || error);
    await db.close().catch(() => {});
    process.exit(1);
  });
