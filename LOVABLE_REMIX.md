# Levar pro Lovable (remix)

O projeto já nasceu no stack nativo do Lovable, então o remix não exige
conversão: Vite + React + TypeScript + Tailwind + shadcn/ui, `components.json`
no lugar, alias `@/`, componentes de UI no formato que o Lovable espera em
`src/components/ui/`, e Supabase como backend. É por isso que não usei Next.js
— o Lovable não digere Next, e o remix emperraria antes de começar.

## Passo a passo

1. **Suba num repositório GitHub** (o Lovable importa de repo):

   ```bash
   cd dnia-links
   git init && git add -A
   git commit -m "links.dn.ia: encurtador com UTM e métrica de clique"
   gh repo create dnia-links --private --source=. --push
   ```

2. **No Lovable**, crie o projeto a partir do repositório (GitHub → Import /
   Remix). Ele vai reconhecer a estrutura e abrir pra edição visual.

3. **Conecte o Supabase** pelo botão nativo do Lovable, apontando pro *mesmo*
   projeto onde você rodou `supabase/schema.sql`. Não deixe o Lovable criar um
   banco novo (Lovable Cloud) se o Worker já está apontado pro seu — senão o
   painel escreve num banco e o redirect lê de outro.

4. **Configure as variáveis** no Lovable: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_SHORT_DOMAIN`.

5. **Deploy do painel** no Lovable, em domínio/subdomínio próprio — nunca no
   domínio curto, que é do Worker.

## O que dizer pro Lovable

Cole isso no chat dele na primeira mensagem, pra ele não "consertar" o que está
certo de propósito:

```
Este projeto é um encurtador de links com UTM e métricas, já funcionando.
Respeite estas decisões de arquitetura ao editar:

1. NÃO crie rota de redirect (/:slug) neste app. O redirect roda fora, num
   Cloudflare Worker, porque SPA não faz redirect HTTP real e isso quebraria a
   prévia de link no WhatsApp/Instagram/LinkedIn (esses crawlers não executam JS).
2. NÃO mude o modelo de RLS. O painel fala direto com o Supabase usando o JWT
   do usuário. Cliques são gravados só pela service_role (o Worker) — não existe
   policy de insert em `clicks` de propósito.
3. NÃO altere a convenção de UTM em src/lib/utm.ts sem me avisar: ela é o que
   mantém o relatório por campanha confiável. Há testes em tests/utm.test.ts.
4. Mantenha os tokens de cor como variáveis CSS em src/index.css e use
   hsl(var(--token)) nos componentes — nunca hex direto.
4b. A página pública de link na bio (dominio.com/@perfil) NÃO é uma rota deste
   app: ela é HTML renderizado pelo Worker, pra prévia de compartilhamento
   funcionar. O app só edita o conteúdo dela.
5. Nos rankings e gráficos, não codifique categoria por cor: a paleta da marca
   reprova em daltonismo vermelho-verde no fundo escuro. Magnitude é por tamanho
   de barra, em tom único.

Pode mexer livremente em: layout, espaçamento, textos da interface, novos
componentes visuais, e novas telas que leiam das views v_* já existentes.
```

## O que o Lovable pode mexer sem risco

- Layout, espaçamento, hierarquia visual das telas.
- Texto de interface, label, estado vazio, mensagem de erro.
- Novos componentes visuais sobre os dados que já existem.
- Telas novas que leiam das views `v_link_stats`, `v_campaign_stats`,
  `v_rosto_stats`, `v_canal_stats`, `v_daily_clicks`.

## O que mantém a conta certa (não mexer sem pensar)

| Arquivo | Por quê |
|---|---|
| `cloudflare-worker/redirect.js` | é o redirect e o registro de clique; vive fora do Lovable |
| `src/lib/utm.ts` | a convenção de UTM — mexer aqui muda o relatório histórico |
| `supabase/schema.sql` | RLS, views e a flag `is_bot` que separa clique de prévia |
| `tests/` | se `npm test` quebrar depois de uma edição, a conta parou de fechar |
| `cloudflare-worker/redirect.js` (parte da bio) | o HTML da página pública e o escape contra injeção |

## Depois de cada rodada de remix

```bash
npm test && npm run build
```

Se os dois passarem, a lógica de UTM e de contagem continua íntegra — o remix
mexeu só na superfície.
