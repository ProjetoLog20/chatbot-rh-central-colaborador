CREATE TABLE IF NOT EXISTS configuracoes_modulos (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  em_manutencao BOOLEAN DEFAULT false,
  mensagem_manutencao TEXT,
  visivel_para_admin BOOLEAN DEFAULT true,
  visivel_para_motorista BOOLEAN DEFAULT true,
  visivel_para_colaborador BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO configuracoes_modulos
  (chave, nome, descricao, ativo, em_manutencao, mensagem_manutencao, ordem)
VALUES
  ('pesquisa_clima', 'Pesquisa de Clima', 'Pesquisas de satisfacao da empresa.', true, false, null, 10),
  ('skap', 'SKAP', 'Evolucao, nivel atual e habilidades avaliadas.', true, false, null, 20),
  ('campeao_seguranca', 'Campeao de Seguranca', 'Reconhecimento de atitudes seguras.', true, false, null, 30),
  ('tres_rs', '3 Rs', 'Responsabilidades, recursos e reconhecimentos da metodologia 3Rs.', true, false, null, 40),
  ('premio_produtividade', 'Premio de Produtividade', 'Indicadores, metas e valor previsto do premio.', false, true, 'Estamos ajustando os dados deste painel para garantir que as informacoes sejam apresentadas corretamente. Em breve ele estara disponivel.', 50),
  ('prontuario_motorista', 'Prontuario do Motorista', 'Pontuacao, faixa atual e ocorrencias registradas.', true, false, null, 60),
  ('ouvidoria', 'Ouvidoria', 'Canal oficial para solicitacoes, duvidas ou relatos.', true, false, null, 70),
  ('assistente_rh', 'Assistente RH', 'Atendimento virtual da Central do Colaborador.', true, false, null, 80)
ON CONFLICT (chave) DO NOTHING;
