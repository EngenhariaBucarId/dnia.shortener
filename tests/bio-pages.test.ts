// Abas de páginas de bio (ativas × arquivadas) e limpeza de imagens ao apagar.
import assert from "node:assert/strict";
import { bioPageImageUrls, splitBioPages } from "../src/lib/bio-pages.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- páginas de bio ---");

const page = (slug: string, is_active: boolean) => ({
  id: slug,
  slug,
  is_active,
  avatar_url: null as string | null,
  background_url: null as string | null,
  logo_url: null as string | null,
});

check("separa ativas e arquivadas, mantendo a ordem", () => {
  const { active, archived } = splitBioPages([page("a", true), page("b", false), page("c", true)]);
  assert.deepEqual(active.map((p) => p.slug), ["a", "c"]);
  assert.deepEqual(archived.map((p) => p.slug), ["b"]);
});

check("sem páginas, as duas listas vêm vazias", () => {
  const { active, archived } = splitBioPages([]);
  assert.equal(active.length + archived.length, 0);
});

check("ao apagar, junta foto, fundo e logo — e ignora o que não foi enviado", () => {
  const p = {
    ...page("x", true),
    avatar_url: "https://proj.supabase.co/storage/v1/object/public/bio-media/x/avatar.webp",
    logo_url: "https://proj.supabase.co/storage/v1/object/public/bio-media/x/logo.webp",
  };
  assert.deepEqual(bioPageImageUrls(p), [p.avatar_url, p.logo_url]);
  assert.deepEqual(bioPageImageUrls(page("y", true)), []);
});

console.log(`\n${passed} verificações passaram.\n`);
