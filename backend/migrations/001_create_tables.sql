CREATE TABLE IF NOT EXISTS colaboradores (
  id SERIAL PRIMARY KEY,
  matricula TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  cpf TEXT,
  telefone_whatsapp TEXT,
  email TEXT,
  cargo TEXT,
  setor TEXT,
  unidade TEXT,
  tipo_colaborador TEXT,
  status TEXT,
  data_admissao TEXT,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prontuario_motoristas (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pontuacao_atual INTEGER,
  faixa_atual TEXT,
  pontos_de_atencao TEXT,
  orientacoes TEXT,
  observacoes TEXT,
  data_atualizacao TEXT
);

CREATE TABLE IF NOT EXISTS historico_pontuacao (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pontuacao_anterior INTEGER,
  pontuacao_nova INTEGER,
  faixa_anterior TEXT,
  faixa_nova TEXT,
  motivo TEXT,
  responsavel TEXT,
  data_alteracao TEXT
);

CREATE TABLE IF NOT EXISTS respostas_chatbot (
  id SERIAL PRIMARY KEY,
  categoria TEXT,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  telefone TEXT,
  mensagem TEXT,
  resposta TEXT,
  categoria TEXT,
  status TEXT,
  data_hora TEXT
);

CREATE TABLE IF NOT EXISTS acoes_comunicacao (
  id SERIAL PRIMARY KEY,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  imagem_url TEXT NOT NULL,
  ativo INTEGER DEFAULT 1,
  data_evento TEXT,
  criado_em TEXT,
  atualizado_em TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuario_motoristas_colaborador ON prontuario_motoristas (colaborador_id);
