-- Teste de isolamento entre famílias (RLS + privilégios + RPCs).
-- Executar com psql -v ON_ERROR_STOP=1 após aplicar as migrações.
-- Funciona no stub local (scripts/db/test_local.sh) e em um banco Supabase local de testes.
-- Qualquer falha interrompe com "FALHA: ...".
\set ON_ERROR_STOP on

\set a1 '''aaaaaaaa-0000-0000-0000-000000000001'''
\set a2 '''aaaaaaaa-0000-0000-0000-000000000002'''
\set b1 '''bbbbbbbb-0000-0000-0000-000000000001'''
\set f1 '''aaaaaaaa-0000-0000-0000-0000000000f1'''

-- Fixtures (superusuário)
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:a1, 'a1@teste.local', '{"display_name":"Ana (A)"}'),
  (:a2, 'a2@teste.local', '{"display_name":"Alberto (A)"}'),
  (:b1, 'b1@teste.local', '{"display_name":"Bia (B)"}'),
  (:f1, 'filho@teste.local', '{"display_name":"Filho (A)"}');
create temporary table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;
insert into public.products (id, source, source_id, name, brand, size_label, department, size_value, size_unit)
values ('11111111-1111-1111-1111-111111111111', 'teste', 'cafe-500', 'Café Teste Isolamento', 'MarcaTesteX', '500 g', 'Mercearia', 500, 'g'),
       ('11111111-1111-1111-1111-111111111112', 'teste', 'cafe-250', 'Café Teste Isolamento', 'MarcaTesteX', '250 g', 'Mercearia', 250, 'g')
on conflict (source, source_id) do nothing;

-- ---------------------------------------------------------------- Família A
set role authenticated;
select set_config('request.jwt.claim.sub', :a1, false) \g /dev/null
insert into ctx values ('famA', public.create_family('Família A')::text);
insert into ctx values ('invite', public.create_family_invite((select v::uuid from ctx where k = 'famA')));
with s as (insert into public.shopping_lists (family_id, name) values ((select v::uuid from ctx where k = 'famA'), 'Compras da semana A') returning id)
insert into ctx select 'listA', id::text from s;
with s as (insert into public.family_products (family_id, name, brand) values ((select v::uuid from ctx where k = 'famA'), 'Pão da padaria do bairro', 'Padaria Sol') returning id)
insert into ctx select 'fpA', id::text from s;
insert into public.shopping_list_items (list_id, product_id, name_snapshot, brand_snapshot, size_label_snapshot, quantity_requested, position)
  values ((select v::uuid from ctx where k = 'listA'), '11111111-1111-1111-1111-111111111111', 'Café Teste Isolamento', 'MarcaTesteX', '500 g', 2, 0);
insert into public.shopping_list_items (list_id, family_product_id, name_snapshot, quantity_requested, position)
  values ((select v::uuid from ctx where k = 'listA'), (select v::uuid from ctx where k = 'fpA'), 'Pão da padaria do bairro', 1, 1);

do $$ begin
  assert (select count(*) from public.shopping_list_items) = 2, 'FALHA: A1 deveria ver 2 itens';
  assert (select family_id::text from public.shopping_list_items limit 1) = (select v from ctx where k = 'famA'),
    'FALHA: family_id do item deveria vir da lista';
  assert (select count(*) from public.search_products('CAFE teste MARCATESTEX 500 G')) = 1, 'FALHA: busca sem acento/caixa/espaço deveria achar 1';
  assert (select count(*) from public.search_products('café marcatéstex')) = 2, 'FALHA: busca deveria achar os 2 tamanhos';
end $$;

-- A2 aceita o convite e passa a ver e marcar a lista de A
select set_config('request.jwt.claim.sub', :a2, false) \g /dev/null
select public.accept_family_invite((select v from ctx where k = 'invite')) is not null as a2_entrou;
update public.shopping_list_items set status = 'purchased' where product_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.shopping_lists) = 1, 'FALHA: A2 deveria ver a lista da família A';
  assert (select checked_at is not null from public.shopping_list_items where status = 'purchased'), 'FALHA: checked_at automático';
  assert (select count(*) from public.profiles) = 2, 'FALHA: A2 deveria ver apenas perfis da própria família';
end $$;

