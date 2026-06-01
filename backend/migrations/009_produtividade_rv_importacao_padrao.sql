ALTER TABLE produtividade_importacoes
  ADD COLUMN IF NOT EXISTS valor_total_rv_antiga NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_rv_nova NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_diferenca NUMERIC(12,2) DEFAULT 0;

ALTER TABLE produtividade_colaboradores
  ADD COLUMN IF NOT EXISTS codigo_rv TEXT,
  ADD COLUMN IF NOT EXISTS nome_rv TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS setor TEXT,
  ADD COLUMN IF NOT EXISTS tipo_colaborador TEXT,
  ADD COLUMN IF NOT EXISTS perfil TEXT,
  ADD COLUMN IF NOT EXISTS ftr2_c_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ftr2_s_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ftr1_c_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ftr1_s_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ftr0_c_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ftr0_s_jorn NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_recarga NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rv_antiga NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rv_nova NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_auditoria TEXT DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS metodo_cruzamento TEXT,
  ADD COLUMN IF NOT EXISTS confianca_cruzamento NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS observacao_cruzamento TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_rh TEXT;

UPDATE produtividade_colaboradores
SET rv_antiga = COALESCE(rv_antiga, antiga_rv, 0),
    rv_nova = COALESCE(rv_nova, nova_rv, valor_total_previsto, 0),
    antiga_rv = COALESCE(antiga_rv, rv_antiga, 0),
    nova_rv = COALESCE(nova_rv, rv_nova, valor_total_previsto, 0),
    valor_total_previsto = COALESCE(valor_total_previsto, rv_nova, nova_rv, 0),
    status_auditoria = COALESCE(status_auditoria, 'ok');

CREATE INDEX IF NOT EXISTS idx_produtividade_cpf
  ON produtividade_colaboradores (cpf);

CREATE INDEX IF NOT EXISTS idx_produtividade_status
  ON produtividade_colaboradores (status_produtividade);

CREATE INDEX IF NOT EXISTS idx_produtividade_bateu_devolucao
  ON produtividade_colaboradores (bateu_devolucao);

CREATE INDEX IF NOT EXISTS idx_produtividade_status_auditoria
  ON produtividade_colaboradores (status_auditoria);
