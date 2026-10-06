import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copie .env.example para .env e preencha."
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Domínio curto onde o Worker de redirect está publicado. */
export const SHORT_DOMAIN: string =
  import.meta.env.VITE_SHORT_DOMAIN || "seudominio.com";

export function shortUrl(slug: string): string {
  return `https://${SHORT_DOMAIN}/${slug}`;
}
