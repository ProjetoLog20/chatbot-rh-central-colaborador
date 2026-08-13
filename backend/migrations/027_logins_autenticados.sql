CREATE TABLE IF NOT EXISTS logins_autenticados (
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  hora INTEGER NOT NULL CHECK (hora BETWEEN 0 AND 23),
  autenticado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logins_autenticados_data_hora
  ON logins_autenticados (data, hora);

CREATE INDEX IF NOT EXISTS idx_logins_autenticados_colaborador
  ON logins_autenticados (colaborador_id, data);
