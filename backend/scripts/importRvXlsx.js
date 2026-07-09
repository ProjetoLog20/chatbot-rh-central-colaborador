require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/rv_log20_importacao_pronta.xlsx');
const SHEET_NAME = 'IMPORTACAO_RV';
const LOW_CONFIDENCE_LIMIT = 0.7;
const MOTORISTA_CAIXA_FATOR_1_RATE = 0.12;
const MOTORISTA_CAIXA_FATOR_2_RATE = 0.08;
const AJUDANTE_CAIXA_FATOR_1_RATE = 0.08;
const AJUDANTE_CAIXA_FATOR_2_RATE = 0.04;
const requiredColumns = [
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'matricula',
  'nome_completo',
  'cpf',
  'codigo_rv',
  'nome_rv',
  'funcao_rv'
];

const productivityColumns = [
  'importacao_id',
  'colaborador_id',
  'competencia',
  'periodo_inicio',
  'periodo_fim',
  'matricula',
  'nome_completo',
  'cpf',
  'codigo_rv',
  'nome_rv',
  'funcao_rv',
  'cargo',
  'setor',
  'tipo_colaborador',
  'perfil',
  'caixas',
  'entregas',
  'percentual_devolucao',
  'meta_devolucao',
  'bateu_devolucao',
  'recargas',
  'mapas',
  'ftr2_c_jorn',
  'ftr2_s_jorn',
  'ftr1_c_jorn',
  'ftr1_s_jorn',
  'ftr0_c_jorn',
  'ftr0_s_jorn',
  'valor_recarga',
  'bonus',
  'antiga_rv',
  'nova_rv',
  'rv_antiga',
  'rv_nova',
  'diferenca_rv',
  'valor_total_previsto',
  'extra',
  'status_produtividade',
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

function normalizeName(value) {
  return stripAccents(value).toLowerCase().trim().replace(/\s+/g, ' ');
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

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = parseNumber(cell(row, key));
    if (value) return value;
  }
  return 0;
}

function firstNumberAlias(row, ...keys) {
  return firstNumber(row, keys);
}

function firstText(row, keys) {
  for (const key of keys) {
    const value = trim(cell(row, key));
    if (value) return value;
  }
  return '';
}

function parsePercent(value) {
  const number = parseNumber(value);
  const raw = trim(value);
  if (!raw.includes('%') && number > 0 && number < 1) return Number((number * 100).toFixed(4));
  return number;
}

function normalizeBonusDevolucao(value, bateuDevolucao = false) {
  if (bateuDevolucao) return 200;
  const bonus = parseNumber(value);
  return bonus === 90 ? 200 : bonus;
}

function calculateCaixasAmount(row, funcaoRv, indexes, caixas) {
  const factor1Rate = funcaoRv === 'motorista' ? MOTORISTA_CAIXA_FATOR_1_RATE : AJUDANTE_CAIXA_FATOR_1_RATE;
  const factor2Rate = funcaoRv === 'motorista' ? MOTORISTA_CAIXA_FATOR_2_RATE : AJUDANTE_CAIXA_FATOR_2_RATE;

  const ftr2Boxes = [indexes.ftr2CJorn, indexes.ftr2SJorn]
    .reduce((sum, index) => sum + (index === -1 ? 0 : parseNumber(rowValue(row, index))), 0);
  const ftr1Boxes = [indexes.ftr1CJorn, indexes.ftr1SJorn]
    .reduce((sum, index) => sum + (index === -1 ? 0 : parseNumber(rowValue(row, index))), 0);

  if (ftr1Boxes || ftr2Boxes) {
    return (ftr1Boxes * factor1Rate) + (ftr2Boxes * factor2Rate);
  }

  const hasFatorColumns = [
    indexes.ftr2CJorn,
    indexes.ftr2SJorn,
    indexes.ftr1CJorn,
    indexes.ftr1SJorn
  ].some((index) => index !== -1);
  const fallbackRate = hasFatorColumns ? factor1Rate : factor2Rate;
  return caixas * fallbackRate;
}

