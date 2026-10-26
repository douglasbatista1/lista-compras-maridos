-- Tipo de lista:
--   'complete' — produtos do catálogo (foto, marca, variante, tamanho)
--   'simple'   — a pessoa escreve o que precisa; itens só com texto e quantidade, sem foto
-- Itens de lista simples usam a mesma tabela: product_id e family_product_id ficam nulos
-- e o texto vai em name_snapshot.
alter table public.shopping_lists
  add column kind text not null default 'complete' check (kind in ('complete', 'simple'));

grant insert (kind) on public.shopping_lists to authenticated;

-- "Comprar novamente" mantém o tipo da lista de origem.
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
  insert into public.shopping_lists (family_id, name, kind, source_list_id, created_by)
    values (v_src.family_id, coalesce(nullif(btrim(p_name), ''), v_src.name), v_src.kind, v_src.id, auth.uid())
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
