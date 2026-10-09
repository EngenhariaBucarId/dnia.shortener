# links.dn.ia em produção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o painel (`shortner.dnia.ai`, Vercel), os links curtos (`s.dnia.ai`, Cloudflare Worker) e o banco (Supabase `zqtcfqskdfscqtbzeglu`) funcionando juntos em produção.

**Architecture:** Parte 1 (Tasks 1-9) é código, num PR, testado offline. Parte 2 (Tasks 10-16) é ativação nos serviços externos, na ordem do spec, com checkpoints onde o dono age no dashboard (Auth, DNS, Cloudflare). O painel é SPA estática; só o Worker e a Edge Function têm chave secreta.

**Tech Stack:** React 18 + Vite 5 + Tailwind/shadcn, supabase-js 2, Supabase (Postgres 17, Auth, Storage, Edge Functions/Deno), Cloudflare Workers (wrangler), Vercel. Testes: Node 24 (`node --experimental-strip-types` para `.ts`, `node` para `.mjs`), sem framework.

**Spec:** `docs/superpowers/specs/2026-10-09-supabase-vercel-producao-design.md`

## Global Constraints

- Projeto Supabase: `zqtcfqskdfscqtbzeglu` — URL `https://zqtcfqskdfscqtbzeglu.supabase.co`.
- Painel: `https://shortner.dnia.ai` (grafia escolhida pelo dono). Domínio curto: `s.dnia.ai`. Fallback do Worker: `https://dnia.ai`.
- Repositório **público** (`EngenhariaBucarId/dnia.shortener`): nenhuma chave secreta, salt ou senha em arquivo versionado. `docs/security-audit/` nunca entra em commit.
- Painel usa `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`), com fallback para `VITE_SUPABASE_ANON_KEY`.
- Worker usa `SUPABASE_SECRET_KEY` (`sb_secret_…`) só no cabeçalho `apikey`; `Authorization: Bearer` só para a `service_role` legada (JWT, começa com `eyJ`). Fallback de nome: `SUPABASE_SERVICE_ROLE_KEY`.
- Sem cadastro público: nenhum formulário de sign-up no painel; entrada só por convite (`team-admin`).
- Toda mudança de schema a partir de agora é migração nova em `supabase/migrations/`; nunca editar migração já aplicada.
- Textos de interface em português, voz dn.ia; tokens do tema Premium (nunca hex em componente).
- Node está em `C:\Program Files\nodejs` (no Git Bash: `export PATH="/c/Program Files/nodejs:$PATH"`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `?next=` apontando para outro site (`//evil.com`, `https://evil.com`, `javascript:`) depois do login → a pessoa cai em `/`, nunca fora do painel. Pinado na Task 3.
2. Caminho com `%` malformado no domínio curto (`s.dnia.ai/%E0%A4%A`) → redirect para `https://dnia.ai`, não erro 500. Pinado na Task 1.
3. Worker publicado sem nenhuma chave do Supabase configurada → todo link cai no fallback, sem exceção derrubando a requisição. Pinado na Task 1.
4. `PANEL_URL` cadastrado com barra no fim ou maiúsculas (`https://Shortner.dnia.ai/`) → o CORS ainda aceita a origem exata do navegador. Pinado na Task 2.
5. Recarregar `shortner.dnia.ai/time` ou abrir o link do e-mail em `/definir-senha` direto → a Vercel serve o app, não 404. Pinado na Task 7 (rewrite) e conferido na Task 16.

---

## Parte 1 — Código (um PR)

### Task 1: Worker — chave secreta nova, redirects sem cache e caminho malformado

**Files:**
- Modify: `cloudflare-worker/redirect.js` (cabeçalho de comentário L17-27, `fetch` L29-76, `fetchLink` L78-100, `logClick` headers, `renderBioPage` headers)
- Modify: `cloudflare-worker/redirect.d.ts` (exportar `supabaseHeaders`)
- Test: `tests/worker.test.mjs`, `tests/bio.test.mjs`

**Interfaces:**
- Produces: `export function supabaseHeaders(env: Record<string,string|undefined>, extra?: Record<string,string>): Record<string,string>` em `redirect.js`.

- [ ] **Step 1: Trocar o env dos testes para a chave nova e escrever os testes que falham**

Em `tests/worker.test.mjs`, troque o bloco `env` (L6-11) por:

```js
const env = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_teste",
  IP_HASH_SALT: "salt-de-teste",
  FALLBACK_URL: "https://dn.ia",
};
```

No `mockFetch`, troque a linha `assert.equal(options.headers?.apikey, env.SUPABASE_SERVICE_ROLE_KEY);` (L30) por:

```js
      // chave nova vai só no apikey; não é JWT, então nada de Bearer
      assert.equal(options.headers?.apikey, env.SUPABASE_SECRET_KEY);
      assert.equal(options.headers?.Authorization, undefined);
```

Acrescente antes de `console.log(\`\n${passed} verificações passaram.\n\`);`:

```js
await check("service_role legada (JWT) vai também no Authorization", async () => {
  const legacy = "eyJhbGciOiJIUzI1NiJ9.e30.assinatura";
  let seen = null;
  globalThis.fetch = async (url, options = {}) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/rest/v1/links")) {
      seen = options.headers;
      return new Response(JSON.stringify([LINK]), { status: 200 });
    }
    return new Response("", { status: 201 });
  };
  const legacyEnv = { ...env, SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: legacy };
  await worker.fetch(makeRequest("/x7k2p"), legacyEnv);
  assert.equal(seen.apikey, legacy);
  assert.equal(seen.Authorization, `Bearer ${legacy}`);
});

await check("redirects levam Cache-Control: no-store", async () => {
  mockFetch();
  const ok = await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  mockFetch({ link: null });
  const fallback = await worker.fetch(makeRequest("/nao-existe"), env);
  assert.equal(fallback.headers.get("cache-control"), "no-store");
});

await check("% malformado no caminho cai no fallback, sem erro 500", async () => {
  mockFetch();
  const res = await worker.fetch(makeRequest("/%E0%A4%A"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("sem nenhuma chave configurada, link cai no fallback sem exceção", async () => {
  globalThis.fetch = async (url, options = {}) => {
    // o Supabase recusa requisição sem apikey válida
    return options.headers?.apikey ? new Response("[]", { status: 200 }) : new Response("", { status: 401 });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(makeRequest("/x7k2p"), { ...env, SUPABASE_SECRET_KEY: undefined });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://dn.ia/");
  } finally {
    console.error = originalError;
  }
});
```

Em `tests/bio.test.mjs`, troque o bloco `env` (L5-10) pelo mesmo de cima e a linha `assert.equal(options.headers?.apikey, env.SUPABASE_SERVICE_ROLE_KEY);` por:

```js
      assert.equal(options.headers?.apikey, env.SUPABASE_SECRET_KEY);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `AssertionError` no `mockFetch` (o Worker ainda manda `SUPABASE_SERVICE_ROLE_KEY`, que agora é `undefined`).

- [ ] **Step 3: Implementar no Worker**

Em `cloudflare-worker/redirect.js`, logo depois do bloco `export default { ... };`, adicione:

```js
/**
 * Cabeçalhos pro Supabase. A chave nova (sb_secret_...) NÃO é JWT: vai só no
 * apikey — mandada como Bearer, o Supabase recusa. A service_role legada é
 * JWT e continua indo nos dois, pra compatibilidade.
 */
export function supabaseHeaders(env, extra = {}) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  const headers = { apikey: key, ...extra };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** 302 sem cache: desativar um link vale na hora, mesmo com cache na borda. */
function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(location).toString(), "Cache-Control": "no-store" },
  });
}
```

No início do `fetch`, troque:

```js
    const url = new URL(request.url);
    const slug = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();

    const fallback = env.FALLBACK_URL || "https://dn.ia";
