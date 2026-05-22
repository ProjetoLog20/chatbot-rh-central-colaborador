require('../src/config/env');

const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Defina a variavel no backend/.env ou no ambiente.');
  }

  const migrationsDir = path.join(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const filename of migrationFiles) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Aplicando migracao: ${filename}`);
    await db.query(sql);
  }

  console.log('Migrations aplicadas com sucesso.');
}

runMigrations().catch((err) => {
  console.error('Falha ao aplicar migrations:', err.message || err);
  process.exit(1);
});
