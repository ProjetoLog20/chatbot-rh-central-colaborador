require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/Prontuario_Condutor_Analitico.xls');

const numberFields = [
  'quantidade_sonolencia',
  'acidentes_fai',
  'acidentes_lti',
  'acidentes_mdi',
  'acidentes_mti',
  'capotamentos',
  'colisoes',
  'tombamentos',
  'descumprimento_manuseio_dinheiro',
  'descumprimento_padrao_seguranca',
  'descumprimento_plano_trafego',
  'estacionamento_local_proibido',
  'nao_uso_epi',
  'nao_uso_cinto_ajudante',
  'nao_uso_cinto_motorista',
  'nao_uso_cone',
  'fadiga_celular',
  'fadiga_consumo_alimento',
  'fadiga_fumando',
  'fadiga_oclusao',
  'fadiga_sem_cinto',
  'multa_grave',
  'multa_gravissima',
  'multa_leve',
  'multa_media',
  'advertencias',
  'suspensoes',
  'telemetria_excesso_velocidade_1',
  'telemetria_excesso_velocidade_2',
  'telemetria_excesso_velocidade_3',
  'telemetria_forca_g',
  'telemetria_frenagem_brusca'
];

const prontuarioColumns = [
  'colaborador_id',
  'matricula',
  'nome_condutor',
  'cpf',
  'cargo',
  'status_prontuario',
  'motivo',
  'data_bloqueio',
  'pontuacao_cnh',
  'vencimento_cnh',
  'pontuacao_ponderada',
  'faixa',
  'cor_faixa',
  ...numberFields,
  'regiao_geo',
  'atividade',
  'empresa',
  'operacao',
  'data_importacao'
];

