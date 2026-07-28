require('../src/config/env');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { ensureAccessCounterTable } = require('../src/accessCounter');

function parseRows(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d{4}-\d{2}-\d{2});(\d{1,2});(\d+)$/);
    if (!match) continue;
    const hour = Number(match[2]);
    const quantity = Number(match[3]);
    if (hour < 0 || hour > 23 || quantity < 0) {
      throw new Error(`Linha inválida: ${line}`);
    }
    rows.push({ date: match[1], hour, quantity });
  }
  if (!rows.length) throw new Error('Nenhum registro de acesso válido foi encontrado.');
  return rows;
}

async function importRetroactiveAccess(file) {
  const absoluteFile = path.resolve(file);
  const fileBuffer = fs.readFileSync(absoluteFile);
  const content = fileBuffer.toString('utf8');
  const rows = parseRows(content);
  const reference = content.match(/CHAMADO\s+(\d+)/i)?.[1] || '';
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
  const daily = new Map();

  for (const row of rows) {
    daily.set(row.date, (daily.get(row.date) || 0) + row.quantity);
  }

  const dates = [...daily.keys()].sort();
  const periodStart = dates[0];
  const periodEnd = dates.at(-1);
  const retroactiveTotal = rows.reduce((sum, row) => sum + row.quantity, 0);

  await ensureAccessCounterTable();
  const liveCounter = await db.get(
    'SELECT total_acessos_hoje, ultima_data FROM acessos_app WHERE id = 1'
  );

  await db.run('DELETE FROM acessos_horarios WHERE data >= ? AND data <= ?', [periodStart, periodEnd]);
  await db.run('DELETE FROM acessos_diarios WHERE data >= ? AND data <= ?', [periodStart, periodEnd]);

  const hourlyPlaceholders = rows.map(() => '(?, ?, ?)').join(', ');
  const hourlyParams = rows.flatMap((row) => [row.date, row.hour, row.quantity]);
  await db.run(
    `INSERT INTO acessos_horarios (data, hora, total)
     VALUES ${hourlyPlaceholders}
     ON CONFLICT(data, hora) DO UPDATE SET total = excluded.total`,
    hourlyParams
  );

  const dailyRows = [...daily.entries()];
  const dailyPlaceholders = dailyRows.map(() => '(?, ?)').join(', ');
  const dailyParams = dailyRows.flatMap(([date, quantity]) => [date, quantity]);
  await db.run(
    `INSERT INTO acessos_diarios (data, total)
     VALUES ${dailyPlaceholders}
     ON CONFLICT(data) DO UPDATE SET total = excluded.total`,
    dailyParams
  );

  if (liveCounter?.ultima_data > periodEnd && Number(liveCounter.total_acessos_hoje || 0) > 0) {
    await db.run(
      `INSERT INTO acessos_diarios (data, total)
       VALUES (?, ?)
       ON CONFLICT(data) DO NOTHING`,
      [liveCounter.ultima_data, Number(liveCounter.total_acessos_hoje)]
    );
  }

  await db.run(
    `INSERT INTO acessos_importacoes_retroativas (
       id, origem, referencia, arquivo, hash_sha256, periodo_inicio, periodo_fim,
       total_acessos, registros_horarios, importado_em
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       origem = excluded.origem,
       referencia = excluded.referencia,
       arquivo = excluded.arquivo,
       hash_sha256 = excluded.hash_sha256,
       periodo_inicio = excluded.periodo_inicio,
       periodo_fim = excluded.periodo_fim,
       total_acessos = excluded.total_acessos,
       registros_horarios = excluded.registros_horarios,
       importado_em = CURRENT_TIMESTAMP`,
    [
      'Histórico retroativo informado pelo chamado',
      reference ? `Chamado ${reference}` : '',
      path.basename(absoluteFile),
      hash,
      periodStart,
      periodEnd,
      retroactiveTotal,
      rows.length
    ]
  );

  await db.run(
    `UPDATE acessos_app
        SET total_acessos = ? + CASE WHEN ultima_data > ? THEN total_acessos_hoje ELSE 0 END,
            total_acessos_hoje = CASE WHEN ultima_data > ? THEN total_acessos_hoje ELSE ? END,
            ultima_data = CASE WHEN ultima_data > ? THEN ultima_data ELSE ? END,
            ultimo_acesso_em = CURRENT_TIMESTAMP
      WHERE id = 1`,
    [
      retroactiveTotal,
      periodEnd,
      periodEnd,
      daily.get(periodEnd) || 0,
      periodEnd,
      periodEnd
    ]
  );

  const consolidated = await db.get(
    'SELECT total_acessos, total_acessos_hoje, ultima_data FROM acessos_app WHERE id = 1'
  );

  return {
    arquivo: absoluteFile,
    referencia: reference,
    periodo_inicio: periodStart,
    periodo_fim: periodEnd,
    registros_horarios: rows.length,
    dias: daily.size,
    acessos_chamado: retroactiveTotal,
    total_consolidado: Number(consolidated?.total_acessos || 0),
    ultima_data: consolidated?.ultima_data || null,
    acessos_ultima_data: Number(consolidated?.total_acessos_hoje || 0),
    hash_sha256: hash
  };
}

async function main() {
  const fileIndex = process.argv.indexOf('--file');
  const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : process.argv[2];
  if (!file) throw new Error('Informe --file caminho-do-arquivo.txt');
  const report = await importRetroactiveAccess(file);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { parseRows, importRetroactiveAccess };
