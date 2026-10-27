-- Exclusão de conta pelo próprio app (exigida pela Apple, guideline 5.1.1(v)).
-- Chamada só pela Edge Function delete-account (service_role), que depois apaga o login em
-- auth.users. O apagamento do login remove em cascata o perfil, as participações em famílias,
-- os convites que a pessoa criou e as listas que ela ocultou; listas e compras que ela criou
-- ficam com a família, sem autor (created_by vira null).
--
-- Antes disso, para cada família da pessoa:
--   - se houver outros membros ativos e ela for a responsável, quem entrou primeiro assume;
--   - se ela for a única pessoa ativa, a família inteira é apagada (listas, compras, produtos).

create or replace function public.delete_account_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_heir uuid;
begin
  if p_user is null then raise exception 'Usuário obrigatório'; end if;

  for v_member in
    select m.family_id, m.role from public.family_members m
    where m.user_id = p_user and m.status = 'active'
    for update
  loop
    select m.user_id into v_heir from public.family_members m
      where m.family_id = v_member.family_id and m.status = 'active' and m.user_id <> p_user
      order by m.joined_at, m.created_at
      limit 1;

    if v_heir is null then
      -- compras primeiro: purchases.list_id é "on delete restrict"
      delete from public.purchases where family_id = v_member.family_id;
      delete from public.families where id = v_member.family_id;
    elsif v_member.role = 'owner' then
      update public.family_members set role = 'owner'
        where family_id = v_member.family_id and user_id = v_heir;
    end if;
  end loop;
end;
$$;

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
