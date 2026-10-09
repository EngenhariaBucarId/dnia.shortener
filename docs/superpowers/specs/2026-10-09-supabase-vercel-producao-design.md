# links.dn.ia em produção — Supabase, Vercel e Cloudflare

**Data:** 2026-10-09 · **Status:** aprovado em conversa, aguardando revisão do spec

## Objetivo

Colocar o encurtador inteiro no ar, funcionando com o banco real:

- **Painel** em `https://shortner.dnia.ai` (Vercel), com login de verdade.
- **Links curtos** em `https://s.dnia.ai/<slug>` (Cloudflare Worker), contando cliques.
- **Banco, Auth e Storage** no projeto Supabase `zqtcfqskdfscqtbzeglu`.

**Sucesso =** um admin entra no painel, convida alguém do time, cria um link, o clique em
`s.dnia.ai/<slug>` redireciona e aparece nas métricas, e uma página de bio com imagem abre
em `s.dnia.ai/@perfil`.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Escopo | Tudo no ar: painel hospedado, Worker publicado, time usando |
| Hospedagem do painel | Vercel, ligada ao GitHub (`main` → produção, PR → preview) |
| Login | Bloco oficial da Supabase UI Library `password-based-auth-react`, adaptado; **sem** cadastro público |
| Gestão do time | Mantida como está: tabela `members`, tela Time, Edge Function `team-admin` |
| Schema | Migrações versionadas em `supabase/migrations/`, aplicadas pelo MCP do Supabase |
| Domínios | Painel `shortner.dnia.ai` (grafia escolhida pelo dono), curto `s.dnia.ai` |
| DNS | Zona `dnia.ai` na Cloudflare (a configurar pelo dono) |
| Fallback do Worker | `https://dnia.ai` |

Descartados: `@supabase/auth-ui-react` (arquivado, sem manutenção desde fev/2024);
redirect na Vercel (o DNS vai para a Cloudflare); Supabase CLI com Docker local (pesado
para o tamanho do projeto).

## 1. Banco de dados

- `supabase/migrations/20261009000000_inicial.sql` = conteúdo atual de `supabase/schema.sql`.
  Daqui em diante, toda mudança de schema é uma migração nova; o `schema.sql` vira retrato
  legível e o README diz isso.
- Aplicada com `apply_migration` (MCP) no projeto vazio.
- Verificação após aplicar:
  - advisors de segurança e desempenho sem erro (corrigir o que apontarem);
  - testes de RLS por SQL, simulando papéis: autenticado **sem** linha em `members` não lê
    nem grava nada; membro comum lê/grava links e bio mas não altera `members`; o banco
    recusa remover ou rebaixar o último admin.
- **Auth** (dashboard, pelo dono, com roteiro):
  - cadastro público e login anônimo desligados; provedor Email ligado; confirmação de e-mail ligada;
  - Site URL `https://shortner.dnia.ai`; Redirect URLs `https://shortner.dnia.ai/definir-senha`
    e `http://localhost:8080/definir-senha`;
  - senha mínima de 8 caracteres e checagem de senha vazada, se o plano permitir;
  - templates de **convite** e **recuperação de senha** em português (texto entregue no roteiro).
  - Limite conhecido: o SMTP padrão do Supabase envia poucos e-mails por hora. SMTP próprio
    fica fora deste escopo.
- **Primeiro admin:** o dono cria o próprio usuário com senha no dashboard; em seguida o
  `insert` em `public.members` com `role = 'admin'`.
- **Edge Function `team-admin`:** publicada pelo MCP. Secrets `PANEL_URL=https://shortner.dnia.ai`
  e `EXTRA_ORIGINS=http://localhost:8080`. O CORS passa a aceitar `PANEL_URL` mais a lista
  `EXTRA_ORIGINS` (separada por vírgula). URLs de preview da Vercel **não** convidam nem
  removem — de propósito.

## 2. Login com o bloco da Supabase UI Library

- Instalação: `npx shadcn@latest add @supabase/password-based-auth-react`, recusando
  sobrescrever `button`, `card`, `input` e `label` (já existem no tema Premium).
- Formulários em `src/components/auth/`: `LoginForm`, `ForgotPasswordForm`, `UpdatePasswordForm`.
  O `sign-up-form` não entra.
- Adaptações obrigatórias:
  - usar o cliente único `@/lib/supabase` em vez do `createClient()` do bloco (uma sessão só;
    o modo demo continua funcionando pelo alias do Vite);
  - textos em português;
  - erro de login genérico ("E-mail ou senha incorretos."), sem a mensagem crua;
  - navegação pelo react-router em vez de `location.href`;
  - após o login, voltar para `?next=` validado pelo `safe-next-path` do bloco (padrão `/`);
  - dentro do `AuthLayout` (logo `<dn.ia>`, "links" em Video), com botão de mostrar senha.
- Rotas: `/login` → `LoginForm`; `/esqueci-senha` → `ForgotPasswordForm`;
  `/definir-senha` → `UpdatePasswordForm` (convite e recuperação). Time e "sem acesso" ficam.
