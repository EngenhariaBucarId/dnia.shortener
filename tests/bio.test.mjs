// Testes da página de link na bio renderizada pelo Worker.
import assert from "node:assert/strict";
import worker, { bioPageHtml } from "../cloudflare-worker/redirect.js";

const env = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_teste",
  IP_HASH_SALT: "salt-de-teste",
  FALLBACK_URL: "https://dn.ia",
};

const PAGE = {
  id: "page-1",
  slug: "rodrigo",
  title: "Rodrigo Nascimento",
  subtitle: "Co-CEO dn.ia",
  avatar_url: "https://cdn.dn.ia/rodrigo.jpg",
};

const ITEMS = [
  { label: "Agendar reunião estratégica", position: 1, links: { slug: "abc1234" } },
  { label: "Ver o organogram.ia", position: 2, links: { slug: "def5678" } },
];

function mockFetch({ page = PAGE, items = ITEMS, failOn = null } = {}) {
  globalThis.fetch = async (url, options = {}) => {
    const href = typeof url === "string" ? url : url.toString();

    if (failOn && href.includes(failOn)) {
      return new Response("erro", { status: 500 });
    }

    if (href.includes("/rest/v1/bio_pages")) {
      assert.equal(options.headers?.apikey, env.SUPABASE_SECRET_KEY);
      return new Response(JSON.stringify(page ? [page] : []), { status: 200 });
    }

    if (href.includes("/rest/v1/bio_page_items")) {
      return new Response(JSON.stringify(items), { status: 200 });
    }

    throw new Error(`fetch inesperado: ${href}`);
  };
}

function request(path) {
  return new Request(`https://links.dn.ia${path}`, {
    headers: new Headers({ "user-agent": "Mozilla/5.0 Chrome/129" }),
  });
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- página de link na bio ---");

await check("serve HTML com título, subtítulo e botões", async () => {
  mockFetch();
  const res = await worker.fetch(request("/@rodrigo"), env);

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);

  const html = await res.text();
  assert.ok(html.includes("Rodrigo Nascimento"));
  assert.ok(html.includes("Co-CEO dn.ia"));
  assert.ok(html.includes("Agendar reunião estratégica"));
  assert.ok(html.includes("Ver o organogram.ia"));
});

await check("botões apontam pros links curtos, não pro destino direto", async () => {
  mockFetch();
  const html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  // É isso que faz o clique na bio entrar no mesmo rastreamento.
  assert.ok(html.includes('href="/abc1234"'));
  assert.ok(html.includes('href="/def5678"'));
});

await check("traz as OG tags pra prévia funcionar quando compartilham", async () => {
  mockFetch();
  const html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('property="og:description"'));
  assert.ok(html.includes('property="og:image"'));
});

await check("escapa conteúdo do banco em vez de injetar HTML", async () => {
  mockFetch({
    page: { ...PAGE, title: '<script>alert("xss")</script>', subtitle: null },
    items: [
      { label: '<img src=x onerror=alert(1)>', position: 1, links: { slug: "abc1234" } },
    ],
  });

  const html = await (await worker.fetch(request("/@rodrigo"), env)).text();

  // O que importa não é a string sumir: é ela não virar TAG. Escapada, ela
  // aparece como texto inerte na página.
  assert.ok(!html.includes("<script>alert"), "script cru vazou pro HTML");
  assert.ok(!html.includes("<img src=x"), "img cru vazou pro HTML");
  assert.ok(html.includes("&lt;script&gt;"), "o título não foi escapado");
  assert.ok(html.includes("&lt;img src=x"), "o label não foi escapado");
});

