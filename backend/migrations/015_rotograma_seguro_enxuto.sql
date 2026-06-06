ALTER TABLE rotogramas
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

ALTER TABLE rotograma_importacoes
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

UPDATE rotogramas SET ativo = true WHERE ativo IS NULL;
UPDATE rotograma_importacoes SET ativo = true WHERE ativo IS NULL;

INSERT INTO configuracoes_modulos
  (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, visivel_para_admin, visivel_para_motorista, visivel_para_colaborador, ordem)
VALUES
  ('rotograma_seguro', 'Rotograma Seguro', 'Consulte rotas OK e rotas em atencao para uma operacao mais segura.', true, false, null, true, true, true, 57)
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  updated_at = NOW();