```

por:

```js
    const url = new URL(request.url);
    const fallback = env.FALLBACK_URL || "https://dnia.ai";

    let slug;
    try {
      slug = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();
    } catch {
      // %-escape malformado: não é link nosso, vai pro site.
      return redirect(fallback);
    }
```

Troque **todas** as ocorrências de `Response.redirect(fallback, 302)` e `Response.redirect(destination, 302)` em `redirect.js` por `redirect(fallback)` e `redirect(destination)` (inclusive as de `renderBioPage`). Confira com: `grep -n "Response.redirect" cloudflare-worker/redirect.js` → nenhuma linha.

Em `fetchLink`, troque o objeto `headers: { apikey: ..., Authorization: ..., Accept: "application/json" }` por:

```js
    headers: supabaseHeaders(env, { Accept: "application/json" }),
```

Em `logClick`, troque o objeto de headers do `fetch` para `/rest/v1/clicks` por:

```js
    headers: supabaseHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
```

Em `renderBioPage`, troque `const headers = { apikey: ..., Authorization: ..., Accept: "application/json" };` por:

```js
  const headers = supabaseHeaders(env, { Accept: "application/json" });
```

No comentário de SETUP do topo (L17-27), troque a linha `SUPABASE_SERVICE_ROLE_KEY a service_role key do projeto` por `SUPABASE_SECRET_KEY       chave secreta nova (sb_secret_...) só pro Worker` e `ex: https://dn.ia` por `ex: https://dnia.ai`; a última linha do bloco passa a ser `A chave secreta só existe aqui, no servidor — nunca chega no navegador.`

Em `cloudflare-worker/redirect.d.ts`, acrescente antes de `declare const worker`:

```ts
export function supabaseHeaders(
  env: Record<string, string | undefined>,
  extra?: Record<string, string>
): Record<string, string>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test && npx tsc --noEmit`
Expected: as três suítes passam (`13`, `20` e `15` verificações) e o typecheck não imprime nada.

- [ ] **Step 5: Commit**

```bash
git add cloudflare-worker/redirect.js cloudflare-worker/redirect.d.ts tests/worker.test.mjs tests/bio.test.mjs
git commit -m "Worker: chave secreta nova só no apikey, 302 sem cache e % malformado no fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function — origens do CORS (PANEL_URL + EXTRA_ORIGINS)

**Files:**
- Create: `supabase/functions/team-admin/origins.ts`
- Modify: `supabase/functions/team-admin/index.ts` (cabeçalho de secrets, constante `PANEL_URL`, função `cors`)
- Create: `tests/origins.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `export function allowedOrigins(panelUrl: string | undefined, extra: string | undefined): Set<string>` — origens normalizadas (`URL.origin`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/origins.test.ts`:

```ts
// Origens aceitas pelo CORS da Edge Function team-admin.
import assert from "node:assert/strict";
import { allowedOrigins } from "../supabase/functions/team-admin/origins.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- origens do CORS ---");

check("só o painel", () => {
  assert.deepEqual([...allowedOrigins("https://shortner.dnia.ai", undefined)], ["https://shortner.dnia.ai"]);
});

check("barra no fim, caminho e maiúsculas viram a origem exata", () => {
  const set = allowedOrigins("HTTPS://Shortner.DNIA.ai/definir-senha/", "");
  assert.ok(set.has("https://shortner.dnia.ai"));
  assert.equal(set.size, 1);
});

check("EXTRA_ORIGINS separada por vírgula, com espaços", () => {
  const set = allowedOrigins("https://shortner.dnia.ai", " http://localhost:8080 , http://127.0.0.1:8080");
  assert.ok(set.has("http://localhost:8080"));
  assert.ok(set.has("http://127.0.0.1:8080"));
  assert.equal(set.size, 3);
});

check("entrada inválida é ignorada, não derruba a função", () => {
  const set = allowedOrigins("nao-e-url", "tambem nao,,");
  assert.equal(set.size, 0);
});

check("nada configurado = nenhuma origem aceita", () => {
  assert.equal(allowedOrigins(undefined, undefined).size, 0);
});

console.log(`\n${passed} verificações passaram.\n`);
```

No `package.json`, troque o script `test` por:

```json
    "test": "node --experimental-strip-types --no-warnings tests/utm.test.ts && node --experimental-strip-types --no-warnings tests/origins.test.ts && node --no-warnings tests/worker.test.mjs && node --no-warnings tests/bio.test.mjs",
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node --experimental-strip-types --no-warnings tests/origins.test.ts`
Expected: FAIL — `Cannot find module .../origins.ts`.

- [ ] **Step 3: Implementar**

Crie `supabase/functions/team-admin/origins.ts`:

```ts
/**
 * Origens que o CORS da team-admin aceita: PANEL_URL mais EXTRA_ORIGINS
 * (separadas por vírgula, ex.: o localhost do dev). Cada valor vira a origem
 * exata que o navegador manda (esquema + host + porta, em minúsculas, sem
 * caminho nem barra) — assim "https://Shortner.dnia.ai/" ainda casa.
 * Valor que não é URL é ignorado.
 *
 * Arquivo sem API do Deno de propósito: roda igual no Node, nos testes.
 */
