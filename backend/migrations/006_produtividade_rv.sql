CREATE TABLE IF NOT EXISTS produtividade_importacoes (
  id SERIAL PRIMARY KEY,
  arquivo TEXT NOT NULL,
  competencia TEXT,
  periodo_inicio DATE,
  periodo_fim DATE,
  total_linhas INTEGER DEFAULT 0,
  importados INTEGER DEFAULT 0,
  atualizados INTEGER DEFAULT 0,
  ignorados INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  valor_total_nova_rv NUMERIC(12,2) DEFAULT 0,
  detalhes_json JSONB,
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produtividade_colaboradores (
  id SERIAL PRIMARY KEY,
  importacao_id INTEGER REFERENCES produtividade_importacoes(id) ON DELETE SET NULL,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  matricula TEXT NOT NULL,
  nome_completo TEXT,
  cpf TEXT,
  competencia TEXT NOT NULL,
  periodo_inicio DATE,
  periodo_fim DATE,
  funcao_rv TEXT NOT NULL,
  caixas NUMERIC(12,2),
  entregas NUMERIC(12,2),
  percentual_devolucao NUMERIC(8,4),
  meta_devolucao NUMERIC(8,4),
  bateu_devolucao BOOLEAN,
  recargas NUMERIC(12,2),
  mapas NUMERIC(12,2),
  bonus NUMERIC(12,2),
  antiga_rv NUMERIC(12,2),
  nova_rv NUMERIC(12,2),
  diferenca_rv NUMERIC(12,2),
  valor_total_previsto NUMERIC(12,2),
  status_produtividade TEXT,
  dados_originais_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_produtividade_colab_comp_funcao
  ON produtividade_colaboradores (colaborador_id, competencia, funcao_rv);

CREATE INDEX IF NOT EXISTS idx_produtividade_matricula
  ON produtividade_colaboradores (matricula);

CREATE INDEX IF NOT EXISTS idx_produtividade_competencia
  ON produtividade_colaboradores (competencia);

CREATE INDEX IF NOT EXISTS idx_produtividade_funcao_rv
  ON produtividade_colaboradores (funcao_rv);
