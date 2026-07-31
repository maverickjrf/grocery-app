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
- **Supabase client:** `@supabase/supabase-js@2.111.0` from jsdelivr ESM.
- **Offline:** `sw.js` caches the app shell (Spec 6, Merge A). Data caching
  and offline writes are Merge B and not built yet.
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
default). Each observation snapshots `unit_count`/`unit_size`/`unit_size_unit`/
`base_unit` at record time (see "Two-level package model" below) so historical
unit prices stay correct even if the product is later edited. Each observation
also snapshots `recorded_by_name` so attribution survives the recorder leaving
the household or deleting their account.

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

### Offline: app shell (Spec 6, Merge A)
`sw.js` sits at the repo root so its scope is the GitHub Pages subpath
`/grocery-app/`. Registered from `js/sw_register.js`, after `load`, wrapped so
a failure only costs offline support and never start-up.

Per request kind: same-origin shell files are **stale-while-revalidate**;
navigations serve the cached `index.html`; the CDN module hosts
(`cdn.jsdelivr.net`, `esm.sh`) are **cache-first, filled at runtime**;
`*.supabase.co` is **network-only and never cached**.

Two decisions worth keeping straight:
- **CDN modules are not precached.** esm.sh answers with a shim that
  re-exports deeper versioned files, so caching the entry URL alone leaves a
  broken module graph offline. Runtime caching captures the whole graph on
  first online use, whatever shape it has. This is why the acceptance bar is
  "works offline once the app has been opened online at least once".
- **Freshness does not depend on remembering to bump a version.** With no
  build step nothing is content-hashed, so a hand-bumped cache version would
  make one forgotten bump pin every user to stale JS permanently. Instead
  each response is revalidated in the background and a changed
  `ETag`/`Last-Modified` raises the reload prompt. `CACHE_VERSION` remains
  only as a hard reset.

`?sw=off` unregisters the worker and clears every cache — the documented
recovery route (see [docs/DEPLOYMENT.md](DEPLOYMENT.md)).

Note the whole zxing barcode graph currently loads at boot, because
`products_screen.js` imports `scanner.js` statically. Making that a dynamic
import would shrink the offline-critical surface considerably; not done yet.

### Offline: local data (Spec 6, Merge B1)
`js/local_db.js` keeps a copy of household data in IndexedDB so screens have
something to show with no network. `js/connectivity.js` owns the offline
state and the "Offline — showing saved data" bar.

**There is no sync engine, deliberately.** Every read is
network-first-then-save, so ordinary use of the app *is* the sync, and each
fetch replaces the saved copy wholesale — which means a row deleted on the
server simply isn't in the next fetch. The originally specced design tracked
an `updated_at` watermark per table and pulled deltas, which then required a
second mechanism to notice hard-deleted rows. At household scale (hundreds of
products, low thousands of prices) that bought nothing and cost the two
fiddliest bugs in the design.

Every cached read goes through one helper, `readThrough`:
1. Try the network, with an 8s timeout.
2. Success → save the rows, clear the offline flag, return them.
3. **Network failure or timeout** → set the offline flag and return the saved
   copy. If nothing is saved, rethrow so the screen shows a real error.
4. **Anything with a Postgres error code** → rethrow untouched. An RLS denial
   or a validation failure is the server answering, not a missing network,
   and must never be masked by stale data.

Offline is detected by requests failing, **not** by `navigator.onLine`, which
reports "online" for a phone holding a connection that carries no traffic —
exactly the dead-zone case. The browser is trusted when it says the
connection dropped, not when it claims to have one.

Two consequences worth knowing:
- Products and stores are fetched unfiltered (archived included) and filtered
  in JS, so one saved copy serves both the normal and "show archived" views.
- Price history is saved exactly as the server returns it, embedded store
  name and all, so no join is rebuilt offline. A store renamed while offline
  shows its old name in history until the next successful fetch.

**The cache is warmed deliberately, once per session, from Home**
(`warmOfflineCopy` in `js/app.js`): all products, and the household's whole
price history. A cache filled only by whatever screens someone happened to
open is backwards — the product wanted in a dead zone is the one they have
*not* just been reading about. History is warmed once per session rather than
per Home visit because it is the largest table here.

`meta.historyWarmedAt` records that the full history was saved, which is what
lets an empty result for a product mean "no prices recorded yet" instead of
"not saved on this device". `readThrough`'s `emptyIsAnswer` option carries
that distinction; without it every empty cached read looks like a gap.

A `generation` counter in `local_db.js` is bumped on every wipe, and any save
whose fetch began before the wipe is discarded — otherwise the background
warm-up could repopulate the store moments after sign-out cleared it.

The cache is wiped whenever `meta.householdId` changes and on sign-out — a
stale cache from a household the user has left is a privacy problem, not just
a wrong number.

`getMyHousehold` is cached because it is the first call after start-up and
the router treated *any* failure as "not signed in", so losing signal used to
drop the user on the login screen. Its invite code is deliberately **not**
served from cache: a stale invite code is worse than none.

Not built yet (Merge B2): offline writes. Recording a price still needs a
connection. `local_db.js` creates an empty `outbox` object store now, since
adding one later would mean an IndexedDB version bump.

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
- **Offline data & sync (Spec 6, Merge B)** — app-shell caching is now built
  (see "Offline: app shell" above); the data half is not. Still to come:
  IndexedDB cache, an outbox for writes made offline, a sync engine, and
  offline-safe auth. Groundwork laid: repository pattern, client UUIDs,
  `updated_at` and soft-delete columns on all tables. Supabase has no native
  sync, so this is a hand-rolled IndexedDB queue — RxDB is ruled out by the
  no-bundler constraint. Full design in [docs/ROADMAP.md](ROADMAP.md).
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
