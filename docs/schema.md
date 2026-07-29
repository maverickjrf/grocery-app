# Database Schema (Supabase / Postgres)

All domain tables are protected by Row Level Security. Unless noted, policies
restrict rows to `household_id = public.current_household_id()`.

## Helper functions
- `current_household_id() → uuid` — SECURITY DEFINER; the caller's household from
  their profile. Basis of every RLS policy.
- `shares_household_history(uuid) → boolean` — true if that user is a current or
  past member of the caller's household (drives past-member profile reads).
- `generate_invite_code() → text` — 10 chars, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- `touch_updated_at()` — trigger fn, sets `updated_at = now()` on update.
- `find_or_create_family(p_brand, p_name) → uuid` — returns existing family id for
  (brand, name) case-insensitively, else creates one.
- `cleanup_orphan_family()` — trigger fn, deletes a family with no products left.
- `set_observation_recorder()` — trigger fn, fills `recorded_by_name` on insert.
- RPCs: `create_household(text)`, `join_household(text)`, `leave_household()`,
  `rotate_invite_code()`, `retire_invite_code()`,
  `suggest_product_names/brands/store_names/categories(text)`.

## Tables

### auth.users (Supabase-managed)
Standard Supabase auth. Email = synthetic `<username>@grocery.local`.
Password reset via SQL: `update auth.users set encrypted_password =
crypt('newpw', gen_salt('bf')) where email = '<u>@grocery.local'`.

### public.profiles
One row per user; extends auth.users.
| column        | type        | notes                                    |
|---------------|-------------|-------------------------------------------|
| id            | uuid PK     | = auth.users.id, ON DELETE CASCADE       |
| username      | text NOT NULL |                                        |
| display_name  | text        |                                          |
| household_id  | uuid FK     | → households.id (nullable when no household) |
| role          | text NOT NULL default 'member' | 'owner' | 'member'      |
| created_at    | timestamptz NOT NULL default now() |                   |
| updated_at    | timestamptz NOT NULL default now() |                   |
- Auto-created on signup by trigger `on_auth_user_created` →
  `handle_new_user()` (username/display_name from email local-part).
- RLS SELECT: `id = auth.uid() OR shares_household_history(profiles.id)`.
- RLS UPDATE: `id = auth.uid()`.

### public.households
| column            | type        | notes                              |
|-------------------|-------------|-------------------------------------|
| id                | uuid PK     | default gen_random_uuid()          |
| name              | text NOT NULL |                                  |
| invite_code       | text        | unique when set; nullable if retired |
| invite_expires_at | timestamptz | null = no active invite            |
| created_by        | uuid FK     | → auth.users.id                    |
| created_at        | timestamptz NOT NULL default now() |               |
| updated_at        | timestamptz NOT NULL default now() |               |
- RLS SELECT: `id = current_household_id()`.
- Writes go through SECURITY DEFINER RPCs, not direct table access.

### public.household_memberships
Remembers every household a user was ever in (for past-member attribution).
| column       | type        | notes                          |
|--------------|-------------|----------------------------------|
| household_id | uuid        | FK → households.id, CASCADE    |
| user_id      | uuid        | FK → profiles.id, CASCADE      |
| joined_at    | timestamptz NOT NULL default now() |         |
- PK (household_id, user_id). RLS SELECT: `user_id = auth.uid()`.

### public.stores
| column       | type        | notes                                   |
|--------------|-------------|--------------------------------------------|
| id           | uuid PK     | default gen_random_uuid()               |
| household_id | uuid NOT NULL | FK → households.id; default current_household_id() |
| name         | text NOT NULL |                                       |
| location     | text        |                                         |
| archived     | boolean NOT NULL default false |                        |
| created_by   | uuid NOT NULL | FK → auth.users.id; default auth.uid()  |
| created_at   | timestamptz NOT NULL default now() |                    |
| updated_at   | timestamptz NOT NULL default now() | touch trigger      |
- RLS SELECT/INSERT/UPDATE on household match. No DELETE.

### public.product_families
| column     | type        | notes                                |
|------------|-------------|----------------------------------------|
| id         | uuid PK     | default gen_random_uuid()            |
| household_id | uuid NOT NULL | FK → households.id; default current_household_id() |
| brand      | text        |                                      |
| name       | text NOT NULL |                                    |
| created_by | uuid NOT NULL | default auth.uid()                 |
| created_at | timestamptz NOT NULL default now() |                 |
| updated_at | timestamptz NOT NULL default now() | touch trigger   |
- RLS SELECT/INSERT/UPDATE on household match.

