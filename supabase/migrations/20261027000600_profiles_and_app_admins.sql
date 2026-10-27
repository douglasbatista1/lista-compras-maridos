-- 1) Perfil garantido.
-- Em 26/10/2026 uma conta foi criada no Supabase sem o perfil correspondente (o gatilho
-- on_auth_user_created não gerou a linha). Como family_members.user_id referencia profiles,
-- isso impedia criar ou entrar em família. Agora:
--   a) preenchemos os perfis que faltam;
--   b) create_family e accept_family_invite criam o perfil antes, se ele não existir.

insert into public.profiles (id, display_name)
select u.id, coalesce(left(u.raw_user_meta_data ->> 'display_name', 80), '')
from auth.users u
on conflict (id) do nothing;

create or replace function public.ensure_my_profile()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.profiles (id, display_name)
  select u.id, coalesce(left(u.raw_user_meta_data ->> 'display_name', 80), '')
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
$$;

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
  perform public.ensure_my_profile();
  insert into public.families (name, created_by) values (btrim(p_name), v_uid) returning id into v_family;
  insert into public.family_members (family_id, user_id, role) values (v_family, v_uid, 'owner');
  return v_family;
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
  perform public.ensure_my_profile();
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

-- 2) Administradores do app (equipe do produto, não confundir com o responsável da família).
-- Por enquanto só marca quem é admin; recursos de administração (catálogo, suporte) devem
-- checar public.is_app_admin(). Ninguém se torna admin pelo app: só via SQL/painel.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);
alter table public.app_admins enable row level security;
create policy app_admins_select_self on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

revoke execute on function public.ensure_my_profile() from public, anon, authenticated;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;
