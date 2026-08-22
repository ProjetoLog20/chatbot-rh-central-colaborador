# Deploy seguro do Yuri

Este roteiro mantém a versão atual atendendo enquanto a nova é validada. Não execute os comandos de produção sem backup restaurável e acesso ao rollback do Render.

## Pré-requisitos

- Web Service do Render sem Persistent Disk.
- PostgreSQL/Supabase acessível pela nova instância.
- Health Check Path configurado como `/api/health`.
- Node.js 22.12 ou superior.
- Backup recente do PostgreSQL com restauração testada.
- Auto-deploy temporariamente desabilitado para controlar a janela.

## Variáveis novas

```env
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MAX=15
DATABASE_STATEMENT_TIMEOUT_MS=120000
JWT_SECRET_PREVIOUS=
YURI_LEGACY_AI_ENABLED=false
ROTOGRAMA_UPLOAD_MAX_MB=50
```

`JWT_SECRET_PREVIOUS` deve ficar vazio normalmente. Durante uma rotação, ele recebe temporariamente o segredo antigo e `JWT_SECRET` recebe o novo.

## Primeiro deploy com histórico antigo de migrations

O novo migrador se recusa a reaplicar migrations em um banco existente sem ledger. Essa recusa é intencional.

1. Faça backup e valide o schema em uma cópia.
2. Confirme qual foi a última migration realmente aplicada.
3. Registre o baseline apenas depois da conferência:

```powershell
$env:MIGRATION_BASELINE_CONFIRM='EU_VERIFIQUEI_O_SCHEMA'
$env:MIGRATION_BASELINE_THROUGH='025_planos_melhoria_yuri.sql'
npm --prefix backend run migrate:baseline
```

4. Remova as variáveis temporárias.
5. Execute as migrations pendentes:

```powershell
npm --prefix backend run migrate
```

A migration `026_pesquisa_clima_integridade.sql` é aditiva: cria o controle separado de participação e preserva as respostas existentes.

## Sequência recomendada

1. Fazer deploy da branch em ambiente de preview/homologação.
2. Validar `/api/health`.
3. Testar login de colaborador e administrador.
4. Testar cadastro com senha temporária individual, reset com a senha padrão `log20` e troca obrigatória no primeiro acesso.
5. Testar Pesquisa de Clima ativa, resposta e dashboard.
6. Testar Yuri com IA habilitada e desabilitada.
7. Testar upload de rotograma abaixo do limite configurado.
8. Testar envio de notificação sem push e com push.
9. Iniciar deploy manual no Render.
10. Acompanhar health check, logs e erros 5xx por pelo menos 30 minutos.

Se a nova instância não ficar saudável, o Render deve manter a versão anterior recebendo tráfego. Não reverta a migration `026`: ela é compatível com a versão anterior.

## Rotação de JWT sem logout coletivo

1. Copie o segredo atual para `JWT_SECRET_PREVIOUS`.
2. Gere um novo segredo aleatório e configure-o em `JWT_SECRET`.
3. Faça deploy e valide login e tokens existentes.
4. Aguarde mais de oito horas, a validade máxima atual do token.
5. Esvazie `JWT_SECRET_PREVIOUS` e faça novo deploy.

## Rollback

- Faça rollback do código pelo painel do Render.
- Não apague as tabelas ou índices adicionados pela migration `026`.
- Não restaure o banco apenas para reverter código, salvo se houver corrupção comprovada.
- Preserve request IDs e logs do período para análise.

## Operações deliberadamente separadas do deploy

- Limpeza do histórico Git com dados pessoais.
- Rotação das chaves OpenAI, Groq, VAPID e banco.
- Remoção física dos backups existentes.
- Mudança para autenticação por cookie HttpOnly.

Essas operações exigem coordenação própria porque afetam credenciais, clones existentes ou consumidores externos; não devem ser misturadas ao deploy funcional.
