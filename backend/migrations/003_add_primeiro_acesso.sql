ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS nome_preferido TEXT NULL;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT true;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS senha_temporaria BOOLEAN DEFAULT true;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS data_ultima_troca_senha TIMESTAMP NULL;

ALTER TABLE colaboradores ALTER COLUMN primeiro_acesso DROP DEFAULT;
ALTER TABLE colaboradores ALTER COLUMN senha_temporaria DROP DEFAULT;

ALTER TABLE colaboradores
  ALTER COLUMN primeiro_acesso TYPE BOOLEAN
  USING CASE WHEN primeiro_acesso::text IN ('true', 't', '1') THEN true ELSE false END;

ALTER TABLE colaboradores
  ALTER COLUMN senha_temporaria TYPE BOOLEAN
  USING CASE WHEN senha_temporaria::text IN ('true', 't', '1') THEN true ELSE false END;

ALTER TABLE colaboradores ALTER COLUMN primeiro_acesso SET DEFAULT true;
ALTER TABLE colaboradores ALTER COLUMN senha_temporaria SET DEFAULT true;
