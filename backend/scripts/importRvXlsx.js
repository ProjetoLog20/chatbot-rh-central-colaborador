require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/rv_log20_importacao_pronta.xlsx');
const SHEET_NAME = 'IMPORTACAO_RV';

const columns = [
  'matricula',
  'nome_completo',
  'cpf',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'funcao_rv',
  'caixas',
  'entregas',
  'percentual_devolucao',
  'meta_devolucao',
  'bateu_devolucao',
  'recargas',
  'mapas',
  'bonus',
  'antiga_rv',
  'nova_rv',
  'diferenca_rv',
  'valor_total_previsto',
  'status_produtividade'
];

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function cell(row, key) {
  return row[normalizeKey(key)];
}

function firstCell(row, keys) {
  for (const key of keys) {
    const value = cell(row, key);
    if (value !== undefined && value !== null && trim(value) !== '') return value;
  }
  return '';
}

function trim(value) {
  return String(value ?? '').trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = trim(value)
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/%/g, '');

  if (!text) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    text = text.replace(',', '.');
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = trim(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const excelSerial = Number(text);
  if (Number.isFinite(excelSerial) && excelSerial > 0) {
    const parsed = xlsx.SSF.parse_date_code(excelSerial);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  return null;
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = stripAccents(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'ok', 'bateu', 'dentro_da_meta', 'dentro da meta'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n', 'nao_bateu', 'fora_da_meta', 'fora da meta'].includes(normalized)) return false;
  return null;
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function createLogger() {
  const logsDir = path.join(__dirname, '../logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const logPath = path.join(logsDir, `importacao_rv_${nowForFileName()}.txt`);
  const lines = [];

  return {
    log(message) {
      lines.push(message);
      console.log(message);
    },
    json(label, value) {
      const line = `${label}: ${JSON.stringify(value, null, 2)}`;
      lines.push(line);
      console.log(line);
    },
    save() {
      fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
      console.log(`Log salvo em: ${logPath}`);
      return logPath;
    }
  };
}

async function assertTables() {
  const rows = await db.all(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('produtividade_importacoes', 'produtividade_colaboradores')`
  );
  const found = new Set(rows.map((row) => row.table_name));

  if (!found.has('produtividade_importacoes') || !found.has('produtividade_colaboradores')) {
    throw new Error('Tabelas de produtividade nao encontradas. Rode: npm run migrate');
  }
}

function readRowsFromWorkbook(workbook) {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Aba ${SHEET_NAME} nao encontrada na planilha.`);
  }
  return xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);
}

function buildPayload(row, colaborador, importacaoId) {
  return {
    importacao_id: importacaoId,
    colaborador_id: colaborador.id,
    matricula: trim(cell(row, 'matricula')),
    nome_completo: trim(cell(row, 'nome_completo')) || colaborador.nome_completo,
    cpf: trim(cell(row, 'cpf')) || colaborador.cpf,
    competencia: trim(cell(row, 'competencia')),
    periodo_inicio: parseDate(cell(row, 'periodo_inicio')),
    periodo_fim: parseDate(cell(row, 'periodo_fim')),
    funcao_rv: trim(cell(row, 'funcao_rv')),
    caixas: parseNumber(cell(row, 'caixas')),
    entregas: parseNumber(cell(row, 'entregas')),
    percentual_devolucao: parseNumber(cell(row, 'percentual_devolucao')),
    meta_devolucao: parseNumber(cell(row, 'meta_devolucao')),
    bateu_devolucao: parseBoolean(cell(row, 'bateu_devolucao')),
    recargas: parseNumber(cell(row, 'recargas')),
    mapas: parseNumber(cell(row, 'mapas')),
    bonus: parseNumber(cell(row, 'bonus')),
    antiga_rv: parseNumber(firstCell(row, ['antiga_rv', 'rv_antiga'])),
    nova_rv: parseNumber(firstCell(row, ['nova_rv', 'rv_nova'])),
    diferenca_rv: parseNumber(cell(row, 'diferenca_rv')),
    valor_total_previsto: parseNumber(firstCell(row, ['valor_total_previsto', 'nova_rv', 'rv_nova'])),
    status_produtividade: trim(cell(row, 'status_produtividade')),
    dados_originais_json: JSON.stringify(row)
  };
}

async function createImportRecord({ arquivo, rows, criadoPor }) {
  const first = rows[0] || {};
  const result = await db.run(
    `INSERT INTO produtividade_importacoes (
      arquivo, competencia, periodo_inicio, periodo_fim, total_linhas, criado_por, detalhes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      arquivo,
      trim(cell(first, 'competencia')),
      parseDate(cell(first, 'periodo_inicio')),
      parseDate(cell(first, 'periodo_fim')),
      rows.length,
      criadoPor || null,
      JSON.stringify({ status: 'em_processamento' })
    ]
  );
  return result.lastID;
}

async function updateImportRecord(importacaoId, report) {
  await db.run(
    `UPDATE produtividade_importacoes
     SET importados = ?,
         atualizados = ?,
         ignorados = ?,
         erros = ?,
         valor_total_nova_rv = ?,
         detalhes_json = ?
     WHERE id = ?`,
    [
      report.created,
      report.updated,
      report.ignored,
      report.errors.length,
      report.totalNovaRv,
      JSON.stringify({
        total_antiga_rv: report.totalAntigaRv,
        diferenca_total: report.totalDiferenca,
        erros: report.errors
      }),
      importacaoId
    ]
  );
}

async function upsertProductivity(payload) {
  const existing = await db.get(
    `SELECT id
     FROM produtividade_colaboradores
     WHERE colaborador_id = ? AND competencia = ? AND funcao_rv = ?`,
    [payload.colaborador_id, payload.competencia, payload.funcao_rv]
  );

  const values = columns.map((column) => payload[column]);
  const commonValues = [
    payload.importacao_id,
    payload.colaborador_id,
    ...values,
    payload.dados_originais_json
  ];

  if (existing) {
    await db.run(
      `UPDATE produtividade_colaboradores
       SET importacao_id = ?,
           matricula = ?,
           nome_completo = ?,
           cpf = ?,
           competencia = ?,
           periodo_inicio = ?,
           periodo_fim = ?,
           funcao_rv = ?,
           caixas = ?,
           entregas = ?,
           percentual_devolucao = ?,
           meta_devolucao = ?,
           bateu_devolucao = ?,
           recargas = ?,
           mapas = ?,
           bonus = ?,
           antiga_rv = ?,
           nova_rv = ?,
           diferenca_rv = ?,
           valor_total_previsto = ?,
           status_produtividade = ?,
           dados_originais_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [payload.importacao_id, ...values, payload.dados_originais_json, existing.id]
    );
    return 'updated';
  }

  await db.run(
    `INSERT INTO produtividade_colaboradores (
      importacao_id, colaborador_id, matricula, nome_completo, cpf, competencia,
      periodo_inicio, periodo_fim, funcao_rv, caixas, entregas, percentual_devolucao,
      meta_devolucao, bateu_devolucao, recargas, mapas, bonus, antiga_rv, nova_rv,
      diferenca_rv, valor_total_previsto, status_produtividade, dados_originais_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    commonValues
  );
  return 'created';
}

async function importRows(rows, { arquivo, criadoPor = null } = {}) {
  const importacaoId = await createImportRecord({ arquivo, rows, criadoPor });
  const report = {
    importacaoId,
    totalRows: rows.length,
    created: 0,
    updated: 0,
    ignored: 0,
    errors: [],
    totalNovaRv: 0,
    totalAntigaRv: 0,
    totalDiferenca: 0
  };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    const matricula = trim(cell(row, 'matricula'));
    const competencia = trim(cell(row, 'competencia'));
    const funcaoRv = trim(cell(row, 'funcao_rv'));

    if (!matricula || !competencia || !funcaoRv) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: 'Matricula, competencia ou funcao_rv vazia' });
      continue;
    }

    try {
      const colaborador = await db.get(
        'SELECT id, matricula, nome_completo, cpf FROM colaboradores WHERE matricula = ?',
        [matricula]
      );

      if (!colaborador) {
        report.ignored += 1;
        report.errors.push({ linha: lineNumber, matricula, error: 'Matricula nao encontrada' });
        continue;
      }

      const payload = buildPayload(row, colaborador, importacaoId);
      const result = await upsertProductivity(payload);
      if (result === 'created') report.created += 1;
      if (result === 'updated') report.updated += 1;

      report.totalNovaRv += payload.nova_rv || 0;
      report.totalAntigaRv += payload.antiga_rv || 0;
      report.totalDiferenca += payload.diferenca_rv || 0;
    } catch (error) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: error.message });
    }
  }

  report.totalNovaRv = Number(report.totalNovaRv.toFixed(2));
  report.totalAntigaRv = Number(report.totalAntigaRv.toFixed(2));
  report.totalDiferenca = Number(report.totalDiferenca.toFixed(2));
  await updateImportRecord(importacaoId, report);
  return report;
}

async function importWorkbook({ filePath, buffer, originalName, criadoPor } = {}) {
  const workbook = buffer
    ? xlsx.read(buffer, { type: 'buffer' })
    : xlsx.readFile(path.resolve(filePath || DEFAULT_FILE));
  const rows = readRowsFromWorkbook(workbook);
  const arquivo = originalName || path.basename(filePath || DEFAULT_FILE);
  return importRows(rows, { arquivo, criadoPor });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Defina a variavel no backend/.env.');
  }

  await assertTables();

  const logger = createLogger();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const report = await importWorkbook({ filePath: inputPath });

  logger.log('Importacao RV concluida.');
  logger.log(`Arquivo: ${inputPath}`);
  logger.log(`Importacao ID: ${report.importacaoId}`);
  logger.log(`Total de linhas lidas: ${report.totalRows}`);
  logger.log(`Importados: ${report.created}`);
  logger.log(`Atualizados: ${report.updated}`);
  logger.log(`Ignorados: ${report.ignored}`);
  logger.log(`Erros: ${report.errors.length}`);
  logger.log(`Valor total nova RV: ${report.totalNovaRv.toFixed(2)}`);
  logger.log(`Valor total antiga RV: ${report.totalAntigaRv.toFixed(2)}`);
  logger.log(`Diferenca total: ${report.totalDiferenca.toFixed(2)}`);

  if (report.errors.length) {
    logger.json('Detalhes dos erros', report.errors);
  }

  logger.save();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao RV: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  parseNumber,
  parseDate,
  parseBoolean
};
