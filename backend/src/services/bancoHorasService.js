const db = require('../db');
const { durationToMinutes, isPointExemptRole, minutesToDuration, validateBalance } = require('./bancoHorasParser');
const { isOfficialScopeCollaborator, matchReport, normalizedRegistration } = require('./bancoHorasMatcher');

const INACTIVE_STATUSES = new Set(['desligado', 'removido', 'inativo']);

function appError(message, status = 400, code = 'BANCO_HORAS_INVALIDO', details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function isActive(status) {
  return !INACTIVE_STATUSES.has(String(status || 'ativo').trim().toLowerCase());
}

function requireReason(value) {
  const reason = String(value || '').trim();
  if (reason.length < 5) throw appError('Informe uma justificativa com pelo menos 5 caracteres.');
  return reason;
}

function normalizeCorrectedPunches(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length % 2 !== 0) {
    throw appError(
      'Informe as batidas corrigidas em pares de entrada e saída.',
      400,
      'BATIDAS_CORRIGIDAS_INVALIDAS'
    );
  }
  return value.map((item) => {
    const match = String(item || '').trim().match(/^(?:([01]?\d)|(2[0-3])):([0-5]\d)$/);
    if (!match) {
      throw appError('Use horários válidos no formato HH:mm.', 400, 'BATIDAS_CORRIGIDAS_INVALIDAS');
    }
    const hour = Number(match[1] ?? match[2]);
    return `${String(hour).padStart(2, '0')}:${match[3]}`;
  });
}

function workedMinutesFromPunches(punches) {
  let total = 0;
  for (let index = 0; index < punches.length; index += 2) {
    const [startHour, startMinute] = punches[index].split(':').map(Number);
    const [endHour, endMinute] = punches[index + 1].split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (start === end) {
      throw appError('Entrada e saída não podem ter o mesmo horário.', 400, 'BATIDAS_CORRIGIDAS_INVALIDAS');
    }
    total += end > start ? end - start : (24 * 60) - start + end;
  }
  if (total <= 0 || total > 24 * 60) {
    throw appError('O total corrigido deve ser maior que zero e não pode exceder 24 horas.', 400, 'BATIDAS_CORRIGIDAS_INVALIDAS');
  }
  return total;
}

async function activeCollaborators(database = db) {
  const rows = await database.all(
    `SELECT id, matricula, nome_completo, nome_preferido, cargo, setor, unidade, tipo_colaborador, status
     FROM colaboradores
     ORDER BY nome_completo`
  );
  return rows.filter((row) => isActive(row.status) && isOfficialScopeCollaborator(row));
}

async function nameAliases(database = db) {
  return database.all(
    `SELECT v.nome_kairos_normalizado, v.matricula_kairos, v.colaborador_id
     FROM bh_vinculos_nome v
     JOIN colaboradores c ON c.id = v.colaborador_id`
  );
}

function reportIdentityKey(row) {
  return `${row.nome_kairos_normalizado}\u0000${normalizedRegistration(row.matricula_kairos)}`;
}

function uniquePendingIdentities(saldos, dias) {
  const pending = new Set();
  [...saldos, ...dias].forEach((row) => {
    if (row.status_vinculo !== 'vinculado') pending.add(reportIdentityKey(row));
  });
  return pending;
}

