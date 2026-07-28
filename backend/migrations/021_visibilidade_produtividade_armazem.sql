ALTER TABLE produtividade_armazem_colaboradores
  ADD COLUMN IF NOT EXISTS publicado BOOLEAN DEFAULT true;

UPDATE produtividade_armazem_colaboradores
SET publicado = CASE
  WHEN competencia = '07/2026' THEN true
  ELSE false
END;

CREATE INDEX IF NOT EXISTS idx_prod_armazem_publicado
  ON produtividade_armazem_colaboradores (publicado);
