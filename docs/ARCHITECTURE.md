# Architecture & Context

## Overview
A grocery price-tracking Progressive Web App. You record prices you see in
stores; the app tracks price history, computes unit prices, and shows where
each product is cheapest. All pricing data is user-observed — the app does not
scrape or auto-look-up external prices.

Single user, single device. The database lives on the phone (IndexedDB); there
is no server, no account and no sign-in.

## Tech Stack
- **Front-end:** Vanilla JavaScript (ES modules), no framework, no build step.
- **Styling:** Hand-written CSS with CSS custom properties; light/dark via
  `prefers-color-scheme`. Material-ish, not a component library.
- **Database:** IndexedDB in the browser, via a small raw wrapper
  (`js/local_db.js`). No backend.
- **Hosting:** GitHub Pages (static) at https://maverickjrf.github.io/grocery-app/
- **Barcode scanning:** `@zxing/browser@0.1.5` + `@zxing/library@0.21.3`,
  loaded as ESM from esm.sh — the only external dependency.
- **Offline:** total. `sw.js` caches the app shell; the data was never online.
- **Target device:** Android (Samsung), **Samsung Internet** — the real data
  lives in that browser's storage; Chrome on the same phone would see an
  empty database (see "Local-first").
- **Cost:** Zero. GitHub Pages free.

## Architectural Decisions (and the why)

### Vanilla JS over a framework
No build tooling means edits deploy by `git push` with nothing to compile.
Chosen for a beginner-maintained project where operational simplicity beats
framework ergonomics. Trade-off accepted: manual DOM rendering.

### Local-first: the database is on the device
Decided 2026-11-10. The app originally ran on Supabase's free tier (Postgres +
Auth + RLS, multi-user households). It stopped being used, and the reason was
operational, not functional: the free tier pauses a project after ~7 days
without traffic, so irregular use meant arriving at the supermarket to a
sleeping database. A grocery app that needs a server warmed up before shopping
has the dependency backwards.

So IndexedDB is the source of truth, not a cache. Nothing on the read or write
path touches the network, which also means there is no offline mode to
design — every screen works the same in a dead zone as at home.

What went with the server:
- **Auth and households, entirely.** There is no second user and nothing to
  protect from anyone but whoever holds the phone. The app boots straight to
  Home.
- **RLS, RPCs and migrations.** Integrity rules the database used to enforce
  now live in the repositories (e.g. a product with prices can't be
  permanently deleted — the old foreign key's job).
- **Product families.** `family_id` was written on every product save and never
  read by anything.
- **The legacy package columns** (`package_quantity`, `package_unit`,
  `normalized_quantity`), which had been kept one cycle as a rollback net.

What was kept on purpose:
- **Row shapes stay snake_case, server-style**, package snapshots intact. If an
  online database is ever wanted again, moving rows there is a plain insert.
  No sync engine is built, and none should be until there is a concrete need.
- **The repository signatures**, so the screens did not change.

**Why Android/Chrome matters.** iOS Safari deletes a site's IndexedDB after 7
days without a visit — the exact failure being fixed, except destructively.
Chrome on Android has no inactivity timer and evicts only under real storage
pressure. `navigator.storage.persist()` is requested on every boot (Chrome
grants it silently to an installed PWA). Revisit all of this if an iPhone
ever enters the picture.

**Backups are core, not an extra.** Local-only data is one wiped browser
profile or lost phone away from total loss. "Backup & restore" (`js/backup.js`,
`js/data_screen.js`) writes everything to one JSON file and reads it back; Home
nudges after 14 days without one. The same parser reads the one-off export
taken from Supabase before it was retired. Restore **replaces**, never merges —
merging two copies of the same data would need conflict rules this app has no
use for — and is confirmed first, with a "back up this device first" option.
The parser keeps a fixed column list per table, so whatever extra fields a
file carries (the Supabase export had `household_id`, `created_by`, …) are
dropped, and it refuses a file whose prices point at missing products or
stores rather than half-importing it.

Upgrading from the old v1 IndexedDB (the Supabase-era offline cache) clears
it: those rows were partial copies in the wrong shape, and the real data
arrives by restoring the export.

### Repository pattern
Every table has a `*Repository` object (`js/*.js`) that is the sole owner of its
data access. UI never touches IndexedDB directly. This is what made the move
off Supabase a change to four files rather than to every screen, and it is the
seam to use if a server is ever added back.

### Append-only observations with integrity snapshots
Price observations are never overwritten (edits allowed, deletes are soft by
default). Each observation snapshots `unit_count`/`unit_size`/`unit_size_unit`/
`base_unit` at record time (see "Two-level package model" below) so historical
unit prices stay correct even if the product is later edited. Prices imported
from the household era also carry `recorded_by_name`, which is still shown;
new prices leave it null.

### Client-generated UUIDs
Every record's `id` comes from `crypto.randomUUID()` on the device (with a
`getRandomValues` fallback for non-secure contexts), so ids never collide if
data from two devices is ever combined.

### Unit engine
`js/units.js` holds a single unit table mapping each unit to a dimension, a base
unit (volume→L, weight→kg, count→piece), and a conversion factor. Adding a unit
is a one-line change. Unit price = price / (quantity in base unit). Supported
units: ml, L, fl oz, gallon (volume); mg, g, kg (weight); piece, dozen, pack
(count). Volume units are **US customary** (gallon = 3.78541 L, fl oz =
0.0295735 L) — imperial variants (UK gallon/fl oz differ by ~20%) are
deliberately not offered.