-- ---------------------------------------------------------------- convites por e-mail (A1 é o responsável)
select set_config('request.jwt.claim.sub', :a1, false) \g /dev/null
insert into ctx values ('inviteFilho', public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Filho', 'Filho@Teste.Local'));
do $$
declare n int;
begin
  assert (select email from public.family_invites where code = (select v from ctx where k = 'inviteFilho')) = 'filho@teste.local',
    'FALHA: e-mail do convite deveria ser normalizado';
  -- A2 já é membro (1) + 1 convite pendente => restam 3
  assert public.family_invite_slots((select v::uuid from ctx where k = 'famA')) = 3, 'FALHA: vagas deveriam ser 3';
  begin
    perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Repetido', 'filho@teste.local');
    raise exception 'FALHA: aceitou convite duplicado para o mesmo e-mail';
  exception when others then if sqlerrm like 'FALHA:%' then raise; end if;
  end;
  begin
    perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Já membro', 'a2@teste.local');
    raise exception 'FALHA: convidou quem já é membro';
  exception when others then if sqlerrm like 'FALHA:%' then raise; end if;
  end;
  perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Filha', 'filha@teste.local');
  perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Ajudante', 'ajudante@teste.local');
  perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Avó', 'avo@teste.local');
  assert public.family_invite_slots((select v::uuid from ctx where k = 'famA')) = 0, 'FALHA: vagas deveriam ter acabado';
  begin
    perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'Sexto', 'sexto@teste.local');
    raise exception 'FALHA: passou do limite de 5 pessoas';
  exception when others then if sqlerrm like 'FALHA:%' then raise; end if;
  end;
  -- cancelar um convite libera a vaga
  update public.family_invites set revoked_at = now() where email = 'avo@teste.local';
  get diagnostics n = row_count; assert n = 1, 'FALHA: responsável não conseguiu cancelar convite';
  assert public.family_invite_slots((select v::uuid from ctx where k = 'famA')) = 1, 'FALHA: cancelar deveria liberar vaga';
  assert public.renew_family_invite((select id from public.family_invites where email = 'filha@teste.local')) is not null,
    'FALHA: reenviar convite';
end $$;
insert into ctx select 'inviteFilha', code from public.family_invites where email = 'filha@teste.local';

-- membro comum (A2) não convida nem vê convites
select set_config('request.jwt.claim.sub', :a2, false) \g /dev/null
do $$ begin
  assert (select count(*) from public.family_invites) = 0, 'FALHA: membro comum viu convites';
  begin
    perform public.create_family_invite((select v::uuid from ctx where k = 'famA'), 'X', 'x@teste.local');
    raise exception 'FALHA: membro comum convidou';
  exception when others then if sqlerrm like 'FALHA:%' then raise; end if;
  end;
end $$;

-- o convidado com o e-mail certo aceita
select set_config('request.jwt.claim.sub', :f1, false) \g /dev/null
select public.accept_family_invite(lower((select v from ctx where k = 'inviteFilho'))) is not null \g /dev/null
do $$ begin
  assert (select count(*) from public.shopping_lists) = 1, 'FALHA: convidado deveria ver a lista da família A';
end $$;

-- ---------------------------------------------------------------- Família B tenta acessar A
select set_config('request.jwt.claim.sub', :b1, false) \g /dev/null
insert into ctx values ('famB', public.create_family('Família B')::text);
with s as (insert into public.shopping_lists (family_id, name) values ((select v::uuid from ctx where k = 'famB'), 'Lista B') returning id)
insert into ctx select 'listB', id::text from s;

do $$
declare n int;
begin
  -- leitura
  assert (select count(*) from public.shopping_lists) = 1, 'FALHA: B deveria ver só a própria lista';
  assert (select count(*) from public.shopping_list_items) = 0, 'FALHA: B leu itens de A';
  assert (select count(*) from public.family_products) = 0, 'FALHA: B leu produto particular de A';
  assert (select count(*) from public.families) = 1, 'FALHA: B leu a família A';
  assert (select count(*) from public.family_members where family_id = (select v::uuid from ctx where k = 'famA')) = 0, 'FALHA: B leu membros de A';
  assert (select count(*) from public.profiles) = 1, 'FALHA: B leu perfis de A';
  assert public.family_invite_slots((select v::uuid from ctx where k = 'famA')) is null, 'FALHA: B consultou vagas de A';
  -- alteração e exclusão silenciosamente sem efeito (RLS filtra as linhas)
  update public.shopping_lists set name = 'invadida' where id = (select v::uuid from ctx where k = 'listA');
  get diagnostics n = row_count; assert n = 0, 'FALHA: B alterou lista de A';
  update public.shopping_list_items set quantity_requested = 99;
  get diagnostics n = row_count; assert n = 0, 'FALHA: B alterou itens de A';
  delete from public.shopping_list_items;
  get diagnostics n = row_count; assert n = 0, 'FALHA: B apagou itens de A';
  delete from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA');
  get diagnostics n = row_count; assert n = 0, 'FALHA: B apagou lista de A';
  delete from public.family_products;
  get diagnostics n = row_count; assert n = 0, 'FALHA: B apagou produto particular de A';
