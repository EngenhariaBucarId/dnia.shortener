-- ============================================================================
-- links.dn.ia — schema completo
-- Rode inteiro no SQL Editor do Supabase (Project > SQL Editor > New query).
-- É idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- LINKS
-- ---------------------------------------------------------------------------
-- destination_url = a URL limpa, como a pessoa digitou
-- final_url       = destino + UTMs aplicados (é pra onde o Worker redireciona)
-- Guardar os dois permite reconstruir/alterar UTM depois sem perder o original.
-- campaign/rosto/canal existem como COLUNA (não só dentro da UTM) porque o
-- relatório agrupa por eles — fazer isso parseando string de UTM seria lento
-- e frágil.
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  destination_url text not null,
  final_url text not null,
  title text,
  campaign text,
  rosto text,
  canal text,
  traffic_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  constraint links_slug_format check (slug ~ '^[A-Za-z0-9_-]{3,40}$')
);

create index if not exists idx_links_slug on public.links (slug);
create index if not exists idx_links_campaign on public.links (campaign);
create index if not exists idx_links_created_at on public.links (created_at desc);

-- ---------------------------------------------------------------------------
-- CLICKS — uma linha por acesso
-- ---------------------------------------------------------------------------
-- is_bot separa clique humano de prévia de link. WhatsApp, Instagram,
-- LinkedIn e Slack buscam a URL pra montar o card de preview SEM ninguém ter
-- clicado. Sem essa flag, todo link compartilhado nasce com cliques fantasma
-- e o relatório mente.
--
-- ip_hash: nunca guardamos IP puro. O Worker manda só o SHA-256 do IP + salt,
-- o que permite contar visitante único sem armazenar dado pessoal (LGPD).
--
-- Os utm_* aqui são os EFETIVAMENTE usados no clique — podem diferir dos do
-- link se alguém colou a URL curta com parâmetro extra.
create table if not exists public.clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.links (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer text,
  referrer_host text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  country text,
  region text,
  city text,
  ip_hash text,
  is_bot boolean not null default false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text
);

create index if not exists idx_clicks_link_id on public.clicks (link_id);
create index if not exists idx_clicks_clicked_at on public.clicks (clicked_at desc);
create index if not exists idx_clicks_human on public.clicks (link_id) where not is_bot;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Modelo: ferramenta interna de time. Quem está autenticado vê e cria tudo;
-- quem não está não vê nada. Cliques só são GRAVADOS pelo Worker, que usa a
-- service_role key (a service_role ignora RLS por definição) — então não
-- existe policy de insert em clicks de propósito: nem o painel pode inventar
-- clique.
alter table public.links enable row level security;
alter table public.clicks enable row level security;

drop policy if exists "links: autenticado lê" on public.links;
create policy "links: autenticado lê" on public.links
  for select to authenticated using (true);

drop policy if exists "links: autenticado cria" on public.links;
create policy "links: autenticado cria" on public.links
  for insert to authenticated with check (true);

drop policy if exists "links: autenticado edita" on public.links;
create policy "links: autenticado edita" on public.links
  for update to authenticated using (true) with check (true);

drop policy if exists "links: autenticado apaga" on public.links;
create policy "links: autenticado apaga" on public.links
  for delete to authenticated using (true);

drop policy if exists "clicks: autenticado lê" on public.clicks;
create policy "clicks: autenticado lê" on public.clicks
  for select to authenticated using (true);

-- OPCIONAL — cinto e suspensório. Se quiser restringir o painel a um domínio
-- de email (mesmo que alguém consiga criar conta), troque as policies de
-- links/clicks por versões com esta condição no lugar de `true`:
--
--   (auth.jwt() ->> 'email') like '%@dnia.com.br'
--
-- A trava principal continua sendo desligar o cadastro público no Supabase
-- Auth (ver README) — isto é só a segunda camada.

-- ---------------------------------------------------------------------------
-- VIEWS DE RELATÓRIO
-- ---------------------------------------------------------------------------
-- security_invoker = true faz a view respeitar o RLS de quem consulta, em vez
-- de rodar com a permissão de quem criou. Sem isso, a view viraria um buraco
-- que expõe as tabelas por fora das policies.
--
-- Toda métrica de clique exclui bot: `filter (where not c.is_bot)`.

create or replace view public.v_link_stats
with (security_invoker = true) as
select
  l.id as link_id,
  l.slug,
  l.title,
  l.campaign,
  l.rosto,
  l.canal,
  l.created_at,
  count(c.id) filter (where not c.is_bot) as clicks,
  count(distinct c.ip_hash) filter (where not c.is_bot and c.ip_hash is not null) as unique_clicks,
  count(c.id) filter (where c.is_bot) as bot_hits,
  max(c.clicked_at) filter (where not c.is_bot) as last_click_at
from public.links l
left join public.clicks c on c.link_id = l.id
group by l.id;

create or replace view public.v_campaign_stats
with (security_invoker = true) as
select
  l.campaign,
  count(distinct l.id) as links,
  count(c.id) filter (where not c.is_bot) as clicks,
  count(distinct c.ip_hash) filter (where not c.is_bot and c.ip_hash is not null) as unique_clicks,
  count(c.id) filter (where c.is_bot) as bot_hits,
  max(c.clicked_at) filter (where not c.is_bot) as last_click_at
