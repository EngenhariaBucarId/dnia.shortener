/**
 * Modo demo: substitui o cliente Supabase por um banco em memória com dados
 * de exemplo, pra navegar e desenhar as telas sem projeto Supabase.
 *
 * Só entra no bundle com `npm run dev:demo` (vite --mode demo): o
 * vite.config.ts troca o alias de "@/lib/supabase" por este arquivo nesse
 * modo. O build de produção nunca importa nada daqui.
 *
 * Imita só o pedaço da API que o painel usa: from().select/insert/update/
 * delete + eq/order/limit/single, e auth.getSession/onAuthStateChange/
 * signInWithOtp/signOut. As views v_* são calculadas na hora a partir das
 * tabelas, com a mesma regra do schema (bots fora da contagem).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

export const SHORT_DOMAIN: string =
  import.meta.env.VITE_SHORT_DOMAIN || "dnia.link";

export function shortUrl(slug: string): string {
  return `https://${SHORT_DOMAIN}/${slug}`;
}

// ---------- dados de exemplo (determinísticos) ----------

let seed = 42;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

const DAY = 86_400_000;
const now = Date.now();
let nextId = 1;
const uuid = () => `demo-${nextId++}`;

const LINK_SEEDS = [
  ["reuniao-out26", "Reel organogram.ia — out/26", "lancamento-out26", "rodrigo", "instagram", "organico", "social", "rodrigo-reel", 640],
  ["k7mq2x", "Carrossel 4 estágios", "lancamento-out26", "normandia", "instagram", "organico", "social", "normandia-carrossel", 410],
  ["salto-ia", "Anúncio Salto IA — vídeo 1", "salto-ia-nov26", "marca", "meta-ads", "pago", "cpc", "marca-video", 980],
  ["p4hv9t", "Post LinkedIn — implementação", "autoridade-q4", "rodrigo", "linkedin", "organico", "social", "rodrigo-post", 230],
  ["w8rn3c", "Newsletter #42", "newsletter", "marca", "email", "email", "email", "marca", 155],
  ["evento-sp", "QR palco — evento SP", "salto-ia-nov26", "carlos", "evento", "evento", "evento", "carlos", 88],
  ["t2fz6b", "Short YouTube — agentes", "autoridade-q4", "kaw", "youtube", "organico", "social", "kaw-short", 120],
  ["g5xd8k", "Google Ads — diagnóstico", "diagnostico-q4", "marca", "google-ads", "pago", "cpc", "marca", 300],
  ["m3jw7q", "Grupo WhatsApp founders", "lancamento-out26", "rodrigo", "whatsapp", "organico", "social", "rodrigo", 45],
  ["velho-set26", "Live setembro (encerrada)", "live-set26", "normandia", "instagram", "organico", "social", "normandia-live", 60],
] as const;

const SOURCE_BY_CANAL: Record<string, string> = {
  instagram: "instagram", linkedin: "linkedin", youtube: "youtube",
  whatsapp: "whatsapp", email: "email", "meta-ads": "meta",
  "google-ads": "google", evento: "evento", bio: "instagram",
};

const db: Record<string, Row[]> = {
  links: [],
  clicks: [],
  bio_pages: [],
  bio_page_items: [],
};

LINK_SEEDS.forEach(([slug, title, campaign, rosto, canal, traffic, medium, content], i) => {
  const createdAt = new Date(now - (28 - i * 2) * DAY - i * 3_600_000).toISOString();
  const utms = {
    utm_source: SOURCE_BY_CANAL[canal],
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
    utm_term: null,
  };
  const destination = "https://dn.ia/reuniao-estrategica";
  const query = new URLSearchParams(
    Object.entries(utms).filter(([, v]) => v) as [string, string][]
  ).toString();
  db.links.push({
    id: uuid(),
    slug,
    destination_url: destination,
    final_url: `${destination}?${query}`,
    title,
    campaign,
    rosto,
    canal,
    traffic_type: traffic,
    ...utms,
    created_by: "demo-user",
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: null,
    is_active: slug !== "velho-set26",
  });
});

const DEVICES = ["mobile", "mobile", "mobile", "desktop", "desktop", "tablet"];
const COUNTRIES = ["BR", "BR", "BR", "BR", "BR", "PT", "US"];
const CITIES = ["São Paulo", "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre"];
const REFERRERS = ["instagram.com", "l.instagram.com", "linkedin.com", null, null, "t.co", "youtube.com"];
const BROWSERS = ["Chrome", "Safari", "Safari", "Instagram", "Edge"];

for (const link of db.links) {
  const volume = (LINK_SEEDS.find((s) => s[0] === link.slug)?.[8] ?? 50) as number;
  const created = Date.parse(link.created_at);
  const span = Math.max(1, (now - created) / DAY);
  for (let n = 0; n < volume; n++) {
    // Mais clique nos primeiros dias depois da publicação, como na vida real.
    const offset = Math.pow(rand(), 2.2) * span * DAY;
    const isBot = rand() < 0.12;
    db.clicks.push({
      id: nextId++,
      link_id: link.id,
      clicked_at: new Date(Math.min(now, created + offset)).toISOString(),
      referrer: null,
      referrer_host: link.canal === "email" ? null : pick(REFERRERS),
      user_agent: null,
      device_type: pick(DEVICES),
      browser: pick(BROWSERS),
      os: null,
      country: pick(COUNTRIES),
      region: null,
      city: pick(CITIES),
      ip_hash: `ip-${Math.floor(rand() * volume * 0.7)}-${link.slug}`,
      is_bot: isBot,
      utm_source: link.utm_source,
      utm_medium: link.utm_medium,
      utm_campaign: link.utm_campaign,
      utm_content: link.utm_content,
      utm_term: null,
    });
  }
}

const bioCreated = new Date(now - 20 * DAY).toISOString();
const rodrigoPage = {
  id: uuid(), slug: "rodrigo", title: "Rodrigo", subtitle: "Fundador da dn.ia · humanos + agentes no mesmo time",
  avatar_url: null, background: "premium", background_url: null, logo_url: null, rosto: "rodrigo", is_active: true, created_by: "demo-user",
  created_at: bioCreated, updated_at: bioCreated,
};
const normandiaPage = {
  id: uuid(), slug: "normandia", title: "Normandia", subtitle: null,
  avatar_url: null, background: "azul", background_url: null, logo_url: null, rosto: "normandia", is_active: true, created_by: "demo-user",
  created_at: bioCreated, updated_at: bioCreated,
};
db.bio_pages.push(rodrigoPage, normandiaPage);

[
  ["Agende sua reunião estratégica", "reuniao-out26"],
  ["Salto IA — garanta sua vaga", "salto-ia"],
  ["Newsletter", "w8rn3c"],
].forEach(([label, slug], position) => {
  const link = db.links.find((l) => l.slug === slug)!;
  db.bio_page_items.push({
    id: uuid(), page_id: rodrigoPage.id, link_id: link.id, label, position,
    is_active: true, created_at: bioCreated,
  });
});

// ---------- views (mesma regra do schema: bot não conta) ----------

function aggregate(clicks: Row[]) {
  const human = clicks.filter((c) => !c.is_bot);
  const last = human.reduce<string | null>(
    (acc, c) => (!acc || c.clicked_at > acc ? c.clicked_at : acc),
    null
  );
  return {
    clicks: human.length,
    unique_clicks: new Set(human.map((c) => c.ip_hash)).size,
    bot_hits: clicks.length - human.length,
    last_click_at: last,
  };
}

function groupBy(field: string, labelKey: string) {
  const groups = new Map<string | null, Row[]>();
  for (const link of db.links) {
    const key = link[field] ?? null;
    groups.set(key, [...(groups.get(key) ?? []), link]);
  }
  return [...groups.entries()].map(([key, links]) => {
    const ids = new Set(links.map((l) => l.id));
    return {
      [labelKey]: key,
      links: links.length,
      ...aggregate(db.clicks.filter((c) => ids.has(c.link_id))),
    };
  });
}

const views: Record<string, () => Row[]> = {
  v_link_stats: () =>
    db.links.map((l) => ({
      link_id: l.id, slug: l.slug, title: l.title, campaign: l.campaign,
      rosto: l.rosto, canal: l.canal, created_at: l.created_at,
      ...aggregate(db.clicks.filter((c) => c.link_id === l.id)),
    })),
  v_campaign_stats: () => groupBy("campaign", "campaign"),
  v_rosto_stats: () => groupBy("rosto", "label"),
  v_canal_stats: () => groupBy("canal", "label"),
  v_daily_clicks: () => {
    const map = new Map<string, Row>();
    for (const c of db.clicks) {
      if (c.is_bot) continue;
      const day = c.clicked_at.slice(0, 10);
      const key = `${c.link_id}|${day}`;
      const row = map.get(key) ?? { link_id: c.link_id, day, clicks: 0 };
      row.clicks++;
      map.set(key, row);
    }
    return [...map.values()];
  },
  v_bio_item_stats: () =>
    db.bio_page_items.map((item) => {
      const link = db.links.find((l) => l.id === item.link_id);
      const stats = aggregate(db.clicks.filter((c) => c.link_id === item.link_id));
      return {
        item_id: item.id, page_id: item.page_id, label: item.label,
        position: item.position, slug: link?.slug ?? "",
        clicks: stats.clicks, unique_clicks: stats.unique_clicks,
      };
    }),
};

// ---------- query builder ----------

type Op = "select" | "insert" | "update" | "delete";

class Query implements PromiseLike<{ data: any; error: any }> {
  private op: Op = "select";
  private payload: Row | Row[] | null = null;
  private filters: [string, unknown][] = [];
  private orders: [string, boolean][] = [];
  private max: number | null = null;
  private wantSingle = false;

  constructor(private table: string) {}

  select() {
    // depois de insert/update, .select() só pede o retorno das linhas
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push([column, opts?.ascending ?? true]);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  private matches(row: Row) {
    return this.filters.every(([k, v]) => row[k] === v);
  }

  private run(): { data: any; error: any } {
    const table = db[this.table];
    const stamp = new Date().toISOString();

    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(
        (r) => ({ id: uuid(), created_at: stamp, updated_at: stamp, is_active: true, created_by: "demo-user", expires_at: null, ...(this.table === "bio_pages" ? { background: "premium", background_url: null, logo_url: null } : {}), ...r })
      );
      if (this.table === "links" && rows.some((r) => table.some((t) => t.slug === r.slug))) {
        return { data: null, error: { code: "23505", message: "slug duplicado" } };
      }
      if (this.table === "bio_pages" && rows.some((r) => table.some((t) => t.slug === r.slug))) {
        return { data: null, error: { code: "23505", message: "slug duplicado" } };
      }
      table.push(...rows);
      return { data: this.wantSingle ? rows[0] : rows, error: null };
    }

    if (this.op === "update") {
      const hit = table.filter((r) => this.matches(r));
      hit.forEach((r) => Object.assign(r, this.payload, { updated_at: stamp }));
      return { data: this.wantSingle ? hit[0] ?? null : hit, error: null };
    }

    if (this.op === "delete") {
      db[this.table] = table.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    const source = views[this.table] ? views[this.table]() : table;
    let rows = source.filter((r) => this.matches(r)).map((r) => ({ ...r }));
    for (const [col, asc] of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        if (a[col] === b[col]) return 0;
        const cmp = a[col] > b[col] ? 1 : -1;
        return asc ? cmp : -cmp;
      });
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return { data: this.wantSingle ? rows[0] ?? null : rows, error: null };
  }

  then<A = { data: any; error: any }, B = never>(
    onFulfilled?: ((value: { data: any; error: any }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    // Latência curta de propósito, pra os skeletons aparecerem.
    return new Promise<{ data: any; error: any }>((resolve) =>
      setTimeout(() => resolve(this.run()), 250)
    ).then(onFulfilled, onRejected);
  }
}

// ---------- auth ----------

const demoUser = { id: "demo-user", email: "demo@dnia.com.br" };
let session: Row | null = { user: demoUser, access_token: "demo" };
const listeners = new Set<(event: string, s: Row | null) => void>();

const auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (cb: (event: string, s: Row | null) => void) => {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  signInWithOtp: async () => {
    // No demo o "magic link" entra direto, depois de um respiro.
    setTimeout(() => {
      session = { user: demoUser, access_token: "demo" };
      listeners.forEach((cb) => cb("SIGNED_IN", session));
    }, 1500);
    return { data: {}, error: null };
  },
  signOut: async () => {
    session = null;
    listeners.forEach((cb) => cb("SIGNED_OUT", null));
    return { error: null };
  },
};

// ---------- storage ----------
// Sem Storage de verdade: o arquivo vira data URL e a "URL pública" é ela
// mesma. O Worker só aceita data:image no modo preview, então isso funciona
// no preview do painel e nunca vazaria pra página pública.

const files = new Map<string, string>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const storage = {
  from: (_bucket: string) => ({
    upload: async (path: string, blob: Blob) => {
      files.set(path, await blobToDataUrl(blob));
      await new Promise((r) => setTimeout(r, 400));
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: files.get(path) ?? "" } }),
    remove: async (paths: string[]) => {
      paths.forEach((p) => files.delete(p));
      return { data: null, error: null };
    },
  }),
};

export const supabase: any = {
  from: (table: string) => new Query(table),
  auth,
  storage,
};
