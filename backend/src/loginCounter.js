const db = require('./db');

let loginCounterReady = null;

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

async function initializeLoginCounterTable() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS logins_autenticados (
      colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      hora INTEGER NOT NULL CHECK (hora BETWEEN 0 AND 23),
      autenticado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_logins_autenticados_data_hora
      ON logins_autenticados (data, hora)
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_logins_autenticados_colaborador
      ON logins_autenticados (colaborador_id, data)
  `);
}

function ensureLoginCounterTable() {
  if (!loginCounterReady) {
    loginCounterReady = initializeLoginCounterTable().catch((error) => {
      loginCounterReady = null;
      throw error;
    });
  }
  return loginCounterReady;
}

async function recordAuthenticatedLogin(collaboratorId) {
  const id = Number(collaboratorId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError('colaborador_id invalido para registro de login');
  }

  await ensureLoginCounterTable();
  const { date, hour } = getSaoPauloDateTime();
  await db.run(
    `INSERT INTO logins_autenticados (colaborador_id, data, hora)
     VALUES (?, ?, ?)`,
    [id, date, hour]
  );
}

async function getAuthenticatedLoginMetrics() {
  await ensureLoginCounterTable();
  const { date: today } = getSaoPauloDateTime();

  const [totalRow, todayRow, historyRows, monthlyRows, hourlyRows] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT colaborador_id) AS usuarios_unicos,
              MAX(autenticado_em) AS ultimo_login_em
         FROM logins_autenticados`
    ),
    db.get(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT colaborador_id) AS usuarios_unicos
         FROM logins_autenticados
        WHERE data = ?`,
      [today]
    ),
    db.all(
      `SELECT data,
              COUNT(*) AS total,
              COUNT(DISTINCT colaborador_id) AS usuarios_unicos
         FROM logins_autenticados
        GROUP BY data
        ORDER BY data ASC`
    ),
    db.all(
      `SELECT SUBSTR(data, 1, 7) AS mes,
              COUNT(*) AS total,
              COUNT(DISTINCT colaborador_id) AS usuarios_unicos
         FROM logins_autenticados
        GROUP BY SUBSTR(data, 1, 7)
        ORDER BY mes ASC`
    ),
    db.all(
      `SELECT hora, COUNT(*) AS total
         FROM logins_autenticados
        GROUP BY hora
        ORDER BY hora ASC`
    )
  ]);

  const history = historyRows.map((item) => ({
    data: item.data,
    total: Number(item.total || 0),
    usuarios_unicos: Number(item.usuarios_unicos || 0)
  }));
  const monthlyHistory = monthlyRows.map((item) => ({
    mes: item.mes,
    total: Number(item.total || 0),
    usuarios_unicos: Number(item.usuarios_unicos || 0)
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

  return {
    total_logins: Number(totalRow?.total || 0),
    total_logins_hoje: Number(todayRow?.total || 0),
    usuarios_unicos_total: Number(totalRow?.usuarios_unicos || 0),
    usuarios_unicos_hoje: Number(todayRow?.usuarios_unicos || 0),
    ultima_data: history.at(-1)?.data || null,
    ultimo_login_em: totalRow?.ultimo_login_em || null,
    history,
    monthly_history: monthlyHistory,
    hourly_history: hourlyHistory,
    resumo: {
      dias_registrados: history.length,
      media_logins_dia: history.length
        ? Number((history.reduce((sum, item) => sum + item.total, 0) / history.length).toFixed(1))
        : 0,
      melhor_dia: bestDay,
      horario_pico: bestHour?.total ? bestHour : null,
      fuso_horario: 'America/Sao_Paulo'
    }
  };
}

module.exports = {
  ensureLoginCounterTable,
  recordAuthenticatedLogin,
  getAuthenticatedLoginMetrics
};
