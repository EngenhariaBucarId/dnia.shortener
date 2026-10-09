// Teste de fumaça da lógica pura: convenção de UTM + helpers do Worker.
// Roda com: npm test
import assert from "node:assert/strict";
import {
  slugTag,
  suggestUtms,
  buildFinalUrl,
  divergingUtmKeys,
  matchesConvention,
  randomSlug,
  validateSlug,
  validateDestinationUrl,
  safeExternalHref,
  defaultTrafficTypeFor,
  EMPTY_UTMS,
} from "../src/lib/utm.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- slugTag ---");
check("remove acento e normaliza", () => {
  // barra é separador, então "Ago/26" vira "ago-26"
  assert.equal(slugTag("Lançamento Ago/26"), "lancamento-ago-26");
  assert.equal(slugTag("lancamento-ago26"), "lancamento-ago26");
  assert.equal(slugTag("  IAficação 360°  "), "iaficacao-360");
  assert.equal(slugTag("Reunião   Estratégica"), "reuniao-estrategica");
});
check("não deixa hífen duplicado nem nas pontas", () => {
  assert.equal(slugTag("--a -- b--"), "a-b");
  assert.equal(slugTag("!!!"), "");
});

console.log("\n--- suggestUtms ---");
check("orgânico no Instagram", () => {
  const u = suggestUtms({
    campaign: "Lançamento Ago/26",
    rosto: "rodrigo",
    canal: "instagram",
    trafficType: "organico",
    formato: "reel",
  });
  assert.equal(u.utm_source, "instagram");
  assert.equal(u.utm_medium, "social");
  assert.equal(u.utm_campaign, "lancamento-ago-26");
  assert.equal(u.utm_content, "rodrigo-reel");
  assert.equal(u.utm_term, "");
});
check("mídia paga usa a plataforma de anúncio como source", () => {
  const u = suggestUtms({
    campaign: "captacao-evento",
    rosto: "marca",
    canal: "meta-ads",
    trafficType: "pago",
    formato: "",
  });
  assert.equal(u.utm_source, "meta"); // não "instagram"
  assert.equal(u.utm_medium, "cpc");
  assert.equal(u.utm_content, "marca");
});
check("canal sugere o tipo de tráfego certo", () => {
  assert.equal(defaultTrafficTypeFor("meta-ads"), "pago");
  assert.equal(defaultTrafficTypeFor("email"), "email");
  assert.equal(defaultTrafficTypeFor("bio"), "bio");
  assert.equal(defaultTrafficTypeFor("instagram"), "organico");
});

console.log("\n--- buildFinalUrl ---");
check("aplica UTM preservando query que já existia", () => {
  const url = buildFinalUrl("https://dn.ia/reuniao?plano=anual", {
    ...EMPTY_UTMS,
    utm_source: "instagram",
    utm_medium: "social",
    utm_campaign: "lancamento-ago26",
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("plano"), "anual");
  assert.equal(parsed.searchParams.get("utm_source"), "instagram");
  assert.equal(parsed.searchParams.get("utm_campaign"), "lancamento-ago26");
  // utm vazio não fica pendurado na URL
  assert.equal(parsed.searchParams.has("utm_term"), false);
});
check("sobrescreve UTM que já estava na URL de destino", () => {
  const url = buildFinalUrl("https://dn.ia/x?utm_source=antigo", {
    ...EMPTY_UTMS,
    utm_source: "linkedin",
  });
  assert.equal(new URL(url).searchParams.get("utm_source"), "linkedin");
});
check("URL inválida volta intacta em vez de explodir", () => {
  assert.equal(buildFinalUrl("não-é-url", EMPTY_UTMS), "não-é-url");
});

console.log("\n--- divergência da convenção ---");
check("detecta exatamente qual campo saiu do padrão", () => {
  const ctx = {
    campaign: "teste",
    rosto: "kaw",
    canal: "linkedin",
    trafficType: "organico",
    formato: "",
  };
  const sug = suggestUtms(ctx);
  assert.equal(matchesConvention(sug, sug), true);
  assert.deepEqual(divergingUtmKeys(sug, sug), []);

  const editado = { ...sug, utm_source: "Linkedin" }; // maiúscula = outra fonte no GA4
  assert.deepEqual(divergingUtmKeys(editado, sug), ["utm_source"]);
  assert.equal(matchesConvention(editado, sug), false);
});

console.log("\n--- slug ---");
check("slug aleatório não usa caractere ambíguo", () => {
  for (let i = 0; i < 200; i++) {
    const s = randomSlug();
    assert.equal(s.length, 7);
    assert.ok(!/[01lIO]/.test(s), `slug ambíguo gerado: ${s}`);
  }
});
check("valida tamanho, caractere e reservados", () => {
  assert.equal(validateSlug("abc"), null);
  assert.equal(validateSlug("reuniao-ago26"), null);
  assert.ok(validateSlug("ab")); // curto
  assert.ok(validateSlug("com espaço"));
  assert.ok(validateSlug("login")); // reservado
  assert.ok(validateSlug("DASHBOARD")); // reservado, case-insensitive
});
check("valida URL de destino", () => {
  assert.equal(validateDestinationUrl("https://dn.ia"), null);
  assert.ok(validateDestinationUrl("dn.ia"));
  assert.ok(validateDestinationUrl("javascript:alert(1)"));
});
check("href de destino vindo do banco só aceita http/https", () => {
  assert.equal(safeExternalHref("https://dn.ia/x?utm_source=a"), "https://dn.ia/x?utm_source=a");
  assert.equal(safeExternalHref("http://dn.ia"), "http://dn.ia/");
  assert.equal(safeExternalHref("javascript:alert(1)"), null);
  assert.equal(safeExternalHref(" JaVaScRiPt:alert(1)"), null);
  assert.equal(safeExternalHref("data:text/html;base64,PHNjcmlwdD4="), null);
  assert.equal(safeExternalHref("vbscript:x"), null);
  assert.equal(safeExternalHref("/relativo"), null);
  assert.equal(safeExternalHref(""), null);
  assert.equal(safeExternalHref(null), null);
});

console.log(`\n${passed} verificações passaram.\n`);
