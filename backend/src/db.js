require('./config/env');

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const usePostgres = Boolean(process.env.DATABASE_URL);
let sqliteDb = null;
let pool = null;

function normalizeSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function connectSqlite() {
  const sqlite3 = require('sqlite3').verbose();
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const dbFile = path.join(dataDir, 'db.sqlite');
  sqliteDb = new sqlite3.Database(dbFile);
  sqliteDb.serialize(() => {
    sqliteDb.run('PRAGMA foreign_keys = ON');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricula TEXT NOT NULL UNIQUE,
      nome_completo TEXT NOT NULL,
      cpf TEXT,
      telefone_whatsapp TEXT,
      email TEXT,
      cargo TEXT,
      setor TEXT,
      unidade TEXT,
      tipo_colaborador TEXT,
      status TEXT,
      data_admissao TEXT,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL,
      nome_preferido TEXT,
      primeiro_acesso INTEGER DEFAULT 1,
      senha_temporaria INTEGER DEFAULT 1,
      data_ultima_troca_senha TEXT,
      usuario_wms TEXT,
      codigo_operacional TEXT,
      wms_vinculo_status TEXT,
      wms_vinculo_metodo TEXT,
      wms_vinculado_em TEXT,
      wms_vinculo_origem TEXT
    )`);

    const ensureColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(colaboradores)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE colaboradores ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureColumn('nome_preferido', 'TEXT');
    ensureColumn('primeiro_acesso', 'INTEGER DEFAULT 1');
    ensureColumn('senha_temporaria', 'INTEGER DEFAULT 1');
    ensureColumn('data_ultima_troca_senha', 'TEXT');
    ensureColumn('usuario_wms', 'TEXT');
    ensureColumn('codigo_operacional', 'TEXT');
    ensureColumn('wms_vinculo_status', 'TEXT');
    ensureColumn('wms_vinculo_metodo', 'TEXT');
    ensureColumn('wms_vinculado_em', 'TEXT');
    ensureColumn('wms_vinculo_origem', 'TEXT');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS prontuario_motoristas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      pontuacao_atual INTEGER,
      faixa_atual TEXT,
      pontos_de_atencao TEXT,
      orientacoes TEXT,
      observacoes TEXT,
      data_atualizacao TEXT,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS prontuarios_motoristas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      matricula TEXT,
      nome_condutor TEXT,
      cpf TEXT,
      cargo TEXT,
      status_prontuario TEXT,
      motivo TEXT,
      data_bloqueio TEXT,
      pontuacao_cnh REAL,
      vencimento_cnh TEXT,
      pontuacao_ponderada REAL,
      faixa TEXT,
      cor_faixa TEXT DEFAULT 'sem_faixa',
      quantidade_sonolencia INTEGER DEFAULT 0,
      acidentes_fai INTEGER DEFAULT 0,
      acidentes_lti INTEGER DEFAULT 0,
      acidentes_mdi INTEGER DEFAULT 0,
      acidentes_mti INTEGER DEFAULT 0,
      capotamentos INTEGER DEFAULT 0,
      colisoes INTEGER DEFAULT 0,
      tombamentos INTEGER DEFAULT 0,
      descumprimento_manuseio_dinheiro INTEGER DEFAULT 0,
      descumprimento_padrao_seguranca INTEGER DEFAULT 0,
      descumprimento_plano_trafego INTEGER DEFAULT 0,
      estacionamento_local_proibido INTEGER DEFAULT 0,
      nao_uso_epi INTEGER DEFAULT 0,
      nao_uso_cinto_ajudante INTEGER DEFAULT 0,
      nao_uso_cinto_motorista INTEGER DEFAULT 0,
      nao_uso_cone INTEGER DEFAULT 0,
      fadiga_celular INTEGER DEFAULT 0,
      fadiga_consumo_alimento INTEGER DEFAULT 0,
      fadiga_fumando INTEGER DEFAULT 0,
      fadiga_oclusao INTEGER DEFAULT 0,
      fadiga_sem_cinto INTEGER DEFAULT 0,
      multa_grave INTEGER DEFAULT 0,
      multa_gravissima INTEGER DEFAULT 0,
      multa_leve INTEGER DEFAULT 0,
      multa_media INTEGER DEFAULT 0,
      advertencias INTEGER DEFAULT 0,
      suspensoes INTEGER DEFAULT 0,
      telemetria_excesso_velocidade_1 INTEGER DEFAULT 0,
      telemetria_excesso_velocidade_2 INTEGER DEFAULT 0,
      telemetria_excesso_velocidade_3 INTEGER DEFAULT 0,
      telemetria_forca_g INTEGER DEFAULT 0,
      telemetria_frenagem_brusca INTEGER DEFAULT 0,
      regiao_geo TEXT,
      atividade TEXT,
      empresa TEXT,
      operacao TEXT,
      data_importacao TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS skap_avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      nivel_skap TEXT NOT NULL,
      nivel_original TEXT,
      progresso_percentual REAL DEFAULT 0,
      atingimento_habilidade_tecnica REAL DEFAULT 0,
      observacao_habilidade_tecnica TEXT,
      atingimento_habilidade_especifica REAL DEFAULT 0,
      observacao_habilidade_especifica TEXT,
      atingimento_habilidade_empoderamento REAL DEFAULT 0,
      observacao_habilidade_empoderamento TEXT,
      proficiencia REAL DEFAULT 0,
      proximo_nivel TEXT,
      percentual_para_proximo_nivel REAL DEFAULT 0,
      plano_acao TEXT,
      status_skap TEXT,
      proficiencia_percentual REAL,
      habilidades_tecnicas_percentual REAL,
      habilidades_especificas_percentual REAL,
      habilidades_empoderamento_percentual REAL,
      cargo TEXT,
      atividade TEXT,
      tempo_de_casa TEXT,
      atendimento TEXT DEFAULT 'pendente',
      cinco_s TEXT DEFAULT 'pendente',
      retorno_rota TEXT DEFAULT 'pendente',
      seguranca TEXT DEFAULT 'pendente',
      evolucao_atendimento TEXT DEFAULT 'pendente',
      evolucao_cinco_s TEXT DEFAULT 'pendente',
      evolucao_retorno_rota TEXT DEFAULT 'pendente',
      evolucao_seguranca TEXT DEFAULT 'pendente',
      empoderamento TEXT DEFAULT 'pendente',
      longa_distancia TEXT DEFAULT 'pendente',
      campeao_seguranca TEXT DEFAULT 'pendente',
      autonomia TEXT DEFAULT 'pendente',
      observacao_lideranca TEXT,
      data_avaliacao TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    const ensureSkapColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(skap_avaliacoes)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE skap_avaliacoes ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    [
      ['atingimento_habilidade_tecnica', 'REAL DEFAULT 0'],
      ['observacao_habilidade_tecnica', 'TEXT'],
      ['atingimento_habilidade_especifica', 'REAL DEFAULT 0'],
      ['observacao_habilidade_especifica', 'TEXT'],
      ['atingimento_habilidade_empoderamento', 'REAL DEFAULT 0'],
      ['observacao_habilidade_empoderamento', 'TEXT'],
      ['proficiencia', 'REAL DEFAULT 0'],
      ['proximo_nivel', 'TEXT'],
      ['percentual_para_proximo_nivel', 'REAL DEFAULT 0'],
      ['plano_acao', 'TEXT'],
      ['status_skap', 'TEXT'],
      ['updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP']
    ].forEach(([name, definition]) => ensureSkapColumn(name, definition));

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS skap_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      avaliacao_id INTEGER,
      nivel_anterior TEXT,
      nivel_novo TEXT NOT NULL,
      progresso_anterior REAL,
      progresso_novo REAL,
      motivo TEXT,
      data_avaliacao TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
      FOREIGN KEY (avaliacao_id) REFERENCES skap_avaliacoes(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS produtividade_importacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arquivo TEXT NOT NULL,
      competencia TEXT,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      total_linhas INTEGER DEFAULT 0,
      importados INTEGER DEFAULT 0,
      atualizados INTEGER DEFAULT 0,
      ignorados INTEGER DEFAULT 0,
      erros INTEGER DEFAULT 0,
      valor_total_nova_rv REAL DEFAULT 0,
      valor_total_rv_antiga REAL DEFAULT 0,
      valor_total_rv_nova REAL DEFAULT 0,
      valor_total_diferenca REAL DEFAULT 0,
      detalhes_json TEXT,
      criado_por INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS produtividade_colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importacao_id INTEGER,
      colaborador_id INTEGER NOT NULL,
      matricula TEXT NOT NULL,
      nome_completo TEXT,
      cpf TEXT,
      codigo_rv TEXT,
      nome_rv TEXT,
      competencia TEXT NOT NULL,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      funcao_rv TEXT NOT NULL,
      cargo TEXT,
      setor TEXT,
      tipo_colaborador TEXT,
      perfil TEXT,
      caixas REAL,
      entregas REAL,
      percentual_devolucao REAL,
      meta_devolucao REAL,
      bateu_devolucao INTEGER,
      recargas REAL,
      mapas REAL,
      ftr2_c_jorn REAL DEFAULT 0,
      ftr2_s_jorn REAL DEFAULT 0,
      ftr1_c_jorn REAL DEFAULT 0,
      ftr1_s_jorn REAL DEFAULT 0,
      ftr0_c_jorn REAL DEFAULT 0,
      ftr0_s_jorn REAL DEFAULT 0,
      valor_recarga REAL DEFAULT 0,
      bonus REAL,
      antiga_rv REAL,
      nova_rv REAL,
      rv_antiga REAL DEFAULT 0,
      rv_nova REAL DEFAULT 0,
      diferenca_rv REAL,
      valor_total_previsto REAL,
      extra REAL DEFAULT 0,
      status_produtividade TEXT,
      status_auditoria TEXT DEFAULT 'ok',
      metodo_cruzamento TEXT,
      confianca_cruzamento REAL,
      observacao_cruzamento TEXT,
      mensagem_rh TEXT,
      dados_originais_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (importacao_id) REFERENCES produtividade_importacoes(id) ON DELETE SET NULL,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS produtividade_msim_mensal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unidade TEXT NOT NULL,
      operacao TEXT,
      funcao TEXT NOT NULL,
      competencia TEXT NOT NULL,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      valor_msim REAL NOT NULL DEFAULT 0,
      fonte TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (unidade, funcao, competencia)
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS produtividade_armazem_importacoes (
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS produtividade_armazem_colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importacao_id INTEGER REFERENCES produtividade_armazem_importacoes(id) ON DELETE SET NULL,
      colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
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
      publicado INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.all('PRAGMA table_info(produtividade_armazem_colaboradores)', [], (err, columns) => {
      if (!err && !columns.some((column) => column.name === 'publicado')) {
        sqliteDb.run('ALTER TABLE produtividade_armazem_colaboradores ADD COLUMN publicado INTEGER DEFAULT 1');
      }
    });

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS historico_pontuacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      pontuacao_anterior INTEGER,
      pontuacao_nova INTEGER,
      faixa_anterior TEXT,
      faixa_nova TEXT,
      motivo TEXT,
      responsavel TEXT,
      data_alteracao TEXT,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS respostas_chatbot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      pergunta TEXT NOT NULL,
      resposta TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    const ensureRespostaColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(respostas_chatbot)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE respostas_chatbot ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureRespostaColumn('created_at', 'TEXT');
    ensureRespostaColumn('updated_at', 'TEXT');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS atendimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER,
      telefone TEXT,
      mensagem TEXT,
      resposta TEXT,
      categoria TEXT,
      status TEXT,
      data_hora TEXT,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS satisfacao_yuri (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      ciclo TEXT NOT NULL,
      nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
      comentario TEXT,
      respondido_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (colaborador_id, ciclo),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_satisfacao_yuri_ciclo ON satisfacao_yuri(ciclo)');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'comunicado',
      prioridade TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'rascunho',
      para_todos INTEGER NOT NULL DEFAULT 1,
      para_admin INTEGER NOT NULL DEFAULT 0,
      para_motorista INTEGER NOT NULL DEFAULT 0,
      para_colaborador INTEGER NOT NULL DEFAULT 0,
      link_url TEXT,
      link_texto TEXT,
      inicio_em TEXT,
      fim_em TEXT,
      criado_por INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS notificacoes_leituras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notificacao_id INTEGER NOT NULL,
      colaborador_id INTEGER NOT NULL,
      lida_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (notificacao_id, colaborador_id),
      FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_notificacoes_status_periodo ON notificacoes(status, inicio_em, fim_em)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_notificacoes_leituras_colaborador ON notificacoes_leituras(colaborador_id, notificacao_id)');

    const ensureNotificacaoColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(notificacoes)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE notificacoes ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureNotificacaoColumn('enviar_push', 'INTEGER NOT NULL DEFAULT 0');
    ensureNotificacaoColumn('push_enviado_em', 'TEXT');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS push_inscricoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      ultimo_erro TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_push_inscricoes_colaborador ON push_inscricoes(colaborador_id, ativo)');

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS push_configuracao (
      id INTEGER PRIMARY KEY,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS acoes_comunicacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      imagem_url TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      data_evento TEXT,
      criado_em TEXT,
      atualizado_em TEXT
    )`);

    const ensureAcaoColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(acoes_comunicacao)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE acoes_comunicacao ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureAcaoColumn('responsavel', 'TEXT');
    ensureAcaoColumn('encaminhamento', 'TEXT');
    ensureAcaoColumn('status', "TEXT DEFAULT 'publicado'");

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_modulos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      em_manutencao INTEGER DEFAULT 0,
      mensagem_manutencao TEXT,
      visivel_para_admin INTEGER DEFAULT 1,
      visivel_para_motorista INTEGER DEFAULT 1,
      visivel_para_colaborador INTEGER DEFAULT 1,
      ordem INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS campeoes_seguranca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER,
      competencia TEXT NOT NULL,
      nome_colaborador TEXT NOT NULL,
      matricula TEXT,
      cargo TEXT,
      setor TEXT,
      foto_url TEXT,
      motivo_reconhecimento TEXT NOT NULL,
      log_on_100 INTEGER DEFAULT 0,
      participacao_matinais INTEGER DEFAULT 0,
      sem_acidentes INTEGER DEFAULT 0,
      sem_fluxo_punitivo INTEGER DEFAULT 0,
      observacao TEXT,
      status TEXT DEFAULT 'rascunho',
      criado_por INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL,
      FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_importacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arquivo TEXT,
      total_abas INTEGER DEFAULT 0,
      abas_importadas INTEGER DEFAULT 0,
      abas_ignoradas INTEGER DEFAULT 0,
      rotogramas_importados INTEGER DEFAULT 0,
      pontos_risco_importados INTEGER DEFAULT 0,
      telefones_importados INTEGER DEFAULT 0,
      checklists_importados INTEGER DEFAULT 0,
      premissas_importadas INTEGER DEFAULT 0,
      detalhes_json TEXT,
      criado_por INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotogramas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotograma_id TEXT UNIQUE,
      nome TEXT NOT NULL,
      origem TEXT,
      destino TEXT,
      cidade TEXT,
      transportadora TEXT,
      classificacao_rota TEXT,
      nivel_risco TEXT,
      status TEXT DEFAULT 'ativo',
      ativo INTEGER DEFAULT 1,
      observacao TEXT,
      data_atualizacao TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_pontos_risco (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotograma_id INTEGER,
      tipo_ponto TEXT,
      descricao TEXT,
      nivel_risco TEXT,
      rodovia_endereco TEXT,
      orientacao TEXT,
      latitude TEXT,
      longitude TEXT,
      velocidade_permitida TEXT,
      velocidade_segura TEXT,
      cidade TEXT,
      origem_aba TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rotograma_id) REFERENCES rotogramas(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_areas_suporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotograma_id INTEGER,
      nome TEXT DEFAULT 'RegiÃ£o com suporte',
      latitude TEXT NOT NULL,
      longitude TEXT NOT NULL,
      raio_km REAL NOT NULL DEFAULT 8,
      observacao TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rotograma_id) REFERENCES rotogramas(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS permissoes_colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      permissao TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      concedido_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (colaborador_id, permissao),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER,
      matricula TEXT,
      entidade TEXT NOT NULL,
      entidade_id INTEGER,
      acao TEXT NOT NULL,
      antes_json TEXT,
      depois_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_telefones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotograma_id INTEGER,
      orgao TEXT,
      telefone TEXT,
      descricao TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rotograma_id) REFERENCES rotogramas(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotograma_id INTEGER,
      item TEXT NOT NULL,
      categoria TEXT,
      obrigatorio INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rotograma_id) REFERENCES rotogramas(id) ON DELETE CASCADE
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_premissas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      titulo TEXT,
      descricao TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS rotograma_materiais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      titulo TEXT,
      descricao TEXT,
      origem_aba TEXT,
      dados_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    const moduloDefaults = [
      ['pesquisa_clima', 'Pesquisa de Clima', 'Pesquisas de satisfacao da empresa.', 1, 0, null, 1, 1, 1, 10],
      ['skap', 'SKAP', 'Evolucao, nivel atual e habilidades avaliadas.', 1, 0, null, 1, 1, 1, 20],
      ['campeao_seguranca', 'Campeão de Segurança', 'Reconhecimento de atitudes seguras.', 1, 0, null, 1, 1, 1, 30],
      ['tres_rs', '3 Rs', 'Responsabilidades, recursos e reconhecimentos da metodologia 3Rs.', 1, 0, null, 1, 1, 1, 40],
      ['premio_produtividade', 'Prêmio de Produtividade', 'Indicadores, metas e valor previsto do prêmio.', 0, 1, 'Estamos ajustando os dados deste painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.', 1, 1, 1, 50],
      ['indicadores_rota', 'Indicadores da Rota', 'Acompanhe as metas e entenda os indicadores que ajudam sua rota a ser mais produtiva, organizada e segura.', 1, 0, null, 1, 1, 0, 55],
      ['premio_produtividade_armazem', 'Prêmio de Produtividade do Armazém', 'RV e prêmio de produtividade para Ajudante, Operador de Empilhadeira e Amarrador.', 0, 1, 'Estamos ajustando os dados deste painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.', 1, 1, 1, 56],
      ['rotograma_seguro', 'Rotograma Seguro', 'Consulte rotas, pontos de risco, telefones de emergência e orientações de segurança da operação.', 1, 0, null, 1, 1, 1, 57],
      ['prontuario_motorista', 'Prontuario do Colaborador', 'Pontuacao, faixa atual e ocorrencias registradas.', 1, 0, null, 1, 1, 1, 60],
      ['ouvidoria', 'Ouvidoria', 'Canal oficial para solicitacoes, duvidas ou relatos.', 1, 0, null, 1, 1, 1, 70],
      ['super_team_room', 'Super Team Room', 'Destaques e reconhecimentos mensais da unidade.', 1, 0, null, 1, 1, 1, 75],
      ['assistente_rh', 'Yuri, Assistente de RH', 'Atendimento virtual da Central do Colaborador.', 1, 0, null, 1, 1, 1, 80]
    ];

    moduloDefaults.forEach((item) => {
      sqliteDb.run(
        `INSERT OR IGNORE INTO configuracoes_modulos
         (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, visivel_para_admin, visivel_para_motorista, visivel_para_colaborador, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item
      );
    });

    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuario_motoristas_colaborador ON prontuario_motoristas(colaborador_id)');
    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuarios_motoristas_colaborador ON prontuarios_motoristas(colaborador_id)');
    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_skap_avaliacoes_colaborador ON skap_avaliacoes(colaborador_id)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_status ON campeoes_seguranca(status)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_competencia ON campeoes_seguranca(competencia)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_colaborador ON campeoes_seguranca(colaborador_id)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_skap_avaliacoes_nivel ON skap_avaliacoes(nivel_skap)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_skap_historico_colaborador ON skap_historico(colaborador_id)');
    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_produtividade_colab_comp_funcao ON produtividade_colaboradores(colaborador_id, competencia, funcao_rv)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_matricula ON produtividade_colaboradores(matricula)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_cpf ON produtividade_colaboradores(cpf)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_competencia ON produtividade_colaboradores(competencia)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_funcao_rv ON produtividade_colaboradores(funcao_rv)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_status ON produtividade_colaboradores(status_produtividade)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_bateu_devolucao ON produtividade_colaboradores(bateu_devolucao)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_msim_competencia ON produtividade_msim_mensal(competencia)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_produtividade_msim_unidade_funcao ON produtividade_msim_mensal(unidade, funcao)');
    sqliteDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_armazem_colab_comp_funcao ON produtividade_armazem_colaboradores(colaborador_id, competencia, funcao_armazem)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_matricula ON produtividade_armazem_colaboradores(matricula)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_cpf ON produtividade_armazem_colaboradores(cpf)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_competencia ON produtividade_armazem_colaboradores(competencia)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_funcao ON produtividade_armazem_colaboradores(funcao_armazem)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_status ON produtividade_armazem_colaboradores(status_produtividade)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_status_auditoria ON produtividade_armazem_colaboradores(status_auditoria)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_prod_armazem_origem ON produtividade_armazem_colaboradores(origem_calculo)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_rotogramas_cidade ON rotogramas(cidade)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_rotogramas_nivel_risco ON rotogramas(nivel_risco)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_rotogramas_status ON rotogramas(status)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_rotograma_pontos_rota ON rotograma_pontos_risco(rotograma_id)');
    sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_rotograma_pontos_nivel ON rotograma_pontos_risco(nivel_risco)');

    const ensureRotogramaColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(rotogramas)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE rotogramas ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    const ensureRotogramaImportColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(rotograma_importacoes)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE rotograma_importacoes ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureRotogramaColumn('ativo', 'INTEGER DEFAULT 1');
    ensureRotogramaColumn('map_path_json', 'TEXT');
    ensureRotogramaColumn('distancia_km', 'REAL');
    ensureRotogramaColumn('duracao_minutos', 'REAL');
    ensureRotogramaColumn('geometry_updated_at', 'TEXT');
    ensureRotogramaImportColumn('ativo', 'INTEGER DEFAULT 1');

    const ensureRotogramaPointColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(rotograma_pontos_risco)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE rotograma_pontos_risco ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    ensureRotogramaPointColumn('ordem', 'INTEGER');
    ensureRotogramaPointColumn('fim_latitude', 'TEXT');
    ensureRotogramaPointColumn('fim_longitude', 'TEXT');
    ensureRotogramaPointColumn('trecho_nivel', 'TEXT');

    const ensureProdutividadeImportColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(produtividade_importacoes)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE produtividade_importacoes ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    const ensureProdutividadeColumn = (name, definition) => {
      sqliteDb.all('PRAGMA table_info(produtividade_colaboradores)', [], (err, columns) => {
        if (err) return;
        if (!columns.some((column) => column.name === name)) {
          sqliteDb.run(`ALTER TABLE produtividade_colaboradores ADD COLUMN ${name} ${definition}`);
        }
      });
    };

    [
      ['valor_total_rv_antiga', 'REAL DEFAULT 0'],
      ['valor_total_rv_nova', 'REAL DEFAULT 0'],
      ['valor_total_diferenca', 'REAL DEFAULT 0']
    ].forEach(([name, definition]) => ensureProdutividadeImportColumn(name, definition));

    [
      ['codigo_rv', 'TEXT'],
      ['nome_rv', 'TEXT'],
      ['cargo', 'TEXT'],
      ['setor', 'TEXT'],
      ['tipo_colaborador', 'TEXT'],
      ['perfil', 'TEXT'],
      ['ftr2_c_jorn', 'REAL DEFAULT 0'],
      ['ftr2_s_jorn', 'REAL DEFAULT 0'],
      ['ftr1_c_jorn', 'REAL DEFAULT 0'],
      ['ftr1_s_jorn', 'REAL DEFAULT 0'],
      ['ftr0_c_jorn', 'REAL DEFAULT 0'],
      ['ftr0_s_jorn', 'REAL DEFAULT 0'],
      ['valor_recarga', 'REAL DEFAULT 0'],
      ['rv_antiga', 'REAL DEFAULT 0'],
      ['rv_nova', 'REAL DEFAULT 0'],
      ['extra', 'REAL DEFAULT 0'],
      ['status_auditoria', "TEXT DEFAULT 'ok'"],
      ['metodo_cruzamento', 'TEXT'],
      ['confianca_cruzamento', 'REAL'],
      ['observacao_cruzamento', 'TEXT'],
      ['mensagem_rh', 'TEXT']
    ].forEach(([name, definition]) => ensureProdutividadeColumn(name, definition));
  });

  return sqliteDb;
}

function connectPostgres() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || /sslmode=require/i.test(process.env.DATABASE_URL || '')
      ? { rejectUnauthorized: false }
      : false,
  });
  return pool;
}

const client = usePostgres ? connectPostgres() : connectSqlite();

function all(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (usePostgres) {
    const query = normalizeSql(sql);
    if (callback) {
      pool.query(query, params).then((result) => callback(null, result.rows)).catch(callback);
      return;
    }
    return pool.query(query, params).then((result) => result.rows);
  }

  if (callback) {
    sqliteDb.all(sql, params, callback);
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (usePostgres) {
    const query = normalizeSql(sql);
    if (callback) {
      pool.query(query, params).then((result) => callback(null, result.rows[0])).catch(callback);
      return;
    }
    return pool.query(query, params).then((result) => result.rows[0]);
  }

  if (callback) {
    sqliteDb.get(sql, params, callback);
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const postgresRunner = async () => {
    const query = normalizeSql(sql);
    const result = await pool.query(query, params);
    const ctx = { lastID: null, changes: result.rowCount };

    if (result.command === 'INSERT') {
      if (result.rows?.[0]?.id !== undefined) {
        ctx.lastID = result.rows[0].id;
      } else if (result.rowCount > 0) {
        try {
          const last = await pool.query('SELECT LASTVAL() AS id');
          ctx.lastID = last.rows?.[0]?.id || null;
        } catch (error) {
          // INSERTs sem sequence (ou com id explicito) nao possuem LASTVAL.
          // A operacao foi concluida; apenas nao ha lastID para retornar.
          if (error.code !== '55000') throw error;
        }
      }
    }

    return ctx;
  };

  if (usePostgres) {
    if (callback) {
      postgresRunner()
        .then((ctx) => callback.call(ctx, null))
        .catch(callback);
      return;
    }
    return postgresRunner();
  }

  if (callback) {
    sqliteDb.run(sql, params, function (err) {
      callback.call(this, err);
    });
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function query(sql, params = []) {
  if (usePostgres) {
    return pool.query(normalizeSql(sql), params);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve({ rows });
    });
  });
}

function serialize(fn) {
  if (!usePostgres && typeof sqliteDb.serialize === 'function') {
    return sqliteDb.serialize(fn);
  }
  return fn();
}

function close(callback) {
  if (usePostgres) {
    if (callback) return pool.end(callback);
    return pool.end();
  }

  if (callback) return sqliteDb.close(callback);
  return new Promise((resolve, reject) => {
    sqliteDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  all,
  get,
  run,
  query,
  serialize,
  close,
};