function duplicateCount(rows, keyForRow) {
  const counts = new Map();
  rows
    .filter((row) => row.status_vinculo === 'vinculado' && row.colaborador_id)
    .forEach((row) => {
      const key = keyForRow(row);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function calculateBlockers(importRow, saldos, dias) {
  const pendingIdentities = uniquePendingIdentities(saldos, dias);
  const pendingDays = dias.filter((row) => row.classificacao === 'pendente');
  const incompleteDays = dias.filter((row) => row.classificacao === 'incompleta');
  const invalidBalances = saldos.filter((row) => {
    const validation = validateBalance(row);
    return !validation.periodo_ok || !validation.atual_ok;
  });
  const duplicateBalances = duplicateCount(saldos, (row) => String(row.colaborador_id));
  const duplicateDays = duplicateCount(dias, (row) => `${row.colaborador_id}\u0000${row.data}`);
  return {
    vinculos_pendentes: pendingIdentities.size,
    dias_pendentes: pendingDays.length,
    marcacoes_incompletas: incompleteDays.length,
    saldos_inconsistentes: invalidBalances.length,
    saldos_duplicados: duplicateBalances,
    dias_duplicados: duplicateDays,
    periodo_ausente: importRow.periodo_inicio && importRow.periodo_fim ? 0 : 1
  };
}

function blockerTotal(blockers) {
  return Object.values(blockers).reduce((total, value) => total + Number(value || 0), 0);
}

async function refreshStats(database, importId, { incrementRevision = false } = {}) {
  const importRow = await database.get('SELECT * FROM bh_importacoes WHERE id = ?', [importId]);
  if (!importRow) throw appError('Importação não encontrada.', 404, 'IMPORTACAO_NAO_ENCONTRADA');
  const [saldos, dias] = await Promise.all([
    database.all('SELECT * FROM bh_saldos WHERE importacao_id = ?', [importId]),
    database.all('SELECT * FROM bh_dias WHERE importacao_id = ?', [importId])
  ]);
  const linked = new Set(
    [...saldos, ...dias]
      .filter((row) => row.status_vinculo === 'vinculado' && row.colaborador_id)
      .map((row) => Number(row.colaborador_id))
  );
  const blockers = calculateBlockers(importRow, saldos, dias);
  await database.run(
    `UPDATE bh_importacoes
     SET total_saldos = ?, total_dias = ?, total_vinculados = ?, total_pendencias = ?,
         revisao = revisao + ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [saldos.length, dias.length, linked.size, blockerTotal(blockers), incrementRevision ? 1 : 0, importId]
  );
  return { blockers, saldos, dias };
}

function shapeBalance(row) {
  const validation = validateBalance(row);
  return {
    id: row.id,
    importacao_id: row.importacao_id,
    colaborador_id: row.colaborador_id,
    linha_origem: row.linha_origem,
    matricula_kairos: row.matricula_kairos,
    nome_kairos: row.nome_kairos,
    nome_kairos_normalizado: row.nome_kairos_normalizado,
    estrutura_kairos: row.estrutura_kairos,
    nome_ginfo: row.nome_ginfo_snapshot,
    matricula_ginfo: row.matricula_ginfo_snapshot,
    status_vinculo: row.status_vinculo,
    metodo_vinculo: row.metodo_vinculo,
    confianca_vinculo: row.confianca_vinculo === null ? null : Number(row.confianca_vinculo),
    sugestoes: parseJson(row.sugestoes_json, []),
    saldo_anterior_min: row.saldo_anterior_min,
    debito_min: row.debito_min,
    credito_min: row.credito_min,
    saldo_periodo_min: row.saldo_periodo_min,
    saldo_atual_min: row.saldo_atual_min,
    saldo_anterior: minutesToDuration(row.saldo_anterior_min),
    debito: minutesToDuration(row.debito_min),
    credito: minutesToDuration(row.credito_min),
    saldo_periodo: minutesToDuration(row.saldo_periodo_min),
    saldo_atual: minutesToDuration(row.saldo_atual_min),
    validacao: validation,
    revisado_em: row.revisado_em
  };
}

function shapeDay(row) {
  return {
    id: row.id,
    importacao_id: row.importacao_id,
    colaborador_id: row.colaborador_id,
    linha_origem: row.linha_origem,
    matricula_kairos: row.matricula_kairos,
    nome_kairos: row.nome_kairos,
    nome_kairos_normalizado: row.nome_kairos_normalizado,
    cargo_kairos: row.cargo_kairos,
    estrutura_kairos: row.estrutura_kairos,
    nome_ginfo: row.nome_ginfo_snapshot,
    matricula_ginfo: row.matricula_ginfo_snapshot,
    data: row.data,
    horario_previsto: row.horario_previsto,
    batidas: parseJson(row.batidas_json, []),
    horas_trabalhadas_min: row.horas_trabalhadas_min,
    horas_trabalhadas: row.horas_trabalhadas_min === null ? null : minutesToDuration(row.horas_trabalhadas_min),
    debito_min: row.debito_min,
    credito_min: row.credito_min,
    debito: minutesToDuration(row.debito_min),
    credito: minutesToDuration(row.credito_min),
    justificativa_kairos: row.justificativa_kairos,
    classificacao_original: row.classificacao_original,
    classificacao: row.classificacao,
    status_vinculo: row.status_vinculo,
    metodo_vinculo: row.metodo_vinculo,
    confianca_vinculo: row.confianca_vinculo === null ? null : Number(row.confianca_vinculo),
    sugestoes: parseJson(row.sugestoes_json, []),
    justificativa_admin: row.justificativa_admin,
    revisado_em: row.revisado_em
  };
}

function shapeImport(row) {
  return {
    id: row.id,
    arquivo_nome: row.arquivo_nome,
    formato: row.formato,
    tipo_relatorio: row.tipo_relatorio,
    periodo_inicio: row.periodo_inicio,
    periodo_fim: row.periodo_fim,
    status: row.status,
    total_saldos: Number(row.total_saldos || 0),
    total_dias: Number(row.total_dias || 0),
    total_vinculados: Number(row.total_vinculados || 0),
    total_pendencias: Number(row.total_pendencias || 0),
    revisao: Number(row.revisao || 1),
    avisos: parseJson(row.avisos_json, []),
    criado_por_nome: row.criado_por_nome,
    aprovado_por_nome: row.aprovado_por_nome,
    criado_em: row.created_at,
    aprovado_em: row.aprovado_em
  };
}

async function getImportDetail(importId, { includeOptions = true, database = db } = {}) {
  const row = await database.get(
    `SELECT i.*, criador.nome_completo AS criado_por_nome, aprovador.nome_completo AS aprovado_por_nome
     FROM bh_importacoes i
     LEFT JOIN colaboradores criador ON criador.id = i.criado_por
     LEFT JOIN colaboradores aprovador ON aprovador.id = i.aprovado_por
     WHERE i.id = ?`,
    [importId]
  );
  if (!row) throw appError('Importação não encontrada.', 404, 'IMPORTACAO_NAO_ENCONTRADA');
  const [balanceRows, dayRows, auditRows, options] = await Promise.all([
    database.all('SELECT * FROM bh_saldos WHERE importacao_id = ? ORDER BY linha_origem', [importId]),
    database.all(`SELECT * FROM bh_dias WHERE importacao_id = ?
      ORDER BY CASE classificacao WHEN 'pendente' THEN 0 WHEN 'incompleta' THEN 1 ELSE 2 END,
      data, nome_kairos`, [importId]),
    database.all(
      `SELECT a.*, c.nome_completo AS alterado_por_nome
       FROM bh_auditoria a
       LEFT JOIN colaboradores c ON c.id = a.alterado_por
       WHERE a.importacao_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
      [importId]
    ),
    includeOptions ? activeCollaborators(database) : Promise.resolve([])
  ]);
  const blockers = calculateBlockers(row, balanceRows, dayRows);
  return {
    importacao: shapeImport(row),
    bloqueios: blockers,
    pode_aprovar: row.status === 'rascunho' && blockerTotal(blockers) === 0,
    saldos: balanceRows.map(shapeBalance),
    dias: dayRows.map(shapeDay),
    auditoria: auditRows.map((item) => ({
      id: item.id,
      entidade: item.entidade,
      entidade_id: item.entidade_id,
      campo: item.campo,
      valor_anterior: item.valor_anterior,
      valor_novo: item.valor_novo,
      motivo: item.motivo,
      alterado_por_nome: item.alterado_por_nome,
      criado_em: item.created_at
    })),
    opcoes_vinculo: options.map((item) => ({
      id: item.id,
      matricula: item.matricula,
      nome_completo: item.nome_completo,
      cargo: item.cargo,
      setor: item.setor,
      unidade: item.unidade
    }))
  };
}

async function createDraft({ parsed, filename, fileHash, userId }) {
  const existing = await db.get(
    `SELECT id, status FROM bh_importacoes
     WHERE arquivo_hash = ? AND status IN ('rascunho', 'publicado')
     ORDER BY CASE status WHEN 'publicado' THEN 0 ELSE 1 END, id DESC LIMIT 1`,
    [fileHash]
  );
  if (existing) {
    throw appError(
      existing.status === 'publicado'
        ? 'Este arquivo já foi publicado e não será duplicado.'
        : 'Este arquivo já possui uma conferência em andamento.',
      409,
      'ARQUIVO_DUPLICADO',
      { importacao_id: existing.id, status: existing.status }
    );
  }

  const collaborators = await activeCollaborators();
  const aliases = await nameAliases();
  const report = matchReport(parsed, collaborators, aliases);
  if (!report.saldos.length && !report.dias.length) {
    throw appError(
      'O relatório não contém colaboradores do escopo Armazém ou Administrativo.',
      400,
      'RELATORIO_FORA_ESCOPO'
    );
  }

  const importId = await db.withTransaction(async (transaction) => {
    const created = await transaction.get(
      `INSERT INTO bh_importacoes (
        arquivo_nome, arquivo_hash, formato, tipo_relatorio, periodo_inicio, periodo_fim,
        status, avisos_json, criado_por
      ) VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?, ?) RETURNING id`,
      [filename, fileHash, report.formato, report.tipo_relatorio, report.periodo_inicio, report.periodo_fim, json(report.avisos), userId]
    );

    for (const row of report.saldos) {
      await transaction.run(
        `INSERT INTO bh_saldos (
          importacao_id, colaborador_id, linha_origem, matricula_kairos, nome_kairos,
          nome_kairos_normalizado, estrutura_kairos, nome_ginfo_snapshot, matricula_ginfo_snapshot,
          saldo_anterior_min, debito_min, credito_min, saldo_periodo_min, saldo_atual_min,
          status_vinculo, metodo_vinculo, confianca_vinculo, sugestoes_json, dados_originais_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          created.id, row.colaborador_id, row.linha_origem, row.matricula_kairos, row.nome_kairos,
          row.nome_kairos_normalizado, row.estrutura_kairos, row.nome_ginfo_snapshot, row.matricula_ginfo_snapshot,
          row.saldo_anterior_min, row.debito_min, row.credito_min, row.saldo_periodo_min, row.saldo_atual_min,
          row.status_vinculo, row.metodo_vinculo, row.confianca_vinculo, json(row.sugestoes), json(row.dados_originais)
        ]
      );
    }

    for (const row of report.dias) {
      await transaction.run(
        `INSERT INTO bh_dias (
          importacao_id, colaborador_id, linha_origem, matricula_kairos, nome_kairos,
          nome_kairos_normalizado, cargo_kairos, estrutura_kairos, nome_ginfo_snapshot,
          matricula_ginfo_snapshot, data, horario_previsto, batidas_json, horas_trabalhadas_min,
          debito_min, credito_min, justificativa_kairos, classificacao_original, classificacao,
          status_vinculo, metodo_vinculo, confianca_vinculo, sugestoes_json, dados_originais_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          created.id, row.colaborador_id, row.linha_origem, row.matricula_kairos, row.nome_kairos,
          row.nome_kairos_normalizado, row.cargo_kairos, row.estrutura_kairos, row.nome_ginfo_snapshot,
          row.matricula_ginfo_snapshot, row.data, row.horario_previsto, json(row.batidas), row.horas_trabalhadas_min,
          row.debito_min, row.credito_min, row.justificativa_kairos, row.classificacao_original, row.classificacao,
          row.status_vinculo, row.metodo_vinculo, row.confianca_vinculo, json(row.sugestoes), json(row.dados_originais)
        ]
      );
    }
    await refreshStats(transaction, created.id);
    return created.id;
  });
  return getImportDetail(importId);
}

async function listImports() {
  const rows = await db.all(
    `SELECT i.*, criador.nome_completo AS criado_por_nome, aprovador.nome_completo AS aprovado_por_nome
     FROM bh_importacoes i
     LEFT JOIN colaboradores criador ON criador.id = i.criado_por
     LEFT JOIN colaboradores aprovador ON aprovador.id = i.aprovado_por
     ORDER BY i.created_at DESC, i.id DESC LIMIT 30`
  );
  return rows.map(shapeImport);
}

async function assertDraft(database, importId) {
  const row = await database.get('SELECT * FROM bh_importacoes WHERE id = ?', [importId]);
  if (!row) throw appError('Importação não encontrada.', 404, 'IMPORTACAO_NAO_ENCONTRADA');
  if (row.status !== 'rascunho') {
    throw appError('Uma importação publicada não pode mais ser alterada.', 409, 'IMPORTACAO_IMUTAVEL');
  }
  return row;
}

async function audit(database, { importId, entity, entityId, field, before, after, reason, userId }) {
  await database.run(
    `INSERT INTO bh_auditoria (
      importacao_id, entidade, entidade_id, campo, valor_anterior, valor_novo, motivo, alterado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [importId, entity, entityId, field, before === null ? null : String(before), after === null ? null : String(after), reason, userId]
  );
}

async function linkIdentity({ importId, normalizedName, kairosRegistration, collaboratorId, reason, userId }) {
  const justification = requireReason(reason);
  const safeName = String(normalizedName || '').trim();
  if (!safeName) throw appError('Identidade do Kairos não informada.');

  await db.withTransaction(async (transaction) => {
    await assertDraft(transaction, importId);
    const collaborator = await transaction.get(
      `SELECT id, matricula, nome_completo, cargo, setor, status FROM colaboradores WHERE id = ?`,
      [collaboratorId]
    );
    if (!collaborator || !isActive(collaborator.status) || !isOfficialScopeCollaborator(collaborator)) {
      throw appError(
        'Selecione um colaborador ativo do escopo Administrativo, Apoio Logístico ou Manobrista.',
        400,
        'COLABORADOR_FORA_ESCOPO'
      );
    }
    const allBalances = await transaction.all(
      `SELECT id, colaborador_id, matricula_kairos
       FROM bh_saldos WHERE importacao_id = ? AND nome_kairos_normalizado = ?`,
      [importId, safeName]
    );
    const allDays = await transaction.all(
      `SELECT id, colaborador_id, matricula_kairos, batidas_json, classificacao_original, classificacao
       FROM bh_dias
       WHERE importacao_id = ? AND nome_kairos_normalizado = ?`,
      [importId, safeName]
    );
    const registrations = [...new Set(
      [...allBalances, ...allDays].map((row) => normalizedRegistration(row.matricula_kairos))
    )];
    const registrationProvided = kairosRegistration !== undefined && kairosRegistration !== null;
    let safeRegistration = normalizedRegistration(kairosRegistration);
    if (!registrationProvided && registrations.length === 1) [safeRegistration] = registrations;
    if (!registrationProvided && registrations.length > 1) {
      throw appError(
        'Informe a matrícula Kairos para distinguir colaboradores homônimos.',
        400,
        'MATRICULA_KAIROS_OBRIGATORIA'
      );
    }
    const balances = allBalances.filter((row) => normalizedRegistration(row.matricula_kairos) === safeRegistration);
    const days = allDays.filter((row) => normalizedRegistration(row.matricula_kairos) === safeRegistration);
    if (!balances.length && !days.length) throw appError('Identidade do Kairos não encontrada nesta importação.', 404);

    await transaction.run(
      `UPDATE bh_saldos SET colaborador_id = ?, nome_ginfo_snapshot = ?, matricula_ginfo_snapshot = ?,
       status_vinculo = 'vinculado', metodo_vinculo = 'manual_admin', confianca_vinculo = 1,
       sugestoes_json = '[]', revisado_por = ?, revisado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE importacao_id = ? AND nome_kairos_normalizado = ?
         AND LOWER(TRIM(COALESCE(matricula_kairos, ''))) = ?`,
      [collaborator.id, collaborator.nome_completo, collaborator.matricula, userId, importId, safeName, safeRegistration]
    );
    await transaction.run(
      `UPDATE bh_dias SET colaborador_id = ?, nome_ginfo_snapshot = ?, matricula_ginfo_snapshot = ?,
       status_vinculo = 'vinculado', metodo_vinculo = 'manual_admin', confianca_vinculo = 1,
       sugestoes_json = '[]', revisado_por = ?, revisado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE importacao_id = ? AND nome_kairos_normalizado = ?
         AND LOWER(TRIM(COALESCE(matricula_kairos, ''))) = ?`,
      [collaborator.id, collaborator.nome_completo, collaborator.matricula, userId, importId, safeName, safeRegistration]
    );

    const exempt = isPointExemptRole(collaborator.cargo);
    for (const day of days) {
      if (parseJson(day.batidas_json, []).length) continue;
      const desiredClassification = exempt
        ? 'nao_aplicavel'
        : (day.classificacao === 'nao_aplicavel' ? day.classificacao_original : day.classificacao);
      if (desiredClassification !== day.classificacao) {
        await transaction.run(
          `UPDATE bh_dias SET classificacao = ?, justificativa_admin = NULL, revisado_por = ?,
           revisado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [desiredClassification, userId, day.id]
        );
        await audit(transaction, {
          importId,
          entity: 'dia',
          entityId: day.id,
          field: 'classificacao',
          before: day.classificacao,
          after: desiredClassification,
          reason: justification,
          userId
        });
      }
    }

    const previousIds = [...balances, ...days].map((item) => item.colaborador_id).filter(Boolean);
    await audit(transaction, {
      importId,
      entity: 'identidade',
      entityId: balances[0]?.id || days[0]?.id,
      field: 'colaborador_id',
      before: previousIds.length ? [...new Set(previousIds)].join(',') : null,
      after: collaborator.id,
      reason: justification,
      userId
    });
    await refreshStats(transaction, importId, { incrementRevision: true });
  });
  return getImportDetail(importId);
}