export function allowedOrigins(panelUrl: string | undefined, extra: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of [panelUrl ?? "", ...(extra ?? "").split(",")]) {
    const value = raw.trim();
    if (!value) continue;
    try {
      out.add(new URL(value).origin);
    } catch {
      // ignora entrada inválida
    }
  }
  return out;
}
```

Em `supabase/functions/team-admin/index.ts`:

1. No cabeçalho, depois do bloco do `PANEL_URL`, acrescente:

```ts
//   EXTRA_ORIGINS  opcional: outras origens aceitas, separadas por vírgula
//                  (ex.: http://localhost:8080 pra testar o convite no dev).
```

2. Logo depois de `import { createClient } from "npm:@supabase/supabase-js@2";` acrescente:

```ts
import { allowedOrigins } from "./origins.ts";
```

3. Depois da linha `const SERVICE_ROLE_KEY = ...;` acrescente:

```ts
const ORIGINS = allowedOrigins(PANEL_URL, Deno.env.get("EXTRA_ORIGINS"));
```

4. Troque a função `cors` inteira por:

```ts
function cors(origin: string | null): Record<string, string> {
  // Só o painel (e as origens extras do dev) conversa com esta função. Origem
  // desconhecida não recebe o cabeçalho, e o navegador bloqueia a resposta.
  return origin && ORIGINS.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: quatro suítes passando; `origins` com `5 verificações passaram.`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/team-admin/origins.ts supabase/functions/team-admin/index.ts tests/origins.test.ts package.json
git commit -m "team-admin: CORS aceita PANEL_URL normalizado e EXTRA_ORIGINS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `safeNextPath` (do bloco oficial da Supabase UI Library)

**Files:**
- Create: `src/lib/safe-next-path.ts`
- Create: `tests/safe-next-path.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `export const safeNextPath = (path: unknown, fallback?: string, origin?: string) => string` — devolve caminho interno (`/x?y#z`) ou `fallback`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/safe-next-path.test.ts`:

```ts
// Para onde o login manda depois de entrar: só caminho do próprio painel.
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/safe-next-path.ts";

const ORIGIN = "https://shortner.dnia.ai";
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- safeNextPath ---");

check("caminho interno passa, com query e hash", () => {
  assert.equal(safeNextPath("/time", "/", ORIGIN), "/time");
  assert.equal(safeNextPath("/campanhas?x=1#a", "/", ORIGIN), "/campanhas?x=1#a");
});

check("outro site nunca passa", () => {
  for (const evil of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"]) {
    assert.equal(safeNextPath(evil, "/", ORIGIN), "/", evil);
  }
});

check("vazio ou não-texto vira o fallback", () => {
  for (const nada of ["", null, undefined, 42, {}]) {
    assert.equal(safeNextPath(nada, "/", ORIGIN), "/");
  }
});

check("fallback é respeitado", () => {
  assert.equal(safeNextPath("//evil.com", "/campanhas", ORIGIN), "/campanhas");
});

console.log(`\n${passed} verificações passaram.\n`);
```

No `package.json`, no script `test`, insira `node --experimental-strip-types --no-warnings tests/safe-next-path.test.ts && ` logo depois do trecho de `tests/origins.test.ts`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node --experimental-strip-types --no-warnings tests/safe-next-path.test.ts`
Expected: FAIL — `Cannot find module .../safe-next-path.ts`.

- [ ] **Step 3: Implementar (cópia fiel do bloco oficial)**

Crie `src/lib/safe-next-path.ts`:

```ts
/**
 * Vem do bloco oficial da Supabase UI Library (`safe-next-path`, dependência
 * do `password-based-auth-react`), copiado sem mudança de lógica em 2026-10-09:
 * https://supabase.com/library/r/safe-next-path.json
 *
 * Garante que o "?next=" do login só leve pra dentro do próprio painel —
 * sem isso, um link de login poderia mandar a pessoa pra outro site depois
 * de entrar.
 */
export const safeNextPath = (path: unknown, fallback = "/", origin?: string) => {
  if (typeof path !== "string" || !path.startsWith("/")) return fallback;

  const currentOrigin = origin ?? window.location.origin;

  try {
    const url = new URL(path, currentOrigin);
    return url.origin === currentOrigin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: cinco suítes passando; `safeNextPath` com `4 verificações passaram.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/safe-next-path.ts tests/safe-next-path.test.ts package.json
git commit -m "safeNextPath do bloco oficial da Supabase UI Library, com testes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chave publicável no painel

**Files:**
- Modify: `src/lib/supabase.ts:1-20`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `supabase` (cliente único) continua exportado de `@/lib/supabase`; nada muda para quem importa.

- [ ] **Step 1: Atualizar o cliente**

Em `src/lib/supabase.ts`, troque as linhas do topo até o `createClient` por:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
// Chave pública nova (sb_publishable_...), recomendada pelo Supabase. A anon
// legada continua aceita durante a transição. Nenhuma das duas é segredo: a
// segurança está no RLS + Auth.
const publicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !publicKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Copie .env.example para .env e preencha."
  );
}

export const supabase = createClient<Database>(url, publicKey, {
```

(o restante do arquivo — opções de `auth`, `SHORT_DOMAIN`, `shortUrl` — fica igual).

- [ ] **Step 2: Tipos e exemplo**

`src/vite-env.d.ts`, dentro de `ImportMetaEnv`:

```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legada; use VITE_SUPABASE_PUBLISHABLE_KEY. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SHORT_DOMAIN: string;
}
```

`.env.example` inteiro:

```bash
# Supabase — Project Settings > API Keys
# A chave publicável é pública por natureza (vai no bundle do navegador).
# A segurança fica no RLS + Auth, não no segredo da chave.
VITE_SUPABASE_URL=https://zqtcfqskdfscqtbzeglu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave

# Domínio curto onde o Cloudflare Worker está publicado (sem https://, sem barra final).
# É o que aparece nos links copiados do painel.
VITE_SHORT_DOMAIN=s.dnia.ai
```

- [ ] **Step 3: Verificar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit && npm test`
Expected: typecheck sem saída; todas as suítes passando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/vite-env.d.ts .env.example
git commit -m "Painel usa a chave publicável do Supabase (anon como fallback)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Formulários de acesso a partir do bloco `password-based-auth-react`

**Files:**
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/components/auth/ForgotPasswordForm.tsx`
- Create: `src/components/auth/UpdatePasswordForm.tsx`
- Modify: `src/pages/Login.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/SetPassword.tsx` (passam a só montar o layout e o formulário)
- Modify: `src/App.tsx` (função `Protected`: manda para `/login?next=`)

**Interfaces:**
- Consumes: `useAuth()` de `@/hooks/useAuth` — `signIn(email, password) → {error}`, `sendPasswordReset(email) → {error}`, `updatePassword(password) → {error}`, `MIN_PASSWORD_LENGTH`; `safeNextPath` (Task 3); `AuthLayout` de `@/components/AuthLayout`.
- Produces: `LoginForm`, `ForgotPasswordForm`, `UpdatePasswordForm` (sem props).

Fonte: `https://supabase.com/library/r/password-based-auth-react.json` (2026-10-09). **Não** rodar o CLI do shadcn: ele pergunta, interativamente, se sobrescreve `button/card/input/label`, que já existem no tema Premium, e instalaria `@supabase/supabase-js@latest` sem versão fixa. Os três formulários abaixo seguem a estrutura e a lógica do bloco, com as adaptações do spec. O `sign-up-form` não entra.

- [ ] **Step 1: `LoginForm`**

Crie `src/components/auth/LoginForm.tsx`:

```tsx
/**
 * Adaptado do bloco oficial da Supabase UI Library `password-based-auth-react`
 * (login-form.tsx, 2026-10-09). Mudanças: cliente único via useAuth, textos em
 * português, erro genérico, navegação do react-router com ?next= validado
 * pelo safeNextPath, botão de mostrar senha e sem link de cadastro (entrada
 * só por convite).
 */
import { useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim(), password);
    setIsLoading(false);
    if (signInError) return setError(signInError);
    navigate(safeNextPath(params.get("next"), "/"), { replace: true });
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="voce@dnia.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <RouterLink
            to="/esqueci-senha"
            className="mb-1.5 text-[12px] font-medium text-primary-ink hover:underline"
          >
            Esqueci a senha
          </RouterLink>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
```

Troque `src/pages/Login.tsx` inteiro por:

```tsx
import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

export default function Login() {
  const { session, loading, recovering } = useAuth();
  const [params] = useSearchParams();

  useEffect(() => {
    document.title = "Entrar · links.dn.ia";
  }, []);

  // Sessão de recuperação de senha: termina de definir a senha antes.
  if (!loading && session && recovering) return <Navigate to="/definir-senha" replace />;
  if (!loading && session) return <Navigate to={safeNextPath(params.get("next"), "/")} replace />;

  return (
    <AuthLayout title="Entrar" description="Use o e-mail e a senha do seu convite.">
      <LoginForm />
    </AuthLayout>
  );
}
```

- [ ] **Step 2: `ForgotPasswordForm`**

Crie `src/components/auth/ForgotPasswordForm.tsx`:

```tsx
/**
 * Adaptado do bloco oficial da Supabase UI Library `password-based-auth-react`
 * (forgot-password-form.tsx, 2026-10-09). Mudanças: cliente único via useAuth
 * (o redirectTo para /definir-senha fica no useAuth), textos em português e
 * mesma resposta exista ou não a conta — a tela não confirma quem tem acesso.
 */
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    await sendPasswordReset(email.trim());
    // Sucesso ou não, a mesma tela. (Limite de envio é do Supabase Auth.)
    setIsLoading(false);
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex gap-3 rounded-md border border-border-subtle bg-muted p-4">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <p className="text-[13px] leading-relaxed">
          Se <span className="font-semibold">{email}</span> tiver acesso ao painel, você vai
          receber um link pra criar uma senha nova. O link vale por 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleForgotPassword} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="voce@dnia.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Enviando…" : "Enviar link"}
      </Button>
    </form>
  );
}
```

Troque `src/pages/ForgotPassword.tsx` inteiro por:

```tsx
import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPassword() {
  useEffect(() => {
    document.title = "Esqueci a senha · links.dn.ia";
  }, []);

  return (
    <AuthLayout
      title="Esqueci a senha"
      description="Informe o e-mail do seu acesso. Enviamos um link pra você criar uma senha nova."
    >
      <ForgotPasswordForm />
      <RouterLink
        to="/login"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-ink hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar pro login
      </RouterLink>
    </AuthLayout>
  );
}
```

- [ ] **Step 3: `UpdatePasswordForm`**

Crie `src/components/auth/UpdatePasswordForm.tsx`:

```tsx
/**
 * Adaptado do bloco oficial da Supabase UI Library `password-based-auth-react`
 * (update-password-form.tsx, 2026-10-09). Mudanças: cliente único via useAuth,
 * textos em português, confirmação da senha com as regras visíveis, mínimo de
 * MIN_PASSWORD_LENGTH caracteres e navegação do react-router. Serve pro
 * convite (primeiro acesso) e pra recuperação.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function UpdatePasswordForm() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password.length > 0 && password === confirm;

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough) return setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (!matches) return setError("As duas senhas não são iguais.");

    setIsLoading(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setIsLoading(false);
    if (updateError) return setError("Não foi possível salvar a senha. Peça um link novo e tente de novo.");
    navigate("/", { replace: true });
  }

  return (
    <form onSubmit={handleUpdatePassword} className="space-y-4">
      <div>
        <Label htmlFor="new-password">Nova senha</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="confirm-password">Repita a senha</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <ul className="space-y-1 text-[12px]">
        {[
          { ok: longEnough, label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres` },
          { ok: matches, label: "As duas senhas iguais" },
        ].map((rule) => (
          <li
            key={rule.label}
            className={cn("flex items-center gap-1.5", rule.ok ? "text-success" : "text-muted-foreground")}
          >
            {rule.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {rule.label}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Salvando…" : "Salvar senha e entrar"}
      </Button>
    </form>
  );
}
```

Troque `src/pages/SetPassword.tsx` inteiro por:

```tsx
import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { Button } from "@/components/ui/button";

/**
 * Definir senha — destino dos dois links que chegam por e-mail (convite e
 * "esqueci a senha"). Os dois já abrem uma sessão; aqui só se troca a senha.
 */
export default function SetPassword() {
  const { session, loading } = useAuth();

  useEffect(() => {
    document.title = "Definir senha · links.dn.ia";
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="eyebrow animate-pulse">Carregando…</span>
      </div>
    );
  }

  // Sem sessão: o link expirou, já foi usado ou a pessoa abriu a página direto.
  if (!session) {
    return (
      <AuthLayout
        title="Link inválido ou expirado"
        description="Os links de convite e de recuperação valem uma vez só e por tempo limitado."
      >
        <div className="flex flex-col gap-2">
          <Button asChild>
            <RouterLink to="/esqueci-senha">Pedir um link novo</RouterLink>
          </Button>
          <Button asChild variant="ghost">
            <RouterLink to="/login">Voltar pro login</RouterLink>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Defina sua senha"
      description={
        <>
          Acesso de <span className="font-semibold text-foreground">{session.user.email}</span>.
          Depois disso você entra com e-mail e senha.
        </>
      }
    >
      <UpdatePasswordForm />
    </AuthLayout>
  );
}
```

- [ ] **Step 4: `Protected` manda para `/login?next=`**

Em `src/App.tsx`, troque a primeira linha de import por:

```tsx
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
```

e, dentro de `Protected`, troque:

```tsx
  const { session, role, isAdmin, loading, recovering } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!session) return <Navigate to="/login" replace />;
```

por:

```tsx
  const { session, role, isAdmin, loading, recovering } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!session) {
    // Volta pra página pedida depois do login (validada pelo safeNextPath).
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
```

- [ ] **Step 5: Verificar no demo**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit && npm test && npm run build`
Expected: typecheck sem saída, suítes passando, `✓ built in`.

Depois: `npm run dev:demo -- --host 127.0.0.1` e, no navegador:
1. Abrir `http://127.0.0.1:8080/time` deslogado → vai para `/login?next=%2Ftime`.
2. Sair (ícone do cabeçalho) e entrar com `demo@dnia.com.br` / `demo1234` → cai em `/` (no demo a sessão já começa aberta; após sair e entrar, confere o redirect).
3. Abrir `/login?next=//evil.com`, entrar → cai em `/`.
4. "Esqueci a senha" → mensagem de confirmação.
5. Senha errada → "E-mail ou senha incorretos."

- [ ] **Step 6: Commit**

```bash
git add src/components/auth src/pages/Login.tsx src/pages/ForgotPassword.tsx src/pages/SetPassword.tsx src/App.tsx
git commit -m "Login, esqueci a senha e definir senha a partir do bloco password-based-auth-react

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Migração inicial e verificação de RLS

**Files:**
- Create: `supabase/migrations/20261009000000_inicial.sql` (cópia de `supabase/schema.sql`)
- Create: `supabase/tests/rls.sql`
- Modify: `supabase/schema.sql` (comentário de topo)
- Modify: `README.md` (seção `### 1. Supabase`, passo 2)

**Interfaces:**
- Produces: o arquivo de migração que a Task 10 aplica, e `supabase/tests/rls.sql`, que a Task 10 roda.

- [ ] **Step 1: Criar a migração**

Run: `mkdir -p supabase/migrations supabase/tests && cp supabase/schema.sql supabase/migrations/20261009000000_inicial.sql`

No topo de `supabase/schema.sql`, insira como primeiras linhas:

```sql
-- RETRATO LEGÍVEL do schema. A fonte da verdade são as migrações em
-- supabase/migrations/ (aplicadas em ordem). Mudança nova = migração nova;
-- não edite migração já aplicada. Mantenha este arquivo igual ao resultado
-- de todas as migrações, pra leitura.
```

- [ ] **Step 2: Escrever a verificação de RLS**

Crie `supabase/tests/rls.sql`:

```sql
-- Verificação das policies, rodada contra o banco real (MCP execute_sql ou SQL
-- Editor). Tudo acontece dentro de um DO que SEMPRE termina em exceção: o
-- Postgres desfaz tudo, então nenhum usuário ou link de teste fica no banco.
--
-- Resultado esperado: ERRO com a mensagem "OK: 9 verificações de RLS".
-- Qualquer "FALHOU N: ..." aponta a regra quebrada.
do $$
declare
  admin_id    uuid := '00000000-0000-4000-8000-0000000000a1';
  membro_id   uuid := '00000000-0000-4000-8000-0000000000a2';
  estranho_id uuid := '00000000-0000-4000-8000-0000000000a3';
  n int;
  ok int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (admin_id,    'rls-admin@teste.invalid',    'authenticated', 'authenticated'),
    (membro_id,   'rls-membro@teste.invalid',   'authenticated', 'authenticated'),
    (estranho_id, 'rls-estranho@teste.invalid', 'authenticated', 'authenticated');
  insert into public.members (user_id, email, role) values
    (admin_id,  'rls-admin@teste.invalid',  'admin'),
    (membro_id, 'rls-membro@teste.invalid', 'membro');
  insert into public.links (slug, destination_url, final_url)
    values ('rls-teste-1', 'https://dnia.ai', 'https://dnia.ai');

  -- 1. anon (sem login) não lê links
  execute 'set local role anon';
  begin
    select count(*) into n from public.links;
  exception when insufficient_privilege then n := 0;
  end;
  if n <> 0 then raise exception 'FALHOU 1: anon leu % links', n; end if;
  ok := ok + 1;
  execute 'reset role';

  -- conta autenticada que NÃO está em members
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', estranho_id, 'role', 'authenticated')::text, true);

  -- 2. não lê links
  select count(*) into n from public.links;
  if n <> 0 then raise exception 'FALHOU 2: conta sem convite leu % links', n; end if;
  ok := ok + 1;

  -- 3. não cria link
  begin
    insert into public.links (slug, destination_url, final_url)
      values ('rls-teste-2', 'https://dnia.ai', 'https://dnia.ai');
    raise exception 'FALHOU 3: conta sem convite criou link';
  exception when insufficient_privilege then null;
  end;
  ok := ok + 1;

  -- 4. is_member() é falso
  if public.is_member() then raise exception 'FALHOU 4: is_member() verdadeiro para conta sem convite'; end if;
  ok := ok + 1;

  -- membro comum
  perform set_config('request.jwt.claims',
    json_build_object('sub', membro_id, 'role', 'authenticated')::text, true);

  -- 5. lê links
  select count(*) into n from public.links where slug = 'rls-teste-1';
  if n <> 1 then raise exception 'FALHOU 5: membro não leu o link (%)', n; end if;
  ok := ok + 1;

  -- 6. cria link
  insert into public.links (slug, destination_url, final_url)
    values ('rls-teste-3', 'https://dnia.ai', 'https://dnia.ai');
  ok := ok + 1;

  -- 7. não se promove a admin (RLS filtra: 0 linhas alteradas)
  update public.members set role = 'admin' where user_id = membro_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 7: membro alterou papel (% linhas)', n; end if;
  ok := ok + 1;

  -- admin
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  -- 8. promove e rebaixa o membro
  update public.members set role = 'admin' where user_id = membro_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU 8: admin não alterou papel (% linhas)', n; end if;
  update public.members set role = 'membro' where user_id = membro_id;
  ok := ok + 1;

  -- 9. não remove o último admin
  begin
    delete from public.members where user_id = admin_id;
    raise exception 'FALHOU 9: o último admin foi removido';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  ok := ok + 1;

  execute 'reset role';
  raise exception 'OK: % verificações de RLS', ok;
end $$;
```

- [ ] **Step 3: README**

Em `README.md`, na seção `### 1. Supabase`, troque o passo 2 (que começa com `2. **SQL Editor > New query**, cole \`supabase/schema.sql\``) por:

```markdown
2. **Aplique as migrações** de `supabase/migrations/`, em ordem (pelo SQL
   Editor, colando cada arquivo, ou `supabase db push` com a CLI). Elas criam
   as tabelas, a lista de membros do time (`members`), as policies e o bucket
   `bio-media`. Depois, rode `supabase/tests/rls.sql`: o resultado esperado é
   um erro com a mensagem `OK: 9 verificações de RLS` (o teste desfaz tudo o
   que cria). `supabase/schema.sql` é só um retrato legível do resultado —
   mudança nova entra como migração nova.
```

- [ ] **Step 4: Verificar**

Run: `diff -q supabase/migrations/20261009000000_inicial.sql <(tail -n +5 supabase/schema.sql) && echo IGUAIS`
Expected: `IGUAIS` (a migração é o schema sem o comentário novo de topo).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests supabase/schema.sql README.md
git commit -m "Migração inicial versionada e verificação de RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `vercel.json` e `wrangler.toml` de produção

**Files:**
- Create: `vercel.json`
- Modify: `cloudflare-worker/wrangler.toml`

- [ ] **Step 1: `vercel.json`**

Crie `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!assets/|fonts/|logo/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://zqtcfqskdfscqtbzeglu.supabase.co; connect-src 'self' https://zqtcfqskdfscqtbzeglu.supabase.co wss://zqtcfqskdfscqtbzeglu.supabase.co; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
        },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

Notas para o executor: `'unsafe-inline'` em `style-src` é necessário porque React, Recharts e a página de bio (no iframe `srcdoc`, que herda esta CSP) usam estilo inline; `script-src` continua só `'self'`. O rewrite deixa de fora `assets/`, `fonts/` e `logo/` para arquivo inexistente dar 404 de verdade.

- [ ] **Step 2: `wrangler.toml`**

Troque `cloudflare-worker/wrangler.toml` inteiro por:

```toml
# Worker de redirect do links.dn.ia em s.dnia.ai.
#
# Publicar (com a conta Cloudflare onde está a zona dnia.ai):
#   npx wrangler login
#   npx wrangler secret put SUPABASE_URL
#   npx wrangler secret put SUPABASE_SECRET_KEY
#   npx wrangler secret put IP_HASH_SALT
#   npx wrangler secret put FALLBACK_URL
#   npx wrangler deploy
#
# Os quatro valores entram como secret, nunca aqui — este arquivo vai pro git.

name = "dnia-links-redirect"
main = "redirect.js"
compatibility_date = "2026-10-01"

# Custom Domain: a Cloudflare cria o DNS e o certificado de s.dnia.ai sozinha
# (a zona dnia.ai precisa estar na mesma conta). O Worker captura TODO caminho
# do domínio curto; o painel fica em shortner.dnia.ai, na Vercel.
routes = [
  { pattern = "s.dnia.ai", custom_domain = true }
]
```

- [ ] **Step 3: Verificar**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')" && npm run build`
Expected: `vercel.json ok` e `✓ built in`.

- [ ] **Step 4: Commit**

```bash
git add vercel.json cloudflare-worker/wrangler.toml
git commit -m "Config de produção: vercel.json (SPA + cabeçalhos de segurança) e Worker em s.dnia.ai

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Roteiro de produção para o dono

**Files:**
- Create: `docs/producao/ROTEIRO.md`
- Modify: `README.md` (link para o roteiro no topo da seção `## Setup`)

- [ ] **Step 1: Escrever o roteiro**

Crie `docs/producao/ROTEIRO.md`:

````markdown
# Roteiro de produção — links.dn.ia

Passos que só o dono das contas faz. Cada um diz onde clicar e como conferir.
Nenhum valor secreto vai neste arquivo (o repositório é público).

Projeto Supabase: `zqtcfqskdfscqtbzeglu` · Painel: `https://shortner.dnia.ai` ·
Links: `https://s.dnia.ai`

## A. Supabase Auth (antes de qualquer login)

Dashboard › **Authentication**:

1. **Sign In / Providers**
   - *Allow new users to sign up*: **desligado**.
   - *Allow anonymous sign-ins*: **desligado**.
   - Provedor **Email**: ligado; *Confirm email*: ligado.
   - *Minimum password length*: **8**. *Prevent use of leaked passwords*: ligado, se o plano permitir.
2. **URL Configuration**
   - *Site URL*: `https://shortner.dnia.ai`
   - *Redirect URLs*: `https://shortner.dnia.ai/definir-senha` e `http://localhost:8080/definir-senha`
3. **Emails › Templates**
   - **Invite user** — Assunto: `Seu acesso ao links.dn.ia`. Corpo:

     ```html
     <h2>Você foi convidado pro links.dn.ia</h2>
     <p>O encurtador de links e métricas de campanha da dn.ia.</p>
     <p><a href="{{ .ConfirmationURL }}">Criar minha senha e entrar</a></p>
     <p>O link vale uma vez só. Se ele expirar, peça um convite novo a um admin.</p>
     ```

   - **Reset password** — Assunto: `Criar uma senha nova no links.dn.ia`. Corpo:

     ```html
     <h2>Senha nova pro links.dn.ia</h2>
     <p>Alguém pediu pra trocar a senha desta conta. Se foi você:</p>
     <p><a href="{{ .ConfirmationURL }}">Criar uma senha nova</a></p>
     <p>O link vale por 1 hora. Se não foi você, ignore este e-mail.</p>
     ```

> O SMTP padrão do Supabase envia poucos e-mails por hora — dá pro time no começo.

## B. Seu usuário (primeiro admin)

1. **Authentication › Users › Add user › Create new user**: seu e-mail e uma senha forte, *Auto Confirm User* marcado.
2. Avise o Claude. Ele roda, logo em seguida, o comando que te torna admin
   (é o mesmo do README, em `### 1. Supabase`, passo 4).

## C. Chave secreta do Worker

Dashboard › **Project Settings › API Keys › Secret keys › New secret key**, nome
`cloudflare-worker`. Copie o valor (`sb_secret_…`) só para o passo E — não cole
em chat, arquivo ou commit.

## D. DNS na Cloudflare

1. Adicione a zona `dnia.ai` à conta Cloudflare (se ainda não estiver) e troque
   os nameservers no registrador do domínio, como a Cloudflare indicar.
2. **DNS › Records › Add record**: `CNAME`, nome `shortner`, alvo = o que a
   Vercel mostrar em *Settings › Domains* do projeto, **Proxy status: DNS only**
   (nuvem cinza).
3. Confira: na Vercel, `shortner.dnia.ai` aparece como *Valid Configuration*.

## E. Worker em s.dnia.ai

Num terminal, na pasta `cloudflare-worker/` do repositório:

```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://zqtcfqskdfscqtbzeglu.supabase.co
npx wrangler secret put SUPABASE_SECRET_KEY   # o sb_secret_… do passo C
npx wrangler secret put IP_HASH_SALT          # cole o valor gerado abaixo
npx wrangler secret put FALLBACK_URL          # https://dnia.ai
npx wrangler deploy
```

Para gerar o `IP_HASH_SALT` (32 caracteres aleatórios), no PowerShell:

```powershell
-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Confira: `curl -I https://s.dnia.ai/teste` → `HTTP/2 302`, `location: https://dnia.ai/`,
`cache-control: no-store`.

## F. Rate limiting

Cloudflare › zona `dnia.ai` › **Security › WAF › Rate limiting rules › Create rule**:

- Nome: `links s.dnia.ai`
- Quando: *Hostname* igual a `s.dnia.ai`
- Limite: **60 requisições por 1 minuto**, por IP
- Ação: *Block* por 1 minuto

## Voltar atrás

- Painel: Vercel › Deployments › deploy anterior › **Instant Rollback**.
- Worker: `npx wrangler rollback` na pasta `cloudflare-worker/`.
- Sem admin: rode o comando de admin do README pelo SQL Editor.
````

No `README.md`, logo abaixo da linha `## Setup`, acrescente:

```markdown
> Colocando em produção (Supabase, Vercel e Cloudflare)? Siga
> [`docs/producao/ROTEIRO.md`](docs/producao/ROTEIRO.md).
```

- [ ] **Step 2: Conferir que não há segredo**

Run: `grep -nE "sb_secret_[A-Za-z0-9]{8,}|sb_publishable_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}" docs/producao/ROTEIRO.md README.md .env.example || echo "sem segredos"`
Expected: `sem segredos`.

- [ ] **Step 3: Commit**

```bash
git add docs/producao/ROTEIRO.md README.md
git commit -m "Roteiro de produção: Auth, primeiro admin, DNS, Worker e rate limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificação da Parte 1 e PR

- [ ] **Step 1: Verificação completa**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit && npm test && npm run build && git status --short`
Expected: typecheck sem saída; suítes `utm` (13), `origins` (5), `safe-next-path` (4), `worker` (20), `bio` (15) passando; `✓ built in`; `git status` mostra só `?? docs/security-audit/`.

- [ ] **Step 2: Push e PR**

```bash
git push -u origin feat/supabase-vercel-producao
```

Abrir PR para `main` com título `links.dn.ia em produção: Supabase, Vercel e Cloudflare (parte de código)` e corpo listando as Tasks 1-8, o link para o spec e o roteiro, e a ordem de ativação (Tasks 10-16 deste plano). Corpo termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. (Sem `gh`: usar a API do GitHub com a credencial do git, como nos PRs #1 e #2.)

- [ ] **Step 3: CHECKPOINT — dono revisa e faz o merge do PR**

A Parte 2 aplica o que está no `main`. Esperar o merge antes da Task 14 (deploy de produção na Vercel). As Tasks 10-13 podem rodar antes do merge, porque usam os arquivos da branch.

---

## Parte 2 — Ativação (serviços externos)

### Task 10: Aplicar a migração e verificar o banco

- [ ] **Step 1: Conferir que o projeto ainda está vazio**

MCP `list_tables` (`project_id: zqtcfqskdfscqtbzeglu`, `schemas: ["public"]`) → `{"tables":[]}`. Se não estiver vazio, **parar** e avisar o dono.

- [ ] **Step 2: Aplicar**

MCP `apply_migration` com `project_id: zqtcfqskdfscqtbzeglu`, `name: inicial`, `query:` o conteúdo inteiro de `supabase/migrations/20261009000000_inicial.sql`.

- [ ] **Step 3: Conferir a estrutura**

MCP `list_tables` → `links`, `clicks`, `bio_pages`, `bio_page_items`, `members`, todas com RLS ligado.
MCP `execute_sql`: `select id, public from storage.buckets;` → `bio-media | true`.

- [ ] **Step 4: Rodar a verificação de RLS**

MCP `execute_sql` com o conteúdo de `supabase/tests/rls.sql`.
Expected: erro `OK: 9 verificações de RLS`. Qualquer `FALHOU N` → parar, investigar (fetch `https://supabase.com/docs/guides/monitoring-and-debugging.md` antes), corrigir com **migração nova** (`supabase/migrations/20261009000100_<nome>.sql`), aplicar e rodar de novo.

Confirmar que nada ficou: `select count(*) from auth.users where email like 'rls-%@teste.invalid';` → `0`.

- [ ] **Step 5: Advisors**

MCP `get_advisors` (`type: security`) e (`type: performance`). Para cada aviso de nível ERROR ou WARN: corrigir com migração nova seguindo o link de remediação, aplicar, rodar `rls.sql` de novo. Avisos esperados e aceitos (registrar no PR, não corrigir): `auth_leaked_password_protection` (resolvido no roteiro A, se o plano permitir).

- [ ] **Step 6: Commit (se houve migração nova)**

```bash
git add supabase/migrations
git commit -m "Ajustes apontados pelos advisors do Supabase

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 11: CHECKPOINT — dono configura o Auth e cria o próprio usuário

- [ ] **Step 1:** Pedir ao dono para executar `docs/producao/ROTEIRO.md`, seções **A** e **B.1**, e avisar com o e-mail usado.
- [ ] **Step 2:** Conferir pelo MCP: `select email, email_confirmed_at is not null as confirmado from auth.users;` → uma linha, `confirmado = true`.

---

### Task 12: Primeiro admin

- [ ] **Step 1: Inserir**

MCP `execute_sql` (trocar o e-mail pelo informado na Task 11):

```sql
insert into public.members (user_id, email, role)
select id, email, 'admin' from auth.users where email = 'EMAIL_DO_DONO'
on conflict (user_id) do update set role = 'admin';
```

- [ ] **Step 2: Conferir**

`select email, role from public.members;` → a linha do dono com `admin`.

---

### Task 13: Edge Function `team-admin`

- [ ] **Step 1: Publicar**

MCP `deploy_edge_function` com `project_id: zqtcfqskdfscqtbzeglu`, `name: team-admin`, `entrypoint_path: index.ts`, `verify_jwt: true`, `files:` `index.ts` e `origins.ts` (conteúdo de `supabase/functions/team-admin/`).

- [ ] **Step 2: Secrets**

MCP `create_edge_function_secret` (ou dashboard › Edge Functions › Secrets):
- `PANEL_URL=https://shortner.dnia.ai`
- `EXTRA_ORIGINS=http://localhost:8080`

- [ ] **Step 3: Conferir**

MCP `list_edge_functions` → `team-admin` ativa. Chamada sem login deve ser recusada:
`curl -s -o /dev/null -w "%{http_code}" -X POST https://zqtcfqskdfscqtbzeglu.supabase.co/functions/v1/team-admin` → `401`.

---

### Task 14: Painel na Vercel

- [ ] **Step 1: Escopo**

MCP Vercel `list_teams` → escolher o time da dn.ia (se houver mais de um, perguntar ao dono).

- [ ] **Step 2: Projeto ligado ao GitHub**

MCP `create_git_project` (ou `create_project`) com o repositório `EngenhariaBucarId/dnia.shortener`, nome `dnia-shortener`, framework `vite`. Se a Vercel pedir acesso à organização no GitHub, entregar o link ao dono (`requires_user_action`) e esperar.

- [ ] **Step 3: Variáveis**

Pegar a chave publicável: MCP Supabase `get_publishable_keys` → a `sb_publishable_…` não desativada.
MCP Vercel `create_project_env` para **production, preview e development**:
- `VITE_SUPABASE_URL=https://zqtcfqskdfscqtbzeglu.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>`
- `VITE_SHORT_DOMAIN=s.dnia.ai`

- [ ] **Step 4: Deploy de produção**

Com o PR já mergeado: disparar deploy do `main` (MCP `create_deployment` ou push no `main`). Acompanhar com `get_deployment` até `READY`; em erro, ler `list_deployment_events` antes de mudar qualquer coisa.

- [ ] **Step 5: Conferir na URL `.vercel.app`**

- `GET /` e `GET /time` → `200` (rewrite).
- `GET /fonts/Video-SemiBold.woff2` → `200`, `font/woff2`; `GET /fonts/nao-existe.woff2` → `404` (o rewrite não cobre `assets/`, `fonts/` e `logo/`).
- Cabeçalho `content-security-policy` presente.
- Login com o usuário do dono funciona e o cabeçalho mostra o menu **Time**.

- [ ] **Step 6: Domínio**

MCP `add_project_domain` → `shortner.dnia.ai`. Anotar o alvo de CNAME que a Vercel informar e repassar ao dono (roteiro D.2).

---

### Task 15: CHECKPOINT — dono faz DNS, Worker e rate limit

- [ ] **Step 1:** Pedir ao dono para executar `docs/producao/ROTEIRO.md`, seções **C**, **D**, **E** e **F**, com o alvo de CNAME da Task 14.
- [ ] **Step 2:** Conferir:
  - MCP Vercel `get_project_domain` / `verify_project_domain` → `shortner.dnia.ai` verificado.
  - `curl -sI https://s.dnia.ai/teste` → `302`, `location: https://dnia.ai/`, `cache-control: no-store`.
  - `curl -sI https://shortner.dnia.ai/time` → `200`.

---

### Task 16: Teste de ponta a ponta

Com o dono, no navegador, em `https://shortner.dnia.ai`:

- [ ] Login do admin funciona; "Esqueci a senha" envia e-mail em português e o link leva a `/definir-senha`.
- [ ] Tela **Time**: convite para um segundo e-mail chega; o convidado define a senha e entra como **membro** (sem menu Time).
- [ ] Criar um link no painel; abrir `https://s.dnia.ai/<slug>` → chega ao destino com os UTMs.
- [ ] O clique aparece nas métricas do link (abrir "Métricas" no cartão); um envio do link pelo WhatsApp conta como "Prévias / bots".
- [ ] Desativar o link → `https://s.dnia.ai/<slug>` cai em `https://dnia.ai`.
- [ ] Página de bio com foto, fundo e logo: `https://s.dnia.ai/@perfil` abre igual ao preview do painel.
- [ ] Console do navegador sem erro de CSP em nenhuma tela (inclusive o preview da bio e o QR code).
- [ ] Recarregar direto `https://shortner.dnia.ai/time` e abrir um link de e-mail em `/definir-senha` → app carrega, sem 404.
- [ ] Remover o membro de teste pela tela Time → ele perde o acesso na hora (tela "sem acesso" ou volta ao login).

Ao final: atualizar o PR/issue com o resultado do checklist e marcar o spec como implementado (`**Status:** implementado em <data>`), commit e push.
