require('../src/config/env');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../src/db');

const DEFAULT_FILE = path.join(__dirname, '../data/Rotograma atualizado Cdd Cascavel 2026.xlsx');

const DEFAULT_CHECKLIST = [
  'Realizar checklist do equipamento',
  'Nao iniciar viagem com anomalia',
  'Conferir EPIs',
  'Realizar giro 360',
  'Conferir condicoes do veiculo',
  'Seguir plano de viagem',
  'Acionar lideranca em risco iminente'
];

const DEFAULT_PHONES = [
  ['Policia Militar', '190'],
  ['Policia Rodoviaria Federal', '191'],
  ['Policia Rodoviaria Estadual', '198'],
  ['Corpo de Bombeiros', '193'],
  ['SAMU', '192']
];

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function compactRow(row) {
  return row.map(clean).filter(Boolean);
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function nowForFileName() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function createLogger() {
  const logsDir = path.join(__dirname, '../logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `importacao_rotograma_${nowForFileName()}.txt`);
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

function readRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const cells = Object.keys(sheet).filter((key) => key[0] !== '!');
  if (!cells.length) return [];

  const bounds = cells.reduce((acc, cell) => {
    const decoded = xlsx.utils.decode_cell(cell);
    return {
      minR: Math.min(acc.minR, decoded.r),
      minC: Math.min(acc.minC, decoded.c),
      maxR: Math.max(acc.maxR, decoded.r),
      maxC: Math.max(acc.maxC, decoded.c)
    };
  }, { minR: Infinity, minC: Infinity, maxR: 0, maxC: 0 });

  const range = xlsx.utils.encode_range({
    s: { r: bounds.minR, c: bounds.minC },
    e: { r: bounds.maxR, c: bounds.maxC }
  });

  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
    range
  });
}

function findValueAfterLabel(rows, labelRegex) {
  for (const row of rows.slice(0, 25)) {
    for (let index = 0; index < row.length; index += 1) {
      const value = clean(row[index]);
      if (!labelRegex.test(value)) continue;
      const inline = value.replace(labelRegex, '').trim();
      if (inline) return inline;
      for (let next = index + 1; next < Math.min(row.length, index + 5); next += 1) {
        const candidate = clean(row[next]);
        if (candidate) return candidate;
      }
    }
  }
  return '';
}

