CREATE TABLE IF NOT EXISTS skap_avaliacoes (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nivel_skap TEXT NOT NULL,
  nivel_original TEXT,
  progresso_percentual NUMERIC(5,2) DEFAULT 0,
  proficiencia_percentual NUMERIC(5,2),
  habilidades_tecnicas_percentual NUMERIC(5,2),
  habilidades_especificas_percentual NUMERIC(5,2),
  habilidades_empoderamento_percentual NUMERIC(5,2),
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
  data_avaliacao DATE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skap_avaliacoes_colaborador
  ON skap_avaliacoes(colaborador_id);

CREATE INDEX IF NOT EXISTS idx_skap_avaliacoes_nivel
  ON skap_avaliacoes(nivel_skap);

CREATE TABLE IF NOT EXISTS skap_historico (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  avaliacao_id INTEGER REFERENCES skap_avaliacoes(id) ON DELETE CASCADE,
  nivel_anterior TEXT,
  nivel_novo TEXT NOT NULL,
  progresso_anterior NUMERIC(5,2),
  progresso_novo NUMERIC(5,2),
  motivo TEXT,
  data_avaliacao DATE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skap_historico_colaborador
  ON skap_historico(colaborador_id);
