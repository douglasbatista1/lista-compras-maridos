-- Compra do acesso da família pelas lojas (App Store / Google Play), via RevenueCat.
-- O app identifica a pessoa na RevenueCat com o id da conta (auth.users.id). A Edge Function
-- revenuecat-webhook recebe os eventos e chama apply_store_event, que grava em entitlements
-- (tabela que o app só lê). Ninguém libera acesso pelo app: só o servidor.
--
-- Cortesia (ex.: a família do dono do app): insira manualmente uma linha em entitlements com
-- status 'active' e provider 'courtesy' (ver docs/billing.md).

alter table public.entitlements
  add column if not exists store text,
  add column if not exists product_id text,
  add column if not exists last_event_id text,
  add column if not exists last_event_at timestamptz;

-- Família ativa da pessoa (a mesma que o app abre: a mais antiga em que ela está ativa).
create or replace function public.primary_family_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.family_id from public.family_members m
  where m.user_id = p_user and m.status = 'active'
  order by m.joined_at, m.created_at
  limit 1;
$$;

-- p_status: 'active' (compra/restauração), 'refunded' (reembolso) ou 'revoked' (transferida/expirada).
-- Idempotente: o mesmo evento aplicado duas vezes não muda nada.
-- Retorna a família afetada, ou null se a pessoa não estiver em nenhuma família.
create or replace function public.apply_store_event(
  p_user uuid,
  p_status text,
  p_event_id text,
  p_event_at timestamptz,
  p_store text,
  p_product_id text,
  p_transaction_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.primary_family_of(p_user);
begin
  if p_status not in ('active', 'refunded', 'revoked') then raise exception 'Status inválido: %', p_status; end if;
  if v_family is null then return null; end if;

  -- cortesia não é afetada por eventos da loja
  if exists (select 1 from public.entitlements e
             where e.family_id = v_family and e.kind = 'family_lifetime' and e.provider = 'courtesy') then
    return v_family;
  end if;

  insert into public.entitlements as e (family_id, kind, status, provider, provider_ref, store, product_id,
                                        granted_at, last_event_id, last_event_at)
  values (v_family, 'family_lifetime', p_status, 'revenuecat', p_transaction_id, p_store, p_product_id,
          case when p_status = 'active' then coalesce(p_event_at, now()) end, p_event_id, p_event_at)
  on conflict (family_id, kind) do update
    set status = excluded.status,
        provider = excluded.provider,
        provider_ref = coalesce(excluded.provider_ref, e.provider_ref),
        store = coalesce(excluded.store, e.store),
        product_id = coalesce(excluded.product_id, e.product_id),
        granted_at = case when excluded.status = 'active' then coalesce(e.granted_at, excluded.granted_at) else e.granted_at end,
        last_event_id = excluded.last_event_id,
        last_event_at = excluded.last_event_at
    -- eventos atrasados (mais antigos que o último aplicado) não desfazem o estado atual
    where e.last_event_at is null or excluded.last_event_at is null or excluded.last_event_at >= e.last_event_at;

  return v_family;
end;
$$;

revoke execute on function public.primary_family_of(uuid) from public, anon, authenticated;
revoke execute on function public.apply_store_event(uuid, text, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.primary_family_of(uuid) to service_role;
grant execute on function public.apply_store_event(uuid, text, text, timestamptz, text, text, text) to service_role;