function inferNameFromSheet(sheetName, destino, rota) {
  const fromSheet = clean(sheetName)
    .replace(/one page/ig, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  return destino || fromSheet || rota || 'Rotograma';
}

function normalizeRisk(value) {
  const text = normalizeText(value);
  if (/alto|critico|cr[íi]tico/.test(text)) return 'Alto';
  if (/moderado|medio|m[eé]dio|atencao|aten[cç][aã]o/.test(text)) return 'Moderado';
  if (/baixo/.test(text)) return 'Baixo';
  return clean(value) || 'Sem classificacao';
}

function riskWeight(value) {
  const risk = normalizeRisk(value);
  if (risk === 'Alto') return 3;
  if (risk === 'Moderado') return 2;
  if (risk === 'Baixo') return 1;
  return 0;
}

function isRouteSheet(sheetName, rows) {
  const name = normalizeText(sheetName);
  if (/one page|rotograma|trechos|declives/.test(name)) return true;
  const sample = rows.slice(0, 15).flat().map(normalizeText).join(' ');
  return sample.includes('one pager') || sample.includes('mapeamento rota');
}

function rowLooksLikeRiskPoint(row) {
  const normalized = row.map(normalizeText);
  const tipoIndex = normalized.findIndex((value) => ['ponto', 'trecho'].includes(value));
  if (tipoIndex < 0) return -1;
  const near = normalized.slice(tipoIndex, tipoIndex + 4).join(' ');
  return /baixo|moderado|medio|alto|critico|atencao/.test(near) ? tipoIndex : -1;
}

function findCoordinate(values, start = 0) {
  for (let index = start; index < values.length; index += 1) {
    const value = clean(values[index]).replace(',', '.');
    if (/^-?\d{1,3}\.\d+/.test(value)) return { value, index };
  }
  return { value: '', index: -1 };
}

function extractRiskPoints(rows, sheetName, fallbackCity) {
  const points = [];
  let currentCity = fallbackCity;

  rows.forEach((row) => {
    const values = row.map(clean);
    const tipoIndex = rowLooksLikeRiskPoint(values);
    const first = values[0];
    if (first && Number.isNaN(Number(first)) && !['ponto', 'trecho'].includes(normalizeText(first))) {
      currentCity = first;
    }
    if (tipoIndex < 0) return;

    const cityCandidate = tipoIndex >= 2 && values[0] && Number.isNaN(Number(values[0])) ? values[0] : currentCity;
    const nivel = normalizeRisk(values[tipoIndex + 1]);
    const rodovia = values[tipoIndex + 2] || values[tipoIndex + 3] || '';
    const orientacao = values.slice(tipoIndex + 4, tipoIndex + 8).find((value) => value && !/^-?\d/.test(value)) || values[tipoIndex + 4] || '';
    const firstCoord = findCoordinate(values, tipoIndex + 4);
    const secondCoord = findCoordinate(values, firstCoord.index + 1);
    const speedValues = values.filter((value) => /\bkm\/?h?\b/i.test(value));

    points.push({
      tipo_ponto: values[tipoIndex],
      descricao: orientacao || `${values[tipoIndex]} ${values[tipoIndex - 1] || ''}`.trim(),
      nivel_risco: nivel,
      rodovia_endereco: rodovia,
      orientacao,
      latitude: firstCoord.value,
      longitude: secondCoord.value,
      velocidade_permitida: speedValues[0] || '',
      velocidade_segura: speedValues[1] || speedValues[0] || '',
      cidade: cityCandidate || fallbackCity,
      origem_aba: sheetName
    });
  });

  return points;
}

function extractPhones(rows) {
  const phones = [];
  const seen = new Set();

  for (const row of rows) {
    const values = compactRow(row);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const phone = values.slice(index, index + 4).find((item) => /\b(190|191|198|193|192)\b/.test(item));
      if (!phone) continue;
      if (!/policia|polícia|rodoviaria|rodoviária|bombeiro|samu|urgencia|urgência/i.test(values.slice(Math.max(0, index - 1), index + 2).join(' '))) continue;
      const orgao = value.match(/\b(190|191|198|193|192)\b/) ? values[index - 1] : value;
      const key = `${orgao}-${phone}`;
      if (!orgao || seen.has(key)) continue;
      seen.add(key);
      phones.push({ orgao, telefone: phone.match(/\b(190|191|198|193|192)\b/)?.[0] || phone, descricao: '' });
    }
  }

  DEFAULT_PHONES.forEach(([orgao, telefone]) => {
    const key = `${orgao}-${telefone}`;
    if (!seen.has(key)) {
      seen.add(key);
      phones.push({ orgao, telefone, descricao: 'Telefone padrao de emergencia' });
    }
  });

  return phones;
}

function extractChecklist(rows) {
  const items = new Set(DEFAULT_CHECKLIST);
  rows.flat().map(clean).forEach((value) => {
    if (/check-list|checklist|giro 360|anomalia|epi|viagem|lideranca|lideran[cç]a/i.test(value) && value.length > 12) {
      items.add(value);
    }
  });
  return [...items].slice(0, 20).map((item) => ({ item, categoria: 'Seguranca', obrigatorio: true }));
}

function extractPremissas(rows) {
  const premissas = [];
  let activeCategory = 'Condutor';

  rows.forEach((row) => {
    const values = compactRow(row);
    if (!values.length) return;
    const line = values.join(' ');
    if (/ve[ií]culo/i.test(line)) activeCategory = 'Veiculo';
    if (/motorista|condutor/i.test(line)) activeCategory = 'Condutor';
    if (/seguran[cç]a/i.test(line)) activeCategory = 'Seguranca';
    if (/emerg[eê]ncia|emergencia/i.test(line)) activeCategory = 'Emergencia';

    if (values.length >= 3 && !/^input$/i.test(values[0])) {
      premissas.push({
        categoria: activeCategory,
        titulo: values[0],
        descricao: values.slice(1, 4).join(' - ')
      });
    }
  });

  return premissas.filter((item) => item.titulo.length > 2 && item.descricao.length > 6).slice(0, 80);
}

