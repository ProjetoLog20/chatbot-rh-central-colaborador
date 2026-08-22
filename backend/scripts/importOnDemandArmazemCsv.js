require('../src/config/env');

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const db = require('../src/db');
const DEFAULT_TASK_VALUES_FILE = path.join(__dirname, '../config/armazem-task-values.json');
const DEFAULT_OFFICIAL_RULES_FILE = path.join(__dirname, '../config/armazem-official-rules.json');
const WMS_DAILY_RV_RANGES = [
  { faixa: 'Faixa 1', min: 1, max: 12500, rate: 0.0014 },
  { faixa: 'Faixa 2', min: 12501, max: 16625, rate: 0.001862 },
  { faixa: 'Faixa 3', min: 16626, max: 20750, rate: 0.002324 },
  { faixa: 'Faixa 4', min: 20751, max: Number.POSITIVE_INFINITY, rate: 0.002786 }
];

const DEFAULT_WAREHOUSE_INDICATORS = {
  ajudante: [
    { nome: 'Eficiência de carregamento', valor: 50 },
    { nome: 'Ressuprimento', valor: 50 },
    { nome: 'TMA', valor: 100 }
  ],
  operador: [
    { nome: 'Eficiência de carregamento', valor: 50 },
    { nome: 'TMA', valor: 100 },
    { nome: 'Eficiência de descarga', valor: 50 }
  ],
  geral: [
    { nome: 'Eficiência de carregamento', valor: 50 },
    { nome: 'Ressuprimento', valor: 50 },
    { nome: 'TMA', valor: 100 },
    { nome: 'Eficiência de descarga', valor: 50 }
  ]
};

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

