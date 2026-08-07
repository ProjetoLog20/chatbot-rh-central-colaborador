CREATE TABLE IF NOT EXISTS planos_melhoria_buckets (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  cor TEXT NOT NULL DEFAULT 'slate',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planos_melhoria_cards (
  id SERIAL PRIMARY KEY,
  bucket_id INTEGER NOT NULL REFERENCES planos_melhoria_buckets(id),
  titulo TEXT NOT NULL,
  descricao TEXT,
  responsavel_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  prioridade TEXT NOT NULL DEFAULT 'Média',
  prazo DATE,
  etiquetas TEXT,
  checklist_concluidos INTEGER NOT NULL DEFAULT 0,
  checklist_total INTEGER NOT NULL DEFAULT 0,
  arquivado BOOLEAN NOT NULL DEFAULT false,
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planos_melhoria_comentarios (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES planos_melhoria_cards(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  comentario TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planos_melhoria_auditoria (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  card_id INTEGER REFERENCES planos_melhoria_cards(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  detalhes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planos_cards_bucket ON planos_melhoria_cards(bucket_id, arquivado);
CREATE INDEX IF NOT EXISTS idx_planos_cards_responsavel ON planos_melhoria_cards(responsavel_id, arquivado);
CREATE INDEX IF NOT EXISTS idx_planos_comentarios_card ON planos_melhoria_comentarios(card_id, created_at);

INSERT INTO permissoes_colaboradores (colaborador_id, permissao, ativo)
SELECT id, 'planos_melhoria_grau_1', true
FROM colaboradores
WHERE matricula IN ('19349', '19047', '50383')
ON CONFLICT (colaborador_id, permissao)
DO UPDATE SET ativo = true;

INSERT INTO planos_melhoria_buckets (titulo, descricao, ordem, cor)
SELECT dados.titulo, dados.descricao, dados.ordem, dados.cor
FROM (VALUES
  ('Ideias', 'Sugestões para avaliar', 10, 'slate'),
  ('Vamos fazer', 'Atividades já combinadas', 20, 'violet'),
  ('Em andamento', 'Alguém está cuidando', 30, 'blue'),
  ('Aguardando conferência', 'Prontas para revisar', 40, 'amber'),
  ('Concluído', 'Melhorias entregues', 50, 'green')
) AS dados(titulo, descricao, ordem, cor)
WHERE NOT EXISTS (
  SELECT 1 FROM planos_melhoria_buckets bucket WHERE LOWER(bucket.titulo) = LOWER(dados.titulo)
);