function fallbackPremioRota(row, funcaoRv, indexes, bonus) {
  const premio = parseNumber(rowValue(row, indexes.premio));
  if (premio > 0) return premio;

  const caixas = parseNumber(rowValue(row, indexes.caixas));
  const entregas = parseNumber(rowValue(row, indexes.entregas));
  const recargas = parseNumber(rowValue(row, indexes.recargas));
  const mapas = parseNumber(rowValue(row, indexes.mapas));
  const hasActivity = [caixas, entregas, recargas, mapas].some((value) => value > 0);
  if (!hasActivity) return 0;

  const entregaRate = funcaoRv === 'motorista' ? 1 : 0.7;
  const recargaRate = funcaoRv === 'motorista' ? 200 : 140;
  const caixasAmount = calculateCaixasAmount(row, funcaoRv, indexes, caixas);

  const recargaAmount = indexes.recargaValor === -1
    ? recargas * recargaRate
    : parseNumber(rowValue(row, indexes.recargaValor)) || recargas * recargaRate;
  const base = caixasAmount + entregas * entregaRate + recargaAmount;
  return Number((base + bonus).toFixed(4));
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
  const endDate = new Date(Date.UTC(year, month - 1, 20));
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 21));
  const format = (date) => [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');

  return {
    inicio: format(startDate),
    fim: format(endDate)
  };
}

function validateOfficialPeriod(row) {
  const competencia = trim(cell(row, 'competencia'));
  const periodoInicio = parseDate(cell(row, 'periodo_inicio'));
  const periodoFim = parseDate(cell(row, 'periodo_fim'));
  const esperado = officialPeriodForCompetencia(competencia);

  return {
    valid: Boolean(esperado.inicio && esperado.fim && periodoInicio === esperado.inicio && periodoFim === esperado.fim),
    competencia,
    periodoInicio,
    periodoFim,
    esperado
  };
}

function normalizeCompetencia(value) {
  const text = trim(value);
  const monthOnly = text.match(/^(\d{1,2})$/);
  if (monthOnly) {
    return `${monthOnly[1].padStart(2, '0')}/${new Date().getFullYear()}`;
  }
  const monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) return `${monthYear[1].padStart(2, '0')}/${monthYear[2]}`;
  return text;
}