- Chave pública: `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`), com fallback para
  `VITE_SUPABASE_ANON_KEY` durante a transição. `.env.example` e README atualizados.
- Testes: unitário do `safe-next-path` (caminho normal, URL externa, `//host`, `javascript:`,
  vazio); demo cobrindo os três fluxos.

## 3. Painel na Vercel

- Projeto Vercel ligado a `EngenhariaBucarId/dnia.shortener` (o dono aprova o acesso do app
  da Vercel à organização no GitHub, se pedido). Framework Vite, `npm run build`, saída `dist/`.
- `vercel.json`:
  - rewrite de todas as rotas para `/index.html` (SPA);
  - cabeçalhos: `Content-Security-Policy` (script só `self`; `connect-src` só o projeto
    Supabase, `https` e `wss`; `img-src` `self`, Storage do Supabase, `data:`, `blob:`;
    fontes do Google e locais; `frame-ancestors 'none'`), `X-Frame-Options: DENY`,
    `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
    `Permissions-Policy` sem câmera, microfone e localização.
  - O iframe `srcdoc` do preview da bio herda a CSP: a lista de imagens e fontes tem de
    cobrir a página de bio. Verificado antes de dar por pronto.
- Variáveis (Production, Preview, Development): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SHORT_DOMAIN=s.dnia.ai`. Nenhum segredo na Vercel.
- Domínio `shortner.dnia.ai` no projeto; na Cloudflare, `CNAME shortner → alvo da Vercel`
  em **DNS only**.
- Previews protegidos pela Vercel (só o time). O build nunca usa `--mode demo`.

## 4. Worker na Cloudflare (`s.dnia.ai`)

- Chave: secret key nova do Supabase (`sb_secret_…`) só para o Worker. Enviada **só** no
  cabeçalho `apikey`; `Authorization: Bearer` apenas quando a chave for a `service_role`
  legada (JWT). Secret `SUPABASE_SECRET_KEY`, aceitando `SUPABASE_SERVICE_ROLE_KEY` como
  fallback. Testes para os dois tipos de chave.
- `wrangler.toml`: Custom Domain `s.dnia.ai`; `compatibility_date` atualizada.
- Secrets (dono, com `wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
  `IP_HASH_SALT` (32 caracteres aleatórios, comando de geração no roteiro),
  `FALLBACK_URL=https://dnia.ai`.
- Ajustes pequenos da auditoria: `Cache-Control: no-store` nos 302 (I14); `%` malformado
  no caminho cai no fallback em vez de erro 500 (I2). Testes para os dois.
- Na Cloudflare (dono): regra de rate limiting para `s.dnia.ai`, ex.: 60 req/min por IP
  (I16 e pendente P1).
- Publicação pelo dono: `npx wrangler login` e `npx wrangler deploy`.

## 5. Ordem de ativação

| # | Passo | Quem | Verificação |
|---|---|---|---|
| 1 | Código (seções 1-4) num PR | Claude | `npm test`, typecheck, build, demo |
| 2 | Migração inicial | Claude (MCP) | tabelas, testes de RLS, advisors |
| 3 | Configuração do Auth | dono, com roteiro | leitura pelo MCP do que for possível |
| 4 | Usuário do dono com senha | dono | — |
| 5 | Primeiro admin, logo após o 4 | Claude (MCP) | `select` em `members` |
| 6 | Edge Function `team-admin` e secrets | Claude (MCP) | lista de funções, logs |
| 7 | Projeto Vercel, variáveis, deploy do `main` | Claude (plugin Vercel) | login na URL `.vercel.app` |
| 8 | DNS: zona `dnia.ai`, `CNAME shortner` | dono | domínio verificado na Vercel |
| 9 | Worker: secrets e deploy | dono, com roteiro | `curl -I https://s.dnia.ai/teste` → 302 para dnia.ai |
| 10 | Rate limiting | dono | — |
| 11 | Teste de ponta a ponta | ambos | checklist abaixo |

**Checklist de ponta a ponta**

- [ ] Login do admin em `shortner.dnia.ai`; "esqueci a senha" chega e funciona.
- [ ] Convite enviado pela tela Time; o convidado define a senha e entra como membro.
- [ ] Conta sem convite (se existir) vê a tela "sem acesso".
- [ ] Link criado no painel; `s.dnia.ai/<slug>` redireciona com os UTMs.
- [ ] O clique aparece nas métricas do link (prévia do WhatsApp conta como bot).
- [ ] Link desativado cai em `dnia.ai`.
- [ ] Página `s.dnia.ai/@perfil` abre com foto, fundo e logo; o preview no painel bate.
- [ ] Nenhum erro de CSP no console do painel.

## Volta atrás

- Banco: projeto vazio hoje (pior caso: reaplicar). Com dados reais, só migrações novas.
- Vercel: Instant Rollback para o deploy anterior.
- Worker: `wrangler rollback`.
- Sem admin: `insert` em `members` pelo SQL Editor (comando no README).

## Fora do escopo

SMTP próprio; webhook de clique para o dn.nexus; nova rodada da auditoria de segurança
após o deploy; CI rodando testes nos PRs.
