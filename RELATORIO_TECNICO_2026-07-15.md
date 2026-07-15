# Relatorio tecnico da Central do Colaborador

Data da auditoria: 15/07/2026

## Resumo executivo

A plataforma esta operacional no Render e a pagina de login carregou corretamente apos o cold start do plano gratuito. A solucao possui boa separacao entre frontend, API e banco, controle de acesso por perfil na maior parte das rotas e um conjunto amplo de modulos de RH e operacao.

O principal defeito encontrado estava no adaptador PostgreSQL: insercoes sem sequence ou resolvidas por `ON CONFLICT DO NOTHING` tentavam consultar `LASTVAL()`. Isso interrompia o contador de acessos em producao. A correcao acompanha este relatorio.

Classificacao geral atual: **funcional, com riscos de seguranca e observabilidade que devem ser priorizados antes de ampliar o uso**.

## Protecoes aplicadas apos a auditoria

- Rate limiting no login e no primeiro acesso: ate 10 falhas por IP em 15 minutos, sem penalizar autenticacoes bem-sucedidas.
- Cabecalhos HTTP com Helmet, incluindo CSP, bloqueio de MIME sniffing, politica de referencia e HSTS em producao.
- Remocao do cabecalho que identifica Express.
- Limite de 1 MB para payloads JSON e formularios comuns, com resposta controlada `413`.
- `X-Request-Id` para rastrear erros sem expor detalhes internos ao usuario.
- Respostas de autenticacao marcadas com `Cache-Control: no-store`.
- Endpoint `/api/health` para verificar aplicacao e banco sem consumir o contador de acessos.
- Validacao adicional de tipo/extensao nos uploads de imagens, SKAP e Rotograma.
- Atualizacao compativel do React Router; auditoria das dependencias de producao do frontend ficou sem vulnerabilidades conhecidas.
- Suite automatizada cobrindo saude, cabecalhos, CSP, forca bruta, payload excessivo e autorizacao de importacoes.
- O formato atual de login, JWT e APIs foi preservado para evitar quebra da plataforma em operacao.

## Arquitetura

- Frontend: React 18, React Router e Vite.
- Backend: Node.js, Express e APIs REST.
- Banco de producao: PostgreSQL, configurado por `DATABASE_URL`.
- Banco local: SQLite como alternativa de desenvolvimento.
- Hospedagem: servico web no Render; o backend tambem entrega o build estatico do frontend.
- Autenticacao: JWT com validade de 8 horas e perfis `admin`, `motorista` e `colaborador`.
- Integracao de IA: OpenAI opcional no assistente Yuri, executada pelo backend.

## Modulos mapeados

- Autenticacao e primeiro acesso.
- Cadastro e administracao de colaboradores.
- Prontuario dos motoristas.
- SKAP e historico de evolucao.
- Premio de produtividade de rota e armazem.
- Indicadores da rota.
- Pesquisa de clima e resultados.
- Campeao de Seguranca.
- Rotograma Seguro.
- Acoes, encontros e comunicacao interna.
- Base de respostas e assistente Yuri.
- Ouvidoria externa.
- Configuracao de disponibilidade e manutencao dos modulos.
- Importacao e exportacao de planilhas.
- Contador e grafico de acessos no painel administrativo.

## Acessos registrados

Na consulta direta ao banco de producao foram encontrados:

- Total registrado: **36 eventos de acesso**.
- Eventos registrados em 15/07/2026: **2**.
- Ultimo evento salvo: 15/07/2026, 21:27:52 UTC (18:27:52 em Brasilia).

Esses numeros nao equivalem a 36 pessoas. O middleware atual incrementa o contador para navegacoes e chamadas de API que nao sejam arquivos estaticos. Um unico usuario pode gerar varios eventos durante uma sessao. O historico diario tambem esta incompleto: havia somente um registro retroativo em 06/07/2026, mesmo com o total acumulado de 36.

## Pontos positivos

