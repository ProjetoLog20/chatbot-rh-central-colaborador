# Chat Bot RH - Central do Colaborador

Aplicacao fullstack com React + Vite no frontend, Express + SQLite no backend, autenticacao JWT, importacao de CSV/Excel e chat assistente com IA.

## Estrutura

- `backend/` - servidor Express, SQLite, APIs, importacoes e seed
- `frontend/` - aplicacao React + Vite

## Variaveis de ambiente

Crie `backend/.env` a partir de `backend/.env.example`:

```env
JWT_SECRET=troque_por_um_segredo_forte
FRONTEND_URL=http://localhost:5173
PORT=4000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Observacoes:

- `JWT_SECRET` e obrigatorio para login e validacao de token.
- `FRONTEND_URL` controla a origem permitida no CORS.
- `OPENAI_API_KEY` e opcional. Sem ela, o chatbot usa a base local do RH e contexto permitido do usuario.

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

- `JWT_SECRET`
- `PORT` (Render define automaticamente se não for configurado)
- `FRONTEND_URL` (por exemplo `https://seu-app.onrender.com`)
- `OPENAI_API_KEY` (opcional, se usar o assistente OpenAI)
- `OPENAI_MODEL` (opcional, por exemplo `gpt-5-mini`)

O backend serve o frontend gerado em `frontend/dist` e mantém as rotas da API em `/api`.

## Usuarios de teste

- Admin
  - Matricula: `1000`
  - Senha: `admin123`
- Motorista
  - Matricula: `2000`
  - Senha: `motorista123`
- Colaborador
  - Matricula: `3000`
  - Senha: `colaborador123`

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
