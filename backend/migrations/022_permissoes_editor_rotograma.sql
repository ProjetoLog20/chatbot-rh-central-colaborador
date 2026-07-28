CREATE TABLE IF NOT EXISTS permissoes_colaboradores (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  permissao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  concedido_em TIMESTAMP DEFAULT NOW(),
  UNIQUE (colaborador_id, permissao)
);

CREATE TABLE IF NOT EXISTS rotograma_auditoria (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  matricula TEXT,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL,
  antes_json TEXT,
  depois_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissoes_colaborador
  ON permissoes_colaboradores(colaborador_id, permissao, ativo);

CREATE INDEX IF NOT EXISTS idx_rotograma_auditoria_entidade
  ON rotograma_auditoria(entidade, entidade_id, created_at);

INSERT INTO permissoes_colaboradores (colaborador_id, permissao, ativo)
SELECT id, 'rotograma_editar', true
FROM colaboradores
WHERE matricula = '19022'
ON CONFLICT (colaborador_id, permissao)
DO UPDATE SET ativo = true;
