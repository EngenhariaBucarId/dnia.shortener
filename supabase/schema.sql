-- RETRATO LEGÍVEL do schema. A fonte da verdade são as migrações em
-- supabase/migrations/ (aplicadas em ordem). Mudança nova = migração nova;
-- não edite migração já aplicada. Mantenha este arquivo igual ao resultado
-- de todas as migrações, pra leitura.
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
-- MEMBROS DO TIME
-- ---------------------------------------------------------------------------
-- A ferramenta é fechada: só entra quem um admin convidou. Ter conta no
-- Supabase Auth NÃO basta — toda policy abaixo exige uma linha aqui. Assim,
-- se alguém ligar o cadastro público por engano, a conta nova nasce sem
-- acesso a nada; e remover alguém do time corta o acesso na hora, sem
-- esperar o token expirar.
--
-- Quem convida e remove é a Edge Function `team-admin` (supabase/functions),
-- porque criar usuário no Auth exige a service_role, que nunca vai pro
-- navegador. Trocar papel o admin faz direto pelo painel (policy abaixo).
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'membro',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint members_role_valid check (role in ('admin', 'membro'))
);

-- SECURITY DEFINER: a policy de members usa is_member(), e com "invoker" a
-- função consultaria members passando pelo próprio RLS (recursão). search_path
-- vazio e nomes qualificados, pra função não poder ser sequestrada. Ficam no
-- schema private, que a API REST não publica (ninguém chama por /rpc); o papel
-- authenticated só precisa de USAGE no schema e EXECUTE nelas pras policies.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid());
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

revoke all on function private.is_member() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_member() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- O time nunca pode ficar sem admin: senão ninguém mais convida ninguém e a
-- única saída é SQL na mão. Vale pra remover e pra rebaixar o último admin.
create or replace function public.members_keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (
       select 1 from public.members m
       where m.role = 'admin' and m.user_id <> old.user_id
     ) then
    raise exception 'O time precisa de pelo menos um admin.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_members_keep_one_admin on public.members;
create trigger trg_members_keep_one_admin
  before update or delete on public.members
  for each row execute function public.members_keep_one_admin();

alter table public.members enable row level security;

-- O time vê quem está no time; só admin muda papel ou remove a linha.
drop policy if exists "members: membro lê" on public.members;
create policy "members: membro lê" on public.members
  for select to authenticated using (private.is_member());

drop policy if exists "members: admin edita" on public.members;
create policy "members: admin edita" on public.members
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "members: admin remove" on public.members;
create policy "members: admin remove" on public.members
  for delete to authenticated using (private.is_admin());

-- Sem policy de insert de propósito: entrar no time só pelo convite (Edge
-- Function com service_role), que cria a conta e a linha juntas.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Modelo: ferramenta interna de time. Membro do time vê e cria tudo; quem não
-- é membro — mesmo autenticado — não vê nada. Cliques só são GRAVADOS pelo
-- Worker, que usa a service_role key (a service_role ignora RLS por definição)
-- — então não existe policy de insert em clicks de propósito: nem o painel
-- pode inventar clique.
alter table public.links enable row level security;
alter table public.clicks enable row level security;

-- Nomes antigos (versão em que bastava estar autenticado), removidos ao rodar
-- de novo num banco que já tinha o schema anterior.
drop policy if exists "links: autenticado lê" on public.links;
drop policy if exists "links: autenticado cria" on public.links;
drop policy if exists "links: autenticado edita" on public.links;
drop policy if exists "links: autenticado apaga" on public.links;
drop policy if exists "clicks: autenticado lê" on public.clicks;

drop policy if exists "links: membro lê" on public.links;
create policy "links: membro lê" on public.links
  for select to authenticated using (private.is_member());

drop policy if exists "links: membro cria" on public.links;
create policy "links: membro cria" on public.links
  for insert to authenticated with check (private.is_member());

drop policy if exists "links: membro edita" on public.links;
create policy "links: membro edita" on public.links
  for update to authenticated using (private.is_member()) with check (private.is_member());

drop policy if exists "links: membro apaga" on public.links;
create policy "links: membro apaga" on public.links
  for delete to authenticated using (private.is_member());

drop policy if exists "clicks: membro lê" on public.clicks;
create policy "clicks: membro lê" on public.clicks
  for select to authenticated using (private.is_member());

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
set search_path = ''
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

-- Fundo da página: um dos temas prontos (lista em BIO_BACKGROUNDS, no Worker)
-- ou "imagem", que usa background_url. Em coluna separada (e não só a URL)
-- pra trocar de tema sem perder a imagem já enviada.
alter table public.bio_pages add column if not exists background text not null default 'premium';
alter table public.bio_pages add column if not exists background_url text;
-- Logo da empresa no rodapé da página (no lugar do texto "dn.ia").
alter table public.bio_pages add column if not exists logo_url text;

alter table public.bio_pages drop constraint if exists bio_pages_background_valid;
alter table public.bio_pages add constraint bio_pages_background_valid
  check (background in ('premium', 'warm', 'dark', 'azul', 'imagem'));

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
drop policy if exists "bio_items: autenticado administra" on public.bio_page_items;

drop policy if exists "bio_pages: membro administra" on public.bio_pages;
create policy "bio_pages: membro administra" on public.bio_pages
  for all to authenticated using (private.is_member()) with check (private.is_member());

drop policy if exists "bio_items: membro administra" on public.bio_page_items;
create policy "bio_items: membro administra" on public.bio_page_items
  for all to authenticated using (private.is_member()) with check (private.is_member());

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

-- ---------------------------------------------------------------------------
-- IMAGENS DA PÁGINA DE BIO (Supabase Storage)
-- ---------------------------------------------------------------------------
-- Foto de perfil e imagem de fundo enviadas pelo painel. O bucket é PÚBLICO
-- pra leitura porque a página de bio é pública: o navegador de quem visita
-- carrega a imagem direto do Storage. Escrever (subir, trocar, apagar) é só
-- pro time autenticado — o mesmo modelo das tabelas.
--
-- Limite de 5 MB e só imagem. O painel já redimensiona e converte pra WebP
-- antes de subir, então na prática os arquivos ficam bem abaixo disso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bio-media', 'bio-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bio-media: autenticado envia" on storage.objects;
drop policy if exists "bio-media: autenticado troca" on storage.objects;
drop policy if exists "bio-media: autenticado apaga" on storage.objects;

drop policy if exists "bio-media: membro envia" on storage.objects;
create policy "bio-media: membro envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bio-media' and private.is_member());

drop policy if exists "bio-media: membro troca" on storage.objects;
create policy "bio-media: membro troca" on storage.objects
  for update to authenticated
  using (bucket_id = 'bio-media' and private.is_member());

drop policy if exists "bio-media: membro apaga" on storage.objects;
create policy "bio-media: membro apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bio-media' and private.is_member());

-- ---------------------------------------------------------------------------
-- PRIMEIRO ADMIN (rodar uma vez, à mão)
-- ---------------------------------------------------------------------------
-- O convite exige um admin, então o primeiro sai daqui: crie o usuário em
-- Authentication > Users > Add user (com senha) e rode, trocando o e-mail:
--
--   insert into public.members (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = 'voce@dnia.com.br'
--   on conflict (user_id) do update set role = 'admin';
--
-- Depois disso, todo o resto do time entra pelo menu Time do painel.