from public.links l
left join public.clicks c on c.link_id = l.id
group by l.campaign;

create or replace view public.v_rosto_stats
with (security_invoker = true) as
select
  l.rosto as label,
  count(distinct l.id) as links,
  count(c.id) filter (where not c.is_bot) as clicks,
  count(distinct c.ip_hash) filter (where not c.is_bot and c.ip_hash is not null) as unique_clicks,
  count(c.id) filter (where c.is_bot) as bot_hits,
  max(c.clicked_at) filter (where not c.is_bot) as last_click_at
from public.links l
left join public.clicks c on c.link_id = l.id
group by l.rosto;

create or replace view public.v_canal_stats
with (security_invoker = true) as
select
  l.canal as label,
  count(distinct l.id) as links,
  count(c.id) filter (where not c.is_bot) as clicks,
  count(distinct c.ip_hash) filter (where not c.is_bot and c.ip_hash is not null) as unique_clicks,
  count(c.id) filter (where c.is_bot) as bot_hits,
  max(c.clicked_at) filter (where not c.is_bot) as last_click_at
from public.links l
left join public.clicks c on c.link_id = l.id
group by l.canal;

-- Série diária por link, pro gráfico de cliques por dia.
create or replace view public.v_daily_clicks
with (security_invoker = true) as
select
  c.link_id,
  (c.clicked_at at time zone 'America/Sao_Paulo')::date as day,
  count(*) as clicks
from public.clicks c
where not c.is_bot
group by c.link_id, 2
order by 2;

grant select on public.v_link_stats to authenticated;
grant select on public.v_campaign_stats to authenticated;
grant select on public.v_rosto_stats to authenticated;
grant select on public.v_canal_stats to authenticated;
grant select on public.v_daily_clicks to authenticated;

-- ============================================================================
-- PARIDADE COM O BIT.LY — adicionado depois da revisão POPI
-- ============================================================================
-- Três funções do bit.ly que o time usa e faltavam aqui: edição de destino,
-- QR code e página de link na bio. QR code é gerado no navegador a partir do
-- link curto, então não precisa de coluna. As outras duas precisam de schema.

-- ---------------------------------------------------------------------------
-- EDIÇÃO DE DESTINO
-- ---------------------------------------------------------------------------
-- Trocar o destino de um link já publicado é a razão de existir de um
-- encurtador: o link impresso num banner ou publicado em 40 posts continua o
-- mesmo, e o destino muda por baixo. Os cliques antigos ficam presos ao
-- link_id, então o histórico não se perde na troca.
alter table public.links
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_links_touch on public.links;
create trigger trg_links_touch
  before update on public.links
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- PÁGINA DE LINK NA BIO
-- ---------------------------------------------------------------------------
-- Mora no domínio curto como seudominio.com/@rodrigo e é renderizada pelo
-- próprio Worker (HTML de servidor, não SPA) — por isso a prévia funciona
-- quando alguém compartilha a página.
--
-- O "@" não colide com slug de link: o check de links só aceita
-- [A-Za-z0-9_-], então nenhum link pode nascer começando com @.
create table if not exists public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,          -- "rodrigo" → dominio.com/@rodrigo
  title text not null,
  subtitle text,
  avatar_url text,
  rosto text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bio_pages_slug_format check (slug ~ '^[a-z0-9_-]{2,40}$')
);

drop trigger if exists trg_bio_pages_touch on public.bio_pages;
create trigger trg_bio_pages_touch
  before update on public.bio_pages
  for each row execute function public.touch_updated_at();

-- Cada item da bio aponta pra um link curto já existente, em vez de guardar a
-- URL solta. Assim o clique no botão da bio passa pelo mesmo Worker e entra no
-- mesmo relatório — sem uma segunda máquina de métrica pra manter.
create table if not exists public.bio_page_items (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.bio_pages (id) on delete cascade,
  link_id uuid not null references public.links (id) on delete cascade,
  label text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_bio_items_page on public.bio_page_items (page_id, position);
create index if not exists idx_bio_pages_slug on public.bio_pages (slug);

alter table public.bio_pages enable row level security;
alter table public.bio_page_items enable row level security;

-- Mesmo modelo das outras tabelas: o time autenticado administra; o público
-- nunca lê direto do banco (quem serve a página pública é o Worker, com a
-- service_role, que ignora RLS).
drop policy if exists "bio_pages: autenticado administra" on public.bio_pages;
create policy "bio_pages: autenticado administra" on public.bio_pages
  for all to authenticated using (true) with check (true);

drop policy if exists "bio_items: autenticado administra" on public.bio_page_items;
create policy "bio_items: autenticado administra" on public.bio_page_items
  for all to authenticated using (true) with check (true);

-- Cliques por item da bio, pro painel mostrar o que performa dentro da página.
create or replace view public.v_bio_item_stats
with (security_invoker = true) as
select
  i.id as item_id,
  i.page_id,
  i.label,
  i.position,
  l.slug,
  count(c.id) filter (where not c.is_bot) as clicks,
  count(distinct c.ip_hash) filter (where not c.is_bot and c.ip_hash is not null) as unique_clicks
from public.bio_page_items i
join public.links l on l.id = i.link_id
left join public.clicks c on c.link_id = l.id
group by i.id, i.page_id, i.label, i.position, l.slug;

grant select on public.v_bio_item_stats to authenticated;
