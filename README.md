# Chat Bot RH - Central do Colaborador

Aplicacao fullstack com React + Vite no frontend, Express + SQLite no backend, autenticacao JWT, importacao de CSV/Excel e chat assistente com IA.

## Estrutura

- `backend/` - servidor Express, SQLite, APIs, importacoes e seed
- `frontend/` - aplicacao React + Vite

## Variaveis de ambiente

Crie `backend/.env` a partir de `backend/.env.example`:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=troque_por_um_segredo_forte
FRONTEND_URL=http://localhost:5173
NODE_ENV=production
OPENAI_API_KEY=
YURI_AI_ENABLED=true
OPENAI_MODEL=gpt-4o-mini
```

Observacoes:

- `DATABASE_URL` e obrigatorio em produção. Ele deve apontar para o banco PostgreSQL do Supabase.
- `JWT_SECRET` e obrigatorio para login e validação de token.
- `FRONTEND_URL` controla a origem permitida no CORS.
- `NODE_ENV` deve ser `production` no Render para a aplicação rodar em modo de produção.

Para desenvolvimento local simples, o backend continua suportando SQLite se `DATABASE_URL` não estiver definido.

Variaveis do Yuri com IA:

- `OPENAI_API_KEY` habilita a IA real do Yuri pelo backend. Nunca use essa chave no frontend.
- `YURI_AI_ENABLED=true` ativa a chamada da OpenAI. Use `false` para manter o Yuri com resposta padrao sem IA.
- `OPENAI_MODEL` define o modelo usado pelo Yuri. Padrao recomendado: `gpt-4o-mini`.

### Restricao geografica ao Parana

Para ativar o bloqueio das APIs fora do Parana no Render, configure:

```env
GEO_RESTRICTION_ENABLED=true
IPINFO_TOKEN=token_com_acesso_ao_ipinfo_core
GEO_FAIL_CLOSED=true
GEO_ALLOW_PRIVATE_IPS=true
```

O token precisa retornar `country_code=BR` e `region_code=PR`. O resultado fica em cache por seis horas por IP. A rota de health check, requisicoes CORS `OPTIONS` e IPs privados usados no desenvolvimento local nao sao bloqueados. Geolocalizacao por IP e aproximada e pode ser afetada por VPN, proxy e redes moveis.

## Instalacao

```bash
npm install
npm run install:all
npm run seed
npm run dev
```

Acesse:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Deploy no Render

Use o diretório raiz do projeto para o serviço Web no Render.

- Build command: `npm run build`
- Start command: `npm start`
- Root directory: `/`

Variáveis de ambiente necessárias:

- `DATABASE_URL` (conexão PostgreSQL do Supabase)
- `JWT_SECRET`
- `FRONTEND_URL` (por exemplo `https://seu-app.onrender.com`)
- `NODE_ENV=production`
- `OPENAI_API_KEY`
- `YURI_AI_ENABLED=true`
- `OPENAI_MODEL=gpt-4o-mini`

Para desativar temporariamente a IA do Yuri sem remover a chave, use `YURI_AI_ENABLED=false`.

No Render, execute as migrations uma vez antes de subir a aplicação para garantir que o banco PostgreSQL esteja com o schema correto. Use:

```bash
npm --prefix backend run migrate
```

Em producão, o backend serve o frontend gerado em `frontend/dist` e mantém as rotas da API em `/api`.

### Configuração do Supabase

1. Crie um projeto no Supabase.
2. No painel do projeto, copie o `Connection string` do banco de dados PostgreSQL.
3. Defina o valor em `DATABASE_URL` no Render.
4. Defina `JWT_SECRET`, `FRONTEND_URL` e `NODE_ENV=production`.
5. Rode `npm --prefix backend run migrate` antes de iniciar o backend.

## Fluxo de Primeiro Acesso

No cadastro manual e para novos usuários importados sem senha informada, o servidor gera uma senha temporária individual. No reset administrativo, a senha temporária é redefinida para `log20`. No primeiro login:
1. O colaborador faz login com sua matrícula e a senha temporária.
2. O sistema o redireciona para a página de mudança obrigatória de senha.
3. A nova senha deve ter pelo menos 10 caracteres e não pode repetir a senha temporária.
4. Após a mudança bem-sucedida, ele é redirecionado para a página inicial.

