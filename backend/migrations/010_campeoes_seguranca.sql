CREATE TABLE IF NOT EXISTS campeoes_seguranca (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  competencia TEXT NOT NULL,
  nome_colaborador TEXT NOT NULL,
  matricula TEXT,
  cargo TEXT,
  setor TEXT,
  foto_url TEXT,
  motivo_reconhecimento TEXT NOT NULL,
  log_on_100 BOOLEAN DEFAULT false,
  participacao_matinais BOOLEAN DEFAULT false,
  sem_acidentes BOOLEAN DEFAULT false,
  sem_fluxo_punitivo BOOLEAN DEFAULT false,
  observacao TEXT,
  status TEXT DEFAULT 'rascunho',
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_status
  ON campeoes_seguranca (status);

CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_competencia
  ON campeoes_seguranca (competencia);

CREATE INDEX IF NOT EXISTS idx_campeoes_seguranca_colaborador
  ON campeoes_seguranca (colaborador_id);
