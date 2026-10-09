// Teste de integração do Worker: mocka fetch e request, exercita o handler
// e confere o redirect e o payload de clique que vai pro Supabase.
import assert from "node:assert/strict";
import worker from "../cloudflare-worker/redirect.js";

const env = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  IP_HASH_SALT: "salt-de-teste",
  FALLBACK_URL: "https://dn.ia",
};

const LINK = {
  id: "11111111-1111-1111-1111-111111111111",
  final_url:
    "https://dn.ia/reuniao?utm_source=instagram&utm_medium=social&utm_campaign=lancamento-ago26&utm_content=rodrigo-reel",
  is_active: true,
  expires_at: null,
};

/** Instala um fetch falso: responde o GET do link e captura o POST do clique. */
function mockFetch({ link = LINK } = {}) {
  const captured = { inserts: [] };

  globalThis.fetch = async (url, options = {}) => {
    const href = typeof url === "string" ? url : url.toString();

    if (href.includes("/rest/v1/links")) {
      // confere que a service_role key está sendo usada (e não a anon)
      assert.equal(options.headers?.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
      return new Response(JSON.stringify(link ? [link] : []), { status: 200 });
    }

    if (href.includes("/rest/v1/clicks")) {
      assert.equal(options.method, "POST");
      captured.inserts.push(JSON.parse(options.body));
      return new Response("", { status: 201 });
    }

    throw new Error(`fetch inesperado: ${href}`);
  };

  return captured;
}

function makeRequest(path, { userAgent = CHROME_UA, referer = null, cf = {} } = {}) {
  const headers = new Headers({
    "user-agent": userAgent,
    "cf-connecting-ip": "203.0.113.42",
  });
  if (referer) headers.set("referer", referer);

  const request = new Request(`https://links.dn.ia${path}`, { headers });
  // request.cf não existe fora da Cloudflare — injetamos como a plataforma faz
  Object.defineProperty(request, "cf", { value: cf, configurable: true });
  return request;
}

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const WHATSAPP_UA = "WhatsApp/2.23.20.0 A";
const FB_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- redirect ---");

await check("302 pro destino final com os UTMs salvos", async () => {
  mockFetch();
  const res = await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), LINK.final_url);
});

await check("link inexistente cai no fallback, não em erro", async () => {
  mockFetch({ link: null });
  const res = await worker.fetch(makeRequest("/nao-existe"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("link inativo cai no fallback", async () => {
  mockFetch({ link: { ...LINK, is_active: false } });
  const res = await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("link expirado cai no fallback", async () => {
  mockFetch({ link: { ...LINK, expires_at: "2020-01-01T00:00:00Z" } });
  const res = await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

await check("Supabase fora do ar ainda redireciona pro site", async () => {
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  const res = await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
});

console.log("\n--- merge de parâmetros ---");

await check("fbclid do anúncio passa adiante pro destino", async () => {
  mockFetch();
  const res = await worker.fetch(makeRequest("/x7k2p?fbclid=ABC123"), env);
  const dest = new URL(res.headers.get("location"));
  assert.equal(dest.searchParams.get("fbclid"), "ABC123");
  // e os UTMs salvos continuam lá
  assert.equal(dest.searchParams.get("utm_campaign"), "lancamento-ago26");
});

await check("parâmetro na URL curta sobrescreve o UTM salvo", async () => {
  const captured = mockFetch();
  const res = await worker.fetch(
    makeRequest("/x7k2p?utm_content=rodrigo-story"),
    env
  );
  const dest = new URL(res.headers.get("location"));
  assert.equal(dest.searchParams.get("utm_content"), "rodrigo-story");
  // e o clique registra o UTM EFETIVO, não o salvo
  assert.equal(captured.inserts[0].utm_content, "rodrigo-story");
});

console.log("\n--- registro do clique ---");

await check("grava device, browser, os, geo e hash de IP", async () => {
  const captured = mockFetch();
  await worker.fetch(
    makeRequest("/x7k2p", {
      userAgent: IPHONE_UA,
      referer: "https://www.instagram.com/p/abc/",
      cf: { country: "BR", region: "Sao Paulo", city: "São Paulo" },
    }),
    env
  );

  const click = captured.inserts[0];
  assert.equal(click.link_id, LINK.id);
  assert.equal(click.device_type, "mobile");
  assert.equal(click.browser, "Safari");
  assert.equal(click.os, "iOS");
  assert.equal(click.country, "BR");
  assert.equal(click.city, "São Paulo");
  assert.equal(click.referrer_host, "www.instagram.com");
  assert.equal(click.is_bot, false);
  // IP nunca vai em texto puro — só o hash (LGPD)
  assert.match(click.ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(click).includes("203.0.113.42"));
});

await check("sem IP_HASH_SALT (ou vazio/curto) grava o clique sem ip_hash e mantém o 302", async () => {
  const originalError = console.error;
  console.error = () => {}; // o aviso de salt ausente é esperado aqui
  try {
    for (const salt of [undefined, "", "   ", "curto"]) {
      const captured = mockFetch();
      const res = await worker.fetch(makeRequest("/x7k2p"), { ...env, IP_HASH_SALT: salt });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), LINK.final_url);
      assert.equal(captured.inserts.length, 1, "o clique ainda deve ser gravado");
      assert.equal(captured.inserts[0].ip_hash, null, `salt ${JSON.stringify(salt)} gerou hash`);
    }
  } finally {
    console.error = originalError;
  }
});

await check("com salt válido o ip_hash é o SHA-256 de salt + IP, nunca de 'undefined'", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p"), env);
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(`${env.IP_HASH_SALT}:203.0.113.42`).digest("hex");
  const undefinedHash = createHash("sha256").update("undefined:203.0.113.42").digest("hex");
  assert.equal(captured.inserts[0].ip_hash, expected);
  assert.notEqual(captured.inserts[0].ip_hash, undefinedHash);
});

await check("Chrome no desktop é classificado certo", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p", { userAgent: CHROME_UA }), env);
  const click = captured.inserts[0];
  assert.equal(click.device_type, "desktop");
  assert.equal(click.browser, "Chrome");
  assert.equal(click.os, "macOS");
});

await check("prévia do WhatsApp é marcada como bot", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p", { userAgent: WHATSAPP_UA }), env);
  assert.equal(captured.inserts[0].is_bot, true);
  assert.equal(captured.inserts[0].device_type, "bot");
});

await check("prévia do Facebook/Instagram é marcada como bot", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p", { userAgent: FB_UA }), env);
  assert.equal(captured.inserts[0].is_bot, true);
});

await check("sem user-agent conta como bot", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p", { userAgent: "" }), env);
  assert.equal(captured.inserts[0].is_bot, true);
});

await check("clique sem referrer registra referrer_host nulo", async () => {
  const captured = mockFetch();
  await worker.fetch(makeRequest("/x7k2p"), env);
  assert.equal(captured.inserts[0].referrer_host, null);
});

await check("raiz do domínio vai pro fallback sem registrar clique", async () => {
  const captured = mockFetch();
  const res = await worker.fetch(makeRequest("/"), env);
  assert.equal(res.headers.get("location"), "https://dn.ia/");
  assert.equal(captured.inserts.length, 0);
});

console.log(`\n${passed} verificações passaram.\n`);