function materialType(sheetName) {
  const text = normalizeText(sheetName);
  if (text.includes('lista vermelha')) return 'lista_vermelha';
  if (text.includes('rural')) return 'rural';
  if (text.includes('placas')) return 'placas';
  if (text.includes('plano')) return 'plano_viagem';
  if (text.includes('premissas')) return 'premissas';
  if (text.includes('simulador')) return 'rota_critica';
  return 'material';
}

function extractMaterial(sheetName, rows) {
  const lines = rows.map(compactRow).filter((row) => row.length);
  return {
    tipo: materialType(sheetName),
    titulo: clean(sheetName),
    descricao: lines.slice(0, 6).map((row) => row.join(' | ')).join('\n'),
    origem_aba: sheetName,
    dados_json: JSON.stringify(lines.slice(0, 120))
  };
}

async function resetTables() {
  await db.run('DELETE FROM rotograma_pontos_risco');
  await db.run('DELETE FROM rotograma_telefones');
  await db.run('DELETE FROM rotograma_checklist');
  await db.run('DELETE FROM rotograma_premissas');
  await db.run('DELETE FROM rotograma_materiais');
  await db.run('DELETE FROM rotogramas');
}

async function insertRows(table, columns, rows, chunkSize = 120) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const placeholders = chunk
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ');
    const params = chunk.flatMap((row) => columns.map((column) => row[column]));
    await db.run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
      params
    );
  }
}

