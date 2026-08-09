CREATE TABLE IF NOT EXISTS pesquisa_clima_participacoes (
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  respondido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pesquisa_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_pesquisa_clima_participacoes_colaborador
  ON pesquisa_clima_participacoes(colaborador_id, pesquisa_id);

INSERT INTO pesquisa_clima_participacoes (pesquisa_id, colaborador_id, respondido_em)
SELECT pesquisa_id, colaborador_id, COALESCE(MIN(created_at), CURRENT_TIMESTAMP)
FROM respostas_clima
WHERE colaborador_id IS NOT NULL
GROUP BY pesquisa_id, colaborador_id
ON CONFLICT (pesquisa_id, colaborador_id) DO NOTHING;
