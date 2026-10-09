-- Verificação das policies, rodada contra o banco real (MCP execute_sql ou SQL
-- Editor). Tudo acontece dentro de um DO que SEMPRE termina em exceção: o
-- Postgres desfaz tudo, então nenhum usuário ou link de teste fica no banco.
--
-- Resultado esperado: ERRO com a mensagem "OK: 9 verificações de RLS".
-- Qualquer "FALHOU N: ..." aponta a regra quebrada.
do $$
declare
  admin_id    uuid := '00000000-0000-4000-8000-0000000000a1';
  membro_id   uuid := '00000000-0000-4000-8000-0000000000a2';
  estranho_id uuid := '00000000-0000-4000-8000-0000000000a3';
  n int;
  ok int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (admin_id,    'rls-admin@teste.invalid',    'authenticated', 'authenticated'),
    (membro_id,   'rls-membro@teste.invalid',   'authenticated', 'authenticated'),
    (estranho_id, 'rls-estranho@teste.invalid', 'authenticated', 'authenticated');
  insert into public.members (user_id, email, role) values
    (admin_id,  'rls-admin@teste.invalid',  'admin'),
    (membro_id, 'rls-membro@teste.invalid', 'membro');
  insert into public.links (slug, destination_url, final_url)
    values ('rls-teste-1', 'https://dnia.ai', 'https://dnia.ai');

  -- 1. anon (sem login) não lê links
  execute 'set local role anon';
  begin
    select count(*) into n from public.links;
  exception when insufficient_privilege then n := 0;
  end;
  if n <> 0 then raise exception 'FALHOU 1: anon leu % links', n; end if;
  ok := ok + 1;
  execute 'reset role';

  -- conta autenticada que NÃO está em members
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', estranho_id, 'role', 'authenticated')::text, true);

  -- 2. não lê links
  select count(*) into n from public.links;
  if n <> 0 then raise exception 'FALHOU 2: conta sem convite leu % links', n; end if;
  ok := ok + 1;

  -- 3. não cria link
  begin
    insert into public.links (slug, destination_url, final_url)
      values ('rls-teste-2', 'https://dnia.ai', 'https://dnia.ai');
    raise exception 'FALHOU 3: conta sem convite criou link';
  exception when insufficient_privilege then null;
  end;
  ok := ok + 1;

  -- 4. is_member() é falso
  if public.is_member() then raise exception 'FALHOU 4: is_member() verdadeiro para conta sem convite'; end if;
  ok := ok + 1;

  -- membro comum
  perform set_config('request.jwt.claims',
    json_build_object('sub', membro_id, 'role', 'authenticated')::text, true);

  -- 5. lê links
  select count(*) into n from public.links where slug = 'rls-teste-1';
  if n <> 1 then raise exception 'FALHOU 5: membro não leu o link (%)', n; end if;
  ok := ok + 1;

  -- 6. cria link
  insert into public.links (slug, destination_url, final_url)
    values ('rls-teste-3', 'https://dnia.ai', 'https://dnia.ai');
  ok := ok + 1;

  -- 7. não se promove a admin (RLS filtra: 0 linhas alteradas)
  update public.members set role = 'admin' where user_id = membro_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 7: membro alterou papel (% linhas)', n; end if;
  ok := ok + 1;

  -- admin
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  -- 8. promove e rebaixa o membro
  update public.members set role = 'admin' where user_id = membro_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU 8: admin não alterou papel (% linhas)', n; end if;
  update public.members set role = 'membro' where user_id = membro_id;
  ok := ok + 1;

  -- 9. não remove o último admin
  begin
    delete from public.members where user_id = admin_id;
    raise exception 'FALHOU 9: o último admin foi removido';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  ok := ok + 1;

  execute 'reset role';
  raise exception 'OK: % verificações de RLS', ok;
end $$;
