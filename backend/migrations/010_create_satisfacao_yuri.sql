CREATE TABLE IF NOT EXISTS satisfacao_yuri (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ciclo TEXT NOT NULL,
  nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario TEXT,
  respondido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (colaborador_id, ciclo)
);

CREATE INDEX IF NOT EXISTS idx_satisfacao_yuri_ciclo
  ON satisfacao_yuri (ciclo);
