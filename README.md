# links.dn.ia

Encurtador de links próprio com construtor de UTM e métrica de clique por
campanha, rosto e canal. Stack nativo do Lovable (Vite + React + TypeScript +
Tailwind + shadcn/ui) sobre Supabase, com um Cloudflare Worker fazendo o
redirect.

## O que ele faz

- **Encurta** com slug automático (sem caractere ambíguo: nada de `0/O`, `1/l/I`)
  ou slug customizado seu.
- **Monta os UTMs na convenção** a partir de campanha, rosto, canal, tipo de
  tráfego e formato — e deixa cada campo editável, avisando quando você sai do
  padrão.
- **Conta o clique** com dia, dispositivo, navegador, SO, país/cidade,
  referrer e os UTMs efetivamente usados.
- **Separa clique de prévia de link.** WhatsApp, Instagram, LinkedIn e Slack
  buscam a URL pra montar o card de preview sem ninguém ter clicado — isso
  entra como `is_bot` e fica fora da métrica. Sem essa separação, um link
  mandado num grupo de 50 pessoas nasce com 50 "cliques".
- **Relatório por corte**: campanha, rosto e canal, pra responder de onde veio
  a demanda sem exportar nada pra planilha.
- **Edição de destino**: troca pra onde um link já publicado aponta, sem mudar
  o link nem perder os cliques antigos. O slug também é editável, com aviso
  de que o endereço antigo para de funcionar.
- **QR code** por link, gerado no navegador (nenhum link vaza pra API de
  terceiro), em PNG pra tela e SVG pra gráfica.
- **Página de link na bio** por perfil, em `seudominio.com/@rodrigo`, servida
  pelo Worker em HTML de servidor — por isso a prévia funciona quando alguém
  compartilha. Cada botão é um link rastreado, então o clique na bio cai no
  mesmo relatório. Foto, logo da empresa (no rodapé) e imagem de fundo sobem direto do painel (Supabase
  Storage, já redimensionadas no navegador), com 4 fundos prontos do design
  system e preview ao vivo — o preview é o mesmo HTML que o Worker publica.
- **Login por magic link**, só pra quem já foi convidado no Supabase.

## Arquitetura

```
seudominio.com/x7k2p   →  Cloudflare Worker  →  registra clique  →  302 pro destino com UTM
seudominio.com/@rodrigo →  Cloudflare Worker  →  HTML da página de bio (com prévia)
                                  ↓
                          Supabase (Postgres + Auth + RLS)
                                  ↑
painel.seudominio.com  →  App Lovable (React)  →  cria link / edita destino / QR / bio / métrica
```

Só o Worker roda no servidor, e ele existe por um motivo concreto: o painel é
uma SPA, e SPA não faz redirect HTTP de verdade. Os apps de mensagem não
executam JavaScript ao montar a prévia de um link, então redirect no cliente
quebraria a prévia de todo link compartilhado.

Fora isso, **não existe backend próprio**: o painel fala direto com o Supabase
usando o JWT do usuário, e o RLS controla o acesso. É o padrão que o Lovable
entende melhor, o que torna o remix limpo.

## Setup

### 1. Supabase

1. Crie um projeto em supabase.com.
2. **SQL Editor > New query**, cole `supabase/schema.sql` e rode. É idempotente,
   pode rodar de novo sem quebrar nada. Ele também cria o bucket `bio-media`
   (Storage) das fotos da bio — rode de novo sempre que o schema mudar.
3. **⚠️ Desligue o cadastro público** — este é o passo que não pode ser
   esquecido. Em **Authentication > Sign In / Providers > Email**, desmarque
   *Enable sign-ups* (ou, em projetos mais novos, ligue *Confirm email* e
   desative *Allow new users to sign up*). Sem isso, qualquer pessoa cria conta,
   vira `authenticated` e passa a ver todos os seus links e cliques.
4. Convide o time em **Authentication > Users > Add user > Send invitation**
   (Dali, Kaw, Gustavo, quem mais precisar).
5. Em **Project Settings > API**, copie a `Project URL` e a `anon` key.

A `anon` key é pública por natureza — ela vai dentro do bundle do navegador. A
segurança está no RLS + Auth, não em esconder essa chave. A `service_role` key
é que nunca sai do servidor: só o Worker a usa.

### 2. Variáveis do app

```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_SHORT_DOMAIN
```

### 3. Rodar local

```bash
npm install
npm run dev     # http://localhost:8080
npm test        # 35 verificações da lógica de UTM, do Worker e da bio
npm run build
```

Para o magic link funcionar em desenvolvimento, adicione
`http://localhost:8080` em **Authentication > URL Configuration > Redirect URLs**
no Supabase.

### 4. Cloudflare Worker (o redirect)

Pelo painel da Cloudflare:

1. **Workers & Pages > Create > Create Worker** e cole
   `cloudflare-worker/redirect.js` inteiro.
2. **Settings > Variables and Secrets**, adicione como *secret*:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | a `service_role` key |
   | `IP_HASH_SALT` | valor aleatório (`openssl rand -hex 16`) |
   | `FALLBACK_URL` | onde cair se o link não existir (ex: `https://dn.ia`) |

3. **Settings > Domains & Routes > Add**, aponte o domínio curto
   (`seudominio.com/*`) pro Worker.

Ou por CLI, com `cloudflare-worker/wrangler.toml` (troque `SEUDOMINIO.com`
antes):