async function updateBalance({ importId, balanceId, values, reason, userId }) {
  const justification = requireReason(reason);
  const previous = await db.get('SELECT * FROM bh_saldos WHERE id = ? AND importacao_id = ?', [balanceId, importId]);
  if (!previous) throw appError('Saldo não encontrado.', 404, 'SALDO_NAO_ENCONTRADO');
  let anterior;
  let debito;
  let credito;
  try {
    anterior = durationToMinutes(values.saldo_anterior);
    debito = durationToMinutes(values.debito);
    credito = durationToMinutes(values.credito);
  } catch (error) {
    throw appError(error.message, 400, 'DURACAO_INVALIDA');
  }
  if (debito < 0 || credito < 0) throw appError('Débito e crédito não podem ser negativos.');
  const periodo = credito - debito;
  const atual = anterior + periodo;

  await db.withTransaction(async (transaction) => {
    await assertDraft(transaction, importId);
    const updates = [
      ['saldo_anterior_min', previous.saldo_anterior_min, anterior],
      ['debito_min', previous.debito_min, debito],
      ['credito_min', previous.credito_min, credito],
      ['saldo_periodo_min', previous.saldo_periodo_min, periodo],
      ['saldo_atual_min', previous.saldo_atual_min, atual]
    ];
    await transaction.run(
      `UPDATE bh_saldos SET saldo_anterior_min = ?, debito_min = ?, credito_min = ?,
       saldo_periodo_min = ?, saldo_atual_min = ?, revisado_por = ?, revisado_em = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND importacao_id = ?`,
      [anterior, debito, credito, periodo, atual, userId, balanceId, importId]
    );
    for (const [field, before, after] of updates) {
      if (Number(before) === Number(after)) continue;
      await audit(transaction, {
        importId, entity: 'saldo', entityId: balanceId, field,
        before: minutesToDuration(before), after: minutesToDuration(after), reason: justification, userId
      });
    }
    await refreshStats(transaction, importId, { incrementRevision: true });
  });
  return getImportDetail(importId);
}

