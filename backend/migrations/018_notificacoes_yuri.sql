CREATE TABLE IF NOT EXISTS notificacoes (
  id SERIAL PRIMARY KEY,
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
  inicio_em TIMESTAMP,
  fim_em TIMESTAMP,
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificacoes_leituras (
  id SERIAL PRIMARY KEY,
  notificacao_id INTEGER NOT NULL REFERENCES notificacoes(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  lida_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (notificacao_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_status_periodo
  ON notificacoes (status, inicio_em, fim_em);

CREATE INDEX IF NOT EXISTS idx_notificacoes_leituras_colaborador
  ON notificacoes_leituras (colaborador_id, notificacao_id);