end $$;

-- inserções e RPCs contra A devem falhar com erro
do $$
declare
  attempts text[] := array[
    $q$insert into public.shopping_list_items (list_id, name_snapshot) values ((select v::uuid from ctx where k = 'listA'), 'x')$q$,
    $q$insert into public.shopping_lists (family_id, name) values ((select v::uuid from ctx where k = 'famA'), 'x')$q$,
    $q$insert into public.family_products (family_id, name) values ((select v::uuid from ctx where k = 'famA'), 'x')$q$,
    $q$insert into public.shopping_list_items (list_id, family_product_id, name_snapshot) values ((select v::uuid from ctx where k = 'listB'), (select v::uuid from ctx where k = 'fpA'), 'x')$q$,
    $q$select public.complete_shopping_list((select v::uuid from ctx where k = 'listA'))$q$,
    $q$select public.clone_shopping_list((select v::uuid from ctx where k = 'listA'), 'x')$q$,
    $q$select public.create_family_invite((select v::uuid from ctx where k = 'famA'))$q$,
    $q$insert into public.products (id, source, source_id, name) values (gen_random_uuid(), 'x', 'x', 'x')$q$,
    $q$update public.products set name = 'x'$q$,
    $q$delete from public.products$q$,
    $q$insert into public.purchases (family_id, list_id) values ((select v::uuid from ctx where k = 'famB'), (select v::uuid from ctx where k = 'listB'))$q$,
    $q$insert into public.entitlements (family_id, status) values ((select v::uuid from ctx where k = 'famB'), 'active')$q$,
    $q$update public.shopping_lists set status = 'completed', completed_at = now() where id = (select v::uuid from ctx where k = 'listB')$q$,
    $q$update public.family_members set role = 'owner'$q$,
    $q$select public.send_shopping_list((select v::uuid from ctx where k = 'listA'))$q$,
    $q$select public.hide_shopping_list((select v::uuid from ctx where k = 'listA'))$q$,
    $q$insert into public.list_hides (list_id, user_id) values ((select v::uuid from ctx where k = 'listB'), auth.uid())$q$,
    $q$update public.shopping_lists set sent_at = now() where id = (select v::uuid from ctx where k = 'listB')$q$,
    $q$select public.renew_family_invite((select id from public.family_invites limit 1))$q$,
    $q$select public.renew_family_invite('00000000-0000-0000-0000-000000000000')$q$,
    $q$update public.family_invites set name = 'x'$q$,
    $q$select public.accept_family_invite((select v from ctx where k = 'inviteFilha'))$q$
  ];
  stmt text;
begin
  foreach stmt in array attempts loop
    begin
      execute stmt;
      raise exception 'FALHA: deveria ter sido bloqueado: %', stmt;
    exception when others then
      if sqlerrm like 'FALHA:%' then raise; end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------- anon não lê nada
set role anon;
do $$ begin
  begin
    perform count(*) from public.products;
    raise exception 'FALHA: anon leu o catálogo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.shopping_lists;
    raise exception 'FALHA: anon leu listas';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- enviar, concluir e comprar novamente (A1)