- Segregacao clara entre frontend, backend, rotas, servicos e migrations.
- Rotas administrativas geralmente protegidas por autenticacao e autorizacao de perfil.
- Consultas SQL parametrizadas na maior parte do backend.
- Senhas protegidas com bcrypt.
- JWT exige segredo configurado no ambiente e expira em 8 horas.
- CORS limitado a origens conhecidas.
- Uploads usam limite de tamanho e armazenamento em memoria antes do processamento.
- Dados sensiveis do colaborador nao sao enviados diretamente ao provedor de IA no fluxo revisado.
- Build de producao concluido com sucesso.
- Modulos podem ser desativados ou colocados em manutencao pelo administrador.

## Riscos e recomendacoes

### Prioridade critica

1. **Contador de acessos falhava no PostgreSQL.** Corrigido neste ciclo. Depois do deploy, validar o painel administrativo e acompanhar se o historico diario volta a crescer.
2. **Dependencia `xlsx` com vulnerabilidades conhecidas e sem correcao publicada no pacote atual.** Os uploads permanecem restritos a administradores, extensoes esperadas e limites de tamanho. Como solucao definitiva, avaliar migracao para uma biblioteca mantida ou executar a leitura em processo isolado, com limites de tempo, memoria e quantidade de linhas.

### Prioridade alta

1. **Token JWT armazenado em `localStorage`.** Um XSS pode capturar o token. Preferir cookie `HttpOnly`, `Secure` e `SameSite`, acompanhado de protecao CSRF.
2. **Dependencias residuais no backend.** `xlsx` continua sem correcao publicada no pacote usado; `tar` e `node-pre-gyp` chegam pela cadeia nativa do bcrypt. Nao foi aplicado upgrade maior automatico para evitar risco no login e no build do Render.
4. **Uploads e imagens no disco do Render.** O filesystem do servico pode ser efemero. Usar armazenamento persistente externo, como Supabase Storage ou S3 compativel.
5. **Cobertura automatizada ainda parcial.** A suite de seguranca foi criada; ampliar para calculo da RV, isolamento de dados por colaborador e importacoes completas.

### Prioridade media

1. **Contagem nao representa usuarios unicos.** Registrar sessoes anonimizadas ou logins bem-sucedidos, sem armazenar dados pessoais desnecessarios. Exibir separadamente eventos, sessoes e usuarios unicos.
2. **Historico diario inconsistente.** Criar migration formal para as tabelas de acesso e reconciliar o acumulado com o historico.
3. **Datas calculadas em UTC.** O contador usa `toISOString()`, podendo virar o dia tres horas antes do horario de Brasilia. Calcular a competencia diaria no fuso `America/Sao_Paulo`.
4. **Cold start no plano gratuito.** O primeiro carregamento observado passou pela tela de inicializacao do Render antes de abrir o login. Isso afeta experiencia, mas nao exige consumo artificial de horas.
5. **Ausencia de endpoint simples de saude.** Criar `/api/health` com verificacao controlada da aplicacao e do banco, sem expor configuracoes.
6. **Observabilidade limitada.** Adicionar logs estruturados, identificador de requisicao, monitoramento de erros e alertas de falha de deploy/importacao.
7. **Textos com sinais de codificacao inconsistente no codigo-fonte.** Padronizar arquivos em UTF-8 e revisar acentos exibidos nos modulos.

## Validacoes executadas

- Aplicacao publicada acessada em `https://chatbot-rh-central-colaborador-preset.onrender.com`.
- Login publico carregado corretamente apos o cold start.
- Build completo executado com sucesso (`npm run build`).
- Auditoria de dependencias executada no frontend e backend.
- Consulta do contador executada diretamente no PostgreSQL de producao.
- Revisao estatica das rotas, middlewares, autorizacao, uploads, banco e armazenamento do token.

## Proximos passos sugeridos

1. Confirmar no Render que o deploy desta correcao terminou com sucesso.
2. Abrir o painel administrativo e validar o contador de acessos.
3. Corrigir a definicao de metrica para diferenciar eventos, sessoes e usuarios unicos.
4. Implementar rate limiting e cabecalhos de seguranca.
5. Atualizar dependencias e criar testes automatizados para os fluxos de maior risco.
