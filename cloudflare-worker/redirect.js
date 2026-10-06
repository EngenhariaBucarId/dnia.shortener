/**
 * links.dn.ia — Worker de redirect.
 *
 * É a única peça que roda no servidor, e ela existe por um motivo concreto:
 * o painel é uma SPA (React no navegador) e SPA não faz redirect HTTP de
 * verdade. WhatsApp, Instagram e LinkedIn não executam JavaScript quando
 * montam a prévia de um link — eles leem só o HTML inicial. Com redirect no
 * cliente, toda prévia de link compartilhado sairia errada.
 *
 * O que ele faz em cada clique:
 *   1. resolve o slug no Supabase
 *   2. junta os parâmetros que vieram na URL curta com os UTMs já salvos
 *      (fbclid/gclid do anúncio passam adiante; parâmetro na mão sobrescreve)
 *   3. registra o clique (marcando prévia de link como bot)
 *   4. responde 302 pro destino final
 *
 * SETUP — Cloudflare Dashboard:
 *   1. Workers & Pages > Create > Create Worker > cole este arquivo.
 *   2. Settings > Variables and Secrets > adicione como SECRET:
 *        SUPABASE_URL              https://SEU-PROJETO.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY a service_role key do projeto
 *        IP_HASH_SALT              valor aleatório (openssl rand -hex 16)
 *        FALLBACK_URL              onde cair se o link não existir (ex: https://dn.ia)
 *   3. Settings > Domains & Routes > Add > seu domínio curto (seudominio.com/*).
 *
 * A service_role key só existe aqui, no servidor — nunca chega no navegador.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();

    const fallback = env.FALLBACK_URL || "https://dn.ia";

    if (!slug || slug === "favicon.ico" || slug === "robots.txt") {
      return Response.redirect(fallback, 302);
    }

    // Página de link na bio: dominio.com/@rodrigo
    // O "@" não colide com slug de link porque o banco só aceita
    // [A-Za-z0-9_-] em slug — nenhum link pode começar com @.
    if (slug.startsWith("@")) {
      return renderBioPage(slug.slice(1).toLowerCase(), env, fallback);
    }

    let link;
    try {
      link = await fetchLink(slug, env);
    } catch (err) {
      console.error("Falha ao consultar o link:", err);
      // Se o banco está fora, é melhor mandar a pessoa pro site do que
      // mostrar erro — ela clicou num link de campanha, não num app.
      return Response.redirect(fallback, 302);
    }

    if (!link || !link.is_active) {
      return Response.redirect(fallback, 302);
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return Response.redirect(fallback, 302);
    }

    const destination = mergeParams(link.final_url, url.searchParams);

    // Log ANTES do redirect (await, não "fire and forget"): o Worker pode ser
    // encerrado assim que a resposta sai, e aí o clique se perde. Custa
    // ~30-80ms, que ninguém percebe.
    await logClick({ request, url, link, destination, env }).catch((err) =>
      console.error("Falha ao registrar clique:", err)
    );

    return Response.redirect(destination, 302);
  },
};

async function fetchLink(slug, env) {
  const endpoint =
    `${env.SUPABASE_URL}/rest/v1/links` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,final_url,is_active,expires_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term` +
    `&limit=1`;

  const response = await fetch(endpoint, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondeu ${response.status}`);
  }

  const rows = await response.json();
  return rows[0] ?? null;
}

/**
 * Junta os parâmetros que chegaram na URL curta com a URL final já salva.
 * O que vem na URL curta vence — é assim que fbclid/gclid do anúncio e
 * sobrescrita manual de utm_content chegam no destino.
 *
 * Isso não abre open redirect: o destino sempre sai de `final_url`, que está
 * no banco. Parâmetro de entrada mexe na query, nunca na origem.
 */
function mergeParams(finalUrl, incomingParams) {
  let parsed;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return finalUrl;
  }

  for (const [key, value] of incomingParams.entries()) {
    if (value) parsed.searchParams.set(key, value);
  }

  return parsed.toString();
}

