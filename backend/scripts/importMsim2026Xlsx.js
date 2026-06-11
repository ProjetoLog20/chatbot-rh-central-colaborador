require('../src/config/env');

const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = 'C:\\Users\\ArT\\Desktop\\MSIM2026.xlsx';
const SHEET_NAME = 'MSIM 2026';
const TARGET_OPERATION = 'CD CASCAVEL';
const TARGET_UNIT = 'CASCAVEL PR';
const YEAR = 2026;

const monthMap = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12
};

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function trim(value) {
  return String(value ?? '').trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = trim(value).replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return 0;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMsimValue(value) {
  const number = parseNumber(value);
  if (!number) return 0;
  return Number((number < 100 ? number * 100 : number).toFixed(2));
}

function competenciaForMonth(month, year = YEAR) {
  return `${String(month).padStart(2, '0')}/${year}`;
}

function findTargetRow(rows) {
  return rows.find((row) => normalizeText(row[1]) === normalizeText(TARGET_OPERATION));
}

function readMsimRows(filePath) {
  const workbook = xlsx.readFile(path.resolve(filePath || DEFAULT_FILE));
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Aba ${SHEET_NAME} nao encontrada.`);

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const groupRow = rows[0] || [];
  const monthRow = rows[1] || [];
  const targetRow = findTargetRow(rows);
  if (!targetRow) throw new Error(`Operacao ${TARGET_OPERATION} nao encontrada na aba ${SHEET_NAME}.`);

  const parsed = [];
  let currentFunction = '';
  for (let index = 0; index < monthRow.length; index += 1) {
    if (trim(groupRow[index])) currentFunction = trim(groupRow[index]);
    const monthToken = normalizeText(monthRow[index]).slice(0, 3);
    const month = monthMap[monthToken];
    if (!currentFunction || !month) continue;

    const valorMsim = normalizeMsimValue(targetRow[index]);
    if (!valorMsim) continue;

    parsed.push({
      unidade: TARGET_UNIT,
      operacao: trim(targetRow[1]) || TARGET_OPERATION,
      funcao: currentFunction,
      competencia: competenciaForMonth(month),
      mes: month,
      ano: YEAR,
      valor_msim: valorMsim,
      fonte: path.basename(filePath || DEFAULT_FILE)
    });
  }

  return parsed;
}

async function assertTables() {
  await db.get('SELECT 1 FROM produtividade_msim_mensal LIMIT 1');
}

async function upsertMsimRows(rows) {
  let imported = 0;
  for (const row of rows) {
    await db.run(
      `INSERT INTO produtividade_msim_mensal (
        unidade, operacao, funcao, competencia, mes, ano, valor_msim, fonte
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (unidade, funcao, competencia) DO UPDATE SET
        operacao = excluded.operacao,
        mes = excluded.mes,
        ano = excluded.ano,
        valor_msim = excluded.valor_msim,
        fonte = excluded.fonte,
        updated_at = CURRENT_TIMESTAMP`,
      [
        row.unidade,
        row.operacao,
        row.funcao,
        row.competencia,
        row.mes,
        row.ano,
        row.valor_msim,
        row.fonte
      ]
    );
    imported += 1;
  }
  return imported;
}

async function importWorkbook({ filePath } = {}) {
  await assertTables();
  const rows = readMsimRows(filePath || DEFAULT_FILE);
  const imported = await upsertMsimRows(rows);
  return {
    totalRows: rows.length,
    imported,
    unidade: TARGET_UNIT,
    operacao: TARGET_OPERATION
  };
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const report = await importWorkbook({ filePath: inputPath });
  console.log('Importacao MSIM concluida.');
  console.log(`Arquivo: ${inputPath}`);
  console.log(`Unidade: ${report.unidade}`);
  console.log(`Operacao: ${report.operacao}`);
  console.log(`Registros MSIM importados: ${report.imported}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao MSIM: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  normalizeMsimValue,
  readMsimRows
};