### Administrador: Resetar Senha de Colaborador

Se um administrador resetar a senha, o sistema define a credencial temporária como `log20`, exibe-a ao administrador e marca o cadastro como primeiro acesso novamente.

## Usuarios de teste

- Admin
  - Matricula: `1000`
  - Senha: `log20` (primeira vez)
- Motorista
  - Matricula: `2000`
  - Senha: `log20` (primeira vez)
- Colaborador
  - Matricula: `3000`
  - Senha: `log20` (primeira vez)

Os usuários de demonstração do seed ainda utilizam `log20` exclusivamente no ambiente local. Cadastros reais recebem credenciais temporárias individuais.

## Comandos uteis

```bash
npm run dev
npm run seed
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run dev
npm.cmd --prefix frontend run dev
```

## Centrais

- Central do Colaborador: acesso a dados proprios, prontuario quando aplicavel, cards e chatbot.
- Central do Colaborador: tambem exibe o carrossel de acoes da CIPA e Cafe com o Gerente.
- Central do Administrador: dados publicados, modelos Excel, importacao, base do chatbot e publicacao de acoes/eventos.

## Importacao Excel/CSV

Na Central do Administrador, use a aba `Exportar para a pagina via Excel`:

1. Baixe o modelo Excel.
2. Preencha a primeira aba.
3. Envie o arquivo preenchido.

Modelos disponiveis:

- Colaboradores
- Prontuario dos motoristas
- Base do chatbot

### Importacao SKAP no Supabase/PostgreSQL

Antes de importar, garanta que o `DATABASE_URL` esteja configurado em `backend/.env` e rode as migrations:

```bash
npm --prefix backend run migrate
```

Para importar uma planilha SKAP:

```bash
cd backend
npm run import:skap -- ../caminho/arquivo.xlsx
```

Exemplo com a planilha pronta:

```bash
cd backend
npm run import:skap -- "C:\Users\ArT\Downloads\skap_log20_importacao_pronta.xlsx"
```

Se nenhum arquivo for informado, o script usa `backend/data/skap_log20_importacao_pronta.xlsx`.

O importador atualiza/cria apenas dados em `skap_avaliacoes` e `skap_historico`, vinculando pela `matricula` da tabela `colaboradores`. Ele nao altera senha, perfil ou dados cadastrais do colaborador. Ao final, grava um log em `backend/logs/importacao_skap_YYYY-MM-DD_HH-mm.txt`.

Regras:

- Arquivos aceitos: `.xlsx` e `.csv`
- Tamanho maximo: 5 MB
- Importacao de colaboradores usa UPSERT por `matricula`, preservando o `id` e os vinculos existentes.
- Novos colaboradores sem senha informada recebem credenciais temporárias individuais; o painel baixa um CSV para entrega segura. Senhas de usuários já existentes são preservadas.
- Importacao de prontuario registra historico quando pontuacao ou faixa mudam.

## Segurança e privacidade

- O segredo JWT fica apenas em `JWT_SECRET`.
- A chave `OPENAI_API_KEY` fica apenas no backend e nao deve ser exposta no frontend.
- CORS usa `FRONTEND_URL`, mantendo localhost para desenvolvimento.
- Colaborador e motorista acessam somente os proprios dados.
- Admin pode acessar e gerenciar todos os dados.
- A IA externa nao recebe CPF, telefone ou e-mail.
- Para prontuario, a IA recebe somente pontuacao, faixa e orientacao resumida.
- O Yuri usa a rota protegida `POST /api/yuri/chat`, exige token JWT e orienta procurar o RH em assuntos sensiveis como pagamento, premio, prontuario, SKAP, contestacao ou dados pessoais.
- `atendimentos.colaborador_id` aceita `NULL` para futuro WhatsApp antes da identificacao do numero.

## Funcionalidades

- Login com matricula e senha
- Perfis: colaborador, motorista e admin
- Importacao de CSV/Excel com validacao e relatorio de erros
- Carrossel publico de acoes da CIPA e Cafe com o Gerente
- Admin publica imagens e descricoes de acoes/eventos
- Chat assistente RH com IA opcional
- Fallback do chat usando respostas cadastradas no painel admin
- Mascote visual do assistente RH