async function logClick({ request, url, link, destination, env }) {
  const userAgent = request.headers.get("user-agent") || "";
  const referrer = request.headers.get("referer");
  const ip = request.headers.get("cf-connecting-ip");

  const { deviceType, browser, os, isBot } = parseUserAgent(userAgent);

  // Os UTMs efetivamente usados: o que foi pro destino, não o que estava
  // salvo — se alguém sobrescreveu na URL, o relatório mostra a verdade.
  const effective = new URL(destination).searchParams;

  const payload = {
    link_id: link.id,
    referrer: referrer,
    referrer_host: hostOf(referrer),
    user_agent: userAgent || null,
    device_type: deviceType,
    browser,
    os,
    is_bot: isBot,
    // request.cf vem de graça na Cloudflare — zero chamada externa de geo-IP.
    country: request.cf?.country ?? null,
    region: request.cf?.region ?? null,
    city: request.cf?.city ?? null,
    ip_hash: ip ? await sha256(`${env.IP_HASH_SALT}:${ip}`) : null,
    utm_source: effective.get("utm_source"),
    utm_medium: effective.get("utm_medium"),
    utm_campaign: effective.get("utm_campaign"),
    utm_content: effective.get("utm_content"),
    utm_term: effective.get("utm_term"),
  };

  // url fica disponível pra debug de parâmetro de entrada, se precisar
  void url;

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/clicks`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Insert de clique falhou (${response.status}): ${await response.text()}`
    );
  }
}

/**
 * Os "bots" que mais importam aqui não são crawlers de busca: são os
 * geradores de prévia de link. Quando alguém manda a URL curta num grupo de
 * WhatsApp, o WhatsApp busca a URL uma vez por participante que vê a
 * mensagem. Sem marcar isso, um link mandado num grupo de 50 pessoas nasce
 * com 50 "cliques".
 */
const BOT_PATTERN =
  /bot|crawler|spider|crawling|facebookexternalhit|facebookcatalog|whatsapp|telegram|slackbot|linkedinbot|twitterbot|discordbot|preview|pinterest|embedly|quora|vkshare|redditbot|applebot|headless|curl|wget|python-requests|axios|lighthouse|monitor|pingdom|uptime/i;

function parseUserAgent(ua) {
  if (!ua) {
    return {
      deviceType: "unknown",
      browser: "unknown",
      os: "unknown",
      isBot: true, // sem user-agent é quase sempre robô
    };
  }

  const isBot = BOT_PATTERN.test(ua);

  const deviceType = isBot
    ? "bot"
    : /ipad|tablet|playbook|silk/i.test(ua)
      ? "tablet"
      : /mobi|iphone|android/i.test(ua)
        ? "mobile"
        : "desktop";

  // Ordem importa: Edge e Opera também se dizem Chrome; Chrome também diz Safari.
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /opr|opera/i.test(ua)
      ? "Opera"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /safari/i.test(ua)
            ? "Safari"
            : "unknown";

  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad|ios/i.test(ua)
      ? "iOS"
      : /mac os/i.test(ua)
        ? "macOS"
        : /android/i.test(ua)
          ? "Android"
          : /linux/i.test(ua)
            ? "Linux"
            : "unknown";

  return { deviceType, browser, os, isBot };
}

