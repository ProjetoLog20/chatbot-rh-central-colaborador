CREATE TABLE IF NOT EXISTS prontuarios_motoristas (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  matricula TEXT,
  nome_condutor TEXT,
  cpf TEXT,
  cargo TEXT,
  status_prontuario TEXT,
  motivo TEXT,
  data_bloqueio TEXT,
  pontuacao_cnh NUMERIC,
  vencimento_cnh TEXT,
  pontuacao_ponderada NUMERIC,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuarios_motoristas_colaborador
  ON prontuarios_motoristas (colaborador_id);

CREATE INDEX IF NOT EXISTS idx_prontuarios_motoristas_cpf
  ON prontuarios_motoristas (cpf);

CREATE INDEX IF NOT EXISTS idx_prontuarios_motoristas_cor_faixa
  ON prontuarios_motoristas (cor_faixa);

CREATE INDEX IF NOT EXISTS idx_prontuarios_motoristas_faixa
  ON prontuarios_motoristas (faixa);
