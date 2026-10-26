-- Ajustes apontados pelo Security Advisor do Supabase (22/10/2026).
-- O Supabase concede EXECUTE a "authenticated" em toda função nova (default privileges).

-- 1) Funções de gatilho e utilitárias não devem ser chamáveis pela API (/rest/v1/rpc/...).
revoke execute on function
  public.handle_new_user(), public.shopping_list_items_guard(), public.set_updated_at()
  from public, anon, authenticated;

-- 2) Vagas de convite: só o responsável da família vê (antes qualquer usuário logado
--    podia consultar quantas pessoas outra família tem).
create or replace function public.family_invite_slots(p_family uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_family_owner(p_family) then
    5
    - (select count(*) from public.family_members m
        where m.family_id = p_family and m.status = 'active' and m.role <> 'owner')::int
    - (select count(*) from public.family_invites i
        where i.family_id = p_family and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())::int
  end;
$$;
