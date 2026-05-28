require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/skap_log20_importacao_pronta.xlsx');
const SHEET_NAME = 'IMPORTAR_SKAP';

const criteriaColumns = [
  'atendimento',
  'cinco_s',
  'retorno_rota',
  'seguranca',
  'evolucao_atendimento',
  'evolucao_cinco_s',
  'evolucao_retorno_rota',
  'evolucao_seguranca',
  'empoderamento',
  'longa_distancia',
  'campeao_seguranca',
  'autonomia'
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

function normalizeText(value) {
  return stripAccents(value).trim().toLowerCase();
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
  );
}

function cell(row, key) {
  return row[normalizeKey(key)];
}

function trim(value) {
  return String(value ?? '').trim();
}

function normalizeCriterion(value) {
  const normalized = normalizeText(value).replace(/\s+/g, '_');

  if (['concluido', 'ok', 'sim'].includes(normalized)) return 'concluido';
  if (['em_evolucao', 'evolucao'].includes(normalized)) return 'em_evolucao';
  if (['', 'pendente', 'nao', 'não'].includes(normalized)) return 'pendente';

  return 'pendente';
}

function criterionScore(value) {
  if (value === 'concluido') return 100;
  if (value === 'em_evolucao') return 50;
  return 0;
}

function normalizeLevel(value) {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');

  if (['bronze', 'inicial', 'atendimento basico'].includes(normalized)) return 'bronze';
  if (['prata', 'verde', 'evolucao', 'atendimento proativo'].includes(normalized)) return 'prata';
  if (['ouro', 'avancado', 'empoderamento'].includes(normalized)) return 'ouro';
  if (normalized.includes('atendimento basico')) return 'bronze';
  if (normalized.includes('atendimento proativo') || normalized.includes('evolucao')) return 'prata';
  if (normalized.includes('empoderamento') || normalized.includes('avancado')) return 'ouro';

  return normalized || 'bronze';
}