async function insertRotograma(meta, points) {
  const maxRisk = points.reduce((acc, point) => riskWeight(point.nivel_risco) > riskWeight(acc) ? point.nivel_risco : acc, 'Sem classificacao');
  const result = await db.run(
    `INSERT INTO rotogramas (
      rotograma_id, nome, origem, destino, cidade, transportadora,
      classificacao_rota, nivel_risco, status, observacao, data_atualizacao
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meta.rotograma_id,
      meta.nome,
      meta.origem,
      meta.destino,
      meta.cidade,
      meta.transportadora,
      maxRisk,
      maxRisk,
      'ativo',
      meta.observacao,
      meta.data_atualizacao
    ]
  );
  return result.lastID;
}

async function importWorkbook({ filePath, buffer } = {}) {
  const resolvedPath = filePath ? path.resolve(filePath) : DEFAULT_FILE;
  const workbook = buffer ? xlsx.read(buffer, { type: 'buffer' }) : xlsx.readFile(resolvedPath);
  const report = {
    arquivo: buffer ? 'upload' : resolvedPath,
    total_abas: workbook.SheetNames.length,
    abas_importadas: [],
    abas_ignoradas: [],
    rotogramas_importados: 0,
    pontos_risco_importados: 0,
    telefones_importados: 0,
    checklists_importados: 0,
    premissas_importadas: 0,
    materiais_importados: 0,
    erros: []
  };

  await resetTables();

  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const rows = readRows(workbook, sheetName);
    try {
      if (/premissas/i.test(sheetName)) {
        const premissas = extractPremissas(rows);
        await insertRows('rotograma_premissas', ['categoria', 'titulo', 'descricao'], premissas);
        report.premissas_importadas += premissas.length;
        report.abas_importadas.push(sheetName);
        continue;
      }

      if (!isRouteSheet(sheetName, rows)) {
        const material = extractMaterial(sheetName, rows);
        if (material.descricao) {
          await db.run(
            'INSERT INTO rotograma_materiais (tipo, titulo, descricao, origem_aba, dados_json) VALUES (?, ?, ?, ?, ?)',
            [material.tipo, material.titulo, material.descricao, material.origem_aba, material.dados_json]
          );
          report.materiais_importados += 1;
          report.abas_importadas.push(sheetName);
        } else {
          report.abas_ignoradas.push(sheetName);
        }
        continue;
      }

      const origem = findValueAfterLabel(rows, /^origem:?\s*/i) || 'CDD Cascavel';
      const destino = findValueAfterLabel(rows, /^destino:?\s*/i);
      const rota = findValueAfterLabel(rows, /^rota:?\s*/i);
      const transportadora = findValueAfterLabel(rows, /^transportadora:?\s*/i);
      const dataAtualizacao = findValueAfterLabel(rows, /^data:?\s*/i);
      const cidade = inferNameFromSheet(sheetName, destino, rota);
      const points = extractRiskPoints(rows, sheetName, cidade);

      if (!points.length && !/one page|rotograma pontos|trechos|declives/i.test(sheetName)) {
        report.abas_ignoradas.push(sheetName);
        continue;
      }

      const meta = {
        rotograma_id: slug(`${sheetIndex + 1}-${sheetName}-${cidade}`),
        nome: cidade,
        origem,
        destino: destino || cidade,
        cidade,
        transportadora,
        observacao: `Importado da aba ${sheetName}`,
        data_atualizacao: dataAtualizacao
      };
      const rotogramaId = await insertRotograma(meta, points);
      report.rotogramas_importados += 1;

      await insertRows(
        'rotograma_pontos_risco',
        [
          'rotograma_id',
          'tipo_ponto',
          'descricao',
          'nivel_risco',
          'rodovia_endereco',
          'orientacao',
          'latitude',
          'longitude',
          'velocidade_permitida',
          'velocidade_segura',
          'cidade',
          'origem_aba'
        ],
        points.map((point) => ({ ...point, rotograma_id: rotogramaId }))
      );
      report.pontos_risco_importados += points.length;

      const phones = extractPhones(rows);
      await insertRows(
        'rotograma_telefones',
        ['rotograma_id', 'orgao', 'telefone', 'descricao'],
        phones.map((phone) => ({ ...phone, rotograma_id: rotogramaId }))
      );
      report.telefones_importados += phones.length;

      const checklist = extractChecklist(rows);
      await insertRows(
        'rotograma_checklist',
        ['rotograma_id', 'item', 'categoria', 'obrigatorio'],
        checklist.map((item) => ({ ...item, rotograma_id: rotogramaId }))
      );
      report.checklists_importados += checklist.length;
      report.abas_importadas.push(sheetName);
    } catch (error) {
      report.abas_ignoradas.push(sheetName);
      report.erros.push({ aba: sheetName, erro: error.message });
    }
  }

  await db.run(
    `INSERT INTO rotograma_importacoes (
      arquivo, total_abas, abas_importadas, abas_ignoradas, rotogramas_importados,
      pontos_risco_importados, telefones_importados, checklists_importados,
      premissas_importadas, detalhes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.arquivo,
      report.total_abas,
      report.abas_importadas.length,
      report.abas_ignoradas.length,
      report.rotogramas_importados,
      report.pontos_risco_importados,
      report.telefones_importados,
      report.checklists_importados,
      report.premissas_importadas,
      JSON.stringify(report)
    ]
  );

  return report;
}

async function main() {
  const logger = createLogger();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_FILE);
  const report = await importWorkbook({ filePath: inputPath });

  logger.log('Importacao Rotograma Seguro concluida.');
  logger.log(`Arquivo: ${inputPath}`);
  logger.log(`Total de abas: ${report.total_abas}`);
  logger.log(`Abas importadas: ${report.abas_importadas.length}`);
  logger.log(`Abas ignoradas: ${report.abas_ignoradas.length}`);
  logger.log(`Rotogramas importados: ${report.rotogramas_importados}`);
  logger.log(`Pontos de risco importados: ${report.pontos_risco_importados}`);
  logger.log(`Telefones importados: ${report.telefones_importados}`);
  logger.log(`Checklists importados: ${report.checklists_importados}`);
  logger.log(`Premissas importadas: ${report.premissas_importadas}`);
  logger.log(`Materiais importados: ${report.materiais_importados}`);
  logger.json('Abas ignoradas', report.abas_ignoradas);
  if (report.erros.length) logger.json('Erros', report.erros);
  logger.save();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao de rotograma: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importWorkbook,
  normalizeRisk
};
