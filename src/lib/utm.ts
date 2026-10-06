/**
 * Convenção de UTM da dn.ia.
 *
 * O problema que isso resolve: UTM digitado à mão fragmenta o relatório.
 * "instagram", "Instagram", "ig" e "insta" viram quatro fontes diferentes no
 * GA4 e o número de cada campanha fica errado — e você só descobre no fim do
 * mês, quando não dá mais pra consertar o histórico.
 *
 * Aqui a regra é: o sistema SUGERE os UTMs a partir de campanha/rosto/canal,
 * e os campos ficam editáveis. Quem edita vê um aviso de que saiu da
 * convenção, então divergir é uma escolha consciente, não um acidente de
 * digitação.
 *
 * A convenção:
 *   utm_source   = o canal normalizado        (instagram, linkedin, meta, google)
 *   utm_medium   = o tipo de tráfego          (social, cpc, email, evento, bio)
 *   utm_campaign = a campanha em kebab-case   (lancamento-ago26)
 *   utm_content  = rosto + formato            (rodrigo-reel, normandia-carrossel)
 *   utm_term     = livre, normalmente vazio   (reservado pra palavra-chave paga)
 */

export type Utms = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
};

export const EMPTY_UTMS: Utms = {
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
};

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const satisfies readonly (keyof Utms)[];

/** Rostos da dn.ia — vira o começo do utm_content. */
export const ROSTOS = [
  { value: "rodrigo", label: "Rodrigo" },
  { value: "normandia", label: "Normandia" },
  { value: "carlos", label: "Carlos" },
  { value: "kaw", label: "Kaw" },
  { value: "marca", label: "Marca (dn.ia)" },
] as const;

/**
 * Canais. `source` é o que entra no utm_source — repare que mídia paga usa o
 * nome da plataforma de anúncio (meta, google), não da rede onde o anúncio
 * aparece, porque é assim que o GA4 e as plataformas reconciliam.
 */
export const CANAIS = [
  { value: "instagram", label: "Instagram", source: "instagram", trafficType: "organico" },
  { value: "linkedin", label: "LinkedIn", source: "linkedin", trafficType: "organico" },
  { value: "youtube", label: "YouTube", source: "youtube", trafficType: "organico" },
  { value: "whatsapp", label: "WhatsApp", source: "whatsapp", trafficType: "organico" },
  { value: "bio", label: "Link na bio", source: "instagram", trafficType: "bio" },
  { value: "email", label: "E-mail", source: "email", trafficType: "email" },
  { value: "meta-ads", label: "Meta Ads", source: "meta", trafficType: "pago" },
  { value: "google-ads", label: "Google Ads", source: "google", trafficType: "pago" },
  { value: "linkedin-ads", label: "LinkedIn Ads", source: "linkedin", trafficType: "pago" },
  { value: "evento", label: "Evento", source: "evento", trafficType: "evento" },
] as const;

/** Tipo de tráfego → utm_medium. */
export const TRAFFIC_TYPES = [
  { value: "organico", label: "Orgânico", medium: "social" },
  { value: "pago", label: "Mídia paga", medium: "cpc" },
  { value: "email", label: "E-mail", medium: "email" },
  { value: "evento", label: "Evento", medium: "evento" },
  { value: "bio", label: "Link na bio", medium: "bio" },
] as const;

/** Formatos de peça — entra no fim do utm_content. */
export const FORMATOS = [
  { value: "", label: "— sem formato —" },
  { value: "reel", label: "Reel" },
  { value: "carrossel", label: "Carrossel" },
  { value: "story", label: "Story" },
  { value: "post", label: "Post estático" },
  { value: "video", label: "Vídeo longo" },
  { value: "newsletter", label: "Newsletter" },
  { value: "convite", label: "Convite" },
] as const;

export type RostoValue = (typeof ROSTOS)[number]["value"];
export type CanalValue = (typeof CANAIS)[number]["value"];
export type TrafficTypeValue = (typeof TRAFFIC_TYPES)[number]["value"];

/**
 * Normaliza um texto livre em tag de UTM: minúsculo, sem acento, sem
 * caractere especial, espaços viram hífen. "Lançamento Ago/26" → "lancamento-ago26"
 */
export function slugTag(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function canalByValue(value: string) {
  return CANAIS.find((c) => c.value === value);
}

export function trafficTypeByValue(value: string) {
  return TRAFFIC_TYPES.find((t) => t.value === value);
}

/** O tipo de tráfego que o canal escolhido sugere (ex: Meta Ads → pago). */
export function defaultTrafficTypeFor(canal: string): TrafficTypeValue {
  return (canalByValue(canal)?.trafficType ?? "organico") as TrafficTypeValue;
}

export type UtmContext = {
  campaign: string;
  rosto: string;
  canal: string;
  trafficType: string;
  formato: string;
};

/** Monta os UTMs na convenção a partir dos campos de contexto do formulário. */
export function suggestUtms(ctx: UtmContext): Utms {
  const canal = canalByValue(ctx.canal);
  const traffic = trafficTypeByValue(ctx.trafficType);

  return {
    utm_source: canal?.source ?? slugTag(ctx.canal),
    utm_medium: traffic?.medium ?? slugTag(ctx.trafficType),
    utm_campaign: slugTag(ctx.campaign),
    utm_content: [ctx.rosto, ctx.formato]
      .filter(Boolean)
      .map((part) => slugTag(part))
      .filter(Boolean)
      .join("-"),
    utm_term: "",
  };
}

/**
 * Aplica os UTMs na URL de destino. Parâmetros que já existiam na URL são
 * preservados; os utm_* preenchidos sobrescrevem. UTM vazio é removido em vez
 * de virar `utm_term=` pendurado na URL.
 */
export function buildFinalUrl(destinationUrl: string, utms: Utms): string {
  let parsed: URL;
  try {
    parsed = new URL(destinationUrl);
  } catch {
    return destinationUrl; // URL inválida: o formulário barra antes de salvar
  }

  for (const key of UTM_KEYS) {
    const value = utms[key]?.trim();
    if (value) parsed.searchParams.set(key, value);
    else parsed.searchParams.delete(key);
  }

  return parsed.toString();
}

/** True quando os UTMs atuais são exatamente o que a convenção sugeriria. */
export function matchesConvention(current: Utms, suggested: Utms): boolean {
  return UTM_KEYS.every(
    (key) => (current[key] ?? "").trim() === (suggested[key] ?? "").trim()
  );
}

/** Quais campos divergem da convenção — usado pro aviso na interface. */
export function divergingUtmKeys(current: Utms, suggested: Utms): string[] {
  return UTM_KEYS.filter(
    (key) => (current[key] ?? "").trim() !== (suggested[key] ?? "").trim()
  );
}

const SLUG_ALPHABET =
  "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // sem 0/O/1/l/I

/** Slug aleatório legível — sem caracteres que se confundem ao ditar ou digitar. */
export function randomSlug(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return out;
}

/** Rotas do próprio painel não podem virar slug. */
export const RESERVED_SLUGS = new Set([
  "api",
  "login",
  "dashboard",
  "campanhas",
  "favicon.ico",
  "robots.txt",
]);

export function validateSlug(slug: string): string | null {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(slug)) {
    return "Use 3 a 40 caracteres: letras, números, hífen ou underscore.";
  }
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return `"${slug}" é reservado pelo sistema. Escolha outro.`;
  }
  return null;
}

export function validateDestinationUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "URL inválida — inclua https:// no começo.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "A URL precisa começar com https://";
  }
  return null;
}
