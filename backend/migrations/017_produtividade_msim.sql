CREATE TABLE IF NOT EXISTS produtividade_msim_mensal (
  id SERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  operacao TEXT,
  funcao TEXT NOT NULL,
  competencia TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  valor_msim NUMERIC(12,2) NOT NULL DEFAULT 0,
  fonte TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (unidade, funcao, competencia)
);

CREATE INDEX IF NOT EXISTS idx_produtividade_msim_competencia
  ON produtividade_msim_mensal (competencia);

CREATE INDEX IF NOT EXISTS idx_produtividade_msim_unidade_funcao
  ON produtividade_msim_mensal (unidade, funcao);
