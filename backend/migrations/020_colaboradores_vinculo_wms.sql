ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS usuario_wms TEXT,
  ADD COLUMN IF NOT EXISTS codigo_operacional TEXT,
  ADD COLUMN IF NOT EXISTS wms_vinculo_status TEXT,
  ADD COLUMN IF NOT EXISTS wms_vinculo_metodo TEXT,
  ADD COLUMN IF NOT EXISTS wms_vinculado_em TIMESTAMP,
  ADD COLUMN IF NOT EXISTS wms_vinculo_origem TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_usuario_wms_unico
  ON colaboradores (usuario_wms)
  WHERE usuario_wms IS NOT NULL AND TRIM(usuario_wms) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_codigo_operacional_unico
  ON colaboradores (codigo_operacional)
  WHERE codigo_operacional IS NOT NULL AND TRIM(codigo_operacional) <> '';

UPDATE colaboradores c
SET
  usuario_wms = fonte.usuario_wms,
  codigo_operacional = fonte.codigo_operacional,
  wms_vinculo_status = 'confirmado',
  wms_vinculo_metodo = 'historico_oficial_produtividade',
  wms_vinculado_em = CURRENT_TIMESTAMP,
  wms_vinculo_origem = 'produtividade_armazem_colaboradores'
FROM (
  SELECT
    colaborador_id,
    MAX(NULLIF(TRIM(usuario_wms), '')) AS usuario_wms,
    MAX(NULLIF(TRIM(codigo_operacional), '')) AS codigo_operacional
  FROM produtividade_armazem_colaboradores
  GROUP BY colaborador_id
  HAVING
    COUNT(DISTINCT NULLIF(TRIM(usuario_wms), '')) <= 1
    AND COUNT(DISTINCT NULLIF(TRIM(codigo_operacional), '')) <= 1
    AND (
      MAX(NULLIF(TRIM(usuario_wms), '')) IS NOT NULL
      OR MAX(NULLIF(TRIM(codigo_operacional), '')) IS NOT NULL
    )
) fonte
WHERE c.id = fonte.colaborador_id
  AND COALESCE(NULLIF(TRIM(c.usuario_wms), ''), fonte.usuario_wms) = fonte.usuario_wms
  AND COALESCE(NULLIF(TRIM(c.codigo_operacional), ''), fonte.codigo_operacional) = fonte.codigo_operacional;