### Two-level package model (count × unit-size)
A product's package is `unit_count` sub-units of `unit_size` each — a simple
product (1.5L Coke) is `unit_count = 1`; a multi-unit product (100 softgels of
300mg; 10 sachets of 80g) has `unit_count > 1`. `total_base_quantity` is
`unit_count × unit_size` normalized to the dimension's base unit, and is what
products are sorted/compared by.
`js/units.js` derives two prices from this — `pricePerSubunit` (price ÷ count,
e.g. ₱/softgel) and `pricePerBase` (price ÷ total_base_quantity, e.g. ₱/kg). A
display ladder (`scaleQuantity`, `scalePerBasePrice`) restates a large total or
a per-base price at human scale (30000mg → 30g; ₱33,333/kg → ₱33.33/g) without
changing what's stored — each observation's own snapshot decides its own
display, so reshaping a product later never retro-scales old history.

The add/edit product form defaults to the single-quantity layout (Size +
Unit); a "This comes in multiples" toggle reveals the Count field. Package
display format: `1.5L` when count = 1, `10 × 80g (800g)` when count > 1.

### Barcode matching on a GTIN-14 key
UPC-A (12), EAN-13 and ITF-14 can be the same number differing only by
leading zeros, and the label, the scanner and a human typing can each produce
a different length. `gtinKey` in `js/products.js` reduces 12-14 digit codes to
the zero-padded 14-digit form and lookups compare on that. Anything else
(EAN-8, alphanumeric) matches literally. A non-zero ITF-14 indicator digit (a
carton, not a unit) stays a distinct product. There is no barcode index: the
key has to be computed for every stored code anyway, and a scan over a few
hundred products is instant.

### Type-ahead for data cleanliness
Free-text fields (product name, brand, category, store name) get type-ahead
from the existing distinct values (`js/suggest.js`, read through the
repositories), steering toward one canonical spelling instead of spawning
"Coke" vs "Coca-Cola". Matching is case-insensitive substring, as the old
server-side ILIKE was; product and store names skip archived rows, brands and
categories don't.

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
  `stores_screen.js`, `data_screen.js`).
- Modal close paths (Cancel, backdrop click, a completed save) never remove
  the overlay directly — they call `goBack()`/`modalController`'s returned
  dismiss function, and the actual removal happens in the `pushModal`
  callback, which is the single place a modal ever tears down, however it was
  triggered. `modalController` guards against a slow in-flight save calling
  dismiss again after hardware Back already closed the modal.
- Home is the root: it never calls `pushScreen`, so Back from Home is the
  browser's native behavior (leaves the app).

### App shell caching (service worker)
`sw.js` sits at the repo root so its scope is the GitHub Pages subpath
`/grocery-app/`. Registered from `js/sw_register.js`, after `load`, wrapped so
a failure only costs offline start-up and never start-up itself.

Per request kind: same-origin shell files are **stale-while-revalidate**;
navigations serve the cached `index.html`; the CDN module host (`esm.sh`, for
zxing) is **cache-first, filled at runtime**.

Two decisions worth keeping straight:
- **CDN modules are not precached.** esm.sh answers with a shim that
  re-exports deeper versioned files, so caching the entry URL alone leaves a
  broken module graph offline. Runtime caching captures the whole graph on
  first online use. So the scanner works offline once it has been used online
  at least once; everything else works offline from the first install.
- **Freshness does not depend on remembering to bump a version.** With no
  build step nothing is content-hashed, so a hand-bumped cache version would
  make one forgotten bump pin every user to stale JS permanently. Instead
  each response is revalidated in the background and a changed
  `ETag`/`Last-Modified` raises the reload prompt. `CACHE_VERSION` remains
  only as a hard reset.

`?sw=off` unregisters the worker and clears every cache — the documented
recovery route (see [docs/DEPLOYMENT.md](DEPLOYMENT.md)). It deliberately
never touches IndexedDB, which holds the only copy of the data.

The whole zxing barcode graph currently loads at boot, because
`products_screen.js` imports `scanner.js` statically. Making that a dynamic
import would cut boot cost considerably; not done yet.

## Implemented Features
- Stores: create, edit, archive/restore, type-ahead on name.
- Products: create, edit, archive/restore, permanent-delete when price-free;
  type-ahead on name/brand/category, product search.
- Barcode scanning: camera scan (phone), lookup by GTIN key, scan-to-prefill
  new product, continuous "scan next" shopping loop.
- Price observations: record with auto unit-price, edit, soft-delete or
  permanent-delete, all with confirmation. Package-size snapshots.
- Product detail: full price history (newest first), and a sortable "Where to
  buy" store comparison (cheapest / most recent).
- Shopping mode: set current store (persisted on device), scan → found panel with
  cheapest-store insight → record price with current store pre-selected.
- Backup & restore: one-file backup/restore, reads the old Supabase export,
  backup-age nudge on Home, persistent-storage request.

## On Hold (not built)
- **Sales / promos (Spec 5)** — next. Easier now: new columns are a code
  change, not a migration run by hand.
- **Dashboard & price-trend charts** (Milestone A).
- **Analytics** — price-increase detection, inflation tracking, store comparison
  ranking, best-value-per-package, volatility.
- **Phase 3 smart features** — favorites, shopping basket, per-store basket
  optimization, price-change alerts, CSV export, anomaly detection.
- **Product photos** — dropped along with Supabase Storage; would need to live
  in IndexedDB as blobs, which also bloats backups. Unlikely.
- **Sync / a server again** — only if a concrete reason appears (a second
  device or person). The row shapes are ready for it; nothing else is.
