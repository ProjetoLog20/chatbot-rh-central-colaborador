CREATE TABLE IF NOT EXISTS pesquisas_clima (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'rascunho',
  anonima BOOLEAN DEFAULT false,
  data_inicio TIMESTAMP,
  data_fim TIMESTAMP,
  criado_por INTEGER REFERENCES colaboradores(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perguntas_clima (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  pergunta TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ordem INTEGER,
  obrigatoria BOOLEAN DEFAULT true,
  ativa BOOLEAN DEFAULT true,
  opcoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respostas_clima (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  pergunta_id INTEGER NOT NULL REFERENCES perguntas_clima(id) ON DELETE CASCADE,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  nota INTEGER,
  resposta_texto TEXT,
  resposta_opcao TEXT,
  comentario TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planos_acao_clima (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  problema TEXT NOT NULL,
  acao TEXT NOT NULL,
  responsavel INTEGER REFERENCES colaboradores(id),
  prazo DATE,
  status TEXT DEFAULT 'planejado',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pesquisas_clima_status ON pesquisas_clima(status);
CREATE INDEX IF NOT EXISTS idx_perguntas_clima_pesquisa ON perguntas_clima(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_respostas_clima_pesquisa ON respostas_clima(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_respostas_clima_colaborador ON respostas_clima(colaborador_id);