async function classifyImportDay({ importId, dayId, classification, correctedPunches, reason, userId }) {
  const justification = requireReason(reason);
  const requested = String(classification || '').trim().toLowerCase();

  await db.withTransaction(async (transaction) => {
    await assertDraft(transaction, importId);
    const previous = await transaction.get('SELECT * FROM bh_dias WHERE id = ? AND importacao_id = ?', [dayId, importId]);
    if (!previous) throw appError('Dia não encontrado.', 404, 'DIA_NAO_ENCONTRADO');
    const punches = parseJson(previous.batidas_json, []);
    const isIncomplete = previous.classificacao === 'incompleta' || punches.length % 2 === 1;

    let punchesToPersist = punches;
    let workedMinutes = previous.horas_trabalhadas_min;
    if (punches.length === 0) {
      if (!['folga', 'falta'].includes(requested)) {
        throw appError(
          'Dia sem batida só pode ser classificado como folga ou falta.',
          400,
          'CLASSIFICACAO_INVALIDA'
        );
      }
    } else if (isIncomplete) {
      if (requested !== 'trabalhado') {
        throw appError(
          'Marcação incompleta só pode ser validada como trabalhada após corrigir as batidas.',
          400,
          'CLASSIFICACAO_INVALIDA'
        );
      }
      punchesToPersist = normalizeCorrectedPunches(correctedPunches);
      workedMinutes = workedMinutesFromPunches(punchesToPersist);
    } else if (requested !== 'trabalhado') {
      throw appError('Dia com batidas só pode ser classificado como trabalhado.', 400, 'CLASSIFICACAO_INVALIDA');
    } else if (correctedPunches !== undefined) {
      punchesToPersist = normalizeCorrectedPunches(correctedPunches);
      workedMinutes = workedMinutesFromPunches(punchesToPersist);
    }

    await transaction.run(
      `UPDATE bh_dias SET classificacao = ?, batidas_json = ?, horas_trabalhadas_min = ?,
       justificativa_admin = ?, revisado_por = ?,
       revisado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND importacao_id = ?`,
      [requested, json(punchesToPersist), workedMinutes, justification, userId, dayId, importId]
    );
    await audit(transaction, {
      importId, entity: 'dia', entityId: dayId, field: 'classificacao',
      before: previous.classificacao, after: requested, reason: justification, userId
    });
    if (json(punches) !== json(punchesToPersist)) {
      await audit(transaction, {
        importId, entity: 'dia', entityId: dayId, field: 'batidas',
        before: json(punches), after: json(punchesToPersist), reason: justification, userId
      });
    }
    if (Number(previous.horas_trabalhadas_min) !== Number(workedMinutes)) {
      await audit(transaction, {
        importId, entity: 'dia', entityId: dayId, field: 'horas_trabalhadas',
        before: previous.horas_trabalhadas_min === null ? null : minutesToDuration(previous.horas_trabalhadas_min),
        after: workedMinutes === null ? null : minutesToDuration(workedMinutes),
        reason: justification,
        userId
      });
    }
    await refreshStats(transaction, importId, { incrementRevision: true });
  });
  return getImportDetail(importId);
}

