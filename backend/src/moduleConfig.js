const db = require('./db');

const DEFAULT_MAINTENANCE_MESSAGE = 'Estamos ajustando este painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.';
let schemaReady = false;

const MODULE_DEFAULTS = [
  ['pesquisa_clima', 'Pesquisa de Clima', 'Pesquisas de satisfação da empresa.', true, false, null, true, true, true, 10],
  ['skap', 'SKAP', 'Evolução, nível atual e habilidades avaliadas.', true, false, null, true, true, true, 20],
  ['campeao_seguranca', 'Campeão de Segurança', 'Reconhecimento de atitudes seguras.', true, false, null, true, true, true, 30],
  ['tres_rs', '3 Rs', 'Responsabilidades, recursos e reconhecimentos da metodologia 3Rs.', true, false, null, true, true, true, 40],
  ['premio_produtividade', 'Prêmio de Produtividade', 'Indicadores, metas e valor previsto do prêmio.', false, true, 'Estamos ajustando os dados deste painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.', true, true, true, 50],
  ['indicadores_rota', 'Indicadores da Rota', 'Acompanhe as metas e entenda os indicadores que ajudam sua rota a ser mais produtiva, organizada e segura.', true, false, null, true, true, false, 55],
  ['premio_produtividade_armazem', 'Prêmio de Produtividade do Armazém', 'RV e prêmio de produtividade para Ajudante, Operador de Empilhadeira e Amarrador.', false, true, DEFAULT_MAINTENANCE_MESSAGE, true, true, true, 56],
  ['rotograma_seguro', 'Rotograma Seguro', 'Consulte rotas, pontos de risco, telefones de emergência e orientações de segurança da operação.', true, false, null, true, true, true, 57],
  ['prontuario_motorista', 'Prontuário do Colaborador', 'Pontuação, faixa atual e ocorrências registradas.', true, false, null, true, true, true, 60],
  ['ouvidoria', 'Ouvidoria', 'Canal oficial para solicitações, dúvidas ou relatos.', true, false, null, true, true, true, 70],
  ['assistente_rh', 'Yuri, Assistente de RH', 'Atendimento virtual da Central do Colaborador.', true, false, null, true, true, true, 80]
];

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
  if (normalized.includes('motorista') || normalized.includes('ajudante')) return 'visivel_para_motorista';
  return 'visivel_para_colaborador';
}

async function ensureModuleConfigTable() {
  if (schemaReady) return;

  await db.run(`CREATE TABLE IF NOT EXISTS configuracoes_modulos (
    id SERIAL PRIMARY KEY,
    chave TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    em_manutencao BOOLEAN DEFAULT false,
    mensagem_manutencao TEXT,
    visivel_para_admin BOOLEAN DEFAULT true,
    visivel_para_motorista BOOLEAN DEFAULT true,
    visivel_para_colaborador BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const item of MODULE_DEFAULTS) {
    await db.run(
      `INSERT INTO configuracoes_modulos
       (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, visivel_para_admin, visivel_para_motorista, visivel_para_colaborador, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (chave) DO NOTHING`,
      item
    );
  }

  await db.run(
    `UPDATE configuracoes_modulos
     SET nome = ?, descricao = ?, updated_at = CURRENT_TIMESTAMP
     WHERE chave = ? AND nome IN (?, ?, ?)`,
    [
      'Yuri, Assistente de RH',
      'Atendimento virtual da Central do Colaborador.',
      'assistente_rh',
      'Assistente RH',
      'IA Assistente RH',
      'Assistente RH Log20'
    ]
  );

  await db.run(
    `UPDATE configuracoes_modulos
     SET nome = ?, updated_at = CURRENT_TIMESTAMP
     WHERE chave = ? AND nome IN (?, ?)`,
    [
      'Prontuário do Colaborador',
      'prontuario_motorista',
      'Prontuario do Motorista',
      'Prontuário do Motorista'
    ]
  );

  schemaReady = true;
}

async function getModule(chave) {
  await ensureModuleConfigTable();
  const row = await db.get('SELECT * FROM configuracoes_modulos WHERE chave = ?', [chave]);
  return shapeModule(row);
}

async function listModulesForUser(perfil) {
  await ensureModuleConfigTable();
  const column = visibilityColumnForPerfil(perfil);
  const rows = await db.all(
    `SELECT * FROM configuracoes_modulos WHERE ${column} = ? ORDER BY ordem, nome`,
    [true]
  );
  return rows.map(shapeModule);
}

async function listAllModules() {
  await ensureModuleConfigTable();
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
    error: 'Módulo em manutenção',
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
  ensureModuleConfigTable,
  ensureModuleAvailable,
  listAllModules,
  listModulesForUser,
  maintenancePayload,
  shapeModule
};
