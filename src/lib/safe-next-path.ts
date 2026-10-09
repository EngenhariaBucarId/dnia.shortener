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
