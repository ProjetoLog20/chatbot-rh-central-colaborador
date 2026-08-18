const path = require('path');
const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');

const MAX_ROWS = 20_000;
const DURATION_TOKEN = '(?:-?\\d{1,4}:\\d{2}|\\(\\d{1,4}:\\d{2}\\))';

function decodeHtmlEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (named[lower] !== undefined) return named[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return match;
  });
}

function cleanText(value) {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlText(value) {
  return cleanText(
    String(value || '')
      .replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function durationToMinutes(value, { allowBlank = false } = {}) {
  let input = cleanText(value);
  if (!input && allowBlank) return null;
  if (!input) throw new Error('Duração vazia no relatório.');

  let sign = 1;
  if (/^\(.+\)$/.test(input)) {
    sign = -1;
    input = input.slice(1, -1).trim();
  }
  if (input.startsWith('-')) {
    sign = -1;
    input = input.slice(1);
  } else if (input.startsWith('+')) {
    input = input.slice(1);
  }

  const match = input.match(/^(\d{1,4}):([0-5]\d)$/);
  if (!match) throw new Error(`Duração inválida no relatório: ${cleanText(value) || '(vazia)'}`);
  return sign * (Number(match[1]) * 60 + Number(match[2]));
}

function optionalDuration(value, fallback = 0) {
  const input = cleanText(value);
  return input ? durationToMinutes(input) : fallback;
}

function minutesToDuration(value) {
  const minutes = Number(value || 0);
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function parseBrDate(value) {
  const match = cleanText(value).match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function parsePeriod(value) {
  const input = cleanText(value);
  const explicit = input.match(/Per[ií]odo\s*:\s*(?:Per[ií]odo\s*:\s*)?(\d{2}\/\d{2}\/\d{4})\s*(?:at[eé]|a)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (explicit) {
    return { inicio: parseBrDate(explicit[1]), fim: parseBrDate(explicit[2]) };
  }
  const dates = [...input.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)]
    .map((item) => parseBrDate(item[0]))
    .filter(Boolean);
  if (dates.length < 2) return { inicio: null, fim: null };
  return { inicio: dates[0], fim: dates[1] };
}

function extractRows(tableHtml) {
  const rows = [];
  for (const rowMatch of String(tableHtml || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(htmlText(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function validateBalance(balance) {
  const periodoCalculado = balance.credito_min - balance.debito_min;
  const atualCalculado = balance.saldo_anterior_min + balance.saldo_periodo_min;
  return {
    periodo_ok: periodoCalculado === balance.saldo_periodo_min,
    atual_ok: atualCalculado === balance.saldo_atual_min,
    saldo_periodo_calculado_min: periodoCalculado,
    saldo_atual_calculado_min: atualCalculado
  };
}

function makeBalance({ sourceRow, matricula, nome, estrutura, anterior, debito, credito, periodo, atual }) {
  const balance = {
    linha_origem: sourceRow,
    matricula_kairos: cleanText(matricula),
    nome_kairos: cleanText(nome),
    nome_kairos_normalizado: normalizeText(nome),
    estrutura_kairos: cleanText(estrutura),
    saldo_anterior_min: durationToMinutes(anterior),
    debito_min: durationToMinutes(debito),
    credito_min: durationToMinutes(credito),
    saldo_periodo_min: durationToMinutes(periodo),
    saldo_atual_min: durationToMinutes(atual)
  };
  balance.validacao = validateBalance(balance);
  balance.dados_originais = {
    matricula: cleanText(matricula),
    nome: cleanText(nome),
    estrutura: cleanText(estrutura),
    saldo_anterior: cleanText(anterior),
    debito: cleanText(debito),
    credito: cleanText(credito),
    saldo_periodo: cleanText(periodo),
    saldo_atual: cleanText(atual)
  };
  return balance;
}

function summaryWarnings(balances) {
  const invalid = balances.filter((row) => !row.validacao.periodo_ok || !row.validacao.atual_ok);
  return invalid.length
    ? [`${invalid.length} saldo(s) não fecham com as fórmulas do relatório.`]
    : [];
}

function parseSummaryHtml(html) {
  const allText = htmlText(html);
  const periodo = parsePeriod(allText);
  const balances = [];

  for (const cells of extractRows(html)) {
    if (cells.length < 8 || !/^\d{2,}$/.test(cells[0])) continue;
    const lastFive = cells.slice(-5);
    if (!lastFive.every((value) => new RegExp(`^${DURATION_TOKEN}$`).test(value))) continue;
    balances.push(makeBalance({
      sourceRow: balances.length + 1,
      matricula: cells[0],
      nome: cells[1],
      estrutura: cells[2],
      anterior: lastFive[0],
      debito: lastFive[1],
      credito: lastFive[2],
      periodo: lastFive[3],
      atual: lastFive[4]
    }));
  }

  if (!balances.length) throw new Error('O relatório resumido não contém linhas de colaboradores reconhecíveis.');
  if (balances.length > MAX_ROWS) throw new Error('O relatório excede o limite de linhas permitido.');

  return {
    tipo_relatorio: 'resumido',
    periodo_inicio: periodo.inicio,
    periodo_fim: periodo.fim,
    saldos: balances,
    dias: [],
    avisos: [
      ...summaryWarnings(balances),
      'Este relatório alimenta os saldos. Para classificar folgas e faltas, importe também o relatório detalhado de ponto.'
    ]
  };
}

function splitNameAndStructure(value, structures) {
  const input = cleanText(value);
  const ordered = [...new Set(structures.map(cleanText).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const normalizedInput = normalizeText(input);
  for (const structure of ordered) {
    const normalizedStructure = normalizeText(structure);
    if (!normalizedInput.endsWith(normalizedStructure)) continue;
    const words = input.split(/\s+/);
    const structureWords = structure.split(/\s+/).length;
    return {
      nome: words.slice(0, Math.max(0, words.length - structureWords)).join(' '),
      estrutura: structure
    };
  }
  return { nome: input, estrutura: '' };
}

function parseSummaryText(text) {
  const lines = String(text || '').split(/\r?\n/).map(cleanText).filter(Boolean);
  const structures = lines
    .map((line) => line.match(/^Estrutura Organizacional:\s*(.+)$/i)?.[1])
    .filter(Boolean);
  const periodo = parsePeriod(lines.join(' '));
  const balances = [];
  const rowPattern = new RegExp(`^(\\d{2,})\\s+(.+?)\\s+(${DURATION_TOKEN})\\s+(${DURATION_TOKEN})\\s+(${DURATION_TOKEN})\\s+(${DURATION_TOKEN})\\s+(${DURATION_TOKEN})$`);

  for (const line of lines) {
    const match = line.match(rowPattern);
    if (!match) continue;
    const identity = splitNameAndStructure(match[2], structures);
    if (!identity.nome) continue;
    balances.push(makeBalance({
      sourceRow: balances.length + 1,
      matricula: match[1],
      nome: identity.nome,
      estrutura: identity.estrutura,
      anterior: match[3],
      debito: match[4],
      credito: match[5],
      periodo: match[6],
      atual: match[7]
    }));
  }

  if (!balances.length) throw new Error('O PDF não contém a tabela esperada do Banco de Horas Resumido.');
  if (balances.length > MAX_ROWS) throw new Error('O relatório excede o limite de linhas permitido.');

  return {
    tipo_relatorio: 'resumido',
    periodo_inicio: periodo.inicio,
    periodo_fim: periodo.fim,
    saldos: balances,
    dias: [],
    avisos: [
      ...summaryWarnings(balances),
      'Este PDF alimenta os saldos. Para classificar folgas e faltas, importe também o relatório detalhado de ponto.'
    ]
  };
}

function boundValue(section, binding) {
  const pattern = new RegExp(`data-bind=['"]text:\\s*${binding}['"][^>]*>([\\s\\S]*?)<\\/span>`, 'i');
  return htmlText(section.match(pattern)?.[1] || '');
}

function balanceValuesFromSection(section) {
  const row = section.match(/<tr\b[^>]*data-bind=['"]with:\s*BancoHorasSaldo[^>]*>([\s\S]*?)<\/tr>/i);
  if (!row) return null;
  const cells = extractRows(`<table><tr>${row[1]}</tr></table>`)[0] || [];
  const valueAfter = (label) => {
    const index = cells.findIndex((cell) => normalizeText(cell) === normalizeText(label));
    return index >= 0 ? cells[index + 1] : '';
  };
  const anterior = valueAfter('Saldo Anterior:');
  const periodo = valueAfter('Saldo Período:');
  const atual = valueAfter('Saldo Atual:');
  return anterior && periodo && atual ? { anterior, periodo, atual } : null;
}

function isPointExemptRole(cargo) {
  const normalized = normalizeText(cargo);
  return normalized.includes('supervisor') || normalized.includes('coordenador');
}

function classifyDay({ punches, justification, cargo }) {
  if (punches.length % 2 === 1) return 'incompleta';
  if (punches.length > 0) return 'trabalhado';
  if (isPointExemptRole(cargo)) return 'nao_aplicavel';
  return 'pendente';
}

function parseDetailedHtml(html) {
  const chunks = String(html || '')
    .split(/(?=<div\b(?=[^>]*class=['"][^'"]*infosCabecalho)(?=[^>]*data-bind=['"]with:\s*InfoFuncionario['"])[^>]*>)/i)
    .slice(1);
  const saldos = [];
  const dias = [];
  let sourceDay = 0;

  for (const chunk of chunks) {
    const headerEnd = chunk.search(/<table\b[^>]*class=['"][^'"]*tbl_ponto/i);
    const header = headerEnd >= 0 ? chunk.slice(0, headerEnd) : chunk;
    const nome = boundValue(header, 'Nome');
    const matricula = boundValue(header, 'Matricula');
    const cargo = boundValue(header, 'Cargo');
    const estrutura = boundValue(header, 'Estrutura');
    if (!nome) continue;

    const employeeDays = [];
    const entries = chunk.match(/<tbody\b[^>]*data-bind=['"]foreach:\s*Entradas['"][^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '';
    for (const cells of extractRows(entries)) {
      if (cells.length < 12) continue;
      const date = parseBrDate(cells[0]);
      if (!date) continue;
      const punches = cells[2].match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || [];
      const classification = classifyDay({ punches, justification: cells[11], cargo });
      sourceDay += 1;
      const day = {
        linha_origem: sourceDay,
        matricula_kairos: matricula,
        nome_kairos: nome,
        nome_kairos_normalizado: normalizeText(nome),
        cargo_kairos: cargo,
        estrutura_kairos: estrutura,
        data: date,
        horario_previsto: cells[1],
        batidas: punches,
        horas_trabalhadas_min: optionalDuration(cells[3], null),
        debito_min: optionalDuration(cells[9], 0),
        credito_min: optionalDuration(cells[10], 0),
        justificativa_kairos: cells[11],
        classificacao_original: classification,
        classificacao: classification,
        dados_originais: {
          data: cells[0],
          horario: cells[1],
          apontamentos: cells[2],
          horas_trabalhadas: cells[3],
          debito: cells[9],
          credito: cells[10],
          justificativa: cells[11]
        }
      };
      dias.push(day);
      employeeDays.push(day);
    }

    const balanceValues = balanceValuesFromSection(chunk);
    if (balanceValues) {
      const summedDebit = employeeDays.reduce((sum, item) => sum + item.debito_min, 0);
      const summedCredit = employeeDays.reduce((sum, item) => sum + item.credito_min, 0);
      const periodMinutes = durationToMinutes(balanceValues.periodo);
      const hasDailyMovement = summedDebit !== 0 || summedCredit !== 0;
      const debit = hasDailyMovement ? summedDebit : Math.max(0, -periodMinutes);
      const credit = hasDailyMovement ? summedCredit : Math.max(0, periodMinutes);
      saldos.push(makeBalance({
        sourceRow: saldos.length + 1,
        matricula,
        nome,
        estrutura,
        anterior: balanceValues.anterior,
        debito: minutesToDuration(debit),
        credito: minutesToDuration(credit),
        periodo: balanceValues.periodo,
        atual: balanceValues.atual
      }));
    }
  }

  if (!dias.length) throw new Error('O relatório detalhado não contém datas diárias reconhecíveis.');
  if (dias.length + saldos.length > MAX_ROWS) throw new Error('O relatório excede o limite de linhas permitido.');
  const dates = dias.map((item) => item.data).sort();
  const uniqueDates = new Set(dates);
  const avisos = summaryWarnings(saldos);
  if (uniqueDates.size === 1) {
    avisos.push('O arquivo contém somente um dia; o calendário receberá apenas essa data.');
  }

  return {
    tipo_relatorio: 'detalhado',
    periodo_inicio: dates[0],
    periodo_fim: dates[dates.length - 1],
    saldos,
    dias,
    avisos
  };
}

function normalizedHeader(value) {
  return normalizeText(value).replace(/ do periodo$/, ' periodo');
}

function parseBinaryWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  } catch {
    throw new Error('Não foi possível ler o arquivo Excel enviado.');
  }

  const saldos = [];
  const allValues = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    rows.forEach((row) => allValues.push(...row.map(cleanText)));
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(normalizedHeader);
      return headers.includes('matricula') && headers.includes('nome') && headers.includes('saldo atual');
    });
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map(normalizedHeader);
    const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
    const indexes = {
      matricula: indexOf('matricula'),
      nome: indexOf('nome'),
      estrutura: indexOf('estrutura organizacional', 'estrutura'),
      anterior: indexOf('saldo anterior'),
      debito: indexOf('debito'),
      credito: indexOf('credito'),
      periodo: indexOf('saldo periodo', 'saldo do periodo'),
      atual: indexOf('saldo atual')
    };
    if (Object.values(indexes).some((index) => index < 0)) continue;
    for (const row of rows.slice(headerIndex + 1)) {
      const matricula = cleanText(row[indexes.matricula]);
      if (!/^\d{2,}$/.test(matricula)) continue;
      saldos.push(makeBalance({
        sourceRow: saldos.length + 1,
        matricula,
        nome: row[indexes.nome],
        estrutura: row[indexes.estrutura],
        anterior: row[indexes.anterior],
        debito: row[indexes.debito],
        credito: row[indexes.credito],
        periodo: row[indexes.periodo],
        atual: row[indexes.atual]
      }));
    }
  }
  if (!saldos.length) {
    throw new Error('A planilha não contém o formato reconhecido do Banco de Horas Resumido do Kairos.');
  }
  const periodo = parsePeriod(allValues.join(' '));
  return {
    tipo_relatorio: 'resumido',
    periodo_inicio: periodo.inicio,
    periodo_fim: periodo.fim,
    saldos,
    dias: [],
    avisos: [
      ...summaryWarnings(saldos),
      'Esta planilha alimenta os saldos. Para classificar folgas e faltas, importe também o relatório detalhado de ponto.'
    ]
  };
}

function detectContent(buffer) {
  const firstBytes = buffer.subarray(0, 8);
  if (firstBytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  const prefix = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^<(?:!doctype\s+html|html)\b/i.test(prefix)) return 'html';
  if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4b) return 'xlsx';
  if (firstBytes.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'xls';
  throw new Error('Formato não reconhecido. Envie um PDF, XLS ou XLSX gerado pelo Kairos.');
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return cleanText(result?.text).length ? result.text : '';
  } finally {
    await parser.destroy();
  }
}

async function parseBancoHorasFile({ buffer, filename = '' }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('O arquivo está vazio.');
  const content = detectContent(buffer);
  const extension = path.extname(filename).toLowerCase().replace('.', '');
  let parsed;
  let formato;

  if (content === 'pdf') {
    const text = await extractPdfText(buffer);
    if (!text) throw new Error('O PDF não possui uma camada de texto legível. Exporte novamente pelo Kairos.');
    if (!/Banco de Horas Resumido/i.test(text)) {
      throw new Error('Neste MVP, PDFs devem ser do relatório Banco de Horas Resumido. Para o calendário, use o XLS detalhado.');
    }
    parsed = parseSummaryText(text);
    formato = 'pdf';
  } else if (content === 'html') {
    const html = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (/Relat[oó]rio Banco de Horas Resumido/i.test(html)) parsed = parseSummaryHtml(html);
    else if (/Relat[oó]rio de Ponto do Funcion[aá]rio/i.test(html)) parsed = parseDetailedHtml(html);
    else throw new Error('O arquivo não corresponde a um relatório de Banco de Horas ou Ponto do Funcionário do Kairos.');
    formato = extension === 'xlsx' ? 'xlsx' : 'xls';
  } else {
    parsed = parseBinaryWorkbook(buffer);
    formato = content;
  }

  if (!parsed.periodo_inicio || !parsed.periodo_fim) {
    parsed.avisos.push('O período não pôde ser identificado automaticamente e deverá ser conferido antes da publicação.');
  }
  return { ...parsed, formato };
}

module.exports = {
  classifyDay,
  detectContent,
  durationToMinutes,
  isPointExemptRole,
  minutesToDuration,
  normalizeText,
  parseBancoHorasFile,
  parseDetailedHtml,
  parseSummaryHtml,
  parseSummaryText,
  validateBalance
};