function parseArgs(argv) {
  const args = { dryRun: false, createMissing: false, activateModule: false, allowMissingValues: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') args.file = argv[++index];
    else if (arg === '--competencia') args.competencia = argv[++index];
    else if (arg === '--task-values') args.taskValues = argv[++index];
    else if (arg === '--operator-file') args.operatorFile = argv[++index];
    else if (arg === '--official-rules') args.officialRules = argv[++index];
    else if (arg === '--default-value') args.defaultValue = Number(argv[++index]);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--create-missing') args.createMissing = true;
    else if (arg === '--activate-module') args.activateModule = true;
    else if (arg === '--allow-missing-values') args.allowMissingValues = true;
    else if (!args.file) args.file = arg;
  }
  return args;
}

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeName(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeComparableName(value) {
  const ignoredWords = new Set(['da', 'das', 'de', 'do', 'dos']);
  return normalizeName(value)
    .split(' ')
    .filter((part) => part && !ignoredWords.has(part))
    .join(' ');
}

function trim(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(trim(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIndicatorReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const reviews = {};
  for (const [rawMatricula, rawItems] of Object.entries(value)) {
    const matricula = trim(rawMatricula);
    if (!matricula || !Array.isArray(rawItems)) continue;
    reviews[matricula] = rawItems.slice(0, 20).map((item) => ({
      nome: trim(item?.nome).slice(0, 120),
      valor: Number(Math.min(100000, Math.max(0, numberValue(item?.valor))).toFixed(2)),
      confirmado: item?.confirmado === true
    })).filter((item) => item.nome);
  }
  return reviews;
}

function normalizeAdditionalValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const additions = {};
  for (const [rawMatricula, rawItem] of Object.entries(value)) {
    const matricula = trim(rawMatricula);
    if (!matricula || !rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const valor = Number(Math.min(100000, Math.max(0, numberValue(rawItem.valor))).toFixed(2));
    const observacao = trim(rawItem.observacao).slice(0, 500);
    if (valor > 0 && !observacao) throw new Error(`Informe a observação do valor adicional da matrícula ${matricula}.`);
    additions[matricula] = { valor, observacao };
  }
  return additions;
}

function normalizeManualCorrections(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const corrections = {};
  for (const [rawMatricula, rawItem] of Object.entries(value)) {
    const matricula = trim(rawMatricula);
    if (!matricula || !rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const rawValue = rawItem.valor_final ?? rawItem.valor;
    if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
    const parsedValue = typeof rawValue === 'number'
      ? rawValue
      : Number(trim(rawValue).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      throw new Error(`Informe um valor final válido para a matrícula ${matricula}.`);
    }
    const valorFinal = Number(Math.min(100000, parsedValue).toFixed(2));
    const observacao = trim(rawItem.observacao).slice(0, 500);
    if (!observacao) throw new Error(`Informe o motivo da correção manual da matrícula ${matricula}.`);
    corrections[matricula] = { valorFinal, observacao };
  }
  return corrections;
}

function parseDate(value) {
  const text = trim(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function competenciaFromDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const competencyMonth = day > 20 ? month + 1 : month;
  const competencyYear = competencyMonth === 13 ? year + 1 : year;
  const finalMonth = competencyMonth === 13 ? 1 : competencyMonth;
  return `${String(finalMonth).padStart(2, '0')}/${competencyYear}`;
}

function normalizeCompetencia(value) {
  const text = trim(value);
  let match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, '0')}/${match[1]}` : null;
  }
  match = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? `${String(month).padStart(2, '0')}/${match[2]}` : null;
}

function monthYearFromCompetencia(competencia) {
  const normalized = normalizeCompetencia(competencia);
  const match = normalized?.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return trim(competencia);
  return `${match[2]}-${match[1].padStart(2, '0')}`;
}

function officialPeriodForCompetencia(competencia) {
  const normalized = normalizeCompetencia(competencia);
  const match = normalized?.match(/^(\d{2})\/(\d{4})$/);
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

function canonicalActivity(activity) {
  const text = normalizeName(activity);
  if (!text) return 'Demais Atividades';
  if (text.includes('ressuprimento') || text.includes('reabastecimento')) return 'Ressuprimento';
  if (text.includes('retrabalho')) return 'Retrabalho';
  if (text.includes('repack') || text.includes('reintegracao')) return 'Repack';
  if (text.includes('remonte')) return 'Remonte';
  if (text.includes('refugo') || text.includes('pnc')) return 'Refugo';
  if (text.includes('tarefa operacional') || text === 'tarefa op') return 'Tarefa Operacional';
  if (text.includes('fitilho')) return 'Colocar fitilho';
  if (text.includes('amarracao')) return 'Amarração';
  if (text.includes('descarregar') || text.includes('descarga') || text.includes('desamarrar')) return 'Descarga';
  if (text.includes('chop') || text.includes('chopp')) return 'Separar Chopp';
  if (text.includes('carregamento') && text.includes('van')) return 'Carregamento Van';
  return 'Demais Atividades';
}

function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function parseCsvBuffer(buffer) {
  return parse(decodeCsv(buffer), {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
    bom: true
  }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value])));
}

function readCsv(file) {
  return parseCsvBuffer(fs.readFileSync(file));
}

function requireCsvColumns(csvRows, requiredColumns, sourceName) {
  const available = new Set(Object.keys(csvRows[0] || {}));
  const missing = requiredColumns.filter((column) => !available.has(column));
  if (missing.length) {
    throw new Error(`O arquivo ${sourceName} não possui as colunas esperadas: ${missing.join(', ')}.`);
  }
}

function readTaskValues(file) {
  const source = file ? path.resolve(file) : DEFAULT_TASK_VALUES_FILE;
  const raw = JSON.parse(fs.readFileSync(source, 'utf8'));
  const entries = Array.isArray(raw)
    ? raw.map((item) => [item.task_name || item.atividade || item.name, item.value ?? item.valor])
    : Object.entries(raw);
  return Object.fromEntries(entries.map(([key, value]) => [normalizeName(canonicalActivity(key)), numberValue(value)]));
}

function readOfficialRules(file, competencia) {
  const source = file ? path.resolve(file) : DEFAULT_OFFICIAL_RULES_FILE;
  if (!fs.existsSync(source)) return { eligibleMatriculas: [], collaborators: {} };
  const raw = JSON.parse(fs.readFileSync(source, 'utf8'));
  const rules = raw[competencia] || {};
  return {
    eligibleMatriculas: (rules.eligible_matriculas || []).map(trim),
    collaborators: rules.collaborators || {}
  };
}

function canonicalOperatorActivity(value) {
  const text = normalizeName(value);
  if (text.includes('retorno de rota') && (text.includes('descarregamento') || text.includes('baixar palete'))) {
    return 'Descarregamento';
  }
  if (text === 'descarregamento') return 'Descarregamento';
  if (text.includes('carregamento ag')) return 'Carregamento AG - Novo';
  if (text.includes('palete misto')) return 'Carregamento Palete Misto Rota - Novo';
  if (text.includes('palete fechado')) return 'Carregamento Palete Fechado Rota - Novo';
  if (text.includes('movimentacao')) return 'Movimentação';
  return trim(value) || 'Atividade operacional';
}

function wmsDailyRange(points) {
  const numericPoints = Math.max(numberValue(points), 0);
  return WMS_DAILY_RV_RANGES.find((range) => numericPoints >= range.min && numericPoints <= range.max)
    || WMS_DAILY_RV_RANGES[0];
}

function isWmsSeparationCsv(csvRows) {
  const first = csvRows[0] || {};
  return Object.prototype.hasOwnProperty.call(first, 'usuario_finalizou_palete')
    && Object.prototype.hasOwnProperty.call(first, 'pontuacao')
    && Object.prototype.hasOwnProperty.call(first, 'data_de_entrega');
}

function buildWmsSeparationRows(csvRows, options = {}) {
  const parsedRows = csvRows
    .map((row) => ({
      ...row,
      date: parseDate(row.data_de_entrega),
      usuario: trim(row.usuario_finalizou_palete),
      pontos: numberValue(row.pontuacao),
      esforco: numberValue(row.esforco)
    }))
    .filter((row) => row.date && row.usuario && row.pontos >= 0);

  const competencia = trim(options.competencia)
    ? normalizeCompetencia(options.competencia)
    : (parsedRows[0] ? competenciaFromDate(parsedRows[0].date) : null);
  const period = officialPeriodForCompetencia(competencia);
  if (!period.inicio || !period.fim) throw new Error('Competencia invalida. Informe a competencia no formato MM/AAAA.');

  const buckets = new Map();
  for (const row of parsedRows) {
    if (row.date < period.inicio || row.date > period.fim) continue;
    const bucket = buckets.get(row.usuario) || {
      usuario: row.usuario,
      pontos: 0,
      esforco: 0,
      registros: 0,
      dias: new Map()
    };
    const day = bucket.dias.get(row.date) || { data: row.date, pontos: 0, esforco: 0, registros: 0 };
    day.pontos += row.pontos;
    day.esforco += row.esforco;
    day.registros += 1;
    bucket.pontos += row.pontos;
    bucket.esforco += row.esforco;
    bucket.registros += 1;
    bucket.dias.set(row.date, day);
    buckets.set(row.usuario, bucket);
  }

  const rows = [...buckets.values()].map((bucket, index) => {
    const dias = [...bucket.dias.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((day) => {
        const range = wmsDailyRange(day.pontos);
        return {
          ...day,
          faixa: range.faixa,
          valor_por_ponto: range.rate,
          valor_rv: Number((day.pontos * range.rate).toFixed(6))
        };
      });
    const rvAntiga = Number((bucket.pontos * WMS_DAILY_RV_RANGES[0].rate).toFixed(6));
    const rvNova = Number(dias.reduce((sum, day) => sum + day.valor_rv, 0).toFixed(6));
    const rangeCounts = Object.fromEntries(WMS_DAILY_RV_RANGES.map(({ faixa }) => [
      faixa,
      dias.filter((day) => day.faixa === faixa).length
    ]));
    const usedRanges = Object.entries(rangeCounts).filter(([, count]) => count > 0);
    const faixa = usedRanges.length === 1
      ? usedRanges[0][0]
      : usedRanges.map(([name, count]) => `${name}: ${count} dia(s)`).join(' | ');

    return {
      sourceIndex: index,
      competencia,
      periodo_inicio: period.inicio,
      periodo_fim: period.fim,
      matricula: '',
      nome_completo: bucket.usuario,
      cpf: '',
      funcao_armazem: 'Ajudante',
      cargo: 'Ajudante',
      setor: 'Armazem',
      tipo_colaborador: 'Interno',
      perfil: 'colaborador',
      usuario_wms: bucket.usuario,
      codigo_operacional: bucket.usuario,
      pontos: Number(bucket.pontos.toFixed(2)),
      faixa: faixa || 'Sem movimentacao',
      rv_antiga: rvAntiga,
      rv_nova: rvNova,
      erros: 0,
      valor_total_previsto: rvNova,
      indicador_1: `${dias.length} dia(s) com movimentacao`,
      indicador_2: `PPA: ${Number(bucket.pontos.toFixed(2))}`,
      indicador_3: bucket.esforco > 0 ? `PPS: ${(bucket.pontos / bucket.esforco).toFixed(4)}` : 'PPS: 0',
      status_produtividade: rvNova > 0 ? 'Elegivel' : 'Sem premio',
      origem_calculo: 'wms_separacao_faixas_diarias',
      status_auditoria: 'pendente_conferencia_erros',
      metodo_cruzamento: 'usuario_wms_exato',
      confianca_cruzamento: 1,
      observacao_cruzamento: 'RV calculada pelas faixas diarias oficiais. O CSV de separacao nao contem ocorrencias de conferencia para desconto.',
      mensagem_rh: `RV calculada por dia a partir da pontuação do On Demand. Valor bruto: R$ ${rvNova.toFixed(2)}.`,
      dados_originais_json: JSON.stringify({
        fonte: 'tempo_separacao_por_palete',
        usuario_wms: bucket.usuario,
        registros: bucket.registros,
        pontos: bucket.pontos,
        esforco: bucket.esforco,
        pps: bucket.esforco > 0 ? bucket.pontos / bucket.esforco : 0,
        faixas: rangeCounts,
        dias,
        regras: WMS_DAILY_RV_RANGES.map(({ faixa: name, min, max, rate }) => ({
          faixa: name,
          min,
          max: Number.isFinite(max) ? max : null,
          valor_por_ponto: rate
        }))
      })
    };
  });

  return {
    sourceType: 'wms_separacao',
    competencia,
    period,
    rows,
    missingValues: [],
    validRows: parsedRows.filter((row) => row.date >= period.inicio && row.date <= period.fim)
  };
}

function buildOperatorActivities(csvRows, competencia) {
  requireCsvColumns(csvRows, ['usuario', 'status', 'tipo', 'data_de_criacao'], 'Monitorar Tarefas');
  const period = officialPeriodForCompetencia(competencia);
  const buckets = new Map();
  let validRows = 0;

  for (const row of csvRows) {
    const date = parseDate(row.data_de_criacao);
    if (!date || date < period.inicio || date > period.fim) continue;
    if (normalizeName(row.status) !== 'completa') continue;
    const usuario = trim(row.usuario).toUpperCase();
    if (!usuario) continue;
    validRows += 1;
    const activity = canonicalOperatorActivity(row.tipo);
    const bucket = buckets.get(normalizeName(usuario)) || { usuario, atividades: new Map(), registros: 0 };
    const item = bucket.atividades.get(activity) || { atividade: activity, quantidade: 0, valuePerUnit: 0.1, total: 0 };
    item.quantidade += 1;
    item.total = Number((item.quantidade * item.valuePerUnit).toFixed(2));
    bucket.atividades.set(activity, item);
    bucket.registros += 1;
    buckets.set(normalizeName(usuario), bucket);
  }

  return {
    period,
    validRows,
    users: buckets.size,
    buckets: new Map([...buckets].map(([key, bucket]) => [
      key,
      { ...bucket, atividades: [...bucket.atividades.values()] }
    ]))
  };
}

function emptyCombinedRow(nome, competencia, period) {
  return {
    sourceIndex: 0,
    competencia,
    periodo_inicio: period.inicio,
    periodo_fim: period.fim,
    matricula: '',
    nome_completo: nome,
    cpf: '',
    funcao_armazem: 'Operador de Empilhadeira',
    cargo: 'Operador de Empilhadeira',
    setor: 'Armazem',
    tipo_colaborador: 'Interno',
    perfil: 'colaborador',
    usuario_wms: nome,
    codigo_operacional: '',
    pontos: 0,
    faixa: 'Sem premio',
    rv_antiga: 0,
    rv_nova: 0,
    erros: 0,
    valor_total_previsto: 0,
    indicador_1: '',
    indicador_2: '',
    indicador_3: '',
    status_produtividade: 'Sem premio',
    origem_calculo: 'rv_armazem_combinada',
    status_auditoria: 'ok',
    metodo_cruzamento: 'nome_usuario_relatorio',
    confianca_cruzamento: 0.8,
    observacao_cruzamento: '',
    mensagem_rh: '',
    dados_originais_json: JSON.stringify({ usuario: nome, atividades: [], registros: 0 })
  };
}

function ensureCombinedRows(context, operatorContext, officialRules) {
  const byName = new Map(context.rows.map((row) => [normalizeName(row.nome_completo), row]));
  const officialNames = new Set(
    Object.values(officialRules.collaborators)
      .map((rule) => normalizeName(rule.nome))
      .filter(Boolean)
  );
  if (operatorContext) {
    for (const bucket of operatorContext.buckets.values()) {
      if (officialRules.eligibleMatriculas.length && !officialNames.has(normalizeName(bucket.usuario))) continue;
      if (!byName.has(normalizeName(bucket.usuario))) {
        const row = emptyCombinedRow(bucket.usuario, context.competencia, context.period);
        context.rows.push(row);
        byName.set(normalizeName(bucket.usuario), row);
      }
    }
  }
  for (const rule of Object.values(officialRules.collaborators)) {
    if (!rule.nome || byName.has(normalizeName(rule.nome))) continue;
    const row = emptyCombinedRow(rule.nome, context.competencia, context.period);
    context.rows.push(row);
    byName.set(normalizeName(rule.nome), row);
  }
}

function parseOriginal(row) {
  try {
    return JSON.parse(row.dados_originais_json || '{}');
  } catch {
    return {};
  }
}

function defaultManualIndicators(colaborador = {}) {
  const role = normalizeName(`${colaborador.cargo || ''} ${colaborador.tipo_colaborador || ''} ${colaborador.funcao_armazem || ''}`);
  const group = role.includes('operador') || role.includes('empilhadeira')
    ? 'operador'
    : (role.includes('ajudante') || role.includes('amarrador') ? 'ajudante' : 'geral');
  return DEFAULT_WAREHOUSE_INDICATORS[group].map((indicator) => ({ ...indicator }));
}

function resolveManualIndicators(colaborador, officialRules, indicatorReviews = {}) {
  const matricula = trim(colaborador.matricula);
  const rule = officialRules.collaborators[matricula] || {};
  const configuredIndicators = (Array.isArray(rule.indicators) ? rule.indicators : []).map((item) => ({
    nome: trim(item.nome || item.type),
    valor: Number(numberValue(item.valor ?? item.value).toFixed(2))
  })).filter((item) => item.nome);
  const availableIndicators = configuredIndicators.length
    ? configuredIndicators
    : defaultManualIndicators(colaborador);
  const reviews = indicatorReviews?.[matricula];
  const indicatorsReviewed = Array.isArray(reviews);
  const selectedIndicators = availableIndicators.flatMap((candidate) => {
    const review = reviews?.find((item) => normalizeName(item.nome) === normalizeName(candidate.nome));
    if (!review?.confirmado) return [];
    return [{ nome: candidate.nome, valor: review.valor }];
  });

  return {
    availableIndicators,
    selectedIndicators,
    indicatorsReviewed,
    indicatorsTotal: Number(selectedIndicators.reduce((sum, item) => sum + item.valor, 0).toFixed(2))
  };
}

function applyCombinedRules(row, colaborador, operatorContext, officialRules, indicatorReviews = {}) {
  const matricula = trim(colaborador.matricula);
  const rule = officialRules.collaborators[matricula] || {};
  const original = parseOriginal(row);
  const onDemandActivities = Array.isArray(original.atividades) ? original.atividades : [];
  const operatorBucket = operatorContext?.buckets.get(normalizeName(row.nome_completo));
  const operatorActivities = operatorBucket?.atividades || [];
  const adjustments = (rule.task_adjustments || []).map((item) => ({
    atividade: trim(item.atividade) || 'Ajuste oficial',
    quantidade: numberValue(item.quantidade),
    valuePerUnit: numberValue(item.valor_unitario),
    total: Number(numberValue(item.valor).toFixed(2)),
    origem: 'ajuste_oficial',
    motivo: trim(item.motivo)
  }));
  const activities = [
    ...onDemandActivities.map((item) => ({ ...item, origem: item.origem || 'on_demand' })),
    ...operatorActivities.map((item) => ({ ...item, origem: 'relatorio_monitorar_tarefas' })),
    ...adjustments
  ];

  const indicatorState = resolveManualIndicators(colaborador, officialRules, indicatorReviews);
  const indicatorCandidates = indicatorState.availableIndicators;
  const indicatorsReviewed = indicatorState.indicatorsReviewed;
  const indicators = indicatorState.selectedIndicators;

  const tasksTotal = Number(activities.reduce((sum, item) => sum + numberValue(item.total), 0).toFixed(2));
  const indicatorsTotal = indicatorState.indicatorsTotal;
  const total = Number((tasksTotal + indicatorsTotal).toFixed(2));
  const expectedTotal = rule.expected_total === undefined ? null : numberValue(rule.expected_total);
  const difference = expectedTotal === null ? 0 : Number((total - expectedTotal).toFixed(2));
  const taskPoints = activities.reduce((sum, item) => sum + Math.max(numberValue(item.quantidade), 0), 0);

  row.pontos = Number(taskPoints.toFixed(2));
  row.rv_nova = total;
  row.valor_total_previsto = total;
  row.faixa = total > 0 ? 'Elegivel' : 'Sem premio';
  row.status_produtividade = total > 0 ? 'Elegivel' : 'Sem premio';
  row.indicador_1 = indicators[0] ? `${indicators[0].nome}: R$ ${indicators[0].valor.toFixed(2)}` : '';
  row.indicador_2 = indicators[1] ? `${indicators[1].nome}: R$ ${indicators[1].valor.toFixed(2)}` : '';
  row.indicador_3 = indicators[2] ? `${indicators[2].nome}: R$ ${indicators[2].valor.toFixed(2)}` : '';
  row.origem_calculo = 'on_demand+monitorar_tarefas+indicadores_yuri';
  row.status_auditoria = indicatorCandidates.length && !indicatorsReviewed
    ? 'pendente_indicadores'
    : (Math.abs(difference) < 0.01 ? 'ok' : 'divergencia_bi');
  row.observacao_cruzamento = Math.abs(difference) < 0.01
    ? 'Cruzamento conferido com o fechamento oficial.'
    : `Diferença de R$ ${difference.toFixed(2)} em relação ao fechamento oficial.`;
  row.mensagem_rh = `RV do armazém: tarefas R$ ${tasksTotal.toFixed(2)} + indicadores R$ ${indicatorsTotal.toFixed(2)}.`;
  row.dados_originais_json = JSON.stringify({
    ...original,
    turno_armazem: trim(rule.turno_armazem || rule.turno || original.turno_armazem || original.turno) || null,
    atividades: activities,
    registros_operadores: operatorBucket?.registros || 0,
    tarefasTotal: tasksTotal,
    indicatorsTotal,
    indicators,
    indicatorCandidates,
    indicatorsReviewed,
    adjustments,
    expectedTasks: rule.expected_tasks ?? null,
    expectedTotal,
    difference,
    fontes: ['on_demand', ...(operatorContext ? ['relatorio_monitorar_tarefas'] : []), 'indicadores_yuri']
  });
  return {
    tasksTotal,
    indicatorsTotal,
    total,
    expectedTotal,
    difference,
    adjustments,
    availableIndicators: indicatorCandidates,
    selectedIndicators: indicators,
    indicatorsReviewed
  };
}

function applyWmsIndicatorRules(row, colaborador, officialRules, indicatorReviews = {}, totals = {}) {
  const indicatorState = resolveManualIndicators(colaborador, officialRules, indicatorReviews);
  const tasksTotal = Number(numberValue(totals.tasksTotal ?? row.rv_nova).toFixed(2));
  const total = Number((tasksTotal + indicatorState.indicatorsTotal).toFixed(2));
  const rule = officialRules.collaborators[trim(colaborador.matricula)] || {};
  const expectedTotal = rule.expected_total === undefined ? null : numberValue(rule.expected_total);
  const difference = expectedTotal === null ? 0 : Number((total - expectedTotal).toFixed(2));
  const original = parseOriginal(row);

  row.rv_nova = total;
  row.valor_total_previsto = total;
  row.faixa = total > 0 ? row.faixa : 'Sem premio';
  row.status_produtividade = total > 0 ? 'Elegivel' : 'Sem premio';
  row.origem_calculo = `${row.origem_calculo || 'wms_separacao'}+indicadores_manuais`;
  if (indicatorState.availableIndicators.length && !indicatorState.indicatorsReviewed) {
    row.status_auditoria = 'pendente_indicadores';
  }
  if (indicatorState.selectedIndicators.length) {
    const summary = indicatorState.selectedIndicators
      .map((item) => `${item.nome}: R$ ${item.valor.toFixed(2)}`)
      .join('; ');
    row.mensagem_rh = `${trim(row.mensagem_rh)} Indicadores confirmados: ${summary}.`.trim();
  }
  row.dados_originais_json = JSON.stringify({
    ...original,
    tarefasTotal: tasksTotal,
    indicatorsTotal: indicatorState.indicatorsTotal,
    indicators: indicatorState.selectedIndicators,
    indicatorCandidates: indicatorState.availableIndicators,
    indicatorsReviewed: indicatorState.indicatorsReviewed,
    expectedTotal,
    difference
  });

  return {
    ...totals,
    tasksTotal,
    indicatorsTotal: indicatorState.indicatorsTotal,
    total,
    expectedTotal,
    difference,
    availableIndicators: indicatorState.availableIndicators,
    selectedIndicators: indicatorState.selectedIndicators,
    indicatorsReviewed: indicatorState.indicatorsReviewed,
    adjustments: totals.adjustments || []
  };
}

function applyAdditionalValue(row, colaborador, totals, additionalValues = {}) {
  const item = additionalValues?.[trim(colaborador.matricula)];
  const additionalTotal = Number(numberValue(item?.valor).toFixed(2));
  if (additionalTotal <= 0) return { ...totals, additionalTotal: 0, additionalValue: null };

  const additionalValue = { valor: additionalTotal, observacao: trim(item.observacao) };
  const total = Number((numberValue(totals.total) + additionalTotal).toFixed(2));
  const difference = totals.expectedTotal === null || totals.expectedTotal === undefined
    ? 0
    : Number((total - totals.expectedTotal).toFixed(2));
  const original = parseOriginal(row);
  row.rv_nova = total;
  row.valor_total_previsto = total;
  row.faixa = total > 0 ? 'Elegivel' : 'Sem premio';
  row.status_produtividade = total > 0 ? 'Elegivel' : 'Sem premio';
  row.origem_calculo = `${row.origem_calculo || 'rv_armazem'}+valor_adicional`;
  if (row.status_auditoria !== 'pendente_indicadores' && totals.expectedTotal !== null && totals.expectedTotal !== undefined) {
    row.status_auditoria = Math.abs(difference) < 0.01 ? 'ok' : 'divergencia_bi';
  }
  row.mensagem_rh = `${trim(row.mensagem_rh)} Valor adicional: R$ ${additionalTotal.toFixed(2)} — ${additionalValue.observacao}.`.trim();
  row.dados_originais_json = JSON.stringify({
    ...original,
    additionalValues: [additionalValue],
    additionalTotal
  });
  return { ...totals, total, difference, additionalTotal, additionalValue };
}

function applyManualCorrection(row, colaborador, totals, manualCorrections = {}) {
  const item = manualCorrections?.[trim(colaborador.matricula)];
  if (!item) return { ...totals, manualCorrection: null };

  const previousTotal = Number(numberValue(totals.total).toFixed(2));
  const finalTotal = Number(numberValue(item.valorFinal).toFixed(2));
  const manualCorrection = {
    valorAnterior: previousTotal,
    valorFinal: finalTotal,
    diferenca: Number((finalTotal - previousTotal).toFixed(2)),
    observacao: trim(item.observacao)
  };
  const difference = totals.expectedTotal === null || totals.expectedTotal === undefined
    ? 0
    : Number((finalTotal - totals.expectedTotal).toFixed(2));
  const original = parseOriginal(row);

  row.rv_nova = finalTotal;
  row.valor_total_previsto = finalTotal;
  row.faixa = finalTotal > 0 ? 'Elegivel' : 'Sem premio';
  row.status_produtividade = finalTotal > 0 ? 'Elegivel' : 'Sem premio';
  row.origem_calculo = `${row.origem_calculo || 'rv_armazem'}+correcao_manual_conferencia`;
  row.status_auditoria = 'corrigido_manualmente';
  row.observacao_cruzamento = `${trim(row.observacao_cruzamento)} Correção manual: ${manualCorrection.observacao}.`.trim();
  row.mensagem_rh = `${trim(row.mensagem_rh)} Valor final corrigido manualmente de R$ ${previousTotal.toFixed(2)} para R$ ${finalTotal.toFixed(2)} — ${manualCorrection.observacao}.`.trim();
  row.dados_originais_json = JSON.stringify({
    ...original,
    manualCorrection
  });

  return { ...totals, total: finalTotal, difference, manualCorrection };
}

function buildRows(csvRows, options) {
  if (isWmsSeparationCsv(csvRows)) return buildWmsSeparationRows(csvRows, options);
  requireCsvColumns(csvRows, ['usuario', 'atividade', 'observacao', 'status_tarefa'], 'On Demand');
  const columns = new Set(Object.keys(csvRows[0] || {}));
  if (!columns.has('finalizacao') && !columns.has('criacao')) {
    throw new Error('O arquivo On Demand não possui a coluna Finalização ou Criação.');
  }
  const validRows = csvRows
    .map((row) => {
      const date = parseDate(row.finalizacao || row.criacao);
      return {
        ...row,
        date,
        usuario: trim(row.usuario).toUpperCase(),
        quantidade: numberValue(row.observacao),
        atividade_canonica: canonicalActivity(row.atividade)
      };
    })
    .filter((row) => row.usuario && row.date && normalizeName(row.status_tarefa || 'finalizado').includes('finalizado'));

  const competencia = trim(options.competencia)
    ? normalizeCompetencia(options.competencia)
    : (validRows[0] ? competenciaFromDate(validRows[0].date) : null);
  const period = officialPeriodForCompetencia(competencia);
  if (!period.inicio || !period.fim) throw new Error('Competencia invalida. Informe --competencia MM/AAAA.');

  const values = readTaskValues(options.taskValues);
  const defaultValue = Number.isFinite(options.defaultValue) ? options.defaultValue : null;
  const buckets = new Map();
  const missingValues = new Set();

  for (const row of validRows) {
    if (row.date < period.inicio || row.date > period.fim) continue;
    const user = row.usuario;
    const activity = row.atividade_canonica;
    const valuePerUnit = values[normalizeName(activity)] ?? defaultValue;
    if (valuePerUnit === null || valuePerUnit === undefined) missingValues.add(activity);

    const bucket = buckets.get(user) || { usuario: user, quantidade: 0, total: 0, byActivity: new Map(), raw: [] };
    const quantity = row.quantidade || 0;
    const total = quantity * (valuePerUnit || 0);
    bucket.quantidade += quantity;
    bucket.total += total;
    const activityBucket = bucket.byActivity.get(activity) || { quantidade: 0, total: 0, valuePerUnit: valuePerUnit || 0 };
    activityBucket.quantidade += quantity;
    activityBucket.total += total;
    bucket.byActivity.set(activity, activityBucket);
    bucket.raw.push(row);
    buckets.set(user, bucket);
  }

  const rows = [...buckets.values()].map((bucket, index) => {
    const details = [...bucket.byActivity.entries()]
      .sort((a, b) => b[1].total - a[1].total || b[1].quantidade - a[1].quantidade)
      .map(([atividade, data]) => ({ atividade, ...data }));
    const total = Number(bucket.total.toFixed(2));
    return {
      sourceIndex: index,
      competencia,
      periodo_inicio: period.inicio,
      periodo_fim: period.fim,
      matricula: '',
      nome_completo: bucket.usuario,
      cpf: '',
      funcao_armazem: 'Ajudante',
      cargo: 'Ajudante',
      setor: 'Armazem',
      tipo_colaborador: 'Interno',
      perfil: 'colaborador',
      usuario_wms: bucket.usuario,
      codigo_operacional: '',
      pontos: Number(bucket.quantidade.toFixed(2)),
      faixa: total > 0 ? 'Elegivel' : 'Sem premio',
      rv_antiga: 0,
      rv_nova: total,
      erros: 0,
      valor_total_previsto: total,
      indicador_1: details[0] ? `${details[0].atividade}: ${details[0].quantidade}` : '',
      indicador_2: details[1] ? `${details[1].atividade}: ${details[1].quantidade}` : '',
      indicador_3: details[2] ? `${details[2].atividade}: ${details[2].quantidade}` : '',
      status_produtividade: total > 0 ? 'Elegivel' : 'Sem premio',
      origem_calculo: 'on_demand_csv',
      status_auditoria: missingValues.size ? 'revisar_valores_atividade' : 'ok',
      metodo_cruzamento: 'nome_usuario_on_demand',
      confianca_cruzamento: 0.8,
      observacao_cruzamento: missingValues.size ? 'Importado sem todos os valores de atividade.' : '',
      mensagem_rh: `Importado do On Demand ${monthYearFromCompetencia(competencia)}. Total de pontos: ${Number(bucket.quantidade.toFixed(2))}.`,
      dados_originais_json: JSON.stringify({
        usuario: bucket.usuario,
        atividades: details,
        registros: bucket.raw.length
      })
    };
  });

  return { sourceType: 'on_demand', competencia, period, rows, missingValues: [...missingValues].sort(), validRows };
}

async function ensureArmazemTables() {
  await db.run(`CREATE TABLE IF NOT EXISTS produtividade_armazem_importacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arquivo TEXT,
    competencia TEXT,
    periodo_inicio TEXT,
    periodo_fim TEXT,
    total_linhas INTEGER DEFAULT 0,
    importados INTEGER DEFAULT 0,
    atualizados INTEGER DEFAULT 0,
    ignorados INTEGER DEFAULT 0,
    erros INTEGER DEFAULT 0,
    valor_total_previsto REAL DEFAULT 0,
    valor_total_rv_antiga REAL DEFAULT 0,
    valor_total_rv_nova REAL DEFAULT 0,
    detalhes_json TEXT,
    criado_por INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS produtividade_armazem_colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    importacao_id INTEGER,
    colaborador_id INTEGER,
    competencia TEXT NOT NULL,
    periodo_inicio TEXT,
    periodo_fim TEXT,
    matricula TEXT,
    nome_completo TEXT,
    cpf TEXT,
    funcao_armazem TEXT,
    cargo TEXT,
    setor TEXT,
    tipo_colaborador TEXT,
    perfil TEXT,
    usuario_wms TEXT,
    codigo_operacional TEXT,
    pontos REAL DEFAULT 0,
    faixa TEXT,
    rv_antiga REAL DEFAULT 0,
    rv_nova REAL DEFAULT 0,
    erros REAL DEFAULT 0,
    valor_total_previsto REAL DEFAULT 0,
    indicador_1 TEXT,
    indicador_2 TEXT,
    indicador_3 TEXT,
    status_produtividade TEXT,
    origem_calculo TEXT,
    status_auditoria TEXT DEFAULT 'ok',
    metodo_cruzamento TEXT,
    confianca_cruzamento REAL,
    observacao_cruzamento TEXT,
    mensagem_rh TEXT,
    dados_originais_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_armazem_colab_comp_funcao ON produtividade_armazem_colaboradores(colaborador_id, competencia, funcao_armazem)');
}

async function backupSqlite() {
  if (process.env.DATABASE_URL) return null;
  const dbPath = path.join(__dirname, '../data/db.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  const backupPath = path.join(__dirname, `../logs/backup_ondemand_antes_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

async function findColaborador(row) {
  const activeFilter = `LOWER(TRIM(COALESCE(status, 'ativo'))) NOT IN ('desligado', 'removido', 'inativo')`;
  const all = await db.all(`SELECT * FROM colaboradores WHERE ${activeFilter}`);
  const sourceName = normalizeName(row.nome_completo);
  const wmsMatches = all.filter((colaborador) => normalizeName(colaborador.usuario_wms) === sourceName);
  if (wmsMatches.length === 1) return { colaborador: wmsMatches[0], metodo: 'usuario_wms_exato', confianca: 1 };
  const nameMatches = all.filter((colaborador) => normalizeName(colaborador.nome_completo) === sourceName);
  if (nameMatches.length === 1) return { colaborador: nameMatches[0], metodo: 'nome_exato_normalizado', confianca: 0.95 };
  return null;
}

function applyCollaboratorRoleRules(row, colaborador) {
  const role = normalizeName(`${colaborador.cargo || ''} ${colaborador.tipo_colaborador || ''}`);
  if (role.includes('operador') || role.includes('empilhadeira')) {
    row.funcao_armazem = 'Operador de Empilhadeira';
    let original = {};
    try {
      original = JSON.parse(row.dados_originais_json || '{}');
    } catch {
      original = {};
    }
    const activities = Array.isArray(original.atividades) ? original.atividades : [];
    const adjusted = activities.map((activity) => ({
      ...activity,
      valuePerUnit: 0.1,
      total: Number((numberValue(activity.quantidade) * 0.1).toFixed(2))
    }));
    const total = Number(adjusted.reduce((sum, activity) => sum + activity.total, 0).toFixed(2));
    row.rv_nova = total;
    row.valor_total_previsto = total;
    row.faixa = total > 0 ? 'Elegivel' : 'Sem premio';
    row.status_produtividade = total > 0 ? 'Elegivel' : 'Sem premio';
    row.dados_originais_json = JSON.stringify({ ...original, atividades: adjusted, regra_funcao: 'operador_tarefa_0_10' });
    row.mensagem_rh = `Importado do On Demand. Operador de Empilhadeira: ${row.pontos} tarefa(s) a R$ 0,10.`;
  } else if (role.includes('amarrador') || role.includes('amarracao')) {
    row.funcao_armazem = 'Amarrador';
  } else {
    row.funcao_armazem = 'Ajudante';
  }
  return row;
}

async function createColaborador(row) {
  const senhaHash = await bcrypt.hash('log20', 10);
  const matricula = `OND${String(row.sourceIndex + 1).padStart(5, '0')}`;
  const result = await db.run(
    `INSERT INTO colaboradores (
      matricula, nome_completo, cpf, cargo, setor, unidade, tipo_colaborador, status,
      senha_hash, perfil, primeiro_acesso, senha_temporaria
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matricula,
      row.nome_completo,
      null,
      row.cargo,
      row.setor,
      'CDD Cascavel',
      row.tipo_colaborador,
      'Ativo',
      senhaHash,
      row.perfil,
      1,
      1
    ]
  );
  return db.get('SELECT * FROM colaboradores WHERE id = ?', [result.lastID]);
}

async function createImportRecord(file, rows, context, options = {}) {
  const total = rows.reduce((sum, row) => sum + row.valor_total_previsto, 0);
  const result = await db.run(
    `INSERT INTO produtividade_armazem_importacoes (
      arquivo, competencia, periodo_inicio, periodo_fim, total_linhas,
      valor_total_previsto, valor_total_rv_nova, detalhes_json, criado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      options.originalFilename || path.basename(file),
      context.competencia,
      context.period.inicio,
      context.period.fim,
      rows.length,
      Number(total.toFixed(2)),
      Number(total.toFixed(2)),
      JSON.stringify({ origem: 'on_demand_csv', missing_values: context.missingValues }),
      options.createdBy || null
    ]
  );
  return result.lastID;
}

async function upsertArmazem(row, colaborador, importacaoId) {
  const payload = {
    ...row,
    importacao_id: importacaoId,
    colaborador_id: colaborador.id,
    matricula: colaborador.matricula,
    nome_completo: colaborador.nome_completo,
    cpf: colaborador.cpf,
    cargo: colaborador.cargo || row.cargo,
    setor: colaborador.setor || row.setor,
    tipo_colaborador: colaborador.tipo_colaborador || row.tipo_colaborador,
    perfil: colaborador.perfil || row.perfil
  };

  const existing = await db.get(
    'SELECT id FROM produtividade_armazem_colaboradores WHERE colaborador_id = ? AND competencia = ? AND funcao_armazem = ?',
    [payload.colaborador_id, payload.competencia, payload.funcao_armazem]
  );

  if (existing) {
    const updateColumns = armazemColumns.filter((column) => column !== 'colaborador_id');
    await db.run(
      `UPDATE produtividade_armazem_colaboradores
       SET ${updateColumns.map((column) => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...updateColumns.map((column) => payload[column]), existing.id]
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

async function importOnDemand(file, options = {}) {
  const csvRows = readCsv(file);
  const context = buildRows(csvRows, options);
  const isWmsSeparation = context.sourceType === 'wms_separacao';
  const officialRules = readOfficialRules(options.officialRules, context.competencia);
  const indicatorReviews = normalizeIndicatorReviews(options.indicatorReviews);
  const additionalValues = normalizeAdditionalValues(options.additionalValues);
  const manualCorrections = normalizeManualCorrections(options.manualCorrections);
  const operatorCsvRows = options.operatorFile ? readCsv(options.operatorFile) : [];
  const operatorContext = options.operatorFile && !isWmsSeparation
    ? buildOperatorActivities(operatorCsvRows, context.competencia)
    : null;
  if (!isWmsSeparation) ensureCombinedRows(context, operatorContext, officialRules);
  const report = {
    file,
    operatorFile: options.operatorFile || null,
    competencia: context.competencia,
    periodo: context.period,
    linhasCsv: csvRows.length,
    linhasValidasPeriodo: context.validRows.length,
    linhasOperadoresCsv: operatorCsvRows.length,
    linhasOperadoresValidas: operatorContext?.validRows || 0,
    usuariosOperadores: operatorContext?.users || 0,
    colaboradoresNoCsv: context.rows.length,
    missingValues: context.missingValues,
    createdCollaborators: 0,
    created: 0,
    updated: 0,
    ignored: 0,
    notFound: [],
    excludedByOfficialRules: [],
    crossed: [],
    dryRun: Boolean(options.dryRun)
  };

  if (context.missingValues.length && !options.allowMissingValues && !options.dryRun) {
    throw new Error(`Faltam valores para atividades: ${context.missingValues.join(', ')}. Informe --task-values ou use --allow-missing-values.`);
  }

  if (options.dryRun) {
    report.preview = [];
    for (const row of context.rows) {
      const match = await findColaborador(row);
      if (!match) {
        report.ignored += 1;
        report.notFound.push(row.nome_completo);
      } else {
        const eligible = !officialRules.eligibleMatriculas.length
          || officialRules.eligibleMatriculas.includes(trim(match.colaborador.matricula));
        if (!eligible) {
          report.ignored += 1;
          report.excludedByOfficialRules.push({
            matricula: match.colaborador.matricula,
            nome_completo: match.colaborador.nome_completo,
            motivo: 'Não consta no fechamento oficial desta competência.'
          });
          report.preview.push({
            nome_completo: match.colaborador.nome_completo,
            competencia: row.competencia,
            pontos: row.pontos,
            valor_total_previsto: 0,
            funcao_armazem: row.funcao_armazem,
            vinculado: false,
            matricula: match.colaborador.matricula,
            metodo_cruzamento: match.metodo,
            motivo_ignorado: 'Não consta no fechamento oficial desta competência.'
          });
          continue;
        }
        if (!isWmsSeparation) applyCollaboratorRoleRules(row, match.colaborador);
        const baseTotals = isWmsSeparation
          ? {
              tasksTotal: row.rv_nova,
              indicatorsTotal: 0,
              total: row.valor_total_previsto,
              expectedTotal: null,
              difference: 0,
              adjustments: []
            }
          : null;
        const calculatedTotals = isWmsSeparation
          ? applyWmsIndicatorRules(row, match.colaborador, officialRules, indicatorReviews, baseTotals)
          : applyCombinedRules(row, match.colaborador, operatorContext, officialRules, indicatorReviews);
        const totalsWithAdditional = applyAdditionalValue(row, match.colaborador, calculatedTotals, additionalValues);
        const totals = applyManualCorrection(row, match.colaborador, totalsWithAdditional, manualCorrections);
        report.crossed.push({
          colaborador_id: match.colaborador.id,
          matricula: match.colaborador.matricula,
          nome_completo: match.colaborador.nome_completo,
          usuario_on_demand: row.nome_completo,
          metodo: match.metodo,
          confianca: match.confianca,
          valor_tarefas: totals.tasksTotal,
          valor_indicadores: totals.indicatorsTotal,
          ajustes: totals.adjustments,
          indicadores_disponiveis: totals.availableIndicators || [],
          indicadores_confirmados: totals.selectedIndicators || [],
          valor_adicional: totals.additionalTotal,
          observacao_valor_adicional: totals.additionalValue?.observacao || '',
          correcao_manual: totals.manualCorrection,
          valor_total_previsto: row.valor_total_previsto,
          valor_esperado: totals.expectedTotal,
          diferenca: totals.difference
        });
      }
      report.preview.push({
        nome_completo: row.nome_completo,
        competencia: row.competencia,
        pontos: row.pontos,
        valor_total_previsto: row.valor_total_previsto,
        funcao_armazem: row.funcao_armazem,
        vinculado: Boolean(match),
        matricula: match?.colaborador?.matricula || null,
        metodo_cruzamento: match?.metodo || null,
        indicador_1: row.indicador_1,
        indicador_2: row.indicador_2,
        indicador_3: row.indicador_3,
        valor_tarefas: match ? numberValue(parseOriginal(row).tarefasTotal ?? (isWmsSeparation ? parseOriginal(row).dias?.reduce((sum, day) => sum + numberValue(day.valor_rv), 0) : 0)) : 0,
        valor_indicadores: match ? numberValue(parseOriginal(row).indicatorsTotal) : 0,
        ajustes: match ? (isWmsSeparation ? [] : parseOriginal(row).adjustments) : [],
        indicadores_disponiveis: match ? parseOriginal(row).indicatorCandidates || [] : [],
        indicadores_confirmados: match ? parseOriginal(row).indicators || [] : [],
        valor_adicional: match ? numberValue(parseOriginal(row).additionalTotal) : 0,
        observacao_valor_adicional: match ? parseOriginal(row).additionalValues?.[0]?.observacao || '' : ''
      });
    }
    return report;
  }

  report.backupPath = await backupSqlite();
  const importacaoId = await createImportRecord(file, context.rows, context, options);
  report.importacaoId = importacaoId;

  for (const row of context.rows) {
    let match = await findColaborador(row);
    if (!match && options.createMissing) {
      const colaborador = await createColaborador(row);
      match = { colaborador, metodo: 'cadastro_criado_importacao', confianca: 0.8 };
      report.createdCollaborators += 1;
    }
    if (!match) {
      report.ignored += 1;
      report.notFound.push(row.nome_completo);
      continue;
    }
    const eligible = !officialRules.eligibleMatriculas.length
      || officialRules.eligibleMatriculas.includes(trim(match.colaborador.matricula));
    if (!eligible) {
      report.ignored += 1;
      report.excludedByOfficialRules.push({
        matricula: match.colaborador.matricula,
        nome_completo: match.colaborador.nome_completo,
        motivo: 'Não consta no fechamento oficial desta competência.'
      });
      continue;
    }
    row.metodo_cruzamento = match.metodo;
    row.confianca_cruzamento = match.confianca;
    row.status_auditoria = isWmsSeparation
      ? 'pendente_conferencia_erros'
      : (context.missingValues.length ? 'revisar_valores_atividade' : 'ok');
    row.observacao_cruzamento = isWmsSeparation
      ? `Cruzamento ${match.metodo} confirmado. Valor bruto calculado; o CSV não contém ocorrências de conferência para desconto.`
      : `Cruzamento ${match.metodo} com o cadastro ativo do Yuri.`;
    if (!isWmsSeparation) applyCollaboratorRoleRules(row, match.colaborador);
    const baseTotals = isWmsSeparation
      ? {
          tasksTotal: row.rv_nova,
          indicatorsTotal: 0,
          total: row.valor_total_previsto,
          expectedTotal: null,
          difference: 0,
          adjustments: []
        }
      : null;
    const calculatedTotals = isWmsSeparation
      ? applyWmsIndicatorRules(row, match.colaborador, officialRules, indicatorReviews, baseTotals)
      : applyCombinedRules(row, match.colaborador, operatorContext, officialRules, indicatorReviews);
    const totalsWithAdditional = applyAdditionalValue(row, match.colaborador, calculatedTotals, additionalValues);
    const totals = applyManualCorrection(row, match.colaborador, totalsWithAdditional, manualCorrections);
    const result = await upsertArmazem(row, match.colaborador, importacaoId);
    if (result === 'created') report.created += 1;
    if (result === 'updated') report.updated += 1;
    report.crossed.push({
      colaborador_id: match.colaborador.id,
      matricula: match.colaborador.matricula,
      nome_completo: match.colaborador.nome_completo,
      usuario_on_demand: row.nome_completo,
      metodo: match.metodo,
      confianca: match.confianca,
      valor_tarefas: totals.tasksTotal,
      valor_indicadores: totals.indicatorsTotal,
      ajustes: totals.adjustments,
      indicadores_disponiveis: totals.availableIndicators || [],
      indicadores_confirmados: totals.selectedIndicators || [],
      valor_adicional: totals.additionalTotal,
      observacao_valor_adicional: totals.additionalValue?.observacao || '',
      correcao_manual: totals.manualCorrection,
      valor_total_previsto: row.valor_total_previsto,
      valor_esperado: totals.expectedTotal,
      diferenca: totals.difference
    });
  }

  if (officialRules.eligibleMatriculas.length) {
    const includedIds = report.crossed.map((item) => item.colaborador_id);
    const placeholders = includedIds.map(() => '?').join(', ');
    const exclusionSql = placeholders ? `AND colaborador_id NOT IN (${placeholders})` : '';
    await db.run(
      `DELETE FROM produtividade_armazem_colaboradores
       WHERE competencia = ? AND origem_calculo = 'on_demand_csv' ${exclusionSql}`,
      [context.competencia, ...includedIds]
    );
  }

  await db.run(
    `UPDATE produtividade_armazem_importacoes
     SET importados = ?, atualizados = ?, ignorados = ?,
         valor_total_previsto = ?, valor_total_rv_nova = ?, detalhes_json = ?
     WHERE id = ?`,
    [
      report.created,
      report.updated,
      report.ignored,
      Number(report.crossed.reduce((sum, item) => sum + numberValue(item.valor_total_previsto), 0).toFixed(2)),
      Number(report.crossed.reduce((sum, item) => sum + numberValue(item.valor_total_previsto), 0).toFixed(2)),
      JSON.stringify({
        origem: 'rv_armazem_combinada',
        missing_values: report.missingValues,
        not_found: report.notFound,
        excluded_by_official_rules: report.excludedByOfficialRules,
        operator_rows: report.linhasOperadoresValidas,
        crossed: report.crossed
      }),
      importacaoId
    ]
  );

  if (options.activateModule) {
    await db.run(
      `UPDATE configuracoes_modulos
       SET ativo = 1, em_manutencao = 0, mensagem_manutencao = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE chave = 'premio_produtividade_armazem'`
    );
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) throw new Error('Uso: npm run import:ondemand -- --file on-demand.csv [--operator-file atividades.csv] --competencia MM/AAAA [--task-values valores.json] [--create-missing] [--activate-module] [--dry-run]');
  const report = await importOnDemand(path.resolve(args.file), args);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao On Demand: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importOnDemand,
  buildRows,
  buildWmsSeparationRows,
  isWmsSeparationCsv,
  wmsDailyRange,
  WMS_DAILY_RV_RANGES,
  canonicalActivity,
  normalizeComparableName,
  normalizeCompetencia,
  applyCollaboratorRoleRules,
  buildOperatorActivities,
  applyCombinedRules,
  applyWmsIndicatorRules,
  applyAdditionalValue,
  applyManualCorrection,
  normalizeIndicatorReviews,
  normalizeAdditionalValues,
  normalizeManualCorrections,
  parseCsvBuffer,
  readOfficialRules,
  officialPeriodForCompetencia
};
