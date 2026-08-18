CREATE TABLE IF NOT EXISTS bh_importacoes (
  id SERIAL PRIMARY KEY,
  arquivo_nome TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  formato TEXT NOT NULL CHECK (formato IN ('pdf', 'xls', 'xlsx')),
  tipo_relatorio TEXT NOT NULL CHECK (tipo_relatorio IN ('resumido', 'detalhado')),
  periodo_inicio DATE,
  periodo_fim DATE,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'publicado', 'cancelado')),
  total_saldos INTEGER NOT NULL DEFAULT 0,
  total_dias INTEGER NOT NULL DEFAULT 0,
  total_vinculados INTEGER NOT NULL DEFAULT 0,
  total_pendencias INTEGER NOT NULL DEFAULT 0,
  revisao INTEGER NOT NULL DEFAULT 1,
  avisos_json TEXT,
  criado_por INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  aprovado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bh_importacoes_hash_publicado
  ON bh_importacoes (arquivo_hash)
  WHERE status = 'publicado';

CREATE INDEX IF NOT EXISTS idx_bh_importacoes_status_periodo
  ON bh_importacoes (status, periodo_fim DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS bh_saldos (
  id SERIAL PRIMARY KEY,
  importacao_id INTEGER NOT NULL REFERENCES bh_importacoes(id) ON DELETE CASCADE,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE RESTRICT,
  linha_origem INTEGER NOT NULL,
  matricula_kairos TEXT,
  nome_kairos TEXT NOT NULL,
  nome_kairos_normalizado TEXT NOT NULL,
  estrutura_kairos TEXT,
  nome_ginfo_snapshot TEXT,
  matricula_ginfo_snapshot TEXT,
  saldo_anterior_min INTEGER NOT NULL DEFAULT 0,
  debito_min INTEGER NOT NULL DEFAULT 0 CHECK (debito_min >= 0),
  credito_min INTEGER NOT NULL DEFAULT 0 CHECK (credito_min >= 0),
  saldo_periodo_min INTEGER NOT NULL DEFAULT 0,
  saldo_atual_min INTEGER NOT NULL DEFAULT 0,
  status_vinculo TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_vinculo IN ('vinculado', 'pendente')),
  metodo_vinculo TEXT,
  confianca_vinculo NUMERIC(6,4),
  sugestoes_json TEXT,
  dados_originais_json TEXT,
  revisado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  revisado_em TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (importacao_id, linha_origem)
);

CREATE INDEX IF NOT EXISTS idx_bh_saldos_importacao ON bh_saldos (importacao_id);
CREATE INDEX IF NOT EXISTS idx_bh_saldos_colaborador ON bh_saldos (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_bh_saldos_nome_kairos ON bh_saldos (nome_kairos_normalizado);

CREATE TABLE IF NOT EXISTS bh_dias (
  id SERIAL PRIMARY KEY,
  importacao_id INTEGER NOT NULL REFERENCES bh_importacoes(id) ON DELETE CASCADE,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE RESTRICT,
  linha_origem INTEGER NOT NULL,
  matricula_kairos TEXT,
  nome_kairos TEXT NOT NULL,
  nome_kairos_normalizado TEXT NOT NULL,
  cargo_kairos TEXT,
  estrutura_kairos TEXT,
  nome_ginfo_snapshot TEXT,
  matricula_ginfo_snapshot TEXT,
  data DATE NOT NULL,
  horario_previsto TEXT,
  batidas_json TEXT,
  horas_trabalhadas_min INTEGER,
  debito_min INTEGER NOT NULL DEFAULT 0,
  credito_min INTEGER NOT NULL DEFAULT 0,
  justificativa_kairos TEXT,
  classificacao_original TEXT NOT NULL,
  classificacao TEXT NOT NULL
    CHECK (classificacao IN ('trabalhado', 'folga', 'falta', 'pendente', 'incompleta', 'nao_aplicavel')),
  status_vinculo TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_vinculo IN ('vinculado', 'pendente')),
  metodo_vinculo TEXT,
  confianca_vinculo NUMERIC(6,4),
  sugestoes_json TEXT,
  justificativa_admin TEXT,
  dados_originais_json TEXT,
  revisado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  revisado_em TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (importacao_id, linha_origem)
);

CREATE INDEX IF NOT EXISTS idx_bh_dias_importacao ON bh_dias (importacao_id);
CREATE INDEX IF NOT EXISTS idx_bh_dias_colaborador_data ON bh_dias (colaborador_id, data);
CREATE INDEX IF NOT EXISTS idx_bh_dias_classificacao ON bh_dias (classificacao);
CREATE INDEX IF NOT EXISTS idx_bh_dias_nome_kairos ON bh_dias (nome_kairos_normalizado);

CREATE TABLE IF NOT EXISTS bh_vinculos_nome (
  id SERIAL PRIMARY KEY,
  nome_kairos TEXT NOT NULL,
  nome_kairos_normalizado TEXT NOT NULL,
  matricula_kairos TEXT NOT NULL DEFAULT '',
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'manual_admin',
  criado_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE bh_vinculos_nome
  ADD COLUMN IF NOT EXISTS matricula_kairos TEXT;

UPDATE bh_vinculos_nome
SET matricula_kairos = ''
WHERE matricula_kairos IS NULL;

ALTER TABLE bh_vinculos_nome
  ALTER COLUMN matricula_kairos SET DEFAULT '',
  ALTER COLUMN matricula_kairos SET NOT NULL;

ALTER TABLE bh_vinculos_nome
  DROP CONSTRAINT IF EXISTS bh_vinculos_nome_nome_kairos_normalizado_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bh_vinculos_identidade_kairos
  ON bh_vinculos_nome (nome_kairos_normalizado, matricula_kairos);

CREATE INDEX IF NOT EXISTS idx_bh_vinculos_colaborador ON bh_vinculos_nome (colaborador_id);

CREATE TABLE IF NOT EXISTS bh_auditoria (
  id SERIAL PRIMARY KEY,
  importacao_id INTEGER REFERENCES bh_importacoes(id) ON DELETE CASCADE,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  motivo TEXT NOT NULL,
  alterado_por INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bh_auditoria_importacao
  ON bh_auditoria (importacao_id, created_at DESC);

INSERT INTO bh_vinculos_nome (
  nome_kairos,
  nome_kairos_normalizado,
  matricula_kairos,
  colaborador_id,
  origem
)
SELECT
  'LAINE TAUANA POMMER ARCANJO',
  'laine tauana pommer arcanjo',
  '19232',
  c.id,
  'confirmacao_cliente'
FROM colaboradores c
WHERE c.matricula = '19232'
ON CONFLICT (nome_kairos_normalizado, matricula_kairos) DO NOTHING;
