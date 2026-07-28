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
    CREATE TABLE IF NOT EXISTS acessos_horarios (
      data TEXT NOT NULL,
      hora INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (data, hora)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS acessos_importacoes_retroativas (
      id INTEGER PRIMARY KEY DEFAULT 1,
      origem TEXT NOT NULL,
      referencia TEXT,
      arquivo TEXT,
      hash_sha256 TEXT,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      total_acessos INTEGER NOT NULL DEFAULT 0,
      registros_horarios INTEGER NOT NULL DEFAULT 0,
      importado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    INSERT INTO acessos_app (id, total_acessos, total_acessos_hoje, ultima_data, ultimo_acesso_em)
    VALUES (1, 0, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `);

  await backfillRetroactiveHistory();
}

function getSaoPauloDateTime() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour)
  };
}

async function backfillRetroactiveHistory() {
  const row = await db.get('SELECT total_acessos, total_acessos_hoje, ultima_data FROM acessos_app WHERE id = 1');
  if (!row) return;

  const count = await db.get('SELECT COUNT(*) AS total FROM acessos_diarios');
  if (Number(count?.total || 0) > 0) return;

  const today = getSaoPauloDateTime().date;
  const baseCount = Number(row.total_acessos_hoje || row.total_acessos || 0);
  const initialCount = Math.max(1, baseCount);

  await db.run(
    'INSERT INTO acessos_diarios (data, total) VALUES (?, ?)',
    [row.ultima_data || today, initialCount]
  );
}

async function incrementAccessCounter(req) {
  const { date: today, hour } = getSaoPauloDateTime();
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
      await db.run('INSERT INTO acessos_diarios (data, total) VALUES (?, ?) ON CONFLICT(data) DO UPDATE SET total = acessos_diarios.total + 1', [today, 1]);
      await db.run(
        'INSERT INTO acessos_horarios (data, hora, total) VALUES (?, ?, 1) ON CONFLICT(data, hora) DO UPDATE SET total = acessos_horarios.total + 1',
        [today, hour]
      );
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

    await db.run('INSERT INTO acessos_diarios (data, total) VALUES (?, 1) ON CONFLICT(data) DO UPDATE SET total = acessos_diarios.total + 1', [today]);
    await db.run(
      'INSERT INTO acessos_horarios (data, hora, total) VALUES (?, ?, 1) ON CONFLICT(data, hora) DO UPDATE SET total = acessos_horarios.total + 1',
      [today, hour]
    );

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
  const hourlyRows = await db.all(
    'SELECT hora, SUM(total) AS total FROM acessos_horarios GROUP BY hora ORDER BY hora ASC'
  );
  const retroactiveSource = await db.get(
    `SELECT origem, referencia, arquivo, hash_sha256, periodo_inicio, periodo_fim,
            total_acessos, registros_horarios, importado_em
       FROM acessos_importacoes_retroativas
      WHERE id = 1`
  );
  const detailedDaysRow = await db.get('SELECT COUNT(DISTINCT data) AS total FROM acessos_horarios');
  const history = historyRows.map((item) => ({
    data: item.data,
    total: Number(item.total || 0)
  }));
  const hourlyHistory = Array.from({ length: 24 }, (_, hour) => ({
    hora: hour,
    total: Number(hourlyRows.find((item) => Number(item.hora) === hour)?.total || 0)
  }));
  const bestDay = history.reduce(
    (best, item) => (!best || item.total > best.total ? item : best),
    null
  );
  const bestHour = hourlyHistory.reduce(
    (best, item) => (item.total > (best?.total || 0) ? item : best),
    null
  );
  const totalDays = history.length;
  const monthlyMap = new Map();
  for (const item of history) {
    const month = String(item.data || '').slice(0, 7);
    if (!month) continue;
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + item.total);
  }
  const monthlyHistory = [...monthlyMap.entries()].map(([mes, total]) => ({ mes, total }));

  return {
    total_acessos: Number(row?.total_acessos || 0),
    total_acessos_hoje: Number(row?.total_acessos_hoje || 0),
    ultima_data: row?.ultima_data || null,
    ultimo_acesso_em: row?.ultimo_acesso_em || null,
    history,
    monthly_history: monthlyHistory,
    hourly_history: hourlyHistory,
    fonte_retroativa: retroactiveSource || null,
    resumo: {
      dias_registrados: totalDays,
      media_acessos_dia: totalDays ? Number((history.reduce((sum, item) => sum + item.total, 0) / totalDays).toFixed(1)) : 0,
      melhor_dia: bestDay,
      horario_pico: bestHour?.total ? bestHour : null,
      dias_com_detalhamento_horario: Number(detailedDaysRow?.total || 0),
      fuso_horario: 'America/Sao_Paulo'
    }
  };
}

module.exports = {
  ensureAccessCounterTable,
  incrementAccessCounter,
  getAccessMetrics
};
