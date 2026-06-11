UPDATE acoes_comunicacao
SET status = CASE WHEN COALESCE(ativo, 1) = 1 THEN 'publicado' ELSE 'oculto' END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_acoes_comunicacao_categoria
  ON acoes_comunicacao(categoria);

CREATE INDEX IF NOT EXISTS idx_acoes_comunicacao_ativo
  ON acoes_comunicacao(ativo);