function parseNumber(value) {
  const text = trim(value).replace('%', '').replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = trim(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

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

function calculateProgress(row) {
  const filledCriteria = criteriaColumns
    .map((column) => ({ raw: cell(row, column), normalized: normalizeCriterion(cell(row, column)) }))
    .filter((item) => trim(item.raw) !== '');

  if (!filledCriteria.length) return 0;

  const total = filledCriteria.reduce((sum, item) => sum + criterionScore(item.normalized), 0);
  return Number((total / filledCriteria.length).toFixed(2));
}

function nowForFileName() {
  return new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', '_')
    .replace(':', '-');
}

function createLogger() {
  const logsDir = path.join(__dirname, '../logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const logPath = path.join(logsDir, `importacao_skap_${nowForFileName()}.txt`);
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
       AND table_name IN ('skap_avaliacoes', 'skap_historico')`
  );
  const found = new Set(rows.map((row) => row.table_name));

  if (!found.has('skap_avaliacoes') || !found.has('skap_historico')) {
    throw new Error('Tabelas SKAP nao encontradas. Rode: npm --prefix backend run migrate');
  }
}

async function importRow(row, lineNumber, report) {
  const matricula = trim(cell(row, 'matricula'));
  if (!matricula) {
    report.ignored += 1;
    report.errors.push({ linha: lineNumber, error: 'Matricula vazia' });
    return;
  }

  const colaborador = await db.get(
    'SELECT id, matricula, nome_completo FROM colaboradores WHERE matricula = ?',
    [matricula]
  );

  if (!colaborador) {
    report.ignored += 1;
    report.notFound.push(matricula);
    report.errors.push({ linha: lineNumber, matricula, error: 'Matricula nao encontrada' });
    return;
  }

  const nivelSkap = normalizeLevel(cell(row, 'nivel_skap') || cell(row, 'nivel_original'));
  const progress = calculateProgress(row);
  const existing = await db.get(
    'SELECT id, nivel_skap, progresso_percentual FROM skap_avaliacoes WHERE colaborador_id = ?',
    [colaborador.id]
  );

  const values = [
    colaborador.id,
    nivelSkap,
    trim(cell(row, 'nivel_original')),
    progress,
    parseNumber(cell(row, 'proficiencia_percentual')),
    parseNumber(cell(row, 'habilidades_tecnicas_percentual')),
    parseNumber(cell(row, 'habilidades_especificas_percentual')),
    parseNumber(cell(row, 'habilidades_empoderamento_percentual')),
    trim(cell(row, 'cargo')),
    trim(cell(row, 'atividade')),
    trim(cell(row, 'tempo_de_casa')),
    ...criteriaColumns.map((column) => normalizeCriterion(cell(row, column))),
    trim(cell(row, 'observacao_lideranca')),
    parseDate(cell(row, 'data_avaliacao'))
  ];

  if (existing) {
    await db.run(
      `UPDATE skap_avaliacoes
       SET nivel_skap = ?, nivel_original = ?, progresso_percentual = ?,
           proficiencia_percentual = ?, habilidades_tecnicas_percentual = ?,
           habilidades_especificas_percentual = ?, habilidades_empoderamento_percentual = ?,
           cargo = ?, atividade = ?, tempo_de_casa = ?,
           atendimento = ?, cinco_s = ?, retorno_rota = ?, seguranca = ?,
           evolucao_atendimento = ?, evolucao_cinco_s = ?, evolucao_retorno_rota = ?,
           evolucao_seguranca = ?, empoderamento = ?, longa_distancia = ?,
           campeao_seguranca = ?, autonomia = ?, observacao_lideranca = ?,
           data_avaliacao = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE colaborador_id = ?`,
      [...values.slice(1), colaborador.id]
    );
    report.updated += 1;
  } else {
    await db.run(
      `INSERT INTO skap_avaliacoes (
        colaborador_id, nivel_skap, nivel_original, progresso_percentual,
        proficiencia_percentual, habilidades_tecnicas_percentual,
        habilidades_especificas_percentual, habilidades_empoderamento_percentual,
        cargo, atividade, tempo_de_casa,
        atendimento, cinco_s, retorno_rota, seguranca,
        evolucao_atendimento, evolucao_cinco_s, evolucao_retorno_rota, evolucao_seguranca,
        empoderamento, longa_distancia, campeao_seguranca, autonomia,
        observacao_lideranca, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
    report.created += 1;
  }

  const previousLevel = existing?.nivel_skap ? normalizeLevel(existing.nivel_skap) : null;
  if (!existing || previousLevel !== nivelSkap) {
    const current = await db.get(
      'SELECT id FROM skap_avaliacoes WHERE colaborador_id = ?',
      [colaborador.id]
    );

    await db.run(
      `INSERT INTO skap_historico (
        colaborador_id, avaliacao_id, nivel_anterior, nivel_novo,
        progresso_anterior, progresso_novo, motivo, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colaborador.id,
        current.id,
        previousLevel,
        nivelSkap,
        existing?.progresso_percentual ?? null,
        progress,
        existing ? 'Alteracao de nivel via importacao SKAP' : 'Primeira importacao SKAP',
        parseDate(cell(row, 'data_avaliacao'))
      ]
    );
    report.history += 1;
  }

  if (['bronze', 'prata', 'ouro'].includes(nivelSkap)) {
    report.levels[nivelSkap] += 1;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Defina a variavel no backend/.env.');
  }

  await assertTables();

  const logger = createLogger();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const workbook = xlsx.readFile(inputPath);
  const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);

  const report = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    ignored: 0,
    history: 0,
    errors: [],
    notFound: [],
    levels: { bronze: 0, prata: 0, ouro: 0 }
  };

  for (const [index, row] of rows.entries()) {
    try {
      await importRow(row, index + 2, report);
    } catch (error) {
      report.ignored += 1;
      report.errors.push({
        linha: index + 2,
        matricula: trim(cell(row, 'matricula')),
        error: error.message
      });
    }
  }

  logger.log('Importacao SKAP concluida.');
  logger.log(`Arquivo: ${inputPath}`);
  logger.log(`Total de linhas lidas: ${report.totalRows}`);
  logger.log(`Importadas novas: ${report.created}`);
  logger.log(`Atualizadas: ${report.updated}`);
  logger.log(`Ignoradas: ${report.ignored}`);
  logger.log(`Historicos criados: ${report.history}`);
  logger.log(`Erros: ${report.errors.length}`);
  logger.log(`Matriculas nao encontradas: ${[...new Set(report.notFound)].join(', ') || 'nenhuma'}`);
  logger.log(`Niveis identificados: bronze=${report.levels.bronze}, prata=${report.levels.prata}, ouro=${report.levels.ouro}`);

  if (report.errors.length) {
    logger.json('Detalhes dos erros', report.errors);
  }

  logger.save();
}

main()
  .catch((error) => {
    console.error(`Falha na importacao SKAP: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
