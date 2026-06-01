const db = require('./db');

const DEFAULT_MAINTENANCE_MESSAGE = 'Estamos ajustando este painel para garantir que as informacoes sejam apresentadas corretamente. Em breve ele estara disponivel.';

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function boolValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function shapeModule(row) {
  if (!row) return null;
  return {
    ...row,
    ativo: boolValue(row.ativo),
    em_manutencao: boolValue(row.em_manutencao),
    visivel_para_admin: boolValue(row.visivel_para_admin),
    visivel_para_motorista: boolValue(row.visivel_para_motorista),
    visivel_para_colaborador: boolValue(row.visivel_para_colaborador),
    ordem: Number(row.ordem || 0)
  };
}

function visibilityColumnForPerfil(perfil) {
  const normalized = normalizePerfil(perfil);
  if (normalized === 'admin') return 'visivel_para_admin';
  if (normalized === 'motorista') return 'visivel_para_motorista';
  return 'visivel_para_colaborador';
}

async function getModule(chave) {
  const row = await db.get('SELECT * FROM configuracoes_modulos WHERE chave = ?', [chave]);
  return shapeModule(row);
}

async function listModulesForUser(perfil) {
  const column = visibilityColumnForPerfil(perfil);
  const rows = await db.all(
    `SELECT * FROM configuracoes_modulos WHERE ${column} = ? ORDER BY ordem, nome`,
    [true]
  );
  return rows.map(shapeModule);
}

async function listAllModules() {
  const rows = await db.all('SELECT * FROM configuracoes_modulos ORDER BY ordem, nome');
  return rows.map(shapeModule);
}

async function ensureModuleAvailable(chave, user) {
  const modulo = await getModule(chave);
  if (!modulo) {
    return { available: true, modulo: null };
  }

  if (normalizePerfil(user?.perfil) === 'admin') {
    return { available: true, modulo };
  }

  const available = modulo.ativo && !modulo.em_manutencao;
  return { available, modulo };
}

function maintenancePayload(modulo) {
  return {
    error: 'Modulo em manutencao',
    code: 'MODULO_EM_MANUTENCAO',
    modulo: {
      chave: modulo?.chave,
      nome: modulo?.nome || 'Painel',
      ativo: Boolean(modulo?.ativo),
      em_manutencao: Boolean(modulo?.em_manutencao),
      mensagem_manutencao: modulo?.mensagem_manutencao || DEFAULT_MAINTENANCE_MESSAGE
    }
  };
}

module.exports = {
  DEFAULT_MAINTENANCE_MESSAGE,
  ensureModuleAvailable,
  listAllModules,
  listModulesForUser,
  maintenancePayload,
  shapeModule
};