const aliases = {
  nome_condutor: ['empregado', 'condutor', 'nome', 'nome condutor', 'motorista', 'colaborador'],
  cpf: ['cpf', 'documento'],
  cargo: ['cargo', 'funcao', 'função'],
  status_prontuario: ['status', 'situacao', 'situação', 'situacao prontuario', 'situação prontuario'],
  motivo: ['motivo'],
  data_bloqueio: ['data bloqueio', 'bloqueio'],
  pontuacao_cnh: ['pontuacao cnh', 'pontuação cnh', 'pontuacao', 'pontuação'],
  vencimento_cnh: ['vencimento cnh', 'vencimento', 'validade cnh'],
  pontuacao_ponderada: ['pontuacao ponderada', 'pontuação ponderada', 'ponderada'],
  faixa: ['faixa', 'classificacao faixa', 'classificação faixa'],
  cor_faixa: ['cor faixa', 'cor da faixa', 'classificacao', 'classificação', 'cor'],
  quantidade_sonolencia: ['quantidade sonolencia', 'quantidade sonolência', 'sonolencia', 'sonolência'],
  acidentes_fai: ['acidentes fai', 'fai'],
  acidentes_lti: ['acidentes lti', 'lti'],
  acidentes_mdi: ['acidentes mdi', 'mdi'],
  acidentes_mti: ['acidentes mti', 'mti'],
  capotamentos: ['capotamentos', 'capotamento'],
  colisoes: ['colisoes', 'colisões', 'colisao', 'colisão'],
  tombamentos: ['tombamentos', 'tombamento'],
  descumprimento_manuseio_dinheiro: ['descumprimento manuseio dinheiro', 'manuseio dinheiro'],
  descumprimento_padrao_seguranca: ['descumprimento padrao seguranca', 'descumprimento padrão segurança', 'padrao seguranca', 'padrão segurança'],
  descumprimento_plano_trafego: ['descumprimento plano trafego', 'descumprimento plano tráfego', 'plano trafego', 'plano tráfego'],
  estacionamento_local_proibido: ['estacionamento local proibido', 'local proibido'],
  nao_uso_epi: ['nao uso epi', 'não uso epi', 'epi'],
  nao_uso_cinto_ajudante: ['nao uso cinto ajudante', 'não uso cinto ajudante', 'cinto ajudante'],
  nao_uso_cinto_motorista: ['nao uso cinto motorista', 'não uso cinto motorista', 'cinto motorista'],
  nao_uso_cone: ['nao uso cone', 'não uso cone', 'cone'],
  fadiga_celular: ['fadiga celular', 'celular'],
  fadiga_consumo_alimento: ['fadiga consumo alimento', 'consumo alimento', 'alimento'],
  fadiga_fumando: ['fadiga fumando', 'fumando'],
  fadiga_oclusao: ['fadiga oclusao', 'fadiga oclusão', 'oclusao', 'oclusão'],
  fadiga_sem_cinto: ['fadiga sem cinto', 'sem cinto'],
  multa_grave: ['multa grave', 'grave'],
  multa_gravissima: ['multa gravissima', 'multa gravíssima', 'gravissima', 'gravíssima'],
  multa_leve: ['multa leve', 'leve'],
  multa_media: ['multa media', 'multa média', 'media', 'média'],
  advertencias: ['advertencias', 'advertências', 'advertencia', 'advertência'],
  suspensoes: ['suspensoes', 'suspensões', 'suspensao', 'suspensão'],
  telemetria_excesso_velocidade_1: ['telemetria excesso velocidade 1', 'excesso velocidade 1', 'velocidade 1'],
  telemetria_excesso_velocidade_2: ['telemetria excesso velocidade 2', 'excesso velocidade 2', 'velocidade 2'],
  telemetria_excesso_velocidade_3: ['telemetria excesso velocidade 3', 'excesso velocidade 3', 'velocidade 3'],
  telemetria_forca_g: ['telemetria forca g', 'telemetria força g', 'forca g', 'força g'],
  telemetria_frenagem_brusca: ['telemetria frenagem brusca', 'frenagem brusca'],
  regiao_geo: ['regiao geo', 'região geo', 'geo', 'regiao', 'região'],
  atividade: ['atividade'],
  empresa: ['empresa'],
  operacao: ['operacao', 'operação']
};

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeader(value) {
  return stripAccents(String(value ?? '').replace(/<br\s*\/?>/gi, ' '))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return normalizeHeader(value);
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function trim(value) {
  return String(value ?? '').trim();
}

function parseNumber(value) {
  const text = trim(value)
    .replace(/n\s*\/\s*a/i, '')
    .replace('%', '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!text || /^ok$/i.test(text)) return 0;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function parseDecimal(value) {
  const text = trim(value)
    .replace(/n\s*\/\s*a/i, '')
    .replace('%', '')
    .replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = trim(value);
  if (!text || /n\s*\/\s*a/i.test(text)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+\d{1,2}:\d{2})?/);
  if (brDate) {
    const [, a, b, rawYear] = brDate;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const first = Number(a);
    const second = Number(b);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

function normalizeCorFaixa(value) {
  const normalized = normalizeHeader(value);
  if (!normalized || ['sem faixa', 'nao classificado', 'nao classificada', 'não classificado', 'não classificada'].includes(normalized)) return 'sem_faixa';
  if (['verde', 'green', 'adequado', 'ok'].includes(normalized)) return 'verde';
  if (['amarelo', 'amarela', 'yellow', 'atencao', 'atenção'].includes(normalized)) return 'amarelo';
  if (['vermelho', 'vermelha', 'red', 'critico', 'crítico', 'critica', 'crítica'].includes(normalized)) return 'vermelho';
  if (normalized.includes('verde') || normalized.includes('adequado')) return 'verde';
  if (normalized.includes('amarel') || normalized.includes('atencao')) return 'amarelo';
  if (normalized.includes('vermelh') || normalized.includes('critic')) return 'vermelho';
  return 'sem_faixa';
}

function colorFromRgb(rgb) {
  if (!rgb) return '';
  let clean = String(rgb).replace(/[^a-f0-9]/gi, '');
  if (clean.length === 8) clean = clean.slice(2);
  if (clean.length < 6) return '';
  const hex = clean.slice(-6);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (g >= r + 25 && g >= b + 25) return 'verde';
  if (r > 180 && g > 140 && b < 130) return 'amarelo';
  if (r >= g + 35 && r >= b + 35) return 'vermelho';
  return '';
}

function colorFromCell(cell) {
  const fill = cell?.s?.fill || cell?.s?.patternType || cell?.s;
  const fg = fill?.fgColor || fill?.bgColor || cell?.s?.fgColor || cell?.s?.bgColor;
  return colorFromRgb(fg?.rgb) || colorFromRgb(fg?.indexed);
}

function findHeaderRow(rows) {
  let best = { index: 0, score: -1 };
  rows.forEach((row, index) => {
    const normalized = row.map(normalizeHeader);
    const score = [
      normalized.includes('cpf'),
      normalized.some((value) => ['empregado', 'condutor', 'nome'].includes(value)),
      normalized.some((value) => value.includes('pontuacao')),
      normalized.includes('faixa')
    ].filter(Boolean).length;
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

function buildColumnMap(headerRow) {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const map = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const normalizedCandidates = candidates.map(normalizeHeader);
    let index = normalizedHeaders.findIndex((header) => normalizedCandidates.includes(header));
    if (index === -1) {
      index = normalizedHeaders.findIndex((header) => normalizedCandidates.some((candidate) => header.includes(candidate)));
    }
    if (index !== -1) map[field] = index;
  }
  return map;
}

function buildExportColumnMap(rows, headerIndex) {
  const first = rows[headerIndex] || [];
  const second = rows[headerIndex + 1] || [];
  const normalizedFirst = first.map(normalizeHeader);
  const normalizedSecond = second.map(normalizeHeader);
  const hasNewExportLayout = normalizedFirst.includes('condutor')
    && normalizedFirst.includes('cargo')
    && normalizedFirst.some((value) => value.includes('pontuacao ponderada'));

  if (!hasNewExportLayout) return null;

  return {
    regiao_geo: normalizedFirst.indexOf('regiao'),
    atividade: normalizedFirst.indexOf('atividade'),
    operacao: normalizedFirst.indexOf('operacao'),
    nome_condutor: normalizedFirst.indexOf('condutor'),
    cargo: normalizedFirst.indexOf('cargo'),
    status_prontuario: normalizedSecond.indexOf('status') !== -1
      ? normalizedSecond.indexOf('status')
      : normalizedFirst.indexOf('situacao'),
    motivo: normalizedFirst.indexOf('justificativa'),
    pontuacao_ponderada: normalizedFirst.findIndex((value) => value.includes('pontuacao ponderada')),
    telemetria_frenagem_brusca: normalizedSecond.indexOf('frenagem brusca'),
    acidentes_fai: normalizedSecond.indexOf('fai'),
    acidentes_lti: normalizedSecond.indexOf('lti'),
    acidentes_mti: normalizedSecond.indexOf('mti'),
    acidentes_mdi: normalizedSecond.indexOf('mdi'),
    multa_leve: normalizedSecond.indexOf('leve'),
    multa_media: normalizedSecond.indexOf('media'),
    multa_grave: normalizedSecond.indexOf('grave'),
    multa_gravissima: normalizedSecond.indexOf('gravissima'),
    colisoes: normalizedSecond.indexOf('colisoes'),
    capotamentos: normalizedSecond.indexOf('capotamentos'),
    tombamentos: normalizedSecond.indexOf('tombamentos'),
    advertencias: normalizedSecond.indexOf('advertencias'),
    suspensoes: normalizedSecond.indexOf('suspensoes'),
    quantidade_sonolencia: normalizedSecond.indexOf('sono'),
    fadiga_celular: normalizedSecond.indexOf('celular'),
    fadiga_consumo_alimento: normalizedSecond.indexOf('consumo alimento'),
    fadiga_fumando: normalizedSecond.indexOf('fumando'),
    fadiga_oclusao: normalizedSecond.indexOf('oclusao'),
    fadiga_sem_cinto: normalizedSecond.indexOf('sem cinto'),
    pontuacao_cnh: normalizedSecond.indexOf('pontos'),
    vencimento_cnh: normalizedSecond.indexOf('vencimento'),
    nao_uso_cinto_ajudante: normalizedSecond.indexOf('cinto nao utilizacao'),
    nao_uso_cinto_motorista: normalizedSecond.indexOf('cinto nao utilizacao'),
    nao_uso_cone: normalizedSecond.indexOf('cones falta'),
    nao_uso_epi: normalizedSecond.indexOf('luvas falta')
  };
}

function cleanColumnMap(map) {
  return Object.fromEntries(
    Object.entries(map || {}).filter(([, index]) => Number.isInteger(index) && index >= 0)
  );
}

function readCell(row, columnMap, field) {
  const index = columnMap[field];
  if (index === undefined) return '';
  return row[index];
}

function isDistributionProntuarioCargo(cargo) {
  const normalized = normalizeHeader(cargo);
  return normalized.includes('motorista') || normalized.includes('ajudante distribuicao');
}

function worksheetCell(worksheet, rowIndex, columnIndex) {
  return worksheet[xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

async function findColaborador(row, colaboradoresByCpf, colaboradoresByName) {
  const cpf = digits(row.cpf);
  if (cpf && colaboradoresByCpf.has(cpf)) {
    const matches = colaboradoresByCpf.get(cpf);
    if (matches.length === 1) return { colaborador: matches[0], conflict: false, method: 'cpf' };
    return { colaborador: null, conflict: true, method: 'cpf', count: matches.length };
  }

  const normalizedName = normalizeName(row.nome_condutor);
  if (normalizedName && colaboradoresByName.has(normalizedName)) {
    const matches = colaboradoresByName.get(normalizedName);
    if (matches.length === 1) return { colaborador: matches[0], conflict: false, method: 'nome' };
    return { colaborador: null, conflict: true, method: 'nome', count: matches.length };
  }

  return { colaborador: null, conflict: false, method: cpf ? 'cpf_nome' : 'nome' };
}

function addToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildPayload(rawRow, columnMap, worksheet, sheetRowIndex) {
  const rawFaixa = trim(readCell(rawRow, columnMap, 'faixa'));
  const explicitColor = normalizeCorFaixa(readCell(rawRow, columnMap, 'cor_faixa'));
  const faixaColor = normalizeCorFaixa(rawFaixa);
  const colorCell = columnMap.faixa !== undefined ? worksheetCell(worksheet, sheetRowIndex, columnMap.faixa) : null;
  const colorFromStyle = colorFromCell(colorCell);
  const corFaixa = explicitColor !== 'sem_faixa' ? explicitColor : colorFromStyle || faixaColor;
  const faixa = rawFaixa || {
    verde: 'Verde',
    amarelo: 'Amarela',
    vermelho: 'Vermelha',
    sem_faixa: 'Sem faixa'
  }[corFaixa] || '';

  const payload = {
    nome_condutor: trim(readCell(rawRow, columnMap, 'nome_condutor')),
    cpf: digits(readCell(rawRow, columnMap, 'cpf')),
    cargo: trim(readCell(rawRow, columnMap, 'cargo')),
    status_prontuario: trim(readCell(rawRow, columnMap, 'status_prontuario')),
    motivo: trim(readCell(rawRow, columnMap, 'motivo')),
    data_bloqueio: parseDate(readCell(rawRow, columnMap, 'data_bloqueio')),
    pontuacao_cnh: parseDecimal(readCell(rawRow, columnMap, 'pontuacao_cnh')),
    vencimento_cnh: parseDate(readCell(rawRow, columnMap, 'vencimento_cnh')),
    pontuacao_ponderada: parseDecimal(readCell(rawRow, columnMap, 'pontuacao_ponderada')),
    faixa,
    cor_faixa: corFaixa
  };

  for (const field of numberFields) {
    payload[field] = parseNumber(readCell(rawRow, columnMap, field));
  }

  for (const field of ['regiao_geo', 'atividade', 'empresa', 'operacao']) {
    payload[field] = trim(readCell(rawRow, columnMap, field));
  }

  return payload;
}

function applyNewExportDefaults(payload) {
  const score = Number(payload.pontuacao_ponderada);
  const needsFaixa = !payload.faixa || normalizeCorFaixa(payload.faixa) === 'sem_faixa';
  if (needsFaixa && Number.isFinite(score)) {
    if (score <= 10) {
      payload.faixa = 'Verde';
      payload.cor_faixa = 'verde';
    } else if (score <= 20) {
      payload.faixa = 'Amarela';
      payload.cor_faixa = 'amarelo';
    } else {
      payload.faixa = 'Vermelha';
      payload.cor_faixa = 'vermelho';
    }
  }

  if (!payload.status_prontuario) {
    payload.status_prontuario = Number.isFinite(score) && score > 20 ? 'Em atencao' : 'Liberado';
  }
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function createLogger(prefix = 'importacao_prontuario') {
  const logsDir = path.join(__dirname, '../logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${prefix}_${nowForFileName()}.txt`);
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
      return logPath;
    }
  };
}

async function assertTables() {
  await db.get('SELECT 1 FROM colaboradores LIMIT 1');
  await db.get('SELECT 1 FROM prontuarios_motoristas LIMIT 1');
}

async function upsertProntuario(colaborador, payload, dataImportacao) {
  const existing = await db.get(
    'SELECT id FROM prontuarios_motoristas WHERE colaborador_id = ?',
    [colaborador.id]
  );

  const row = {
    colaborador_id: colaborador.id,
    matricula: colaborador.matricula,
    nome_condutor: payload.nome_condutor || colaborador.nome_completo,
    cpf: payload.cpf || digits(colaborador.cpf),
    cargo: payload.cargo || colaborador.cargo,
    status_prontuario: payload.status_prontuario,
    motivo: payload.motivo,
    data_bloqueio: payload.data_bloqueio,
    pontuacao_cnh: payload.pontuacao_cnh,
    vencimento_cnh: payload.vencimento_cnh,
    pontuacao_ponderada: payload.pontuacao_ponderada,
    faixa: payload.faixa,
    cor_faixa: payload.cor_faixa || 'sem_faixa',
    ...Object.fromEntries(numberFields.map((field) => [field, payload[field] || 0])),
    regiao_geo: payload.regiao_geo,
    atividade: payload.atividade,
    empresa: payload.empresa,
    operacao: payload.operacao,
    data_importacao: dataImportacao
  };

  const placeholders = prontuarioColumns.map(() => '?').join(', ');
  const updates = prontuarioColumns
    .filter((column) => column !== 'colaborador_id')
    .map((column) => `${column} = excluded.${column}`)
    .concat(['updated_at = CURRENT_TIMESTAMP'])
    .join(', ');
  const values = prontuarioColumns.map((column) => row[column]);

  await db.run(
    `INSERT INTO prontuarios_motoristas (${prontuarioColumns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(colaborador_id) DO UPDATE SET ${updates}`,
    values
  );

  return existing ? 'updated' : 'created';
}

async function importWorkbook({ filePath, buffer, originalName, logger = createLogger() }) {
  const source = filePath || originalName || 'upload';
  const workbook = buffer
    ? xlsx.read(buffer, { type: 'buffer', cellStyles: true, cellDates: true })
    : xlsx.readFile(filePath, { cellStyles: true, cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
  const headerIndex = findHeaderRow(rows);
  const newExportColumnMap = buildExportColumnMap(rows, headerIndex);
  const columnMap = cleanColumnMap(newExportColumnMap || buildColumnMap(rows[headerIndex] || []));
  const dataImportacao = new Date().toISOString();
  const firstDataRowIndex = headerIndex + (newExportColumnMap ? 2 : 1);

  if (columnMap.nome_condutor === undefined) {
    throw new Error('Nao foi possivel identificar a coluna de nome/condutor.');
  }

  await assertTables();

  const colaboradores = await db.all('SELECT id, matricula, nome_completo, cpf, cargo FROM colaboradores');
  const colaboradoresByCpf = new Map();
  const colaboradoresByName = new Map();
  colaboradores.forEach((colaborador) => {
    addToMap(colaboradoresByCpf, digits(colaborador.cpf), colaborador);
    addToMap(colaboradoresByName, normalizeName(colaborador.nome_completo), colaborador);
  });

  const report = {
    totalRows: 0,
    created: 0,
    updated: 0,
    notFound: 0,
    conflicts: 0,
    errors: [],
    notFoundRows: [],
    conflictRows: [],
    colors: { verde: 0, amarelo: 0, vermelho: 0, sem_faixa: 0 }
  };

  for (let index = firstDataRowIndex; index < rows.length; index += 1) {
    const rawRow = rows[index];
    if (!rawRow.some((value) => trim(value) !== '')) continue;
    const payload = buildPayload(rawRow, columnMap, worksheet, index);
    if (newExportColumnMap) applyNewExportDefaults(payload);
    if (!payload.nome_condutor && !payload.cpf) continue;
    if (newExportColumnMap && !isDistributionProntuarioCargo(payload.cargo)) continue;

    report.totalRows += 1;
    try {
      const match = await findColaborador(payload, colaboradoresByCpf, colaboradoresByName);
      if (match.conflict) {
        report.conflicts += 1;
        report.conflictRows.push({ linha: index + 1, nome: payload.nome_condutor, cpf: payload.cpf, metodo: match.method, encontrados: match.count });
        continue;
      }
      if (!match.colaborador) {
        report.notFound += 1;
        report.notFoundRows.push({ linha: index + 1, nome: payload.nome_condutor, cpf: payload.cpf });
        continue;
      }

      const result = await upsertProntuario(match.colaborador, payload, dataImportacao);
      report[result] += 1;
      report.colors[payload.cor_faixa || 'sem_faixa'] += 1;
    } catch (error) {
      report.errors.push({ linha: index + 1, nome: payload.nome_condutor, cpf: payload.cpf, error: error.message });
    }
  }

  logger.log('Importacao de prontuario concluida.');
  logger.log(`Arquivo: ${source}`);
  logger.log(`Total de linhas lidas: ${report.totalRows}`);
  logger.log(`Importados novos: ${report.created}`);
  logger.log(`Atualizados: ${report.updated}`);
  logger.log(`Nao encontrados: ${report.notFound}`);
  logger.log(`Conflitos: ${report.conflicts}`);
  logger.log(`Erros: ${report.errors.length}`);
  logger.log(`Cores: verde=${report.colors.verde}, amarelo=${report.colors.amarelo}, vermelho=${report.colors.vermelho}, sem_faixa=${report.colors.sem_faixa}`);
  if (report.notFoundRows.length) logger.json('Nao encontrados', report.notFoundRows);
  if (report.conflictRows.length) logger.json('Conflitos', report.conflictRows);
  if (report.errors.length) logger.json('Erros', report.errors);
  report.logPath = logger.save();

  return report;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Defina a variavel no backend/.env.');
  }

  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  await importWorkbook({ filePath: inputPath });
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao de prontuario: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  normalizeCorFaixa,
  normalizeName
};
