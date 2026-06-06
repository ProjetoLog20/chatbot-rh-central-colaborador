CREATE TABLE IF NOT EXISTS produtividade_armazem_importacoes (
  id SERIAL PRIMARY KEY,
  arquivo TEXT,
  competencia TEXT,
  periodo_inicio DATE,
  periodo_fim DATE,
  total_linhas INTEGER DEFAULT 0,
  importados INTEGER DEFAULT 0,
  atualizados INTEGER DEFAULT 0,
  ignorados INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  valor_total_previsto NUMERIC(12,2) DEFAULT 0,
  valor_total_rv_antiga NUMERIC(12,2) DEFAULT 0,
  valor_total_rv_nova NUMERIC(12,2) DEFAULT 0,
  detalhes_json JSONB,
  criado_por INTEGER NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produtividade_armazem_colaboradores (
  id SERIAL PRIMARY KEY,
  importacao_id INTEGER REFERENCES produtividade_armazem_importacoes(id) ON DELETE SET NULL,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  periodo_inicio DATE,
  periodo_fim DATE,
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
  pontos NUMERIC(12,2) DEFAULT 0,
  faixa TEXT,
  rv_antiga NUMERIC(12,2) DEFAULT 0,
  rv_nova NUMERIC(12,2) DEFAULT 0,
  erros NUMERIC(12,2) DEFAULT 0,
  valor_total_previsto NUMERIC(12,2) DEFAULT 0,
  indicador_1 TEXT,
  indicador_2 TEXT,
  indicador_3 TEXT,
  status_produtividade TEXT,
  origem_calculo TEXT,
  status_auditoria TEXT DEFAULT 'ok',
  metodo_cruzamento TEXT,
  confianca_cruzamento NUMERIC(10,4),
  observacao_cruzamento TEXT,
  mensagem_rh TEXT,
  dados_originais_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE produtividade_armazem_importacoes
  ADD COLUMN IF NOT EXISTS arquivo TEXT,
  ADD COLUMN IF NOT EXISTS competencia TEXT,
  ADD COLUMN IF NOT EXISTS periodo_inicio DATE,
  ADD COLUMN IF NOT EXISTS periodo_fim DATE,
  ADD COLUMN IF NOT EXISTS total_linhas INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS importados INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS atualizados INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ignorados INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS erros INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_previsto NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_rv_antiga NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_rv_nova NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detalhes_json JSONB,
  ADD COLUMN IF NOT EXISTS criado_por INTEGER NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE produtividade_armazem_colaboradores
  ADD COLUMN IF NOT EXISTS importacao_id INTEGER REFERENCES produtividade_armazem_importacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS competencia TEXT,
  ADD COLUMN IF NOT EXISTS periodo_inicio DATE,
  ADD COLUMN IF NOT EXISTS periodo_fim DATE,
  ADD COLUMN IF NOT EXISTS matricula TEXT,
  ADD COLUMN IF NOT EXISTS nome_completo TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS funcao_armazem TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS setor TEXT,
  ADD COLUMN IF NOT EXISTS tipo_colaborador TEXT,
  ADD COLUMN IF NOT EXISTS perfil TEXT,
  ADD COLUMN IF NOT EXISTS usuario_wms TEXT,
  ADD COLUMN IF NOT EXISTS codigo_operacional TEXT,
  ADD COLUMN IF NOT EXISTS pontos NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faixa TEXT,
  ADD COLUMN IF NOT EXISTS rv_antiga NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rv_nova NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS erros NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_previsto NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indicador_1 TEXT,
  ADD COLUMN IF NOT EXISTS indicador_2 TEXT,
  ADD COLUMN IF NOT EXISTS indicador_3 TEXT,
  ADD COLUMN IF NOT EXISTS status_produtividade TEXT,
  ADD COLUMN IF NOT EXISTS origem_calculo TEXT,
  ADD COLUMN IF NOT EXISTS status_auditoria TEXT DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS metodo_cruzamento TEXT,
  ADD COLUMN IF NOT EXISTS confianca_cruzamento NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS observacao_cruzamento TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_rh TEXT,
  ADD COLUMN IF NOT EXISTS dados_originais_json JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_armazem_colab_comp_funcao
  ON produtividade_armazem_colaboradores (colaborador_id, competencia, funcao_armazem);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_matricula
  ON produtividade_armazem_colaboradores (matricula);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_cpf
  ON produtividade_armazem_colaboradores (cpf);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_competencia
  ON produtividade_armazem_colaboradores (competencia);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_funcao
  ON produtividade_armazem_colaboradores (funcao_armazem);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_status
  ON produtividade_armazem_colaboradores (status_produtividade);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_status_auditoria
  ON produtividade_armazem_colaboradores (status_auditoria);

CREATE INDEX IF NOT EXISTS idx_prod_armazem_origem
  ON produtividade_armazem_colaboradores (origem_calculo);

INSERT INTO configuracoes_modulos
  (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, visivel_para_admin, visivel_para_motorista, visivel_para_colaborador, ordem)
VALUES
  (
    'premio_produtividade_armazem',
    'Premio de Produtividade do Armazem',
    'RV e premio de produtividade para Ajudante, Operador de Empilhadeira e Amarrador.',
    false,
    true,
    'Estamos ajustando os dados deste painel para garantir que as informacoes sejam apresentadas corretamente. Em breve ele estara disponivel.',
    true,
    true,
    true,
    56
  )
ON CONFLICT (chave) DO NOTHING;
