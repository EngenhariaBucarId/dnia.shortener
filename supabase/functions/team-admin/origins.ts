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
