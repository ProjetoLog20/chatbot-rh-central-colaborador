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
```

Observacoes:

- `DATABASE_URL` e obrigatorio em produção. Ele deve apontar para o banco PostgreSQL do Supabase.
- `JWT_SECRET` e obrigatorio para login e validação de token.
- `FRONTEND_URL` controla a origem permitida no CORS.
- `NODE_ENV` deve ser `production` no Render para a aplicação rodar em modo de produção.

Para desenvolvimento local simples, o backend continua suportando SQLite se `DATABASE_URL` não estiver definido.

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

Opcional:

- `OPENAI_API_KEY` se usar o assistente OpenAI
- `OPENAI_MODEL` (por exemplo `gpt-5-mini`)

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

Quando um novo colaborador é cadastrado (manualmente ou por import Excel/CSV) sem informar senha, o sistema utiliza a **senha padrão temporária: log20**.

No primeiro login:
1. O colaborador faz login com sua matrícula e a senha temporária.
2. O sistema o redireciona para a página de mudança obrigatória de senha.
3. A nova senha não pode ser igual a "log20" por razões de segurança.
4. Após a mudança bem-sucedida, ele é redirecionado para a página inicial.

### Administrador: Resetar Senha de Colaborador

Se um administrador resetar a senha de um colaborador sem informar uma nova senha, o sistema retorna a senha para a temporária "log20" e marca como primeiro acesso novamente.

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

No primeiro login, cada usuário será obrigado a mudar a senha temporária "log20" para uma nova senha pessoal.

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

Regras:

- Arquivos aceitos: `.xlsx` e `.csv`
- Tamanho maximo: 5 MB
- Importacao de colaboradores usa UPSERT por `matricula`, preservando o `id` e os vinculos existentes.
- Importacao de prontuario registra historico quando pontuacao ou faixa mudam.

## Segurança e privacidade

- O segredo JWT fica apenas em `JWT_SECRET`.
- CORS usa `FRONTEND_URL`, mantendo localhost para desenvolvimento.
- Colaborador e motorista acessam somente os proprios dados.
- Admin pode acessar e gerenciar todos os dados.
- A IA externa nao recebe CPF, telefone ou e-mail.
- Para prontuario, a IA recebe somente pontuacao, faixa e orientacao resumida.
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
