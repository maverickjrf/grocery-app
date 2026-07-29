# Architecture & Context

## Overview
A household grocery price-tracking Progressive Web App. Family members record
prices they observe in stores; the app tracks price history, computes unit
prices, and shows where each product is cheapest. All pricing data is
user-observed — the app does not scrape or auto-look-up external prices.

## Tech Stack
- **Front-end:** Vanilla JavaScript (ES modules), no framework, no build step.
- **Styling:** Hand-written CSS with CSS custom properties; light/dark via
  `prefers-color-scheme`. Material-ish, not a component library.
- **Backend:** Supabase (hosted) — Postgres, Auth, Row Level Security (RLS),
  PostgREST auto-API, RPC functions in PL/pgSQL.
- **Hosting:** GitHub Pages (static) at https://maverickjrf.github.io/grocery-app/
- **Barcode scanning:** `@zxing/browser@0.1.5` + `@zxing/library@0.21.3`,
  loaded as ESM from esm.sh.
- **Supabase client:** `@supabase/supabase-js@2` from jsdelivr ESM.
- **Cost:** Zero. Supabase free tier (no credit card), GitHub Pages free.

## Architectural Decisions (and the why)

### Vanilla JS over a framework
No build tooling means edits deploy by `git push` with nothing to compile.
Chosen for a beginner-maintained project where operational simplicity beats
framework ergonomics. Trade-off accepted: manual DOM rendering.

### Supabase over Firebase
Firebase now requires the Blaze (paid, card-on-file) plan for Storage and Cloud
Functions. Supabase's free tier needs no card and bundles Postgres + Auth +
Storage. Relational Postgres also fits the price-history data model better than
Firestore documents. Trade-off: Supabase has **no built-in offline sync**
(Firestore did) — see "on hold."

### Repository pattern
Every table has a `*Repository` object (`js/*.js`) that is the sole owner of its
Supabase queries. UI never calls Supabase directly. This isolates the backend so
offline support (or a backend swap) can be inserted in one layer later.

### Username-only auth via synthetic email
Supabase Auth is email-based; users only want usernames. A username `brad`
maps to a synthetic address `brad@grocery.local`. Email confirmation is disabled
because these addresses can't receive mail. Consequence: password reset must be
done in the backend (SQL `crypt()` update), which was an accepted, deliberate
choice ("no in-app password reset").

### Multi-tenancy by household, enforced in the database
All domain tables carry `household_id` and are protected by RLS policies keyed on
`current_household_id()`. Isolation is enforced by Postgres, not the client — the
DB refuses to return another household's rows. Households are fully walled off
from each other (cross-household data sharing was considered and rejected).

### Append-only observations with integrity snapshots
Price observations are never overwritten (edits allowed, deletes are soft by
default). Each observation snapshots `package_quantity`/`package_unit`/`base_unit`
at record time so historical unit prices stay correct even if the product is
later edited. Each observation also snapshots `recorded_by_name` so attribution
survives the recorder leaving the household or deleting their account.

### Client-generated UUIDs
Observations get their `id` from `crypto.randomUUID()` on the device, so a record
created offline already has its final identity — groundwork for future offline
sync.

### Unit engine
`js/units.js` holds a single unit table mapping each unit to a dimension, a base
unit (volume→L, weight→kg, count→piece), and a conversion factor. Adding a unit
is a one-line change. Unit price = price / (quantity in base unit). Supported
units: ml, L, fl oz, gallon (volume); mg, g, kg (weight); piece, dozen, pack
(count). Volume units are **US customary** (gallon = 3.78541 L, fl oz =
0.0295735 L) — imperial variants (UK gallon/fl oz differ by ~20%) are
deliberately not offered, a decision to revisit if the household base expands
somewhere imperial units are standard.

### Two-level package model (count × unit-size)
A product's package is `unit_count` sub-units of `unit_size` each — a simple
product (1.5L Coke) is `unit_count = 1`; a multi-unit product (100 softgels of
300mg; 10 sachets of 80g) has `unit_count > 1`. `total_base_quantity` is
`unit_count × unit_size` normalized to the dimension's base unit, and is what
products are sorted/compared by (replacing `normalized_quantity`).
`js/units.js` derives two prices from this, both pure and additive to the
existing single-table design — `pricePerSubunit` (price ÷ count, e.g. ₱/softgel)
and `pricePerBase` (price ÷ total_base_quantity, e.g. ₱/kg). A display ladder
(`scaleQuantity`, `scalePerBasePrice`) restates a large total or a per-base price
at human scale (30000mg → 30g; ₱33,333/kg → ₱33.33/g) without changing what's
stored — each observation's own snapshot decides its own display, so reshaping
a product later never retro-scales old history.