await check("endereço @ inexistente cai no fallback", async () => {
  mockFetch({ page: null });
  const res = await worker.fetch(request("/@naoexiste"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("@ maiúsculo encontra a mesma página", async () => {
  mockFetch();
  const res = await worker.fetch(request("/@RODRIGO"), env);
  assert.equal(res.status, 200);
});

await check("página sem botão ainda renderiza", async () => {
  mockFetch({ items: [] });
  const html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("Em breve"));
});

await check("banco fora do ar cai no fallback em vez de erro", async () => {
  mockFetch({ failOn: "bio_pages" });
  const res = await worker.fetch(request("/@rodrigo"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("não quebra o redirect normal de link", async () => {
  globalThis.fetch = async (url) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/rest/v1/links")) {
      return new Response(
        JSON.stringify([
          { id: "l1", final_url: "https://dn.ia/reuniao", is_active: true, expires_at: null },
        ]),
        { status: 200 }
      );
    }
    if (href.includes("/rest/v1/clicks")) return new Response("", { status: 201 });
    throw new Error(`fetch inesperado: ${href}`);
  };

  const res = await worker.fetch(request("/abc1234"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/reuniao");
});

await check("fundo escolhido entra no HTML; fundo desconhecido cai no premium", async () => {
  mockFetch({ page: { ...PAGE, background: "dark" } });
  let html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("#04070F"), "tema dark não aplicado");

  mockFetch({ page: { ...PAGE, background: "nao-existe" } });
  html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("background:#FCFBF8"), "fallback premium não aplicado");
});

await check("fundo de imagem usa a URL enviada, e sem URL volta pro premium", async () => {
  mockFetch({
    page: { ...PAGE, background: "imagem", background_url: "https://proj.supabase.co/storage/v1/object/public/bio-media/p/bg.webp" },
  });
  let html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("bio-media/p/bg.webp"));

  mockFetch({ page: { ...PAGE, background: "imagem", background_url: null } });
  html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("background:#FCFBF8"));
});

await check("URL de imagem não fura o CSS nem o HTML", async () => {
  mockFetch({
    page: {
      ...PAGE,
      background: "imagem",
      // Tenta fechar o url('...') e o atributo style pra injetar HTML/CSS.
      background_url: `https://x.com/a.png') ;}</style><script>alert(1)</script>"`,
      avatar_url: "javascript:alert(1)",
    },
  });
  const html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(!html.includes("<script>alert"), "script vazou pelo fundo");
  assert.ok(!html.includes("javascript:"), "avatar aceitou javascript:");
  assert.ok(!/url\('[^']*'\)\s*;\}/.test(html), "o url() do fundo foi fechado antes da hora");
});

await check("imagem embutida (data:) só vale no preview, nunca na página pública", async () => {
  const dataImg = "data:image/png;base64,iVBORw0KGgo=";
  const page = { ...PAGE, avatar_url: dataImg, background: "imagem", background_url: dataImg };

  mockFetch({ page });
  const publicHtml = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(!publicHtml.includes("data:image"), "página pública aceitou data:");

  const previewHtml = bioPageHtml(page, ITEMS, { preview: true });
  assert.ok(previewHtml.includes("data:image/png"), "preview recusou data:image");
  assert.ok(!bioPageHtml({ ...page, avatar_url: "data:text/html;base64,PHNjcmlwdD4=" }, [], { preview: true })
    .includes("data:text"), "preview aceitou data: que não é imagem");
});

await check("logo da empresa substitui o texto dn.ia no rodapé", async () => {
  mockFetch();
  let html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes("<footer>dn.ia</footer>"), "sem logo deveria mostrar o texto");

  mockFetch({ page: { ...PAGE, logo_url: "https://proj.supabase.co/storage/v1/object/public/bio-media/p/logo.webp" } });
  html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(html.includes('class="brand" src="https://proj.supabase.co/storage/v1/object/public/bio-media/p/logo.webp"'));
  assert.ok(!html.includes("<footer>dn.ia</footer>"));

  mockFetch({ page: { ...PAGE, logo_url: 'https://x.com/l.png" onerror="alert(1)' } });
  html = await (await worker.fetch(request("/@rodrigo"), env)).text();
  assert.ok(!html.includes('onerror="alert'), "logo furou o atributo src");
});

await check("página arquivada não é servida: a consulta só pede páginas ativas", async () => {
  let pageQuery = "";
  globalThis.fetch = async (url) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/rest/v1/bio_pages")) {
      pageQuery = href;
      // o banco filtra is_active=eq.true; uma arquivada não volta na consulta
      return new Response("[]", { status: 200 });
    }
    throw new Error(`fetch inesperado: ${href}`);
  };
  const res = await worker.fetch(request("/@rodrigo"), env);
  assert.match(pageQuery, /is_active=eq\.true/);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("modo preview do painel não gera link clicável", async () => {
  const html = bioPageHtml(PAGE, ITEMS, { preview: true });
  assert.ok(!html.includes('href="/abc1234"'), "preview com href rastreado");
  assert.ok(html.includes("Agendar reunião estratégica"));
});

console.log(`\n${passed} verificações passaram.\n`);
