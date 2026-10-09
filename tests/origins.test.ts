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
