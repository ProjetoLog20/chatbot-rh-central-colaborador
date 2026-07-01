require('../src/config/env');

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../src/db');

const LOW_CONFIDENCE_LIMIT = 0.7;

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
  const args = { createMissing: false, activateModule: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--create-missing') args.createMissing = true;
    else if (arg === '--activate-module') args.activateModule = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--competencia') args.competencia = argv[++index];
    else if (arg === '--file') args.file = argv[++index];
    else if (!args.file) args.file = arg;
  }
  return args;
}

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function trim(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = trim(value).replace(/\s/g, '').replace(/R\$/gi, '').replace(/%/g, '');
  if (!text) return 0;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = trim(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return null;
}

function competenciaFromMonthYear(monthYear) {
  const text = trim(monthYear);
  const match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return `${match[2].padStart(2, '0')}/${match[1]}`;
  if (/^\d{1,2}\/\d{4}$/.test(text)) {
    const [month, year] = text.split('/');
    return `${month.padStart(2, '0')}/${year}`;
  }
  return text;
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

function businessDays(start, end) {
  const days = [];
  const current = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (current <= last) {
    const weekday = current.getDay();
    if (weekday !== 0 && weekday !== 6) days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function arrayFrom(input, names) {
  for (const name of names) {
    const value = name.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), input);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeDump(raw) {
  const input = Array.isArray(raw) ? { records: raw } : raw;
  return {
    employees: arrayFrom(input, ['Employee', 'Employees', 'employees', 'entities.Employee', 'data.Employee']),
    taskRecords: arrayFrom(input, ['TaskRecord', 'TaskRecords', 'taskRecords', 'task_records', 'entities.TaskRecord', 'data.TaskRecord']),
    taskConfigs: arrayFrom(input, ['TaskConfig', 'TaskConfigs', 'taskConfigs', 'task_configs', 'entities.TaskConfig', 'data.TaskConfig']),
    indicatorConfigs: arrayFrom(input, ['IndicatorConfig', 'IndicatorConfigs', 'indicatorConfigs', 'indicator_configs', 'entities.IndicatorConfig', 'data.IndicatorConfig']),
    dailyIndicators: arrayFrom(input, ['DailyIndicator', 'DailyIndicators', 'dailyIndicators', 'daily_indicators', 'entities.DailyIndicator', 'data.DailyIndicator']),
    monthlyIndicators: arrayFrom(input, ['MonthlyIndicator', 'MonthlyIndicators', 'monthlyIndicators', 'monthly_indicators', 'entities.MonthlyIndicator', 'data.MonthlyIndicator'])
  };
}

function employeeName(employee) {
  return trim(employee.name || employee.nome || employee.nome_completo || employee.employee_name);
}

function employeeMatricula(employee) {
  return trim(employee.matricula || employee.registration || employee.employee_code || employee.codigo || employee.code);
}

function employeeShift(employee) {
  return trim(employee.shift || employee.turno || employee.team || employee.equipe);
}

function employeeRole(employee) {
  return trim(employee.role || employee.funcao || employee.cargo || employee.position);
}

function mapArmazemRole(employee) {
  const role = normalizeName(employeeRole(employee));
  const shift = normalizeName(employeeShift(employee));
  if (role.includes('operador') || shift.includes('operador')) return 'Operador de Empilhadeira';
  if (role.includes('amarrador') || role.includes('amarracao')) return 'Amarrador';
  return 'Ajudante';
}

function taskName(record) {
  return trim(record.task_type || record.task_name || record.tarefa || record.name);
}

function taskEmployeeKey(record) {
  return trim(record.employee_id || record.employeeId || record.colaborador_id || record.employee_name || record.nome_colaborador);
}

function taskEmployeeName(record) {
  return trim(record.employee_name || record.nome_colaborador || record.name);
}

function recordDate(record) {
  return dateOnly(record.task_date || record.date || record.data);
}

function configTaskName(config) {
  return trim(config.task_name || config.name || config.tarefa);
}

function indicatorType(config) {
  return trim(config.indicator_type || config.indicator_name || config.name || config.indicador);
}

function indicatorShift(record) {
  return trim(record.shift || record.turno || record.team);
}

function calculateRows(dump, competencia) {
  const period = officialPeriodForCompetencia(competencia);
  if (!period.inicio || !period.fim) throw new Error(`Competencia invalida: ${competencia}. Use MM/AAAA.`);

  const monthYear = monthYearFromCompetencia(competencia);
  const businessDayCount = Math.max(businessDays(period.inicio, period.fim).length, 1);
  const taskConfigByName = new Map(dump.taskConfigs.map((config) => [normalizeName(configTaskName(config)), config]));
  const dailyByShiftIndicator = new Map();

  for (const indicator of dump.dailyIndicators) {
    const date = dateOnly(indicator.date || indicator.data);
    if (!date || date < period.inicio || date > period.fim) continue;
    if (indicator.achieved === false || indicator.achieved === 0 || indicator.achieved === 'false') continue;
    const key = `${normalizeName(indicatorShift(indicator))}|${normalizeName(indicatorType(indicator))}`;
    dailyByShiftIndicator.set(key, (dailyByShiftIndicator.get(key) || 0) + 1);
  }

  const tasksByEmployee = new Map();
  for (const record of dump.taskRecords) {
    const date = recordDate(record);
    if (!date || date < period.inicio || date > period.fim) continue;
    const key = normalizeName(taskEmployeeKey(record));
    if (!key) continue;
    const name = taskEmployeeName(record);
    const task = taskName(record);
    const config = taskConfigByName.get(normalizeName(task));
    const quantity = numberValue(record.quantity ?? record.quantidade ?? record.observacao ?? 1) || 1;
    const unitValue = numberValue(config?.value ?? config?.valor ?? config?.unit_value);
    const totalValue = numberValue(record.total_value ?? record.valor_total) || quantity * unitValue;
    const bucket = tasksByEmployee.get(key) || { employeeName: name, total: 0, quantity: 0, errors: 0, tasks: new Map() };
    bucket.total += totalValue;
    bucket.quantity += quantity;
    bucket.errors += numberValue(record.errors ?? record.erros);
    bucket.tasks.set(task || 'Tarefa', (bucket.tasks.get(task || 'Tarefa') || 0) + totalValue);
    tasksByEmployee.set(key, bucket);
  }

  return dump.employees
    .filter((employee) => {
      const status = normalizeName(employee.status || employee.situacao);
      return !status || status === 'ativo' || status === 'active';
    })
    .map((employee, index) => {
      const name = employeeName(employee);
      const keys = [
        normalizeName(employee.id),
        normalizeName(employeeMatricula(employee)),
        normalizeName(name)
      ].filter(Boolean);
      const tasks = keys.map((key) => tasksByEmployee.get(key)).find(Boolean) || { total: 0, quantity: 0, errors: 0, tasks: new Map() };
      const shift = employeeShift(employee);
      const indicators = dump.indicatorConfigs
        .filter((config) => normalizeName(indicatorShift(config)) === normalizeName(shift))
        .map((config) => {
          const type = indicatorType(config);
          const achievedDays = dailyByShiftIndicator.get(`${normalizeName(shift)}|${normalizeName(type)}`) || 0;
          const monthlyValue = numberValue(config.monthly_value ?? config.valor_mensal ?? config.value);
          const value = Math.min((monthlyValue / businessDayCount) * achievedDays, monthlyValue);
          return { type, achievedDays, monthlyValue, value };
        });
      const indicatorTotal = indicators.reduce((sum, item) => sum + item.value, 0);
      const rvNova = Number((tasks.total + indicatorTotal).toFixed(2));
      const topTasks = [...tasks.tasks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

      return {
        sourceEmployee: employee,
        sourceIndex: index,
        competencia,
        periodo_inicio: period.inicio,
        periodo_fim: period.fim,
        matricula: employeeMatricula(employee),
        nome_completo: name,
        cpf: digits(employee.cpf),
        funcao_armazem: mapArmazemRole(employee),
        cargo: employeeRole(employee),
        setor: trim(employee.setor || employee.department),
        tipo_colaborador: trim(employee.tipo_colaborador || employee.type),
        perfil: trim(employee.perfil || employee.profile),
        usuario_wms: trim(employee.usuario_wms || employee.wms_user),
        codigo_operacional: trim(employee.codigo_operacional || employee.operational_code),
        pontos: Number(tasks.quantity.toFixed(2)),
        faixa: rvNova > 0 ? 'Elegivel' : 'Sem premio',
        rv_antiga: 0,
        rv_nova: rvNova,
        erros: Number(tasks.errors.toFixed(2)),
        valor_total_previsto: rvNova,
        indicador_1: indicators[0] ? `${indicators[0].type}: R$ ${indicators[0].value.toFixed(2)}` : '',
        indicador_2: indicators[1] ? `${indicators[1].type}: R$ ${indicators[1].value.toFixed(2)}` : '',
        indicador_3: indicators[2] ? `${indicators[2].type}: R$ ${indicators[2].value.toFixed(2)}` : '',
        status_produtividade: rvNova > 0 ? 'Elegivel' : 'Sem premio',
        origem_calculo: 'logipay_base44',
        status_auditoria: keys.length ? 'ok' : 'revisar_cruzamento',
        metodo_cruzamento: 'matricula_nome_logipay',
        confianca_cruzamento: keys.length ? 1 : LOW_CONFIDENCE_LIMIT,
        observacao_cruzamento: '',
        mensagem_rh: topTasks.length
          ? `RV calculada a partir do LogiPay. Principais tarefas: ${topTasks.map(([task, value]) => `${task} R$ ${value.toFixed(2)}`).join('; ')}.`
          : 'RV calculada a partir do LogiPay.',
        dados_originais_json: JSON.stringify({
          employee,
          tasksTotal: Number(tasks.total.toFixed(2)),
          indicatorsTotal: Number(indicatorTotal.toFixed(2)),
          indicators,
          monthYear
        })
      };
    });
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
  await db.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_matricula ON produtividade_armazem_colaboradores(matricula)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_competencia ON produtividade_armazem_colaboradores(competencia)');
}

async function findColaborador(row) {
  if (row.matricula) {
    const byMatricula = await db.get('SELECT * FROM colaboradores WHERE matricula = ?', [row.matricula]);
    if (byMatricula) return byMatricula;
  }
  if (row.cpf) {
    const byCpf = await db.get('SELECT * FROM colaboradores WHERE cpf = ?', [row.cpf]);
    if (byCpf) return byCpf;
  }
  const all = await db.all('SELECT * FROM colaboradores');
  return all.find((colaborador) => normalizeName(colaborador.nome_completo) === normalizeName(row.nome_completo)) || null;
}

async function createColaborador(row) {
  const senhaHash = await bcrypt.hash('123456', 10);
  const matricula = row.matricula || `LOGI${String(row.sourceIndex + 1).padStart(5, '0')}`;
  const result = await db.run(
    `INSERT INTO colaboradores (
      matricula, nome_completo, cpf, cargo, setor, unidade, tipo_colaborador, status,
      senha_hash, perfil, primeiro_acesso, senha_temporaria
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matricula,
      row.nome_completo || matricula,
      row.cpf || null,
      row.cargo || row.funcao_armazem,
      row.setor || 'Armazem',
      'CDD Cascavel',
      row.tipo_colaborador || 'Interno',
      'Ativo',
      senhaHash,
      row.perfil || 'colaborador',
      1,
      1
    ]
  );
  return db.get('SELECT * FROM colaboradores WHERE id = ?', [result.lastID]);
}

async function createImportRecord(file, rows) {
  const total = rows.reduce((sum, row) => sum + row.valor_total_previsto, 0);
  const first = rows[0] || {};
  const result = await db.run(
    `INSERT INTO produtividade_armazem_importacoes (
      arquivo, competencia, periodo_inicio, periodo_fim, total_linhas, valor_total_previsto, valor_total_rv_nova, detalhes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      path.basename(file),
      first.competencia || null,
      first.periodo_inicio || null,
      first.periodo_fim || null,
      rows.length,
      Number(total.toFixed(2)),
      Number(total.toFixed(2)),
      JSON.stringify({ origem: 'logipay_base44', status: 'em_processamento' })
    ]
  );
  return result.lastID;
}

async function upsertArmazem(row, colaborador, importacaoId) {
  const payload = {
    ...row,
    importacao_id: importacaoId,
    colaborador_id: colaborador.id,
    matricula: colaborador.matricula || row.matricula,
    nome_completo: colaborador.nome_completo || row.nome_completo,
    cpf: colaborador.cpf || row.cpf,
    cargo: row.cargo || colaborador.cargo,
    setor: row.setor || colaborador.setor,
    tipo_colaborador: row.tipo_colaborador || colaborador.tipo_colaborador,
    perfil: row.perfil || colaborador.perfil
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

async function backupSqlite() {
  if (process.env.DATABASE_URL) return null;
  const dbPath = path.join(__dirname, '../data/db.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  const backupPath = path.join(__dirname, `../logs/backup_logipay_antes_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

async function importLogipay(file, options = {}) {
  await ensureArmazemTables();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dump = normalizeDump(raw);
  const competencia = competenciaFromMonthYear(options.competencia || raw.competencia || raw.month_year || raw.monthYear);
  if (!competencia) throw new Error('Informe a competencia com --competencia MM/AAAA ou no JSON.');

  const rows = calculateRows(dump, competencia);
  const report = {
    file,
    competencia,
    employees: dump.employees.length,
    taskRecords: dump.taskRecords.length,
    indicatorConfigs: dump.indicatorConfigs.length,
    dailyIndicators: dump.dailyIndicators.length,
    created: 0,
    updated: 0,
    ignored: 0,
    createdCollaborators: 0,
    notFound: [],
    dryRun: Boolean(options.dryRun),
    backupPath: options.dryRun ? null : await backupSqlite()
  };

  if (options.dryRun) {
    report.preview = rows.slice(0, 10).map((row) => ({
      matricula: row.matricula,
      nome_completo: row.nome_completo,
      funcao_armazem: row.funcao_armazem,
      valor_total_previsto: row.valor_total_previsto
    }));
    return report;
  }

  const importacaoId = await createImportRecord(file, rows);
  report.importacaoId = importacaoId;

  for (const row of rows) {
    let colaborador = await findColaborador(row);
    if (!colaborador && options.createMissing) {
      colaborador = await createColaborador(row);
      report.createdCollaborators += 1;
    }
    if (!colaborador) {
      report.ignored += 1;
      report.notFound.push({ matricula: row.matricula, nome: row.nome_completo });
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
      JSON.stringify({ origem: 'logipay_base44', nao_encontrados: report.notFound }),
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
  if (!args.file) throw new Error('Uso: npm run import:logipay -- --file caminho/dump.json --competencia MM/AAAA [--create-missing] [--activate-module] [--dry-run]');
  const report = await importLogipay(path.resolve(args.file), args);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Falha na importacao LogiPay/Base44: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  importLogipay,
  normalizeDump,
  calculateRows,
  officialPeriodForCompetencia
};
