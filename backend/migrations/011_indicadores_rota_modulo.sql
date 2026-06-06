INSERT INTO configuracoes_modulos
  (
    chave,
    nome,
    descricao,
    ativo,
    em_manutencao,
    mensagem_manutencao,
    visivel_para_admin,
    visivel_para_motorista,
    visivel_para_colaborador,
    ordem
  )
VALUES
  (
    'indicadores_rota',
    'Indicadores da Rota',
    'Acompanhe as metas e entenda os indicadores que ajudam sua rota a ser mais produtiva, organizada e segura.',
    true,
    false,
    null,
    true,
    true,
    false,
    55
  )
ON CONFLICT (chave) DO NOTHING;
