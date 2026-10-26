-- =============================================================================
-- Lista de Compras para Maridos — esquema principal
-- Banco compartilhado com isolamento lógico por família (RLS na migração 0002).
-- Datas: timestamptz (UTC). A conversão de fuso acontece só na interface.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- Mesma regra de src/domain/search.ts e scripts/catalog/import_catalog.py:
-- minúsculas, sem acentos, "1 kg" -> "1kg", vírgula decimal -> ponto.
create or replace function public.normalize_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(translate(coalesce(input, ''),
            'áàâãäåçéèêëíìîïñóòôõöúùûüýÿÁÀÂÃÄÅÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÝ',
            'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy')),
          '(\d),(\d)', '\1.\2', 'g'),
        '[^a-z0-9.\s]', ' ', 'g'),
      '(\d)\s+(kg|g|mg|ml|l|un|cm|mm|m)\M', '\1\2', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contas e famílias
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.family_role as enum ('owner', 'member');
create type public.member_status as enum ('active', 'removed');

-- Uma família pode ter duas ou mais contas.
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- referencia profiles (que referencia auth.users) para permitir o embed membro -> perfil na API
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.family_role not null default 'member',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id) where status = 'active';

-- Convite de uso único. Com e-mail: a Edge Function invite-member envia o link de
-- cadastro; só a conta com esse e-mail pode aceitar. Sem e-mail: código para digitar.
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_sent_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index family_invites_family_idx on public.family_invites (family_id);
-- um convite pendente por e-mail em cada família
create unique index family_invites_pending_email_uidx on public.family_invites (family_id, lower(email))
  where email is not null and accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- Catálogo global (somente leitura para usuários; escrita via importação/admin)
-- -----------------------------------------------------------------------------

