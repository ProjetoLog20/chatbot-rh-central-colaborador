require('../src/config/env');

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const db = require('../src/db');

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

function trim(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(trim(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
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

function monthYearFromCompetencia(competencia) {
  const match = trim(competencia).match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return trim(competencia);
  return `${match[2]}-${match[1].padStart(2, '0')}`;
}

function officialPeriodForCompetencia(competencia) {
  const match = trim(competencia).match(/^(\d{1,2})\/(\d{4})$/);
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
  if (text.includes('fitilho')) return 'Colocar fitilho';
  if (text.includes('amarracao')) return 'Amarração';
  if (text.includes('descarregar') || text.includes('descarga') || text.includes('desamarrar')) return 'Descarga';
  if (text.includes('chop') || text.includes('chopp')) return 'Separar Chopp';
  if (text.includes('carregamento') && text.includes('van')) return 'Carregamento Van';
  if (text.includes('carregamento')) return 'Carregamento Van';
  return 'Demais Atividades';
}

function readCsv(file) {
  const content = fs.readFileSync(file, 'utf8');
  return parse(content, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
    bom: true
  }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value])));
}

function readTaskValues(file) {
  if (!file) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = Array.isArray(raw)
    ? raw.map((item) => [item.task_name || item.atividade || item.name, item.value ?? item.valor])
    : Object.entries(raw);
  return Object.fromEntries(entries.map(([key, value]) => [normalizeName(canonicalActivity(key)), numberValue(value)]));
}

function buildRows(csvRows, options) {
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

  const competencia = options.competencia || (validRows[0] ? competenciaFromDate(validRows[0].date) : null);
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

  return { competencia, period, rows, missingValues: [...missingValues].sort(), validRows };
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
  const exact = await db.get('SELECT * FROM colaboradores WHERE LOWER(nome_completo) = LOWER(?)', [row.nome_completo]);
  if (exact) return exact;
  const all = await db.all('SELECT * FROM colaboradores');
  return all.find((colaborador) => normalizeName(colaborador.nome_completo) === normalizeName(row.nome_completo)) || null;
}

async function createColaborador(row) {
  const senhaHash = await bcrypt.hash('123456', 10);
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

async function createImportRecord(file, rows, context) {
  const total = rows.reduce((sum, row) => sum + row.valor_total_previsto, 0);
  const result = await db.run(
    `INSERT INTO produtividade_armazem_importacoes (
      arquivo, competencia, periodo_inicio, periodo_fim, total_linhas,
      valor_total_previsto, valor_total_rv_nova, detalhes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      path.basename(file),
      context.competencia,
      context.period.inicio,
      context.period.fim,
      rows.length,
      Number(total.toFixed(2)),
      Number(total.toFixed(2)),
      JSON.stringify({ origem: 'on_demand_csv', missing_values: context.missingValues })
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
  const report = {
    file,
    competencia: context.competencia,
    periodo: context.period,
    linhasCsv: csvRows.length,
    linhasValidasPeriodo: context.validRows.length,
    colaboradoresNoCsv: context.rows.length,
    missingValues: context.missingValues,
    createdCollaborators: 0,
    created: 0,
    updated: 0,
    ignored: 0,
    notFound: [],
    dryRun: Boolean(options.dryRun)
  };

  if (context.missingValues.length && !options.allowMissingValues && !options.dryRun) {
    throw new Error(`Faltam valores para atividades: ${context.missingValues.join(', ')}. Informe --task-values ou use --allow-missing-values.`);
  }

  if (options.dryRun) {
    report.preview = context.rows.map((row) => ({
      nome_completo: row.nome_completo,
      pontos: row.pontos,
      valor_total_previsto: row.valor_total_previsto,
      indicador_1: row.indicador_1,
      indicador_2: row.indicador_2,
      indicador_3: row.indicador_3
    }));
    return report;
  }

  await ensureArmazemTables();
  report.backupPath = await backupSqlite();
  const importacaoId = await createImportRecord(file, context.rows, context);
  report.importacaoId = importacaoId;

  for (const row of context.rows) {
    let colaborador = await findColaborador(row);
    if (!colaborador && options.createMissing) {
      colaborador = await createColaborador(row);
      report.createdCollaborators += 1;
    }
    if (!colaborador) {
      report.ignored += 1;
      report.notFound.push(row.nome_completo);
      continue;
    }
    const result = await upsertArmazem(row, colaborador, importacaoId);
    if (result === 'created') report.created += 1;
    if (result === 'updated') report.updated += 1;
  }

  await db.run(
    `UPDATE produtividade_armazem_importacoes
     SET importados = ?, atualizados = ?, ignorados = ?, detalhes_json = ?
     WHERE id = ?`,
    [
      report.created,
      report.updated,
      report.ignored,
      JSON.stringify({ origem: 'on_demand_csv', missing_values: report.missingValues, not_found: report.notFound }),
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
  if (!args.file) throw new Error('Uso: npm run import:ondemand -- --file caminho.csv --competencia MM/AAAA [--task-values valores.json] [--create-missing] [--activate-module] [--dry-run]');
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
  canonicalActivity,
  officialPeriodForCompetencia
};
