# Database migrations

These numbered SQL files are the **source of truth for the live Supabase
schema**. They were reconstructed from `pg_get_functiondef` (every
`public` function) and `pg_policies` (every `public` table) pulled from
the live project, cross-checked against `docs/schema.md`.

## Rules

- Run in numeric order against a fresh Supabase project — later files
  depend on tables/functions created by earlier ones (see the ordering
  notes inside 0002, 0006, and 0007 for the two cases where a
  `SECURITY DEFINER` / `LANGUAGE sql` function's catalog dependency
  forced a table or policy into a later file than its "theme" file).
- Every statement is idempotent (`create or replace`, `if not exists`,
  `drop policy/trigger if exists`) so the whole folder can be re-run
  top to bottom without erroring on a project that already has some or
  all of it applied.
- Function bodies are copied verbatim from the live database. Don't
  "fix" or refactor logic in these files without first changing it live
  and re-extracting — these files must always match what's actually
  deployed.
- SQL is **not** version-controlled automatically (see root
  `CLAUDE.md`). When you change anything in the Supabase SQL editor, add
  a new numbered file here in the same change — don't edit an old file
  after it's been applied to production, since these files won't be
  silently re-run.
- GRANT statements are intentionally absent — none were present in the
  extracted `pg_policies`/function data this folder was built from.
  Table privileges to `anon`/`authenticated` are assumed to already
  exist on the live project; verify before relying on this folder alone
  to provision a fresh one.

## Files

| File | Contents |
|---|---|
| `0001_extensions_and_helpers.sql` | Generic trigger/utility helpers with no table dependency (`touch_updated_at`, `generate_invite_code`). |
| `0002_households_and_profiles.sql` | `households`, `profiles`, `current_household_id()`, signup trigger, `create_household()`. |
| `0003_stores.sql` | `stores` table + RLS + `suggest_store_names()`. |
| `0004_product_families_and_products.sql` | `product_families`, `products`, family lookup/cleanup functions, `suggest_brands/categories/product_names()`. |
| `0005_observations.sql` | `observations` table + RLS (append-only, soft-delete via `is_deleted`). |
| `0006_invite_security.sql` | `retired_codes`, `rotate_invite_code()`, `retire_invite_code()`, `join_household()`. |
| `0007_membership_and_attribution.sql` | `household_memberships`, `shares_household_history()`, `leave_household()`, `set_observation_recorder()`, and the `profiles` SELECT policy (deferred from 0002). |
| `0008_two_level_package_model.sql` | Adds `unit_count`/`unit_size`/`unit_size_unit`/`total_base_quantity` to `products` and the matching snapshot + `calculated_price_per_subunit` to `observations`; backfills every existing row as `unit_count = 1`. Legacy `package_quantity`/`package_unit`/`normalized_quantity` columns kept as a rollback net for one cycle. No RLS changes (row-level policies cover new columns automatically). |
