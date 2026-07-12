-- 0005_observations.sql
-- Append-only price observations. Soft-delete only (is_deleted), per
-- CLAUDE.md. The recorded_by_name attribution trigger
-- (set_observation_recorder) is created in 0007 alongside the rest of
-- the membership/attribution logic it supports, and attached to this
-- table's INSERT there.

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) default public.current_household_id(),
  product_id uuid not null references public.products(id),
  store_id uuid not null references public.stores(id),
  observed_price numeric not null,
  quantity_purchased numeric,
  calculated_unit_price numeric not null,
  package_quantity numeric not null,
  package_unit text not null,
  base_unit text not null,
  observation_date date not null default current_date,
  source text not null default 'price_update',
  notes text,
  observed_by uuid not null references public.profiles(id) default auth.uid(),
  recorded_by_name text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists observations_product_idx
  on public.observations (product_id, observation_date desc);
create index if not exists observations_household_idx
  on public.observations (household_id);

drop trigger if exists observations_touch on public.observations;
create trigger observations_touch
  before update on public.observations
  for each row execute function public.touch_updated_at();

alter table public.observations enable row level security;

drop policy if exists "read household observations" on public.observations;
create policy "read household observations" on public.observations
  for select
  using (household_id = current_household_id());

drop policy if exists "insert household observations" on public.observations;
create policy "insert household observations" on public.observations
  for insert
  with check (household_id = current_household_id());

drop policy if exists "update household observations" on public.observations;
create policy "update household observations" on public.observations
  for update
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists "delete household observations" on public.observations;
create policy "delete household observations" on public.observations
  for delete
  using (household_id = current_household_id());
