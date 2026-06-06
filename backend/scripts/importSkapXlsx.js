require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/base skap.xlsx');
const SHEET_NAME = 'Export';

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeName(value) {
  return stripAccents(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeRow(row) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    if (normalized[normalizedKey] === undefined || normalized[normalizedKey] === '') {
      normalized[normalizedKey] = value;
      return;
    }
    normalized[`${normalizedKey}_1`] = value;
  });
  return normalized;
}

function trim(value) {
  return String(value ?? '').trim();
}

function cell(row, key) {
  return row[normalizeKey(key)];
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number((value > 0 && value <= 1 ? value * 100 : value).toFixed(2));

  let text = trim(value).replace(/\s/g, '').replace('%', '');
  if (!text) return 0;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }

  const number = Number(text);
  if (!Number.isFinite(number)) return 0;
  return Number((number > 0 && number <= 1 ? number * 100 : number).toFixed(2));
}

function calculateLevel(proficiencia) {
  const value = Number(proficiencia) || 0;
  if (value < 75) {
    return {
      nivel_skap: 'Bronze',
      proximo_nivel: 'Prata',
      percentual_para_proximo_nivel: Number((75 - value).toFixed(2)),
      status_skap: 'Voce esta no nivel Bronze. Foque nos pontos indicados pela lideranca para alcancar o nivel Prata.'
    };
  }
  if (value < 90) {
    return {
      nivel_skap: 'Prata',
      proximo_nivel: 'Ouro',
      percentual_para_proximo_nivel: Number((90 - value).toFixed(2)),
      status_skap: 'Voce esta no nivel Prata. Continue trabalhando os pontos de desenvolvimento para alcancar o nivel Ouro.'
    };
  }
  return {
    nivel_skap: 'Ouro',
    proximo_nivel: null,
    percentual_para_proximo_nivel: 0,
    status_skap: 'Parabens! Voce alcancou o nivel Ouro no SKAP.'
  };
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
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
  await db.get('SELECT 1 FROM colaboradores LIMIT 1');
  await db.get('SELECT 1 FROM skap_avaliacoes LIMIT 1');
}

async function loadCollaborators() {
  const colaboradores = await db.all('SELECT id, matricula, nome_completo, cargo, setor, unidade, tipo_colaborador FROM colaboradores');
  const byName = new Map();
  colaboradores.forEach((colaborador) => {
    const name = normalizeName(colaborador.nome_completo);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(colaborador);
  });
  return byName;
}

function readRowsFromWorkbook(workbook) {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Aba ${SHEET_NAME} nao encontrada na planilha.`);
  return xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);
}

function buildPayload(row) {
  const proficiencia = parsePercent(cell(row, 'Proficiência'));
  const level = calculateLevel(proficiencia);
  const observacaoTecnica = trim(cell(row, 'Habilidade Técnica'));
  const observacaoEspecifica = trim(cell(row, 'Habilidade Específica'));
  const observacaoEmpoderamento = trim(row.habilidade_empoderamento_1 ?? '');
  const planoAcao = [observacaoTecnica, observacaoEspecifica, observacaoEmpoderamento].filter(Boolean).join('\n\n');

  return {
    ...level,
    progresso_percentual: proficiencia,
    proficiencia,
    proficiencia_percentual: proficiencia,
    atingimento_habilidade_tecnica: parsePercent(cell(row, 'Atingimento Habilidade Técnica')),
    observacao_habilidade_tecnica: observacaoTecnica,
    habilidades_tecnicas_percentual: parsePercent(cell(row, 'Atingimento Habilidade Técnica')),
    atingimento_habilidade_especifica: parsePercent(cell(row, 'Atingimento Habilidade Especificas')),
    observacao_habilidade_especifica: observacaoEspecifica,
    habilidades_especificas_percentual: parsePercent(cell(row, 'Atingimento Habilidade Especificas')),
    atingimento_habilidade_empoderamento: parsePercent(row.habilidade_empoderamento),
    observacao_habilidade_empoderamento: observacaoEmpoderamento,
    habilidades_empoderamento_percentual: parsePercent(row.habilidade_empoderamento),
    plano_acao: planoAcao,
    data_avaliacao: new Date().toISOString().slice(0, 10)
  };
}

async function saveHistory({ colaboradorId, avaliacaoId, existing, payload, motivo }) {
  await db.run(
    `INSERT INTO skap_historico (
      colaborador_id, avaliacao_id, nivel_anterior, nivel_novo,
      progresso_anterior, progresso_novo, motivo, data_avaliacao
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colaboradorId,
      avaliacaoId,
      existing?.nivel_skap || null,
      payload.nivel_skap,
      existing?.proficiencia ?? existing?.progresso_percentual ?? null,
      payload.proficiencia,
      motivo,
      payload.data_avaliacao
    ]
  );
}

