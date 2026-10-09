/**
 * Tipos do que o painel importa do Worker. O Worker é JS puro (colado inteiro
 * no painel da Cloudflare), então os tipos ficam aqui ao lado.
 */

export type BioBackgroundKey = "premium" | "warm" | "dark" | "azul" | "imagem";

export type BioBackground = {
  label: string;
  /** Cor da amostra no seletor; null = vem da imagem enviada. */
  swatch: string | null;
  css: string;
  text: string;
  muted: string;
  line: string;
  btnBg: string;
  btnText: string;
  btnShadow: string;
};

export const BIO_BACKGROUNDS: Record<BioBackgroundKey, BioBackground>;

export function bioPageHtml(
  page: {
    title: string;
    subtitle?: string | null;
    avatar_url?: string | null;
    background?: string | null;
    background_url?: string | null;
    logo_url?: string | null;
  },
  items: { label: string; links?: { slug: string } | null }[],
  options?: { preview?: boolean }
): string;

export function supabaseHeaders(
  env: Record<string, string | undefined>,
  extra?: Record<string, string>
): Record<string, string>;

declare const worker: {
  fetch(request: Request, env: Record<string, string>): Promise<Response>;
};
export default worker;