Legacy columns (`package_quantity`, `package_unit`, `normalized_quantity`) are
kept in step by the app for one migration cycle as a rollback safety net — see
`docs/migrations/0008_two_level_package_model.sql`. A later migration removes
them once the new model is proven.

The add/edit product form defaults to exactly the old single-quantity layout
(Size + Unit); a "This comes in multiples" toggle reveals the Count field.
Package display format: `1.5L` when count = 1 (unchanged), `10 × 80g (800g)`
when count > 1 — count, size of each, computed total in parentheses.

### Product families
Variants of the same item (Coca-Cola 330ml / 1.5L / 2L) are grouped by an
auto-managed `product_families` row, matched case-insensitively on (brand, name).
An orphan-cleanup trigger deletes families when their last product leaves.

### Type-ahead for data cleanliness
Free-text fields (product name, brand, category, store name) get type-ahead fed
by `suggest_*` RPCs returning existing distinct values, steering users toward one
canonical spelling instead of spawning "Coke" vs "Coca-Cola" after the fact.

### Navigation & history
`js/nav.js` is a small stack (`pushScreen`, `pushModal`, `goBack`,
`modalController`) kept in lockstep with `history.pushState`/`popstate`, so
the hardware/browser Back button and the app's own back arrows / modal-close
controls always run the same code path — Back closes the top modal before it
ever navigates a screen, and only leaves the app once the stack is empty
(i.e. from Home). Two rules keep it correct:
- `pushScreen`/`pushModal` is called **once per genuine entry** (a button or
  list item opening a screen/modal) — never from a function that merely
  repaints an already-entered level (search filtering, a post-save refresh,
  or restoring a screen when something deeper is popped). Screens that redraw
  in place are split into a one-time "show" function and a repaintable
  "paint" function for this reason (see `products_screen.js`,
  `stores_screen.js`).
- Modal close paths (Cancel, backdrop click, a completed save) never remove
  the overlay directly — they call `goBack()`/`modalController`'s returned
  dismiss function, and the actual removal happens in the `pushModal`
  callback, which is the single place a modal ever tears down, however it was
  triggered. `modalController` guards against a slow in-flight save calling
  dismiss again after hardware Back already closed the modal.
- Home is the root: it never calls `pushScreen`, so Back from Home is the
  browser's native behavior (leaves the app). Pre-login screens (sign-in/up,
  create/join household) are intentionally out of scope — Back there is
  unchanged from before.

### Invite security
Invite codes are 10 chars from an ambiguity-free alphabet (no O/0, I/1/L), expire
after 3 days, and support retire/rotate. Join returns three-way feedback: valid /
real-but-expired-or-retired / not-a-code — the "expired" message is only shown for
codes that genuinely existed, to avoid leaking which codes are real.

## Implemented Features
- Auth: username/password sign-up, sign-in, sign-out (synthetic email).
- Households: create, join by invite code, explicit leave/switch (confirmed),
  membership history, invite retire/rotate with 3-day expiry.
- Stores: create, edit, archive/restore, type-ahead on name.
- Products: create, edit, archive/restore, permanent-delete when price-free;
  product families (auto), type-ahead on name/brand/category, product search.
- Barcode scanning: camera scan (phone), lookup by barcode against own DB only,
  scan-to-prefill new product, continuous "scan next" shopping loop.
- Price observations: record with auto unit-price, edit, soft-delete or
  permanent-delete, all with confirmation. Package-size + recorder-name snapshots.
- Product detail: full price history (newest first) with attribution, and a
  sortable "Where to buy" store comparison (cheapest / most recent).
- Shopping mode: set current store (persisted on device), scan → found panel with
  cheapest-store insight → record price with current store pre-selected.

## On Hold (architected for, not built)
- **Offline support** — app-shell caching (service worker/PWA) and offline
  record-and-sync. Groundwork laid: repository pattern, client UUIDs, `updated_at`
  and soft-delete columns on all tables. Supabase has no native sync, so this is a
  real build (likely RxDB or a hand-rolled IndexedDB queue) deferred to its own phase.
- **Product photos** — Supabase Storage free tier available; `photo_url` column
  exists but unused. User leaning toward scrapping to save resources.
- **Dashboard & price-trend charts** — next up.
- **Analytics** — price-increase detection, inflation tracking, store comparison
  ranking, best-value-per-package, volatility.
- **Phase 3 smart features** — favorites, shopping basket, per-store basket
  optimization, price-change alerts/notifications, CSV/Excel export, anomaly
  detection.
- **Rejected outright** — cross-household price sharing (store-name matching
  unreliable, privacy leak), multi-household membership (one active household per
  user), adopt/copy stores-with-prices (seeds untrustworthy data), curated starter
  catalog (maintenance burden).