function competenciaFromReferenceMonth(value) {
  const month = Number(trim(value));
  if (!Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${String(month).padStart(2, '0')}/${new Date().getFullYear()}`;
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = stripAccents(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'ok', 'bateu', 'dentro_da_meta', 'dentro da meta'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n', 'nao_bateu', 'fora_da_meta', 'fora da meta'].includes(normalized)) return false;
  return false;
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
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

function getSheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  return xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(normalizeRow);
}

function workbookSheetNames(source, isBuffer) {
  const workbook = isBuffer
    ? xlsx.read(source, { type: 'buffer', bookSheets: true })
    : xlsx.readFile(source, { bookSheets: true });
  return workbook.SheetNames || [];
}

function readWorkbookSubset(source, isBuffer, sheetIndexes) {
  return isBuffer
    ? xlsx.read(source, { type: 'buffer', sheets: sheetIndexes, cellFormula: false })
    : xlsx.readFile(source, { sheets: sheetIndexes, cellFormula: false });
}

function findSheetIndex(sheetNames, matcher) {
  return sheetNames.findIndex((name) => matcher(normalizeKey(name)));
}

function rowValue(row, index) {
  return row?.[index] ?? '';
}

function buildCodeNameMap(onePagerRows) {
  const map = new Map();

  const headerRowIndex = (onePagerRows || []).findIndex((row) => {
    const headers = row.map(normalizeKey);
    return headers.includes('cod') && headers.includes('motorista');
  });

  if (headerRowIndex !== -1) {
    const headers = onePagerRows[headerRowIndex].map(normalizeKey);
    const codeIndex = headers.indexOf('cod');
    const nameIndex = headers.indexOf('motorista');
    for (const row of onePagerRows.slice(headerRowIndex + 1)) {
      const code = trim(rowValue(row, codeIndex));
      const name = trim(rowValue(row, nameIndex));
      if (code && name && /^\d+$/.test(code)) map.set(code, name);
    }
  }

  for (const row of onePagerRows || []) {
    [
      [15, 16],
      [18, 19]
    ].forEach(([codeIndex, nameIndex]) => {
      const code = trim(rowValue(row, codeIndex));
      const name = trim(rowValue(row, nameIndex));
      if (code && name && /^\d+$/.test(code)) map.set(code, name);
    });
  }
  return map;
}

function findCompetencia(...tables) {
  for (const rows of tables) {
    for (const row of (rows || []).slice(0, 5)) {
      const labelIndex = row.findIndex((value) => ['mes', 'periodo_de_pagamento'].includes(normalizeKey(value)));
      if (labelIndex === -1) continue;

      const nearbyValues = row.slice(labelIndex + 1, labelIndex + 5);
      const month = nearbyValues.find((value) => /^\d{1,2}$/.test(trim(value)));
      if (month) return competenciaFromReferenceMonth(month);
    }
  }
  return '';
}

function tableRowsToImportRows(rows, { funcaoRv, codeNameMap, competencia }) {
  const headerIndex = rows.findIndex((row) => row.some((value) => ['Motorista', 'Ajudante'].includes(trim(value))));
  if (headerIndex === -1) return [];

  const headers = rows[headerIndex].map(normalizeKey);
  const indexOf = (...names) => {
    const normalized = names.map(normalizeKey);
    return headers.findIndex((header) => normalized.includes(header));
  };

  const codeIndex = funcaoRv === 'motorista' ? indexOf('Motorista') : indexOf('Ajudante');
  const caixasIndex = indexOf('Caixas');
  const entregasIndex = indexOf('Entregas');
  const devolucaoIndex = indexOf('% DEV');
  const recargasIndex = indexOf('Recargas', 'Rec DOL', 'REC DOL', 'Recarga DOL');
  const mapasIndex = indexOf('Mapas');
  const ftr2CJornIndex = indexOf('Ftr 2 C/Jorn.');
  const ftr2SJornIndex = indexOf('Ftr 2 S/Jorn.');
  const ftr1CJornIndex = indexOf('Ftr 1 C/Jorn.');
  const ftr1SJornIndex = indexOf('Ftr 1 S/Jorn.');
  const ftr0CJornIndex = indexOf('Ftr 0 C/Jorn.');
  const ftr0SJornIndex = indexOf('Ftr 0 S/Jorn.');
  const recargaValorIndex = indexOf('Rec');
  const bonusIndex = indexOf('BNS');
  const antigaIndex = indexOf('Antiga RV');
  const premioIndex = indexOf('Nova RV');
  const extraIndex = indexOf('Extra');

  return rows.slice(headerIndex + 1)
    .map((row) => {
      const codigoRv = trim(rowValue(row, codeIndex));
      const premioInformado = parseNumber(rowValue(row, premioIndex));
      const caixas = parseNumber(rowValue(row, caixasIndex));
      const entregas = parseNumber(rowValue(row, entregasIndex));
      const recargas = parseNumber(rowValue(row, recargasIndex));
      const mapas = parseNumber(rowValue(row, mapasIndex));
      const hasActivity = [caixas, entregas, recargas, mapas].some((value) => value > 0);
      if (!codigoRv || !/^\d+$/.test(codigoRv) || (!premioInformado && !hasActivity)) return null;
      const rvAntiga = parseNumber(rowValue(row, antigaIndex));
      const nomeRv = codeNameMap.get(codigoRv) || '';
      const normalizedCompetencia = normalizeCompetencia(competencia);
      const period = officialPeriodForCompetencia(normalizedCompetencia);
      const bateuDevolucao = parsePercent(rowValue(row, devolucaoIndex)) <= 3.5;
      const bonus = normalizeBonusDevolucao(rowValue(row, bonusIndex), bateuDevolucao);
      const premio = fallbackPremioRota(row, funcaoRv, {
        premio: premioIndex,
        caixas: caixasIndex,
        entregas: entregasIndex,
        recargas: recargasIndex,
        mapas: mapasIndex,
        ftr2CJorn: ftr2CJornIndex,
        ftr2SJorn: ftr2SJornIndex,
        ftr1CJorn: ftr1CJornIndex,
        ftr1SJorn: ftr1SJornIndex,
        ftr0CJorn: ftr0CJornIndex,
        ftr0SJorn: ftr0SJornIndex,
        recargaValor: recargaValorIndex
      }, bonus);
      return normalizeRow({
        competencia: normalizedCompetencia,
        periodo_inicio: period.inicio,
        periodo_fim: period.fim,
        matricula: '',
        nome_completo: '',
        cpf: '',
        codigo_rv: codigoRv,
        nome_rv: nomeRv,
        funcao_rv: funcaoRv,
        caixas: rowValue(row, caixasIndex),
        entregas: rowValue(row, entregasIndex),
        percentual_devolucao: rowValue(row, devolucaoIndex),
        meta_devolucao: '3.5%',
        bateu_devolucao: bateuDevolucao ? 'sim' : 'nao',
        recargas: rowValue(row, recargasIndex),
        mapas: rowValue(row, mapasIndex),
        ftr2_c_jorn: rowValue(row, ftr2CJornIndex),
        ftr2_s_jorn: rowValue(row, ftr2SJornIndex),
        ftr1_c_jorn: rowValue(row, ftr1CJornIndex),
        ftr1_s_jorn: rowValue(row, ftr1SJornIndex),
        ftr0_c_jorn: rowValue(row, ftr0CJornIndex),
        ftr0_s_jorn: rowValue(row, ftr0SJornIndex),
        valor_recarga: rowValue(row, recargaValorIndex),
        bonus,
        premio_produtividade: premio,
        rv_antiga: rvAntiga,
        rv_nova: premio,
        diferenca_rv: Math.max(0, Number((premio - rvAntiga).toFixed(2))),
        extra: rowValue(row, extraIndex),
        status_produtividade: premio > 0 ? 'Elegivel' : 'Sem premio',
        metodo_cruzamento: 'codigo_rv_planilha',
        confianca_cruzamento: 1,
        observacao_cruzamento: 'Importado da planilha oficial de Premio de Produtividade Rota.',
        mensagem_rh: 'Valor calculado conforme planilha oficial do Premio de Produtividade.'
      });
    })
    .filter(Boolean);
}

function readOfficialWorkbookRows(source, isBuffer) {
  const sheetNames = workbookSheetNames(source, isBuffer);
  const onePagerIndex = findSheetIndex(sheetNames, (name) => name === 'one_pager');
  const motoristaIndex = findSheetIndex(sheetNames, (name) => name.includes('tabelao_mot'));
  const ajudanteIndex = findSheetIndex(sheetNames, (name) => name.includes('tabelao_ajd'));
  if (onePagerIndex === -1 || (motoristaIndex === -1 && ajudanteIndex === -1)) return null;

  const sheetIndexes = [onePagerIndex, motoristaIndex, ajudanteIndex].filter((index) => index !== -1);
  const workbook = readWorkbookSubset(source, isBuffer, sheetIndexes);
  const onePagerName = sheetNames[onePagerIndex];
  const onePagerRows = xlsx.utils.sheet_to_json(workbook.Sheets[onePagerName], { header: 1, defval: '', raw: false });
  const motoristaRows = motoristaIndex === -1
    ? []
    : xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[motoristaIndex]], { header: 1, defval: '', raw: true });
  const ajudanteRows = ajudanteIndex === -1
    ? []
    : xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[ajudanteIndex]], { header: 1, defval: '', raw: true });
  const codeNameMap = buildCodeNameMap(onePagerRows);
  const competencia = findCompetencia(motoristaRows, ajudanteRows);

  return [
    ...(motoristaRows.length ? tableRowsToImportRows(motoristaRows, { funcaoRv: 'motorista', codeNameMap, competencia }) : []),
    ...(ajudanteRows.length ? tableRowsToImportRows(ajudanteRows, { funcaoRv: 'ajudante', codeNameMap, competencia }) : [])
  ];
}

async function assertTables() {
  await db.get('SELECT 1 FROM colaboradores LIMIT 1');
  await db.get('SELECT 1 FROM produtividade_importacoes LIMIT 1');
  await db.get('SELECT 1 FROM produtividade_colaboradores LIMIT 1');
}

function readRowsFromWorkbook(workbook) {
  const rows = getSheetRows(workbook, SHEET_NAME);
  if (!rows) throw new Error(`Aba ${SHEET_NAME} nao encontrada na planilha.`);
  const headers = new Set(Object.keys(rows[0] || {}));
  const missing = requiredColumns.filter((column) => !headers.has(column));
  if (missing.length) {
    throw new Error(`Colunas obrigatorias ausentes na aba ${SHEET_NAME}: ${missing.join(', ')}`);
  }
  if (!['premio_produtividade', 'valor_total_previsto', 'rv_nova', 'nova_rv'].some((column) => headers.has(column))) {
    throw new Error(`Coluna obrigatoria ausente na aba ${SHEET_NAME}: premio_produtividade`);
  }
  return rows;
}

async function loadRvCodeMap() {
  const rows = await db.all(
    `SELECT p.codigo_rv, p.nome_rv, c.id, c.matricula, c.nome_completo, c.cpf
     FROM produtividade_colaboradores p
     JOIN colaboradores c ON c.id = p.colaborador_id
     WHERE COALESCE(p.codigo_rv, '') <> ''`
  );
  const map = new Map();
  rows.forEach((row) => {
    const code = trim(row.codigo_rv);
    if (!code || map.has(code)) return;
    map.set(code, row);
  });
  return map;
}

async function loadNameMap() {
  const colaboradores = await db.all('SELECT id, matricula, nome_completo, cpf FROM colaboradores');
  const map = new Map();
  colaboradores.forEach((colaborador) => {
    const name = normalizeName(colaborador.nome_completo);
    if (!name) return;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(colaborador);
  });
  return map;
}

function buildPayload(row, colaborador, importacaoId) {
  const confianca = parseNumber(cell(row, 'confianca_cruzamento'));
  const statusAuditoria = confianca > 0 && confianca < LOW_CONFIDENCE_LIMIT ? 'revisar_cruzamento' : 'ok';
  const bateuDevolucao = parseBoolean(cell(row, 'bateu_devolucao'));
  const bonus = normalizeBonusDevolucao(cell(row, 'bonus'), bateuDevolucao);
  const premioInformado = firstNumber(row, ['premio_produtividade', 'valor_total_previsto', 'rv_nova', 'nova_rv']);
  const premioProdutividade = premioInformado || bonus;

  return {
    importacao_id: importacaoId,
    colaborador_id: colaborador.id,
    competencia: trim(cell(row, 'competencia')),
    periodo_inicio: parseDate(cell(row, 'periodo_inicio')),
    periodo_fim: parseDate(cell(row, 'periodo_fim')),
    matricula: trim(cell(row, 'matricula')) || colaborador.matricula,
    nome_completo: trim(cell(row, 'nome_completo')) || colaborador.nome_completo,
    cpf: trim(cell(row, 'cpf')) || colaborador.cpf,
    codigo_rv: trim(cell(row, 'codigo_rv')),
    nome_rv: trim(cell(row, 'nome_rv')),
    funcao_rv: trim(cell(row, 'funcao_rv')),
    cargo: trim(cell(row, 'cargo')),
    setor: trim(cell(row, 'setor')),
    tipo_colaborador: trim(cell(row, 'tipo_colaborador')),
    perfil: trim(cell(row, 'perfil')),
    caixas: parseNumber(cell(row, 'caixas')),
    entregas: parseNumber(cell(row, 'entregas')),
    percentual_devolucao: parsePercent(cell(row, 'percentual_devolucao')),
    meta_devolucao: parsePercent(cell(row, 'meta_devolucao')),
    bateu_devolucao: bateuDevolucao,
    recargas: parseNumber(cell(row, 'recargas')),
    mapas: parseNumber(cell(row, 'mapas')),
    ftr2_c_jorn: firstNumberAlias(row, 'ftr2_c_jorn', 'ftr_2_c_jorn', 'Ftr 2 C/Jorn.'),
    ftr2_s_jorn: firstNumberAlias(row, 'ftr2_s_jorn', 'ftr_2_s_jorn', 'Ftr 2 S/Jorn.'),
    ftr1_c_jorn: firstNumberAlias(row, 'ftr1_c_jorn', 'ftr_1_c_jorn', 'Ftr 1 C/Jorn.'),
    ftr1_s_jorn: firstNumberAlias(row, 'ftr1_s_jorn', 'ftr_1_s_jorn', 'Ftr 1 S/Jorn.'),
    ftr0_c_jorn: firstNumberAlias(row, 'ftr0_c_jorn', 'ftr_0_c_jorn', 'Ftr 0 C/Jorn.'),
    ftr0_s_jorn: firstNumberAlias(row, 'ftr0_s_jorn', 'ftr_0_s_jorn', 'Ftr 0 S/Jorn.'),
    valor_recarga: parseNumber(cell(row, 'valor_recarga')),
    bonus,
    antiga_rv: 0,
    nova_rv: premioProdutividade,
    rv_antiga: 0,
    rv_nova: premioProdutividade,
    diferenca_rv: 0,
    valor_total_previsto: premioProdutividade,
    extra: parseNumber(cell(row, 'extra')),
    status_produtividade: trim(cell(row, 'status_produtividade')),
    status_auditoria: statusAuditoria,
    metodo_cruzamento: trim(cell(row, 'metodo_cruzamento')),
    confianca_cruzamento: confianca || null,
    observacao_cruzamento: trim(cell(row, 'observacao_cruzamento')),
    mensagem_rh: trim(cell(row, 'mensagem_rh')),
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
         valor_total_rv_antiga = ?,
         valor_total_rv_nova = ?,
         valor_total_diferenca = ?,
         detalhes_json = ?
     WHERE id = ?`,
    [
      report.created,
      report.updated,
      report.ignored,
      report.errors.length,
      report.totalPremioProdutividade,
      0,
      report.totalPremioProdutividade,
      0,
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

async function upsertProductivity(payload) {
  const existing = await db.get(
    `SELECT id
     FROM produtividade_colaboradores
     WHERE colaborador_id = ? AND competencia = ? AND funcao_rv = ?`,
    [payload.colaborador_id, payload.competencia, payload.funcao_rv]
  );

  if (existing) {
    const assignments = productivityColumns
      .filter((column) => !['colaborador_id'].includes(column))
      .map((column) => `${column} = ?`)
      .concat(['updated_at = CURRENT_TIMESTAMP']);
    const values = productivityColumns
      .filter((column) => !['colaborador_id'].includes(column))
      .map((column) => payload[column]);

    await db.run(
      `UPDATE produtividade_colaboradores SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, existing.id]
    );
    return 'updated';
  }

  await db.run(
    `INSERT INTO produtividade_colaboradores (${productivityColumns.join(', ')})
     VALUES (${productivityColumns.map(() => '?').join(', ')})`,
    productivityColumns.map((column) => payload[column])
  );
  return 'created';
}

async function importRows(rows, { arquivo, criadoPor = null } = {}) {
  const importacaoId = await createImportRecord({ arquivo, rows, criadoPor });
  const rvCodeMap = await loadRvCodeMap();
  const nameMap = await loadNameMap();
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
    totalPremioProdutividade: 0
  };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    let matricula = trim(cell(row, 'matricula'));
    const competencia = trim(cell(row, 'competencia'));
    const funcaoRv = trim(cell(row, 'funcao_rv'));
    const codigoRv = trim(cell(row, 'codigo_rv'));
    const nomeRv = firstText(row, ['nome_rv', 'nome_completo']);
    let colaborador = null;

    if (!matricula && codigoRv && rvCodeMap.has(codigoRv)) {
      colaborador = rvCodeMap.get(codigoRv);
      matricula = colaborador.matricula;
    }

    const periodCheck = validateOfficialPeriod(row);
    if (periodCheck.esperado.inicio && !periodCheck.valid) {
      report.periodAlerts.push({ linha: lineNumber, matricula, ...periodCheck });
    }

    if (!matricula) {
      const nameMatches = nameMap.get(normalizeName(nomeRv)) || [];
      if (nameMatches.length === 1) {
        colaborador = nameMatches[0];
        matricula = colaborador.matricula;
      } else {
        report.ignored += 1;
        report.semMatricula.push({ linha: lineNumber, codigo_rv: codigoRv, nome: nomeRv });
        continue;
      }
    }

    if (!competencia || !funcaoRv) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: 'Competencia ou funcao_rv vazia' });
      continue;
    }

    try {
      if (!colaborador) {
        colaborador = await db.get(
          'SELECT id, matricula, nome_completo, cpf FROM colaboradores WHERE matricula = ?',
          [matricula]
        );
      }

      if (!colaborador) {
        report.ignored += 1;
        report.notFound.push({ linha: lineNumber, matricula, nome: trim(cell(row, 'nome_completo')) });
        continue;
      }

      const payload = buildPayload(row, colaborador, importacaoId);
      const result = await upsertProductivity(payload);
      if (result === 'created') report.created += 1;
      if (result === 'updated') report.updated += 1;
      if (payload.status_auditoria === 'revisar_cruzamento') {
        report.lowConfidence.push({ linha: lineNumber, matricula, confianca: payload.confianca_cruzamento });
      }

      report.totalPremioProdutividade += payload.valor_total_previsto || 0;
    } catch (error) {
      report.ignored += 1;
      report.errors.push({ linha: lineNumber, matricula, error: error.message });
    }
  }

  report.totalPremioProdutividade = Number(report.totalPremioProdutividade.toFixed(2));
  await updateImportRecord(importacaoId, report);
  return report;
}

async function importWorkbook({ filePath, buffer, originalName, criadoPor } = {}) {
  await assertTables();
  const resolvedPath = filePath ? path.resolve(filePath) : DEFAULT_FILE;
  const source = buffer || resolvedPath;
  const isBuffer = Boolean(buffer);
  let rows = readOfficialWorkbookRows(source, isBuffer);
  if (!rows) {
    const workbook = buffer
      ? xlsx.read(buffer, { type: 'buffer' })
      : xlsx.readFile(resolvedPath);
    rows = readRowsFromWorkbook(workbook);
  }
  const arquivo = originalName || path.basename(resolvedPath);
  return importRows(rows, { arquivo, criadoPor });
}

async function main() {
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
  logger.log(`Valor total Premio de Produtividade: ${report.totalPremioProdutividade.toFixed(2)}`);
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
      console.error(`Falha na importacao RV: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  parseNumber,
  parsePercent,
  parseDate,
  parseBoolean,
  normalizeBonusDevolucao,
  officialPeriodForCompetencia,
  validateOfficialPeriod
};
