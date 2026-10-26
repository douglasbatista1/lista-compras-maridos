-- =============================================================================
-- Segurança: Row Level Security, privilégios por coluna e RPCs transacionais.
-- Regra: um usuário só lê/altera dados das famílias em que é membro ATIVO.
-- A chave pública (anon) não acessa nenhuma tabela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções auxiliares (security definer para evitar recursão nas políticas)
-- -----------------------------------------------------------------------------
create or replace function public.is_family_member(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.is_family_owner(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family and m.user_id = (select auth.uid()) and m.status = 'active' and m.role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS ligado em todas as tabelas expostas
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.search_synonyms enable row level security;
alter table public.family_products enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.entitlements enable row level security;
alter table public.list_hides enable row level security;

-- Perfis: o próprio usuário e quem divide família com ele (para mostrar o nome).
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.family_members me
      join public.family_members other on other.family_id = me.family_id and other.status = 'active'
      where me.user_id = (select auth.uid()) and me.status = 'active' and other.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Famílias
create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (public.is_family_owner(id)) with check (public.is_family_owner(id));

-- Membros: visíveis aos membros; só é possível marcar como removido (sair ou remover alguém, se dono).
create policy family_members_select on public.family_members for select to authenticated
  using (public.is_family_member(family_id));
create policy family_members_remove on public.family_members for update to authenticated
  using (public.is_family_member(family_id) and (user_id = (select auth.uid()) or public.is_family_owner(family_id)))
  with check (status = 'removed');

-- Convites: só o dono vê e revoga; criação/aceite via RPC.
create policy family_invites_select on public.family_invites for select to authenticated
  using (public.is_family_owner(family_id));
create policy family_invites_revoke on public.family_invites for update to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

-- Catálogo global: leitura para usuários autenticados; nenhuma escrita pelo app.
create policy products_select on public.products for select to authenticated using (is_active);
create policy product_aliases_select on public.product_aliases for select to authenticated using (true);
create policy search_synonyms_select on public.search_synonyms for select to authenticated using (true);

-- Produtos particulares da família
create policy family_products_select on public.family_products for select to authenticated
  using (public.is_family_member(family_id));
create policy family_products_insert on public.family_products for insert to authenticated
  with check (public.is_family_member(family_id));
create policy family_products_update on public.family_products for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy family_products_delete on public.family_products for delete to authenticated
  using (public.is_family_member(family_id));

-- Listas
create policy shopping_lists_select on public.shopping_lists for select to authenticated
  using (public.is_family_member(family_id));
create policy shopping_lists_insert on public.shopping_lists for insert to authenticated
  with check (public.is_family_member(family_id) and status = 'active');
create policy shopping_lists_update on public.shopping_lists for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy shopping_lists_delete on public.shopping_lists for delete to authenticated
  using (public.is_family_member(family_id) and status = 'active');

-- Itens (family_id é definido pelo trigger a partir da lista, antes do WITH CHECK)
create policy shopping_list_items_select on public.shopping_list_items for select to authenticated
  using (public.is_family_member(family_id));
create policy shopping_list_items_insert on public.shopping_list_items for insert to authenticated
  with check (public.is_family_member(family_id));
create policy shopping_list_items_update on public.shopping_list_items for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy shopping_list_items_delete on public.shopping_list_items for delete to authenticated
  using (
    public.is_family_member(family_id)
    and exists (select 1 from public.shopping_lists l where l.id = list_id and l.status = 'active')
  );

-- Histórico de compras e licença: somente leitura pelo app.
create policy purchases_select on public.purchases for select to authenticated
  using (public.is_family_member(family_id));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (public.is_family_member(family_id));
create policy entitlements_select on public.entitlements for select to authenticated
  using (public.is_family_member(family_id));

-- Cada usuário só vê as próprias ocultações; criação via RPC hide_shopping_list.
create policy list_hides_select on public.list_hides for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Privilégios explícitos (defesa em profundidade além do RLS)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.products, public.product_aliases, public.search_synonyms to authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select, update (name) on public.families to authenticated;
grant select, update (status, removed_at) on public.family_members to authenticated;
grant select, update (revoked_at) on public.family_invites to authenticated;
grant select, delete on public.family_products to authenticated;
grant insert (id, family_id, name, brand, variant, size_label, category, note) on public.family_products to authenticated;
grant update (name, brand, variant, size_label, category, note) on public.family_products to authenticated;
grant select, delete on public.shopping_lists to authenticated;
grant insert (id, family_id, name) on public.shopping_lists to authenticated;
grant update (name) on public.shopping_lists to authenticated;
grant select, delete on public.shopping_list_items to authenticated;
grant insert (id, list_id, product_id, family_product_id, name_snapshot, brand_snapshot, variant_snapshot,
  size_label_snapshot, category_snapshot, image_ref_snapshot, quantity_requested, note, position)
  on public.shopping_list_items to authenticated;
grant update (quantity_requested, quantity_purchased, status, note, position) on public.shopping_list_items to authenticated;
grant select on public.purchases, public.purchase_items, public.entitlements, public.list_hides to authenticated;

alter table public.family_products alter column created_by set default auth.uid();
alter table public.shopping_lists alter column created_by set default auth.uid();

-- -----------------------------------------------------------------------------
-- RPCs (operações com várias etapas, atômicas e verificadas no servidor)
-- -----------------------------------------------------------------------------
create or replace function public.create_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  insert into public.families (name, created_by) values (btrim(p_name), v_uid) returning id into v_family;
  insert into public.family_members (family_id, user_id, role) values (v_family, v_uid, 'owner');
  return v_family;
end;
$$;

-- Limite: o responsável + até 5 pessoas (membros ativos + convites pendentes).
create or replace function public.family_invite_slots(p_family uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 5
    - (select count(*) from public.family_members m
        where m.family_id = p_family and m.status = 'active' and m.role <> 'owner')::int
    - (select count(*) from public.family_invites i
        where i.family_id = p_family and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())::int;
$$;

create or replace function public.create_family_invite(p_family uuid, p_name text default null, p_email text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if not public.is_family_owner(p_family) then raise exception 'Apenas o responsável pela família pode convidar'; end if;
  if v_email is not null and exists (
    select 1 from public.family_members m join auth.users u on u.id = m.user_id
    where m.family_id = p_family and m.status = 'active' and lower(u.email) = v_email
  ) then
    raise exception 'Esta pessoa já faz parte da família';
  end if;
  if v_email is not null and exists (
    select 1 from public.family_invites i
    where i.family_id = p_family and lower(i.email) = v_email and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'Já existe um convite pendente para este e-mail. Use "Reenviar".';
  end if;
  if public.family_invite_slots(p_family) <= 0 then
    raise exception 'Limite atingido: a família pode ter até 5 pessoas além do responsável';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.family_invites where code = v_code);
  end loop;
  insert into public.family_invites (family_id, code, created_by, name, email)
    values (p_family, v_code, auth.uid(), nullif(btrim(p_name), ''), v_email);
  return v_code;
end;
$$;

-- Reenviar: renova a validade (7 dias) de um convite pendente e devolve o código.
create or replace function public.renew_family_invite(p_invite uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.family_invites%rowtype;
begin
  select * into v_invite from public.family_invites where id = p_invite for update;
  if not found or not public.is_family_owner(v_invite.family_id) then raise exception 'Convite não encontrado'; end if;
  if v_invite.accepted_at is not null then raise exception 'Este convite já foi aceito'; end if;
  if v_invite.revoked_at is not null then raise exception 'Este convite foi cancelado'; end if;
  update public.family_invites set expires_at = now() + interval '7 days' where id = p_invite;
  return v_invite.code;
end;
$$;

create or replace function public.accept_family_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.family_invites%rowtype;
  v_email text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_invite from public.family_invites
    where code = upper(btrim(p_code)) and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_invite.email is not null and v_invite.email is distinct from v_email then
    raise exception 'Este convite foi enviado para outro e-mail. Entre com o e-mail que recebeu o convite.';
  end if;
  if (select count(*) from public.family_members m
      where m.family_id = v_invite.family_id and m.status = 'active' and m.role <> 'owner') >= 5 then
    raise exception 'A família já tem o número máximo de pessoas';
  end if;
  insert into public.family_members (family_id, user_id, role, invited_by)
    values (v_invite.family_id, v_uid, 'member', v_invite.created_by)
    on conflict (family_id, user_id) do update set status = 'active', removed_at = null;
  update public.family_invites set accepted_by = v_uid, accepted_at = now() where id = v_invite.id;
  return v_invite.family_id;
end;
$$;

-- Conclui a lista e grava a compra confirmada com os itens marcados.
create or replace function public.complete_shopping_list(p_list uuid, p_store text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_purchase uuid;
begin
  select * into v_list from public.shopping_lists where id = p_list for update;
  if not found or not public.is_family_member(v_list.family_id) then raise exception 'Lista não encontrada'; end if;
  if v_list.status <> 'active' then raise exception 'Lista já concluída'; end if;
  if not exists (select 1 from public.shopping_list_items where list_id = p_list and status = 'purchased') then
    raise exception 'Marque pelo menos um item comprado antes de concluir';
  end if;
  update public.shopping_lists
    set status = 'completed', completed_at = now(), completed_by = auth.uid()
    where id = p_list;
  insert into public.purchases (family_id, list_id, confirmed_by, store_name)
    values (v_list.family_id, p_list, auth.uid(), nullif(btrim(p_store), ''))
    returning id into v_purchase;
  insert into public.purchase_items (purchase_id, family_id, list_item_id, product_id, family_product_id,
      name_snapshot, brand_snapshot, variant_snapshot, size_label_snapshot, image_ref_snapshot, quantity_purchased)
    select v_purchase, v_list.family_id, i.id, i.product_id, i.family_product_id,
      i.name_snapshot, i.brand_snapshot, i.variant_snapshot, i.size_label_snapshot, i.image_ref_snapshot,
      coalesce(i.quantity_purchased, i.quantity_requested)
    from public.shopping_list_items i
    where i.list_id = p_list and i.status = 'purchased';
  return v_purchase;
end;
$$;

-- "Enviar lista": marca a lista como pronta para quem vai ao mercado.
create or replace function public.send_shopping_list(p_list uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
begin
  select * into v_list from public.shopping_lists where id = p_list for update;
  if not found or not public.is_family_member(v_list.family_id) then raise exception 'Lista não encontrada'; end if;
  if v_list.status <> 'active' then raise exception 'Lista já concluída'; end if;
  if not exists (select 1 from public.shopping_list_items where list_id = p_list) then
    raise exception 'Adicione pelo menos um produto antes de enviar';
  end if;
  update public.shopping_lists set sent_at = now(), sent_by = auth.uid() where id = p_list;
  return now();
end;
$$;

-- Remove uma lista CONCLUÍDA do histórico de quem pediu, mantendo os dados no banco.
create or replace function public.hide_shopping_list(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
begin
  select * into v_list from public.shopping_lists where id = p_list;
  if not found or not public.is_family_member(v_list.family_id) then raise exception 'Lista não encontrada'; end if;
  if v_list.status <> 'completed' then raise exception 'Listas não concluídas são apagadas, não ocultadas'; end if;
  insert into public.list_hides (list_id, user_id) values (p_list, auth.uid()) on conflict do nothing;
end;
$$;

-- "Comprar novamente": nova lista, novos IDs, itens pendentes; a original não muda.
create or replace function public.clone_shopping_list(p_list uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.shopping_lists%rowtype;
  v_new uuid;
begin
  select * into v_src from public.shopping_lists where id = p_list;
  if not found or not public.is_family_member(v_src.family_id) then raise exception 'Lista não encontrada'; end if;
  insert into public.shopping_lists (family_id, name, source_list_id, created_by)
    values (v_src.family_id, coalesce(nullif(btrim(p_name), ''), v_src.name), v_src.id, auth.uid())
    returning id into v_new;
  insert into public.shopping_list_items (list_id, family_id, product_id, family_product_id, name_snapshot,
      brand_snapshot, variant_snapshot, size_label_snapshot, category_snapshot, image_ref_snapshot,
      quantity_requested, note, position)
    select v_new, v_src.family_id, i.product_id, i.family_product_id, i.name_snapshot, i.brand_snapshot,
      i.variant_snapshot, i.size_label_snapshot, i.category_snapshot, i.image_ref_snapshot,
      i.quantity_requested, i.note, i.position
    from public.shopping_list_items i where i.list_id = p_list order by i.position;
  return v_new;
end;
$$;

-- Busca incremental no catálogo: todos os termos precisam aparecer (diretamente,
-- por sinônimo ou por alias do produto); ordena por
-- início do nome, similaridade trigram e nome. Roda com os privilégios de quem chama (RLS).
create or replace function public.search_products(
  p_query text,
  p_department text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.normalize_text(p_query) as nq,
           array_remove(string_to_array(public.normalize_text(p_query), ' '), '') as toks
  )
  select p.*
  from public.products p, q
  where p.is_active
    and (p_department is null or p.department = p_department)
    and (
      cardinality(q.toks) = 0
      or not exists (
        select 1 from unnest(q.toks) t
        where not exists (
          select 1
          from unnest(array[t] || coalesce((select s.expansions from public.search_synonyms s where s.term = t), '{}')) alt
          where p.search_text like '%' || alt || '%'
             or exists (select 1 from public.product_aliases a where a.product_id = p.id and a.search_alias like '%' || alt || '%')
        )
      )
    )
  order by
    (p.search_name = q.nq) desc,
    (p.search_name like q.nq || '%') desc,
    extensions.similarity(p.search_name, q.nq) desc,
    p.name
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

-- Departamentos com contagem (para os filtros de categoria).
create or replace function public.list_departments()
returns table (department text, products bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.department, count(*) from public.products p
  where p.is_active and p.department is not null
  group by p.department order by p.department;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_family_member(uuid), public.is_family_owner(uuid), public.normalize_text(text),
  public.create_family(text), public.create_family_invite(uuid, text, text), public.accept_family_invite(text),
  public.renew_family_invite(uuid), public.family_invite_slots(uuid),
  public.complete_shopping_list(uuid, text), public.clone_shopping_list(uuid, text),
  public.send_shopping_list(uuid), public.hide_shopping_list(uuid),
  public.search_products(text, text, integer, integer), public.list_departments()
  to authenticated;
-- servidor (importação do catálogo, Edge Functions): colunas geradas chamam normalize_text
grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Realtime: membros da família veem as marcações do outro em tempo real.
-- O Realtime respeita o RLS das tabelas para postgres_changes.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_lists, public.shopping_list_items;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Storage: fotos do catálogo (leitura pública via CDN; escrita só com service role)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