async function approveImport({ importId, revision, userId }) {
  const expectedRevision = Number(revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) {
    throw appError(
      'Informe a revisão atual da conferência antes de aprovar.',
      400,
      'REVISAO_OBRIGATORIA'
    );
  }
  await db.withTransaction(async (transaction) => {
    const importRow = await assertDraft(transaction, importId);
    if (expectedRevision !== Number(importRow.revisao)) {
      throw appError('A conferência foi alterada em outra sessão. Atualize a página antes de aprovar.', 409, 'REVISAO_DESATUALIZADA');
    }
    const stats = await refreshStats(transaction, importId);
    if (blockerTotal(stats.blockers) > 0) {
      throw appError('Ainda existem pendências que impedem a publicação.', 409, 'IMPORTACAO_COM_PENDENCIAS', stats.blockers);
    }

    const manualIdentities = await transaction.all(
      `SELECT nome_kairos, nome_kairos_normalizado, matricula_kairos, colaborador_id
       FROM bh_saldos WHERE importacao_id = ? AND metodo_vinculo = 'manual_admin'
       UNION
       SELECT nome_kairos, nome_kairos_normalizado, matricula_kairos, colaborador_id
       FROM bh_dias WHERE importacao_id = ? AND metodo_vinculo = 'manual_admin'`,
      [importId, importId]
    );
    for (const identity of manualIdentities) {
      await transaction.run(
        `INSERT INTO bh_vinculos_nome (
          nome_kairos, nome_kairos_normalizado, matricula_kairos, colaborador_id, origem, criado_por
        ) VALUES (?, ?, ?, ?, 'manual_admin', ?)
        ON CONFLICT (nome_kairos_normalizado, matricula_kairos) DO UPDATE SET
          nome_kairos = excluded.nome_kairos,
          colaborador_id = excluded.colaborador_id,
          origem = 'manual_admin',
          criado_por = excluded.criado_por,
          updated_at = CURRENT_TIMESTAMP`,
        [
          identity.nome_kairos,
          identity.nome_kairos_normalizado,
          normalizedRegistration(identity.matricula_kairos),
          identity.colaborador_id,
          userId
        ]
      );
    }

    const updated = await transaction.run(
      `UPDATE bh_importacoes SET status = 'publicado', aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'rascunho' AND revisao = ?`,
      [userId, importId, expectedRevision]
    );
    if (updated.changes !== 1) {
      throw appError('A importação foi alterada antes da aprovação. Atualize e tente novamente.', 409, 'REVISAO_DESATUALIZADA');
    }
    await audit(transaction, {
      importId, entity: 'importacao', entityId: importId, field: 'status',
      before: 'rascunho', after: 'publicado', reason: 'Aprovação final da conferência', userId
    });
  });
  return getImportDetail(importId, { includeOptions: false });
}

