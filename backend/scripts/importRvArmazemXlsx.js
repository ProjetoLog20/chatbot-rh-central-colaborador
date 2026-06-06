require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/rv_armazem_importacao_pronta.xlsx');
const SHEET_NAME = 'IMPORTACAO_ARMAZEM';
const LOW_CONFIDENCE_LIMIT = 0.7;

const requiredColumns = [
  'competencia',
  'matricula',
  'nome_completo',
  'funcao_armazem',
  'valor_total_previsto'
];

const armazemColumns = [
  'importacao_id',
  'colaborador_id',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'matricula',
  'nome_completo',
  'cpf',
  'funcao_armazem',
  'cargo',
  'setor',
  'tipo_colaborador',
  'perfil',
  'usuario_wms',
  'codigo_operacional',
  'pontos',
  'faixa',
  'rv_antiga',
  'rv_nova',
  'erros',
  'valor_total_previsto',
  'indicador_1',
  'indicador_2',
  'indicador_3',
  'status_produtividade',
  'origem_calculo',
  'status_auditoria',
  'metodo_cruzamento',
  'confianca_cruzamento',
  'observacao_cruzamento',
  'mensagem_rh',
  'dados_originais_json'
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

function trim(value) {
  return String(value ?? '').trim();
}

function cell(row, key) {
  return row[normalizeKey(key)];
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let text = trim(value)
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/%/g, '');

  if (!text) return 0;

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
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = trim(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+\d{1,2}:\d{2})?/);
  if (brDate) {
    const [, day, month, rawYear] = brDate;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const excelSerial = Number(text);
  if (Number.isFinite(excelSerial) && excelSerial > 0) {
    const parsed = xlsx.SSF.parse_date_code(excelSerial);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  return null;
}

function officialPeriodForCompetencia(competencia) {
  const match = String(competencia || '').trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return { inicio: null, fim: null };

  const month = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = month === 1 ? 12 : month - 1;
  const startYear = month === 1 ? year - 1 : year;

  return {
    inicio: `${startYear}-${String(startMonth).padStart(2, '0')}-21`,
    fim: `${year}-${String(month).padStart(2, '0')}-20`
  };
}

function resolvePeriod(row) {
  const competencia = trim(cell(row, 'competencia'));
  const official = officialPeriodForCompetencia(competencia);
  return {
    periodoInicio: parseDate(cell(row, 'periodo_inicio')) || official.inicio,
    periodoFim: parseDate(cell(row, 'periodo_fim')) || official.fim,
    official
  };
}

function validateOfficialPeriod(row) {
  const competencia = trim(cell(row, 'competencia'));
  const { periodoInicio, periodoFim, official } = resolvePeriod(row);
  return {
    valid: Boolean(official.inicio && official.fim && periodoInicio === official.inicio && periodoFim === official.fim),
    competencia,
    periodoInicio,
    periodoFim,
    esperado: official
  };
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function createLogger() {
  const logsDir = path.join(__dirname, '../logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `importacao_rv_armazem_${nowForFileName()}.txt`);
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
  await db.get('SELECT 1 FROM colaboradores LIMIT 1');
  await db.get('SELECT 1 FROM produtividade_armazem_importacoes LIMIT 1');
  await db.get('SELECT 1 FROM produtividade_armazem_colaboradores LIMIT 1');
}

function readRowsFromWorkbook(workbook) {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Aba ${SHEET_NAME} nao encontrada na planilha.`);

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);
  const headers = new Set(Object.keys(rows[0] || {}));
  const missing = requiredColumns.filter((column) => !headers.has(column));
  if (missing.length) {
    throw new Error(`Colunas obrigatorias ausentes na aba ${SHEET_NAME}: ${missing.join(', ')}`);
  }
  return rows;
}

function buildPayload(row, colaborador, importacaoId) {
  const { periodoInicio, periodoFim } = resolvePeriod(row);
  const confiancaText = trim(cell(row, 'confianca_cruzamento'));
  const confianca = confiancaText ? parseNumber(confiancaText) : null;
  const statusAuditoria = confianca !== null && confianca < LOW_CONFIDENCE_LIMIT ? 'revisar_cruzamento' : 'ok';

  return {
    importacao_id: importacaoId,
    colaborador_id: colaborador.id,
    competencia: trim(cell(row, 'competencia')),
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
    matricula: trim(cell(row, 'matricula')),
    nome_completo: trim(cell(row, 'nome_completo')) || colaborador.nome_completo,
    cpf: trim(cell(row, 'cpf')) || colaborador.cpf,
    funcao_armazem: trim(cell(row, 'funcao_armazem')),
    cargo: trim(cell(row, 'cargo')),
    setor: trim(cell(row, 'setor')),
    tipo_colaborador: trim(cell(row, 'tipo_colaborador')),
    perfil: trim(cell(row, 'perfil')),
    usuario_wms: trim(cell(row, 'usuario_wms')),
    codigo_operacional: trim(cell(row, 'codigo_operacional')),
    pontos: parseNumber(cell(row, 'pontos')),
    faixa: trim(cell(row, 'faixa')),
    rv_antiga: parseNumber(cell(row, 'rv_antiga')),
    rv_nova: parseNumber(cell(row, 'rv_nova')),
    erros: parseNumber(cell(row, 'erros')),
    valor_total_previsto: parseNumber(cell(row, 'valor_total_previsto')),
    indicador_1: trim(cell(row, 'indicador_1')),
    indicador_2: trim(cell(row, 'indicador_2')),
    indicador_3: trim(cell(row, 'indicador_3')),
    status_produtividade: trim(cell(row, 'status_produtividade')),
    origem_calculo: trim(cell(row, 'origem_calculo')),
    status_auditoria: statusAuditoria,
    metodo_cruzamento: trim(cell(row, 'metodo_cruzamento')),
    confianca_cruzamento: confianca,
    observacao_cruzamento: trim(cell(row, 'observacao_cruzamento')),
    mensagem_rh: trim(cell(row, 'mensagem_rh')),
    dados_originais_json: JSON.stringify(row)
  };
}

async function createImportRecord({ arquivo, rows, criadoPor }) {
  const first = rows[0] || {};
  const { periodoInicio, periodoFim } = resolvePeriod(first);
  const result = await db.run(
    `INSERT INTO produtividade_armazem_importacoes (
      arquivo, competencia, periodo_inicio, periodo_fim, total_linhas, criado_por, detalhes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      arquivo,
      trim(cell(first, 'competencia')),
      periodoInicio,
      periodoFim,
      rows.length,
      criadoPor || null,
      JSON.stringify({ status: 'em_processamento' })
    ]
  );
  return result.lastID;
}

async function updateImportRecord(importacaoId, report) {
  await db.run(
    `UPDATE produtividade_armazem_importacoes
     SET importados = ?,
         atualizados = ?,
         ignorados = ?,
         erros = ?,
         valor_total_previsto = ?,
         valor_total_rv_antiga = ?,
         valor_total_rv_nova = ?,
         detalhes_json = ?
     WHERE id = ?`,
    [
      report.created,
      report.updated,
      report.ignored,
      report.errors.length,
      report.totalValorPrevisto,
      report.totalRvAntiga,
      report.totalRvNova,
      JSON.stringify({
        erros: report.errors,
        sem_matricula: report.semMatricula,
        matriculas_nao_encontradas: report.notFound,
        baixa_confianca: report.lowConfidence,
        alertas_periodo: report.periodAlerts
      }),
      importacaoId
    ]
  );
}

async function upsertArmazem(payload) {
  const existing = await db.get(
    `SELECT id
     FROM produtividade_armazem_colaboradores
     WHERE colaborador_id = ? AND competencia = ? AND funcao_armazem = ?`,
    [payload.colaborador_id, payload.competencia, payload.funcao_armazem]
  );

  if (existing) {
    const updateColumns = armazemColumns.filter((column) => column !== 'colaborador_id');
    const assignments = updateColumns.map((column) => `${column} = ?`).concat(['updated_at = CURRENT_TIMESTAMP']);
    const values = updateColumns.map((column) => payload[column]);
    await db.run(
      `UPDATE produtividade_armazem_colaboradores SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, existing.id]
    );
    return 'updated';
  }

  await db.run(
    `INSERT INTO produtividade_armazem_colaboradores (${armazemColumns.join(', ')})
     VALUES (${armazemColumns.map(() => '?').join(', ')})`,
    armazemColumns.map((column) => payload[column])
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
    semMatricula: [],
    notFound: [],
    lowConfidence: [],
    periodAlerts: [],
    totalValorPrevisto: 0,
    totalRvAntiga: 0,
    totalRvNova: 0
  };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    const matricula = trim(cell(row, 'matricula'));
    const competencia = trim(cell(row, 'competencia'));
    const funcaoArmazem = trim(cell(row, 'funcao_armazem'));
    const periodCheck = validateOfficialPeriod(row);
    if (!periodCheck.valid) {
      report.periodAlerts.push({ linha: lineNumber, matricula, ...periodCheck });
    }

    if (!matricula) {
      report.ignored += 1;
      report.semMatricula.push({ linha: lineNumber, nome: trim(cell(row, 'nome_completo')) });
      continue;
    }

    if (!competencia || !funcaoArmazem) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: 'Competencia ou funcao_armazem vazia' });
      continue;
    }

    try {
      const colaborador = await db.get(
        'SELECT id, matricula, nome_completo, cpf FROM colaboradores WHERE matricula = ?',
        [matricula]
      );

      if (!colaborador) {
        report.ignored += 1;
        report.notFound.push({ linha: lineNumber, matricula, nome: trim(cell(row, 'nome_completo')) });
        continue;
      }

      const payload = buildPayload(row, colaborador, importacaoId);
      const result = await upsertArmazem(payload);
      if (result === 'created') report.created += 1;
      if (result === 'updated') report.updated += 1;
      if (payload.status_auditoria === 'revisar_cruzamento') {
        report.lowConfidence.push({ linha: lineNumber, matricula, confianca: payload.confianca_cruzamento });
      }

      report.totalValorPrevisto += payload.valor_total_previsto || 0;
      report.totalRvAntiga += payload.rv_antiga || 0;
      report.totalRvNova += payload.rv_nova || 0;
    } catch (error) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: error.message });
    }
  }

  report.totalValorPrevisto = Number(report.totalValorPrevisto.toFixed(2));
  report.totalRvAntiga = Number(report.totalRvAntiga.toFixed(2));
  report.totalRvNova = Number(report.totalRvNova.toFixed(2));
  await updateImportRecord(importacaoId, report);
  return report;
}

async function importWorkbook({ filePath, buffer, originalName, criadoPor } = {}) {
  await assertTables();
  const workbook = buffer
    ? xlsx.read(buffer, { type: 'buffer' })
    : xlsx.readFile(path.resolve(filePath || DEFAULT_FILE));
  const rows = readRowsFromWorkbook(workbook);
  const arquivo = originalName || path.basename(filePath || DEFAULT_FILE);
  return importRows(rows, { arquivo, criadoPor });
}

async function main() {
  const logger = createLogger();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const report = await importWorkbook({ filePath: inputPath });

  logger.log('Importacao RV Armazem concluida.');
  logger.log(`Arquivo: ${inputPath}`);
  logger.log(`Importacao ID: ${report.importacaoId}`);
  logger.log(`Total de linhas lidas: ${report.totalRows}`);
  logger.log(`Importados: ${report.created}`);
  logger.log(`Atualizados: ${report.updated}`);
  logger.log(`Ignorados: ${report.ignored}`);
  logger.log(`Erros: ${report.errors.length}`);
  logger.log(`Valor total previsto: ${report.totalValorPrevisto.toFixed(2)}`);
  logger.log(`Valor total RV antiga: ${report.totalRvAntiga.toFixed(2)}`);
  logger.log(`Valor total RV nova: ${report.totalRvNova.toFixed(2)}`);
  logger.log(`Registros com baixa confianca: ${report.lowConfidence.length}`);
  logger.log(`Registros sem matricula: ${report.semMatricula.length}`);
  logger.log(`Matriculas nao encontradas: ${report.notFound.length}`);
  logger.log(`Alertas de periodo 21 a 20: ${report.periodAlerts.length}`);

  if (report.periodAlerts.length) logger.json('Alertas de periodo', report.periodAlerts);
  if (report.lowConfidence.length) logger.json('Baixa confianca', report.lowConfidence);
  if (report.semMatricula.length) logger.json('Sem matricula', report.semMatricula);
  if (report.notFound.length) logger.json('Matriculas nao encontradas', report.notFound);
  if (report.errors.length) logger.json('Detalhes dos erros', report.errors);

  logger.save();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao RV Armazem: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  parseNumber,
  parseDate,
  officialPeriodForCompetencia,
  validateOfficialPeriod
};