async function upsertSkap(colaborador, payload, report) {
  const existing = await db.get('SELECT * FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  const hadExisting = Boolean(existing);
  const values = [
    payload.nivel_skap,
    payload.nivel_skap,
    payload.progresso_percentual,
    payload.atingimento_habilidade_tecnica,
    payload.observacao_habilidade_tecnica,
    payload.atingimento_habilidade_especifica,
    payload.observacao_habilidade_especifica,
    payload.atingimento_habilidade_empoderamento,
    payload.observacao_habilidade_empoderamento,
    payload.proficiencia,
    payload.proximo_nivel,
    payload.percentual_para_proximo_nivel,
    payload.plano_acao,
    payload.status_skap,
    payload.proficiencia_percentual,
    payload.habilidades_tecnicas_percentual,
    payload.habilidades_especificas_percentual,
    payload.habilidades_empoderamento_percentual,
    colaborador.cargo,
    payload.data_avaliacao
  ];

  if (existing) {
    await db.run(
      `UPDATE skap_avaliacoes
       SET nivel_skap = ?, nivel_original = ?, progresso_percentual = ?,
           atingimento_habilidade_tecnica = ?, observacao_habilidade_tecnica = ?,
           atingimento_habilidade_especifica = ?, observacao_habilidade_especifica = ?,
           atingimento_habilidade_empoderamento = ?, observacao_habilidade_empoderamento = ?,
           proficiencia = ?, proximo_nivel = ?, percentual_para_proximo_nivel = ?,
           plano_acao = ?, status_skap = ?,
           proficiencia_percentual = ?, habilidades_tecnicas_percentual = ?,
           habilidades_especificas_percentual = ?, habilidades_empoderamento_percentual = ?,
           cargo = ?, data_avaliacao = ?, atualizado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE colaborador_id = ?`,
      [...values, colaborador.id]
    );
    report.updated += 1;
  } else {
    const result = await db.run(
      `INSERT INTO skap_avaliacoes (
        colaborador_id, nivel_skap, nivel_original, progresso_percentual,
        atingimento_habilidade_tecnica, observacao_habilidade_tecnica,
        atingimento_habilidade_especifica, observacao_habilidade_especifica,
        atingimento_habilidade_empoderamento, observacao_habilidade_empoderamento,
        proficiencia, proximo_nivel, percentual_para_proximo_nivel,
        plano_acao, status_skap,
        proficiencia_percentual, habilidades_tecnicas_percentual,
        habilidades_especificas_percentual, habilidades_empoderamento_percentual,
        cargo, data_avaliacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [colaborador.id, ...values]
    );
    report.created += 1;
  }

  const current = await db.get('SELECT id FROM skap_avaliacoes WHERE colaborador_id = ?', [colaborador.id]);
  const levelChanged = existing?.nivel_skap && existing.nivel_skap !== payload.nivel_skap;
  const proficiencyChanged = Number(existing?.proficiencia ?? existing?.progresso_percentual ?? -1) !== Number(payload.proficiencia);
  if (!hadExisting || levelChanged || proficiencyChanged) {
    await saveHistory({
      colaboradorId: colaborador.id,
      avaliacaoId: current.id,
      existing,
      payload,
      motivo: !hadExisting ? 'Primeira importacao SKAP' : 'Atualizacao de nivel/proficiencia via importacao SKAP'
    });
    report.history += 1;
  }

  report.levels[payload.nivel_skap.toLowerCase()] += 1;
}

async function importWorkbook({ filePath, buffer } = {}) {
  await assertTables();
  const workbook = buffer ? xlsx.read(buffer, { type: 'buffer' }) : xlsx.readFile(path.resolve(filePath || DEFAULT_FILE));
  const rows = readRowsFromWorkbook(workbook);
  const byName = await loadCollaborators();
  const report = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    ignored: 0,
    history: 0,
    notFound: [],
    conflicts: [],
    errors: [],
    levels: { bronze: 0, prata: 0, ouro: 0 }
  };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    const colaboradorNome = trim(cell(row, 'Colaborador'));
    if (!colaboradorNome) {
      report.ignored += 1;
      continue;
    }

    const matches = byName.get(normalizeName(colaboradorNome)) || [];
    if (!matches.length) {
      report.ignored += 1;
      report.notFound.push({ linha: lineNumber, colaborador: colaboradorNome });
      continue;
    }
    if (matches.length > 1) {
      report.ignored += 1;
      report.conflicts.push({ linha: lineNumber, colaborador: colaboradorNome, encontrados: matches.map((item) => item.matricula) });
      continue;
    }

    try {
      await upsertSkap(matches[0], buildPayload(row), report);
    } catch (error) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, colaborador: colaboradorNome, error: error.message });
    }
  }

  return report;
}

async function main() {
  const logger = createLogger();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const report = await importWorkbook({ filePath: inputPath });

  logger.log('Importacao SKAP concluida.');
  logger.log(`Arquivo: ${inputPath}`);
  logger.log(`Total de linhas lidas: ${report.totalRows}`);
  logger.log(`Importados: ${report.created}`);
  logger.log(`Atualizados: ${report.updated}`);
  logger.log(`Ignorados: ${report.ignored}`);
  logger.log(`Nao encontrados: ${report.notFound.length}`);
  logger.log(`Conflitos: ${report.conflicts.length}`);
  logger.log(`Historicos criados: ${report.history}`);
  logger.log(`Total Bronze: ${report.levels.bronze}`);
  logger.log(`Total Prata: ${report.levels.prata}`);
  logger.log(`Total Ouro: ${report.levels.ouro}`);
  if (report.notFound.length) logger.json('Nao encontrados', report.notFound);
  if (report.conflicts.length) logger.json('Conflitos', report.conflicts);
  if (report.errors.length) logger.json('Erros', report.errors);
  logger.save();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao SKAP: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  calculateLevel,
  importWorkbook,
  normalizeName,
  parsePercent
};
