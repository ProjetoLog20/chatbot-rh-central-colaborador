ALTER TABLE rotogramas ADD COLUMN IF NOT EXISTS map_path_json TEXT;
ALTER TABLE rotogramas ADD COLUMN IF NOT EXISTS distancia_km NUMERIC;
ALTER TABLE rotogramas ADD COLUMN IF NOT EXISTS duracao_minutos NUMERIC;
ALTER TABLE rotogramas ADD COLUMN IF NOT EXISTS geometry_updated_at TIMESTAMP;

ALTER TABLE rotograma_pontos_risco ADD COLUMN IF NOT EXISTS ordem INTEGER;
ALTER TABLE rotograma_pontos_risco ADD COLUMN IF NOT EXISTS fim_latitude TEXT;
ALTER TABLE rotograma_pontos_risco ADD COLUMN IF NOT EXISTS fim_longitude TEXT;
ALTER TABLE rotograma_pontos_risco ADD COLUMN IF NOT EXISTS trecho_nivel TEXT;

CREATE TABLE IF NOT EXISTS rotograma_areas_suporte (
  id SERIAL PRIMARY KEY,
  rotograma_id INTEGER REFERENCES rotogramas(id) ON DELETE CASCADE,
  nome TEXT DEFAULT 'Região com suporte',
  latitude TEXT NOT NULL,
  longitude TEXT NOT NULL,
  raio_km NUMERIC NOT NULL DEFAULT 8,
  observacao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotograma_areas_suporte_rota
  ON rotograma_areas_suporte(rotograma_id);