async function listCollaboratorsWithPublishedData() {
  const collaborators = await activeCollaborators();
  const [balanceRows, publishedDays] = await Promise.all([
    db.all(
      `SELECT s.*, i.periodo_inicio, i.periodo_fim, i.aprovado_em
       FROM bh_saldos s
       JOIN bh_importacoes i ON i.id = s.importacao_id
       WHERE i.status = 'publicado' AND s.colaborador_id IS NOT NULL
       ORDER BY i.periodo_fim DESC, i.aprovado_em DESC, i.id DESC, s.id DESC`
    ),
    db.all(
      `SELECT d.id, d.colaborador_id, d.data, d.classificacao, i.aprovado_em, i.id AS importacao_id
       FROM bh_dias d JOIN bh_importacoes i ON i.id = d.importacao_id
       WHERE i.status = 'publicado' AND d.colaborador_id IS NOT NULL
       ORDER BY d.colaborador_id, d.data, i.aprovado_em DESC, i.id DESC, d.id DESC`
    )
  ]);
  const latestBalance = new Map();
  balanceRows.forEach((row) => {
    const key = Number(row.colaborador_id);
    if (!latestBalance.has(key)) latestBalance.set(key, row);
  });
  const counts = new Map();
  const countedDates = new Set();
  publishedDays.forEach((row) => {
    const key = Number(row.colaborador_id);
    const dateKey = `${key}\u0000${row.data}`;
    if (countedDates.has(dateKey)) return;
    countedDates.add(dateKey);
    if (!counts.has(key)) counts.set(key, {});
    counts.get(key)[row.classificacao] = Number(counts.get(key)[row.classificacao] || 0) + 1;
  });
  return collaborators.map((collaborator) => {
    const balance = latestBalance.get(Number(collaborator.id));
    return {
      id: collaborator.id,
      matricula: collaborator.matricula,
      nome_completo: collaborator.nome_completo,
      nome_preferido: collaborator.nome_preferido,
      cargo: collaborator.cargo,
      setor: collaborator.setor,
      unidade: collaborator.unidade,
      status: collaborator.status,
      saldo: balance ? shapeBalance(balance) : null,
      periodo_inicio: balance?.periodo_inicio || null,
      periodo_fim: balance?.periodo_fim || null,
      calendario_resumo: counts.get(Number(collaborator.id)) || {}
    };
  });
}