### public.products
| column              | type        | notes                          |
|---------------------|-------------|----------------------------------|
| id                  | uuid PK     | default gen_random_uuid()      |
| household_id        | uuid NOT NULL | FK → households.id; default current_household_id() |
| family_id           | uuid FK     | → product_families.id          |
| barcode             | text        | nullable                       |
| name                | text NOT NULL |                              |
| brand               | text        |                                |
| category            | text        |                                |
| unit_count          | numeric NOT NULL default 1 | sub-units per package (softgels, sachets); simple products = 1; `check > 0` |
| unit_size           | numeric NOT NULL | size of one sub-unit; `check > 0`      |
| unit_size_unit      | text NOT NULL | unit of unit_size, validated client-side against js/units.js |
| base_unit           | text NOT NULL | base unit of unit_size_unit's dimension: L,kg,piece,pack |
| total_base_quantity | numeric NOT NULL | unit_count × unit_size, normalized to base_unit |
| package_quantity    | numeric NOT NULL | legacy; kept one migration cycle as rollback net, see `docs/migrations/0008_two_level_package_model.sql` |
| package_unit        | text NOT NULL | legacy, same note                     |
| normalized_quantity | numeric NOT NULL | legacy, same note                  |
| photo_url           | text        | reserved, unused               |
| archived            | boolean NOT NULL default false |               |
| created_by          | uuid NOT NULL | default auth.uid()           |
| created_at          | timestamptz NOT NULL default now() |          |
| updated_at          | timestamptz NOT NULL default now() | touch trigger |
- Indexes: `products_household_idx(household_id)`,
  `products_barcode_idx(household_id, barcode)`.
- Triggers: `products_touch` (updated_at), `products_cleanup_family`
  (AFTER UPDATE/DELETE → cleanup_orphan_family).
- RLS SELECT/INSERT/UPDATE/DELETE on household match (DELETE added M6; FK from
  observations blocks deleting products that still have prices).

### public.observations  (append-only heart of the app)
| column                | type        | notes                        |
|-----------------------|-------------|---------------------------------|
| id                    | uuid PK     | default gen_random_uuid(); app supplies crypto.randomUUID() |
| household_id          | uuid NOT NULL | FK → households.id; default current_household_id() |
| product_id            | uuid NOT NULL | FK → products.id           |
| store_id              | uuid NOT NULL | FK → stores.id             |
| observed_price        | numeric NOT NULL |                         |
| quantity_purchased    | numeric     | nullable                     |
| calculated_unit_price | numeric NOT NULL | price per base unit      |
| calculated_price_per_subunit | numeric | price per sub-unit (price ÷ unit_count); backfilled = observed_price for legacy rows |
| unit_count            | numeric NOT NULL default 1 | snapshot; `check > 0`  |
| unit_size             | numeric NOT NULL | snapshot                        |
| unit_size_unit        | text NOT NULL | snapshot                          |
| base_unit             | text NOT NULL | snapshot                   |
| package_quantity      | numeric NOT NULL | legacy snapshot, kept one cycle |
| package_unit          | text NOT NULL | legacy snapshot, kept one cycle |
| observation_date      | date NOT NULL default current_date |         |
| source                | text NOT NULL default 'price_update' | 'price_update'|'cart_purchase' |
| notes                 | text        |                              |
| observed_by           | uuid NOT NULL | FK → profiles.id; default auth.uid() |
| recorded_by_name      | text        | username snapshot (trigger-filled) |
| is_deleted            | boolean NOT NULL default false | soft-delete flag |
| created_at            | timestamptz NOT NULL default now() |          |
| updated_at            | timestamptz NOT NULL default now() | touch trigger |
- Indexes: `observations_product_idx(product_id, observation_date desc)`,
  `observations_household_idx(household_id)`.
- Triggers: `observations_touch` (updated_at),
  `observations_set_recorder` (BEFORE INSERT → set_observation_recorder).
- RLS SELECT/INSERT/UPDATE/DELETE on household match.

### public.retired_codes
Archive of retired/rotated invite codes, for "expired" join feedback.
| column       | type        | notes                       |
|--------------|-------------|--------------------------------|
| code         | text PK     |                             |
| household_id | uuid NOT NULL | FK → households.id, CASCADE |
| retired_at   | timestamptz NOT NULL default now() |        |
- RLS enabled, no policies; touched only by SECURITY DEFINER RPCs.

## Relationships (summary)
- profiles.household_id → households.id (a user's active household)
- household_memberships (household_id, user_id) — historical membership
- stores/product_families/products/observations.household_id → households.id
- products.family_id → product_families.id
- observations.product_id → products.id, observations.store_id → stores.id
- observations.observed_by → profiles.id
