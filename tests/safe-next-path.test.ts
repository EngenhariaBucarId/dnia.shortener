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