function hostOf(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ===========================================================================
// PÁGINA DE LINK NA BIO
// ===========================================================================
// Renderizada aqui, no servidor, e não no app do painel. Dois motivos:
// o endereço fica no domínio da marca (dominio.com/@rodrigo, não um
// subdomínio de painel), e por ser HTML de servidor a prévia funciona quando
// alguém compartilha a página — SPA não dá prévia, porque o robô de preview
// não executa JavaScript.
//
// Os botões apontam pros links curtos, então o clique na bio passa pelo mesmo
// caminho de rastreamento do resto.

async function renderBioPage(pageSlug, env, fallback) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
  };

  let page;
  let items;

  try {
    const pageRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/bio_pages` +
        `?slug=eq.${encodeURIComponent(pageSlug)}&is_active=eq.true` +
        `&select=id,slug,title,subtitle,avatar_url&limit=1`,
      { headers }
    );
    if (!pageRes.ok) throw new Error(`bio_pages ${pageRes.status}`);
    page = (await pageRes.json())[0];

    if (!page) return Response.redirect(fallback, 302);

    const itemsRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/bio_page_items` +
        `?page_id=eq.${page.id}&is_active=eq.true` +
        `&select=label,position,links(slug)&order=position.asc`,
      { headers }
    );
    if (!itemsRes.ok) throw new Error(`bio_page_items ${itemsRes.status}`);
    items = await itemsRes.json();
  } catch (err) {
    console.error("Falha ao montar a página de bio:", err);
    return Response.redirect(fallback, 302);
  }

  const html = bioPageHtml(page, items ?? []);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Cache curto na borda: a página muda pouco, mas quando o time edita
      // um botão ninguém quer esperar uma hora pra ver no ar.
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

/** Escapa tudo que vem do banco antes de entrar no HTML. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bioPageHtml(page, items) {
  const title = escapeHtml(page.title);
  const subtitle = page.subtitle ? escapeHtml(page.subtitle) : "";
  const avatar = page.avatar_url ? escapeHtml(page.avatar_url) : "";

  const buttons = items
    .map((item) => {
      const slug = item.links?.slug;
      if (!slug) return "";
      return `<a class="btn" href="/${encodeURIComponent(slug)}">${escapeHtml(
        item.label
      )}</a>`;
    })
    .join("\n      ");

  // Visual no padrão dn.ia: fundo estratificado (nunca preto chapado),
  // azul #3D61FF como único destaque, Rajdhani no título e Inter no corpo.
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${subtitle || title}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${subtitle || title}">
${avatar ? `<meta property="og:image" content="${avatar}">` : ""}
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    min-height:100vh;
    background:
      radial-gradient(ellipse 80% 60% at top left, rgba(61,97,255,.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at top right, rgba(139,92,246,.05) 0%, transparent 60%),
      #0A0A0A;
    color:#FAFAFA;
    font-family:Inter,system-ui,sans-serif;
    display:flex;justify-content:center;
    padding:56px 20px 80px;
  }
  .wrap{width:100%;max-width:420px;text-align:center}
  .avatar{
    width:88px;height:88px;border-radius:50%;object-fit:cover;
    border:1px solid rgba(61,97,255,.35);margin:0 auto 20px;display:block;
  }
  h1{font-family:Rajdhani,sans-serif;font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
  .sub{margin-top:8px;font-size:14px;line-height:1.6;color:hsl(0 0% 58%)}
  .links{margin-top:32px;display:flex;flex-direction:column;gap:12px}
  .btn{
    display:block;padding:15px 20px;border-radius:12px;
    border:1px solid rgba(255,255,255,.08);
    background:rgba(255,255,255,.022);
    color:#FAFAFA;text-decoration:none;font-size:15px;font-weight:500;
    transition:border-color .18s, transform .18s, box-shadow .18s;
  }
  .btn:hover,.btn:focus-visible{
    border-color:rgba(61,97,255,.5);
    transform:translateY(-1px);
    box-shadow:0 8px 24px -12px rgba(61,97,255,.45);
    outline:none;
  }
  .btn:focus-visible{outline:2px solid #3D61FF;outline-offset:2px}
  .empty{margin-top:32px;font-size:14px;color:hsl(0 0% 40%)}
  footer{margin-top:48px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:hsl(0 0% 30%)}
</style>
</head>
<body>
  <main class="wrap">
    ${avatar ? `<img class="avatar" src="${avatar}" alt="">` : ""}
    <h1>${title}</h1>
    ${subtitle ? `<p class="sub">${subtitle}</p>` : ""}
    <nav class="links">
      ${buttons || '<p class="empty">Em breve.</p>'}
    </nav>
    <footer>dn.ia</footer>
  </main>
</body>
</html>`;
}
