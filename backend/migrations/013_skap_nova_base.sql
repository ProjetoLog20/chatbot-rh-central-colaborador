ALTER TABLE skap_avaliacoes
  ADD COLUMN IF NOT EXISTS atingimento_habilidade_tecnica NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_habilidade_tecnica TEXT,
  ADD COLUMN IF NOT EXISTS atingimento_habilidade_especifica NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_habilidade_especifica TEXT,
  ADD COLUMN IF NOT EXISTS atingimento_habilidade_empoderamento NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_habilidade_empoderamento TEXT,
  ADD COLUMN IF NOT EXISTS proficiencia NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_nivel TEXT,
  ADD COLUMN IF NOT EXISTS percentual_para_proximo_nivel NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plano_acao TEXT,
  ADD COLUMN IF NOT EXISTS status_skap TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE skap_avaliacoes
SET nivel_skap = CASE
    WHEN LOWER(COALESCE(nivel_skap, '')) = 'verde' THEN 'Prata'
    WHEN LOWER(COALESCE(nivel_skap, '')) = 'prata' THEN 'Prata'
    WHEN LOWER(COALESCE(nivel_skap, '')) = 'ouro' THEN 'Ouro'
    ELSE 'Bronze'
  END,
  proficiencia = COALESCE(proficiencia, proficiencia_percentual, progresso_percentual, 0),
  atingimento_habilidade_tecnica = COALESCE(atingimento_habilidade_tecnica, habilidades_tecnicas_percentual, 0),
  atingimento_habilidade_especifica = COALESCE(atingimento_habilidade_especifica, habilidades_especificas_percentual, 0),
  atingimento_habilidade_empoderamento = COALESCE(atingimento_habilidade_empoderamento, habilidades_empoderamento_percentual, 0),
  updated_at = COALESCE(updated_at, atualizado_em, NOW());

CREATE INDEX IF NOT EXISTS idx_skap_avaliacoes_proficiencia
  ON skap_avaliacoes(proficiencia);

CREATE INDEX IF NOT EXISTS idx_skap_avaliacoes_updated_at
  ON skap_avaliacoes(updated_at);