set role authenticated;
select set_config('request.jwt.claim.sub', :a1, false) \g /dev/null
select public.send_shopping_list((select v::uuid from ctx where k = 'listA')) is not null as enviada \g /dev/null
do $$ begin
  assert (select sent_at is not null and sent_by is not null from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA')),
    'FALHA: lista deveria estar enviada';
  begin
    perform public.hide_shopping_list((select v::uuid from ctx where k = 'listA'));
    raise exception 'FALHA: ocultou lista não concluída';
  exception when others then
    if sqlerrm like 'FALHA:%' then raise; end if;
  end;
end $$;
insert into ctx select 'purchase', public.complete_shopping_list((select v::uuid from ctx where k = 'listA'))::text;
insert into ctx select 'clone', public.clone_shopping_list((select v::uuid from ctx where k = 'listA'), 'Compras da semana A (de novo)')::text;
do $$ begin
  assert (select status::text from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA')) = 'completed', 'FALHA: lista deveria estar concluída';
  assert (select count(*) from public.purchase_items) = 1, 'FALHA: só o item marcado entra na compra';
  assert (select quantity_purchased from public.purchase_items) = 2, 'FALHA: quantidade comprada';
  assert (select count(*) from public.shopping_list_items where list_id = (select v::uuid from ctx where k = 'clone') and status = 'pending') = 2,
    'FALHA: clone deveria ter 2 itens pendentes';
  assert not exists (select 1 from public.shopping_list_items a join public.shopping_list_items b on a.id = b.id
    where a.list_id = (select v::uuid from ctx where k = 'listA') and b.list_id = (select v::uuid from ctx where k = 'clone')),
    'FALHA: clone reaproveitou IDs';
  assert (select count(*) from public.shopping_list_items where list_id = (select v::uuid from ctx where k = 'listA') and status = 'purchased') = 1,
    'FALHA: lista original foi alterada';
  begin
    insert into public.shopping_list_items (list_id, name_snapshot) values ((select v::uuid from ctx where k = 'listA'), 'tarde demais');
    raise exception 'FALHA: inseriu item em lista concluída';
  exception when others then
    if sqlerrm like 'FALHA:%' then raise; end if;
  end;
  begin
    delete from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA');
    if found then raise exception 'FALHA: apagou lista concluída (histórico)'; end if;
  end;
end $$;

-- ---------------------------------------------------------------- ocultar lista concluída só para A1
select public.hide_shopping_list((select v::uuid from ctx where k = 'listA')) \g /dev/null
do $$ begin
  assert (select count(*) from public.list_hides) = 1, 'FALHA: A1 deveria ter 1 lista oculta';
  assert exists (select 1 from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA')), 'FALHA: lista apagada do banco';
  assert (select count(*) from public.purchase_items) = 1, 'FALHA: compra apagada do banco';
end $$;
select set_config('request.jwt.claim.sub', :a2, false) \g /dev/null
do $$ begin
  assert (select count(*) from public.list_hides) = 0, 'FALHA: A2 viu ocultações de A1';
  assert exists (select 1 from public.shopping_lists where id = (select v::uuid from ctx where k = 'listA')), 'FALHA: A2 perdeu a lista';
end $$;

-- ---------------------------------------------------------------- lista simples (texto livre)
select set_config('request.jwt.claim.sub', :a1, false) \g /dev/null
with s as (insert into public.shopping_lists (family_id, name, kind) values ((select v::uuid from ctx where k = 'famA'), 'Lista simples A', 'simple') returning id)
insert into ctx select 'simpleA', id::text from s;
insert into public.shopping_list_items (list_id, name_snapshot, quantity_requested, position)
  values ((select v::uuid from ctx where k = 'simpleA'), 'Pão francês', 6, 0);
insert into ctx select 'simpleClone', public.clone_shopping_list((select v::uuid from ctx where k = 'simpleA'), 'Simples de novo')::text;
do $$ begin
  assert (select kind from public.shopping_lists where id = (select v::uuid from ctx where k = 'simpleA')) = 'simple', 'FALHA: tipo simples';
  assert (select kind from public.shopping_lists where id = (select v::uuid from ctx where k = 'simpleClone')) = 'simple',
    'FALHA: comprar novamente deveria manter o tipo simples';
  assert (select name_snapshot from public.shopping_list_items where list_id = (select v::uuid from ctx where k = 'simpleClone')) = 'Pão francês',
    'FALHA: item de texto não foi copiado';
  assert (select kind from public.shopping_lists where id = (select v::uuid from ctx where k = 'clone')) = 'complete', 'FALHA: padrão completa';
  begin
    insert into public.shopping_lists (family_id, name, kind) values ((select v::uuid from ctx where k = 'famA'), 'x', 'outra');
    raise exception 'FALHA: aceitou tipo inválido';
  exception when others then if sqlerrm like 'FALHA:%' then raise; end if;
  end;
end $$;

reset role;
select 'RLS: todos os cenários passaram' as resultado;