function monthRange(month) {
  const value = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = value.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw appError('Mês inválido.');
  const start = `${value}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  return { month: value, start, next };
}

async function getCollaboratorPublishedDetail(collaboratorId, month) {
  const collaborator = await db.get(
    `SELECT id, matricula, nome_completo, nome_preferido, cargo, setor, unidade, status
     FROM colaboradores WHERE id = ?`,
    [collaboratorId]
  );
  if (!collaborator || !isActive(collaborator.status) || !isOfficialScopeCollaborator(collaborator)) {
    throw appError('Colaborador não encontrado no escopo do Banco de Horas.', 404);
  }
  const range = monthRange(month);
  const [balanceRows, dayRows] = await Promise.all([
    db.all(
      `SELECT s.*, i.periodo_inicio, i.periodo_fim, i.aprovado_em
       FROM bh_saldos s JOIN bh_importacoes i ON i.id = s.importacao_id
       WHERE s.colaborador_id = ? AND i.status = 'publicado'
       ORDER BY i.periodo_fim DESC, i.aprovado_em DESC, i.id DESC, s.id DESC`,
      [collaboratorId]
    ),
    db.all(
      `SELECT d.*, i.aprovado_em
       FROM bh_dias d JOIN bh_importacoes i ON i.id = d.importacao_id
       WHERE d.colaborador_id = ? AND i.status = 'publicado' AND d.data >= ? AND d.data < ?
       ORDER BY d.data, i.aprovado_em DESC, i.id DESC, d.id DESC`,
      [collaboratorId, range.start, range.next]
    )
  ]);
  const latestByDate = new Map();
  dayRows.forEach((row) => {
    if (!latestByDate.has(row.data)) latestByDate.set(row.data, row);
  });
  const balance = balanceRows[0] || null;
  return {
    colaborador: {
      id: collaborator.id,
      matricula: collaborator.matricula,
      nome_completo: collaborator.nome_completo,
      nome_preferido: collaborator.nome_preferido,
      cargo: collaborator.cargo,
      setor: collaborator.setor,
      unidade: collaborator.unidade
    },
    mes: range.month,
    saldo: balance ? shapeBalance(balance) : null,
    periodo_saldo: balance ? { inicio: balance.periodo_inicio, fim: balance.periodo_fim } : null,
    dias: [...latestByDate.values()].map(shapeDay)
  };
}

module.exports = {
  appError,
  approveImport,
  classifyImportDay,
  createDraft,
  getCollaboratorPublishedDetail,
  getImportDetail,
  linkIdentity,
  listCollaboratorsWithPublishedData,
  listImports,
  updateBalance
};