```bash
npm install -g wrangler
wrangler login
cd cloudflare-worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put IP_HASH_SALT
wrangler secret put FALLBACK_URL
wrangler deploy
```

### 5. Dois domínios, não um

O domínio curto e o painel precisam ser **(sub)domínios diferentes** — o Worker
captura todo caminho do domínio onde está, então não sobra espaço pro painel no
mesmo lugar.

- `seudominio.com` (ou `link.seudominio.com`) → Worker. É o que vai nos links
  compartilhados.
- `painel.seudominio.com`, ou a URL que o Lovable/Vercel te der → o painel.
  Essa URL não se compartilha publicamente.

## Convenção de UTM

| Campo | Vem de | Exemplo |
|---|---|---|
| `utm_source` | canal normalizado | `instagram`, `linkedin`, `meta`, `google` |
| `utm_medium` | tipo de tráfego | `social`, `cpc`, `email`, `evento`, `bio` |
| `utm_campaign` | campanha em kebab-case | `lancamento-ago26` |
| `utm_content` | rosto + formato | `rodrigo-reel`, `normandia-carrossel` |
| `utm_term` | livre | normalmente vazio (palavra-chave paga) |

Repare que **mídia paga usa a plataforma de anúncio como source** (`meta`, não
`instagram`): é assim que o GA4 e as plataformas reconciliam o dado.

A convenção vive em `src/lib/utm.ts`. Mexer nas listas de rosto, canal e formato
é mexer naquele arquivo — e os testes em `tests/utm.test.ts` cobrem o
comportamento.

## Notas técnicas

- **302, não 301.** Redirect permanente fica em cache no navegador: a partir do
  segundo clique da mesma pessoa o servidor nem é chamado, e a contagem para.
- **O clique é gravado antes do redirect** (com `await`, não "fire and forget"):
  o Worker pode ser encerrado assim que a resposta sai. Custa ~30-80ms.
- **IP nunca é guardado em texto puro** — só `sha256(salt + ip)`, o que permite
  contar visitante único sem armazenar dado pessoal (LGPD).
- **Parâmetro na URL curta vence o UTM salvo**, e é isso que faz `fbclid` e
  `gclid` do anúncio chegarem no destino. O clique registra o UTM *efetivo*.
- **Views com `security_invoker = true`** respeitam o RLS de quem consulta. Sem
  isso, a view viraria um buraco por fora das policies.
- **Cliques só são gravados pela `service_role`** (o Worker). Não existe policy
  de insert em `clicks` de propósito: nem o painel pode inventar clique.
- **O gráfico carrega sob demanda** (`React.lazy`): a lib de chart é ~370 kB e
  quem só entra pra criar link não baixa isso.
- **Cor não codifica categoria** nos rankings. A paleta da marca reprova como
  paleta categórica em fundo escuro — âmbar e verde ficam a ΔE 5,7 em
  protanopia, indistinguíveis pra quem tem daltonismo vermelho-verde. A
  magnitude é lida pelo tamanho da barra, em tom único. Verde/âmbar/vermelho
  ficam reservados pra status, sempre com ícone + texto.

## Segurança das dependências

`npm audit --omit=dev` → **0 vulnerabilidades**. O `react-router` foi para a 7.x
de propósito: a 6.x tem um open redirect publicado (CVE-2025-68470 bypass), e
num encurtador de links essa é justamente a classe de bug que não vale carregar.

Sobram avisos em dependências **de build** puxadas pelo Tailwind 3 (`braces`,
`micromatch`, `postcss-selector-parser`) — são DoS por padrão malicioso no
próprio build, sem efeito no que vai pro navegador. O conserto seria migrar pro
Tailwind 4, que quebraria a convenção de config que o Lovable usa. Fica
registrado como dívida consciente.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe local em :8080 |
| `npm run build` | typecheck + bundle de produção |
| `npm run typecheck` | só o typecheck |
| `npm test` | 35 verificações (convenção de UTM, Worker e página de bio, com fetch mockado) |

## Próximos passos possíveis

- UI pra `expires_at` (a coluna existe e o Worker já respeita).
- Webhook do clique pra dn.nexus, fechando o ciclo clique → MQL. Hoje a
  ferramenta mede clique; demanda é o agendamento, e os dois ainda não se
  conversam.
- Filtro de período no relatório de campanha.
- Cor de botão customizável por página de bio (hoje vem do fundo escolhido).

## Paridade com o bit.ly

O objetivo deste projeto é cancelar a assinatura sem o time perder nada. Isso
torna a paridade binária: enquanto faltar uma função em uso, a mensalidade
continua sendo paga e a economia é zero. Estado atual:

| Função do bit.ly | Aqui |
|---|---|
| Encurtamento de URL | sim, com slug customizado |
| Rastreamento e análise | sim — clique, geo, dispositivo, referrer, UTM |
| Domínio personalizado | sim, por padrão (não é upsell de plano) |
| Edição de destino | sim, sem perder o histórico de cliques |
| QR Code | sim, PNG e SVG, gerado no navegador |
| Página de link na bio | sim, em `seudominio.com/@perfil` |

Antes de cancelar, confira: (1) os links do bit.ly que ainda estão no ar em
material publicado continuam funcionando enquanto a conta existir — migre os
que estiverem em peça viva antes de encerrar; (2) QR code impresso aponta pro
domínio antigo e **não** dá pra migrar sem reimprimir, então vale manter a
conta até o material impresso sair de circulação.
