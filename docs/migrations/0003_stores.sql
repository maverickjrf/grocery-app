-- 0003_stores.sql

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) default public.current_household_id(),
  name text not null,
  location text,
  archived boolean not null default false,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists stores_touch on public.stores;
create trigger stores_touch
  before update on public.stores
  for each row execute function public.touch_updated_at();

alter table public.stores enable row level security;

drop policy if exists "read household stores" on public.stores;
create policy "read household stores" on public.stores
  for select
  using (household_id = current_household_id());

drop policy if exists "insert household stores" on public.stores;
create policy "insert household stores" on public.stores
  for insert
  with check (household_id = current_household_id());

drop policy if exists "update household stores" on public.stores;
create policy "update household stores" on public.stores
  for update
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- No DELETE policy: stores are archived (soft-delete via `archived`),
-- never removed, per docs/schema.md.

-- suggest_store_names: LANGUAGE sql, requires `stores` to exist — safe
-- here since it's created above in this same file.
create or replace function public.suggest_store_names(p_query text default ''::text)
returns table(name text)
language sql
stable security definer
set search_path to ''
as $function$
  select distinct name from public.stores
  where household_id = public.current_household_id()
    and archived = false
    and (p_query = '' or name ilike '%' || p_query || '%')
  order by name limit 8;
$function$;
