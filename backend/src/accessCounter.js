const db = require('./db');

async function ensureAccessCounterTable() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS acessos_app (
      id INTEGER PRIMARY KEY DEFAULT 1,
      total_acessos INTEGER NOT NULL DEFAULT 0,
      total_acessos_hoje INTEGER NOT NULL DEFAULT 0,
      ultima_data TEXT,
      ultimo_acesso_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS acessos_diarios (
      data TEXT PRIMARY KEY,
      total INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.run(`
    INSERT INTO acessos_app (id, total_acessos, total_acessos_hoje, ultima_data, ultimo_acesso_em)
    VALUES (1, 0, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `);

  await backfillRetroactiveHistory();
}

async function backfillRetroactiveHistory() {
  const row = await db.get('SELECT total_acessos, total_acessos_hoje, ultima_data FROM acessos_app WHERE id = 1');
  if (!row) return;

  const count = await db.get('SELECT COUNT(*) AS total FROM acessos_diarios');
  if (Number(count?.total || 0) > 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const baseCount = Number(row.total_acessos_hoje || row.total_acessos || 0);
  const initialCount = Math.max(1, baseCount);

  await db.run(
    'INSERT INTO acessos_diarios (data, total) VALUES (?, ?)',
    [row.ultima_data || today, initialCount]
  );
}

async function incrementAccessCounter(req) {
  const today = new Date().toISOString().slice(0, 10);
  const path = req.originalUrl || req.url || '/';

  try {
    await ensureAccessCounterTable();

    const row = await db.get('SELECT * FROM acessos_app WHERE id = 1');
    if (!row) {
      await db.run(
        `INSERT INTO acessos_app (id, total_acessos, total_acessos_hoje, ultima_data, ultimo_acesso_em)
         VALUES (1, 1, 1, ?, CURRENT_TIMESTAMP)`,
        [today]
      );
      await db.run('INSERT INTO acessos_diarios (data, total) VALUES (?, ?) ON CONFLICT(data) DO UPDATE SET total = total + 1', [today, 1]);
      return;
    }

    if (row.ultima_data === today) {
      await db.run(
        `UPDATE acessos_app
         SET total_acessos = total_acessos + 1,
             total_acessos_hoje = total_acessos_hoje + 1,
             ultimo_acesso_em = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
    } else {
      await db.run(
        `UPDATE acessos_app
         SET total_acessos = total_acessos + 1,
             total_acessos_hoje = 1,
             ultima_data = ?,
             ultimo_acesso_em = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [today]
      );
    }

    await db.run('INSERT INTO acessos_diarios (data, total) VALUES (?, 1) ON CONFLICT(data) DO UPDATE SET total = total + 1', [today]);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[acessos] ${req.method} ${path}`);
    }
  } catch (error) {
    console.error('Erro ao registrar acesso:', error);
  }
}

async function getAccessMetrics() {
  await ensureAccessCounterTable();

  const row = await db.get('SELECT total_acessos, total_acessos_hoje, ultima_data, ultimo_acesso_em FROM acessos_app WHERE id = 1');
  const historyRows = await db.all('SELECT data, total FROM acessos_diarios ORDER BY data ASC');

  return {
    total_acessos: Number(row?.total_acessos || 0),
    total_acessos_hoje: Number(row?.total_acessos_hoje || 0),
    ultima_data: row?.ultima_data || null,
    ultimo_acesso_em: row?.ultimo_acesso_em || null,
    history: historyRows.map((item) => ({
      data: item.data,
      total: Number(item.total || 0)
    }))
  };
}

module.exports = {
  ensureAccessCounterTable,
  incrementAccessCounter,
  getAccessMetrics
};
