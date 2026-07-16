ALTER TABLE notificacoes
  ADD COLUMN IF NOT EXISTS enviar_push INTEGER NOT NULL DEFAULT 0;

ALTER TABLE notificacoes
  ADD COLUMN IF NOT EXISTS push_enviado_em TIMESTAMP;

CREATE TABLE IF NOT EXISTS push_inscricoes (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ultimo_erro TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_inscricoes_colaborador
  ON push_inscricoes (colaborador_id, ativo);

CREATE TABLE IF NOT EXISTS push_configuracao (
  id INTEGER PRIMARY KEY,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
