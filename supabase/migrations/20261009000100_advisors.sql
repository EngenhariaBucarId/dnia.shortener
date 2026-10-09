-- ============================================================================
-- Ajustes apontados pelos advisors do Supabase depois da migração inicial.
-- ============================================================================

-- 1. touch_updated_at com search_path fixo (lint 0011, function_search_path_mutable).
alter function public.touch_updated_at() set search_path = '';

-- 2. is_member()/is_admin() saem do schema exposto (lint 0029,
-- authenticated_security_definer_function_executable). Continuam SECURITY
-- DEFINER — precisam ler members sem cair na recursão do RLS —, mas num schema
-- que a API REST não publica: ninguém chama por /rest/v1/rpc. As policies
-- passam a usar private.*; o papel authenticated precisa de USAGE no schema
-- e EXECUTE nas funções pra avaliar as policies.
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

-- members
drop policy if exists "members: membro lê" on public.members;
create policy "members: membro lê" on public.members
  for select to authenticated using (private.is_member());

drop policy if exists "members: admin edita" on public.members;
create policy "members: admin edita" on public.members
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "members: admin remove" on public.members;
create policy "members: admin remove" on public.members
  for delete to authenticated using (private.is_admin());

-- links e clicks
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

-- bio
drop policy if exists "bio_pages: membro administra" on public.bio_pages;
create policy "bio_pages: membro administra" on public.bio_pages
  for all to authenticated using (private.is_member()) with check (private.is_member());

drop policy if exists "bio_items: membro administra" on public.bio_page_items;
create policy "bio_items: membro administra" on public.bio_page_items
  for all to authenticated using (private.is_member()) with check (private.is_member());

-- storage
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

-- As versões públicas não são mais usadas por nenhuma policy.
drop function if exists public.is_member();
drop function if exists public.is_admin();
