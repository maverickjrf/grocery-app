-- 0004_product_families_and_products.sql

create table if not exists public.product_families (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) default public.current_household_id(),
  brand text,
  name text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) default public.current_household_id(),
  family_id uuid references public.product_families(id),
  barcode text,
  name text not null,
  brand text,
  category text,
  package_quantity numeric not null,
  package_unit text not null,
  base_unit text not null,
  normalized_quantity numeric not null,
  photo_url text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_household_idx on public.products (household_id);
create index if not exists products_barcode_idx on public.products (household_id, barcode);

drop trigger if exists product_families_touch on public.product_families;
create trigger product_families_touch
  before update on public.product_families
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- find_or_create_family: case-insensitive lookup on (brand, name) scoped
-- to the caller's household; creates the family row if none matches.
create or replace function public.find_or_create_family(p_brand text, p_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare fid uuid;
begin
  select id into fid from public.product_families
  where household_id = public.current_household_id()
    and coalesce(lower(brand), '') = coalesce(lower(trim(p_brand)), '')
    and lower(name) = lower(trim(p_name))
  limit 1;
  if fid is null then
    insert into public.product_families (brand, name)
    values (nullif(trim(p_brand), ''), trim(p_name))
    returning id into fid;
  end if;
  return fid;
end; $function$;

-- cleanup_orphan_family: deletes a product_families row once its last
-- product is reassigned or removed. Attached AFTER UPDATE/DELETE below
-- (trigger name and timing per docs/schema.md).
create or replace function public.cleanup_orphan_family()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.family_id is not null
     and (tg_op = 'DELETE' or new.family_id is distinct from old.family_id) then
    if not exists (select 1 from public.products where family_id = old.family_id) then
      delete from public.product_families where id = old.family_id;
    end if;
  end if;
  return coalesce(new, old);
end; $function$;

drop trigger if exists products_cleanup_family on public.products;
create trigger products_cleanup_family
  after update or delete on public.products
  for each row execute function public.cleanup_orphan_family();

alter table public.product_families enable row level security;
alter table public.products enable row level security;

drop policy if exists "read households families" on public.product_families;
create policy "read households families" on public.product_families
  for select
  using (household_id = current_household_id());

drop policy if exists "insert household families" on public.product_families;
create policy "insert household families" on public.product_families
  for insert
  with check (household_id = current_household_id());

drop policy if exists "update household families" on public.product_families;
create policy "update household families" on public.product_families
  for update
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- No DELETE policy on product_families: rows are removed only by
-- cleanup_orphan_family() (SECURITY DEFINER trigger), never directly.

drop policy if exists "read household products" on public.products;
create policy "read household products" on public.products
  for select
  using (household_id = current_household_id());

drop policy if exists "insert household products" on public.products;
create policy "insert household products" on public.products
  for insert
  with check (household_id = current_household_id());

drop policy if exists "update household products" on public.products;
create policy "update household products" on public.products
  for update
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists "delete household products" on public.products;
create policy "delete household products" on public.products
  for delete
  using (household_id = current_household_id());

-- suggest_brands / suggest_categories / suggest_product_names:
-- LANGUAGE sql, require `products` to exist — safe here since it's
-- created above in this same file.
create or replace function public.suggest_brands(p_query text default ''::text)
returns table(brand text)
language sql
stable security definer
set search_path to ''
as $function$
  select distinct brand from public.products
  where household_id = public.current_household_id()
    and brand is not null and brand <> ''
    and (p_query = '' or brand ilike '%' || p_query || '%')
  order by brand limit 8;
$function$;

create or replace function public.suggest_categories(p_query text default ''::text)
returns table(category text)
language sql
stable security definer
set search_path to ''
as $function$
  select distinct category from public.products
  where household_id = public.current_household_id()
    and category is not null and category <> ''
    and (p_query = '' or category ilike '%' || p_query || '%')
  order by category limit 8;
$function$;

create or replace function public.suggest_product_names(p_query text default ''::text)
returns table(name text)
language sql
stable security definer
set search_path to ''
as $function$
  select distinct name from public.products
  where household_id = public.current_household_id()
    and archived = false
    and (p_query = '' or name ilike '%' || p_query || '%')
  order by name limit 8;
$function$;
