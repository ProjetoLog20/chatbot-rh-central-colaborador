CREATE TABLE IF NOT EXISTS rotograma_importacoes (
  id SERIAL PRIMARY KEY,
  arquivo TEXT,
  total_abas INTEGER DEFAULT 0,
  abas_importadas INTEGER DEFAULT 0,
  abas_ignoradas INTEGER DEFAULT 0,
  rotogramas_importados INTEGER DEFAULT 0,
  pontos_risco_importados INTEGER DEFAULT 0,
  telefones_importados INTEGER DEFAULT 0,
  checklists_importados INTEGER DEFAULT 0,
  premissas_importadas INTEGER DEFAULT 0,
  detalhes_json TEXT,
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotogramas (
  id SERIAL PRIMARY KEY,
  rotograma_id TEXT UNIQUE,
  nome TEXT NOT NULL,
  origem TEXT,
  destino TEXT,
  cidade TEXT,
  transportadora TEXT,
  classificacao_rota TEXT,
  nivel_risco TEXT,
  status TEXT DEFAULT 'ativo',
  observacao TEXT,
  data_atualizacao TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotograma_pontos_risco (
  id SERIAL PRIMARY KEY,
  rotograma_id INTEGER REFERENCES rotogramas(id) ON DELETE CASCADE,
  tipo_ponto TEXT,
  descricao TEXT,
  nivel_risco TEXT,
  rodovia_endereco TEXT,
  orientacao TEXT,
  latitude TEXT,
  longitude TEXT,
  velocidade_permitida TEXT,
  velocidade_segura TEXT,
  cidade TEXT,
  origem_aba TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotograma_telefones (
  id SERIAL PRIMARY KEY,
  rotograma_id INTEGER REFERENCES rotogramas(id) ON DELETE CASCADE,
  orgao TEXT,
  telefone TEXT,
  descricao TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotograma_checklist (
  id SERIAL PRIMARY KEY,
  rotograma_id INTEGER REFERENCES rotogramas(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  categoria TEXT,
  obrigatorio BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotograma_premissas (
  id SERIAL PRIMARY KEY,
  categoria TEXT,
  titulo TEXT,
  descricao TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotograma_materiais (
  id SERIAL PRIMARY KEY,
  tipo TEXT,
  titulo TEXT,
  descricao TEXT,
  origem_aba TEXT,
  dados_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotogramas_cidade ON rotogramas(cidade);
CREATE INDEX IF NOT EXISTS idx_rotogramas_nivel_risco ON rotogramas(nivel_risco);
CREATE INDEX IF NOT EXISTS idx_rotogramas_status ON rotogramas(status);
CREATE INDEX IF NOT EXISTS idx_rotograma_pontos_rota ON rotograma_pontos_risco(rotograma_id);
CREATE INDEX IF NOT EXISTS idx_rotograma_pontos_nivel ON rotograma_pontos_risco(nivel_risco);

INSERT INTO configuracoes_modulos
  (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, visivel_para_admin, visivel_para_motorista, visivel_para_colaborador, ordem)
VALUES
  ('rotograma_seguro', 'Rotograma Seguro', 'Consulte rotas, pontos de risco, telefones de emergencia e orientacoes de seguranca da operacao.', true, false, null, true, true, true, 57)
ON CONFLICT (chave) DO NOTHING;
