-- 0008_two_level_package_model.sql
--
-- Two-level package model: a package is `unit_count` sub-units of `unit_size`
-- each (100 softgels of 300mg; 10 sachets of 80g). Simple products are just
-- unit_count = 1, which is how every existing row is backfilled.
--
-- NO RLS CHANGES ARE NEEDED and none are made. This adds columns to two
-- existing tables; the policies on public.products and public.observations are
-- row-level (household_id = current_household_id()) and cover new columns
-- automatically. That omission is deliberate, not an oversight.
--
-- The legacy columns (package_quantity, package_unit, normalized_quantity) are
-- deliberately KEPT and kept in step by the app for one migration cycle, as a
-- rollback safety net. A later migration drops them once this model is proven.
--
-- Note there is not a single unit conversion factor in this file. The backfill
-- reuses normalized_quantity, which js/units.js already computed at write time
-- and which is by definition equal to the new total_base_quantity when
-- unit_count = 1. js/units.js therefore stays the only unit table in the system.
--
-- Idempotent: safe to re-run top to bottom.

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists unit_count numeric;
alter table public.products add column if not exists unit_size numeric;
alter table public.products add column if not exists unit_size_unit text;
alter table public.products add column if not exists total_base_quantity numeric;

-- Backfill every existing product as the simple case. No data is lost or moved:
-- the legacy columns are left exactly as they are.
update public.products set
  unit_count = 1,
  unit_size = package_quantity,
  unit_size_unit = package_unit,
  total_base_quantity = normalized_quantity
where unit_size is null;

alter table public.products alter column unit_count set default 1;
alter table public.products alter column unit_count set not null;
alter table public.products alter column unit_size set not null;
alter table public.products alter column unit_size_unit set not null;
alter table public.products alter column total_base_quantity set not null;

alter table public.products drop constraint if exists products_unit_count_positive;
alter table public.products add constraint products_unit_count_positive
  check (unit_count > 0);
alter table public.products drop constraint if exists products_unit_size_positive;
alter table public.products add constraint products_unit_size_positive
  check (unit_size > 0);

-- unit_size_unit is intentionally NOT constrained to an enumerated list here.
-- js/units.js is the single unit registry (see CLAUDE.md: "adding a unit = one
-- table entry"); a CHECK here would make every future unit a two-place change.

-- Products are listed smallest-package-first within a name.
create index if not exists products_total_qty_idx
  on public.products (household_id, total_base_quantity);

-- ---------------------------------------------------------------------------
-- observations — extend the package snapshot
-- ---------------------------------------------------------------------------

alter table public.observations add column if not exists unit_count numeric;
alter table public.observations add column if not exists unit_size numeric;
alter table public.observations add column if not exists unit_size_unit text;
alter table public.observations add column if not exists calculated_price_per_subunit numeric;

-- Existing observations were all single-unit packages, so the price of one
-- sub-unit is the observed price itself (price / 1). calculated_unit_price is
-- untouched: it keeps its existing meaning (price per base unit), so no
-- historical unit price changes as a result of this migration.
update public.observations set
  unit_count = 1,
  unit_size = package_quantity,
  unit_size_unit = package_unit,
  calculated_price_per_subunit = observed_price
where unit_size is null;

alter table public.observations alter column unit_count set default 1;
alter table public.observations alter column unit_count set not null;
alter table public.observations alter column unit_size set not null;
alter table public.observations alter column unit_size_unit set not null;

alter table public.observations drop constraint if exists observations_unit_count_positive;
alter table public.observations add constraint observations_unit_count_positive
  check (unit_count > 0);
alter table public.observations drop constraint if exists observations_unit_size_positive;
alter table public.observations add constraint observations_unit_size_positive
  check (unit_size > 0);

-- ---------------------------------------------------------------------------
-- Verification (run these after the migration; both should return 0 rows)
-- ---------------------------------------------------------------------------
-- Every product's new total must equal its old normalized quantity:
--   select id, name, normalized_quantity, total_base_quantity
--     from public.products
--    where total_base_quantity is distinct from normalized_quantity;
--
-- No observation's stored unit price may have moved:
--   select id, observed_price, calculated_unit_price, calculated_price_per_subunit
--     from public.observations
--    where unit_count = 1
--      and calculated_price_per_subunit is distinct from observed_price;