create table public.products (
  id uuid primary key,                      -- uuid5 estável gerado pela importação
  source text not null,                     -- ex.: 'giassi'
  source_id text not null,                  -- SKU na origem
  source_product_id text,
  source_ref_code text,
  source_url text,
  source_ean_raw text,                      -- código como veio da origem (pode ser interno)
  gtin text check (gtin ~ '^\d{8}$|^\d{12,14}$'),  -- só GTIN com dígito verificador válido
  name text not null,
  brand text,
  brand_raw text,
  variant text,
  description text,
  department text,
  category text,
  subcategory text,
  category_path text,
  size_value numeric(12, 3) check (size_value is null or size_value > 0),
  size_unit text check (size_unit in ('g','kg','mg','ml','l','un','cm','m','mm','folhas','capsulas')),
  pack_qty integer check (pack_qty is null or pack_qty > 0),
  size_label text,
  size_raw text,
  sale_unit text,
  image_path text,                          -- caminho no bucket product-images (nunca binário na tabela)
  image_source_url text,                    -- origem da foto, preservada para auditoria
  image_status text,
  image_license text not null default 'desconhecida',
  needs_review boolean not null default false,
  is_active boolean not null default true,
  search_name text generated always as (public.normalize_text(name)) stored,
  search_text text generated always as (
    public.normalize_text(
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(variant, '') || ' ' ||
      coalesce(size_label, '') || ' ' || coalesce(department, '') || ' ' || coalesce(category, '') || ' ' ||
      coalesce(subcategory, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create unique index products_gtin_uidx on public.products (gtin) where gtin is not null;
create index products_department_idx on public.products (department) where is_active;
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_search_name_trgm_idx on public.products using gin (search_name extensions.gin_trgm_ops);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias text not null,
  search_alias text generated always as (public.normalize_text(alias)) stored,
  created_at timestamptz not null default now(),
  unique (product_id, alias)
);
create index product_aliases_trgm_idx on public.product_aliases using gin (search_alias extensions.gin_trgm_ops);

-- Sinônimos de termos de busca (ex.: detergente -> lava loucas). Dado de referência.
create table public.search_synonyms (
  term text primary key check (term = public.normalize_text(term)),
  expansions text[] not null
);

-- -----------------------------------------------------------------------------
-- Dados privados por família
-- -----------------------------------------------------------------------------

-- Produtos cadastrados manualmente: nunca entram no catálogo global automaticamente.
create table public.family_products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text,
  variant text,
  size_label text,
  category text,
  note text,
  image_path text,
  created_by uuid references auth.users (id) on delete set null,
  search_text text generated always as (
    public.normalize_text(coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(variant, '') || ' ' ||
      coalesce(size_label, '') || ' ' || coalesce(category, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index family_products_family_idx on public.family_products (family_id);
create index family_products_trgm_idx on public.family_products using gin (search_text extensions.gin_trgm_ops);

create type public.list_status as enum ('active', 'completed', 'archived');
create type public.item_status as enum ('pending', 'purchased');

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  status public.list_status not null default 'active',
  source_list_id uuid references public.shopping_lists (id) on delete set null,  -- "comprar novamente"
  created_by uuid references auth.users (id) on delete set null,
  -- "Enviar lista": quem montou sinaliza que a lista está pronta para quem vai comprar
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);
create index shopping_lists_family_status_idx on public.shopping_lists (family_id, status, updated_at desc);

-- Lista concluída removida do histórico de UM usuário. A lista, os itens e a compra
-- continuam no banco (histórico de compras da família); só deixam de aparecer para quem ocultou.
-- Listas não concluídas são apagadas de verdade (delete), não ocultadas.
create table public.list_hides (
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_hides_user_idx on public.list_hides (user_id);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,  -- preenchido por trigger
  product_id uuid references public.products (id) on delete set null,
  family_product_id uuid references public.family_products (id) on delete set null,
  -- snapshot de identificação: mudanças futuras no catálogo não reescrevem o histórico
  name_snapshot text not null,
  brand_snapshot text,
  variant_snapshot text,
  size_label_snapshot text,
  category_snapshot text,
  image_ref_snapshot text,
  quantity_requested numeric(8, 3) not null default 1 check (quantity_requested > 0),
  quantity_purchased numeric(8, 3) check (quantity_purchased is null or quantity_purchased >= 0),
  status public.item_status not null default 'pending',
  checked_at timestamptz,
  checked_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_id is null or family_product_id is null)
);
create index shopping_list_items_list_idx on public.shopping_list_items (list_id, position);
create index shopping_list_items_family_idx on public.shopping_list_items (family_id);
create index shopping_list_items_product_idx on public.shopping_list_items (product_id) where product_id is not null;

-- Compra confirmada (separada da lista: lista criada/itens marcados não são prova de compra).
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  list_id uuid not null unique references public.shopping_lists (id) on delete restrict,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  store_name text,
  created_at timestamptz not null default now()
);
create index purchases_family_idx on public.purchases (family_id, confirmed_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  list_item_id uuid references public.shopping_list_items (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  family_product_id uuid references public.family_products (id) on delete set null,
  name_snapshot text not null,
  brand_snapshot text,
  variant_snapshot text,
  size_label_snapshot text,
  image_ref_snapshot text,
  quantity_purchased numeric(8, 3) not null check (quantity_purchased >= 0),
  created_at timestamptz not null default now()
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_family_product_idx on public.purchase_items (family_id, product_id);

-- Licença/acesso futuro (R$ 10 por família). Escrita só pelo servidor (service role / webhook).
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null default 'family_lifetime',
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked', 'refunded')),
  price_cents integer not null default 1000,
  currency text not null default 'BRL',
  provider text,
  provider_ref text,
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, kind)
);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger families_updated_at before update on public.families for each row execute function public.set_updated_at();
create trigger family_members_updated_at before update on public.family_members for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger family_products_updated_at before update on public.family_products for each row execute function public.set_updated_at();
create trigger shopping_lists_updated_at before update on public.shopping_lists for each row execute function public.set_updated_at();
create trigger shopping_list_items_updated_at before update on public.shopping_list_items for each row execute function public.set_updated_at();
create trigger entitlements_updated_at before update on public.entitlements for each row execute function public.set_updated_at();

-- Itens herdam a família da lista (o valor enviado pelo cliente é ignorado) e não
-- podem apontar para produto particular de outra família.
create or replace function public.shopping_list_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_status public.list_status;
begin
  select l.family_id, l.status into v_family, v_status from public.shopping_lists l where l.id = new.list_id;
  if v_family is null then
    raise exception 'Lista inexistente';
  end if;
  if v_status <> 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status
      or old.quantity_requested is distinct from new.quantity_requested) then
    raise exception 'Lista concluída não pode ser alterada';
  end if;
  new.family_id := v_family;
  if new.family_product_id is not null and not exists (
    select 1 from public.family_products fp where fp.id = new.family_product_id and fp.family_id = v_family
  ) then
    raise exception 'Produto particular de outra família';
  end if;
  if new.status = 'purchased' and new.checked_at is null then
    new.checked_at := now();
    new.checked_by := auth.uid();
  elsif new.status = 'pending' then
    new.checked_at := null;
    new.checked_by := null;
    new.quantity_purchased := null;
  end if;
  return new;
end;
$$;
create trigger shopping_list_items_guard before insert or update on public.shopping_list_items
  for each row execute function public.shopping_list_items_guard();

-- Perfil criado automaticamente para cada novo usuário do Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
