ALTER TABLE acoes_comunicacao
  ADD COLUMN IF NOT EXISTS responsavel TEXT;

ALTER TABLE acoes_comunicacao
  ADD COLUMN IF NOT EXISTS encaminhamento TEXT;

ALTER TABLE acoes_comunicacao
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'publicado';

UPDATE acoes_comunicacao
SET status = CASE WHEN COALESCE(ativo, 1) = 1 THEN 'publicado' ELSE 'oculto' END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_acoes_comunicacao_categoria
  ON acoes_comunicacao(categoria);

CREATE INDEX IF NOT EXISTS idx_acoes_comunicacao_ativo
  ON acoes_comunicacao(ativo);
