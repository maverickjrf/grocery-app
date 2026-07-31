# Roadmap

## Status
MVP complete and in real-world use. Real-world usage fixes (search
preservation, new units, Back-button/nav-stack) and Spec 4 (two-level package
model) are done, confirmed, and live. Next up, in this order: Spec 6
(offline support), then Spec 5 (sales/promos), then Milestone A (dashboard).
One spec at a time, each presented as a plan for approval before any code is
written.

## Next up

### Spec 6 — Offline support (full design)
Goal: The app opens and works in dead zones. Products and stores are always
available offline; price history is available when the household opts in.
Observations recorded offline are queued and sync automatically on
reconnect.

Present the plan for approval before implementing, and land it in two
merges: (A) service worker + app shell, verified working, then (B) local
data layer + sync.

Real-world case this must cover: adding a product once froze on "Saving…"
indefinitely — the row was created server-side (confirmed on reload) but a
connectivity blip meant the client never got the response, and the
no-timeout Supabase call just hung forever. Whatever this spec builds
(outbox + optimistic writes) must guarantee a mutating action never leaves
the UI stuck waiting on a response that may never come, online or offline.

**Architecture**

Five new pieces, all behind the existing repository layer so screens change
as little as possible:
- Service worker (`sw.js`) — caches the app shell so the app loads offline.
- Local store (`js/local_db.js`) — IndexedDB wrapper holding cached
  household data and the outbox.
- Outbox — queue of pending writes made while offline.
- Sync engine (`js/sync.js`) — pulls server changes, flushes the outbox,
  reports status.
- Connectivity/status (`js/connectivity.js`) — online/offline detection and
  a small status UI.

**1. Service worker**
- Scope is the GitHub Pages subpath (`/grocery-app/`) — register
  accordingly; get this right or it silently controls nothing.
- Precache on install: `index.html`, `css/styles.css`, every `js/*.js`
  module, and the CDN modules (`@supabase/supabase-js@2` from jsdelivr,
  `@zxing/browser@0.1.5` and `@zxing/library@0.21.3` from esm.sh). Pin exact
  URLs matching the imports. Without these the app opens offline and
  immediately fails.
- Strategy: cache-first for app shell and CDN modules; network-only for
  Supabase API calls (`*.supabase.co`) — never cache API responses in the
  SW; data caching is IndexedDB's job.
- Versioning: a `CACHE_VERSION` constant; on activate, delete caches not
  matching. Bump it on every deploy that changes cached files.
- Update flow: new SW installs in background; when it takes control, show a
  small "Update available — reload" prompt rather than force-reloading
  mid-use.
- Kill switch: include a documented way to unregister/clear (a hidden
  setting or documented steps in the README) in case a bad SW ships.
- Register only in main/production context; guard registration in a
  try/catch so a SW failure never blocks app boot.

**2. Local store (IndexedDB)**

Use raw IndexedDB, or the tiny `idb` ESM wrapper from CDN if preferred — no
bundler-dependent library (no RxDB).

Object stores:
- `products` — keyed by id. Cached automatically (small, changes rarely).
- `stores` — keyed by id. Cached automatically.
- `observations` — keyed by id. Cached only when the household has opted in
  to offline history.
- `outbox` — keyed by auto-increment seq. Fields: `{seq, table, op, id,
  payload, created_at, attempts, last_error}`.
- `meta` — key/value: `{lastSyncedAt:{products,stores,observations},
  householdId, offlineHistoryEnabled}`.

Scope everything to the current `householdId`; on household change or
logout, clear the local store completely (a stale cache from a previous
household is a privacy problem, not just a bug).

**3. Outbox (offline writes)**
- Every mutating repository call, when offline (or when a request fails
  with a network error), writes to IndexedDB and appends an outbox entry,
  then returns success to the UI optimistically.
- New records get `crypto.randomUUID()` client-side (already the pattern)
  — this gives idempotent retries for free: if a flush succeeds but the
  response is lost, the retry hits a primary-key conflict, which the sync
  engine treats as success, not an error.
- Supported ops: insert (observations, products, stores), update (edits),
  soft_delete (`is_deleted`/`archived`). Hard deletes are not queued
  offline — require connectivity for permanent deletion (it's rare and
  irreversible; don't do it blind).
- Flush order is strictly FIFO by seq so an insert always precedes its
  later edit.

**4. Sync engine**

Push (flush outbox): on reconnect, on app foreground, and after any
successful online write. Process FIFO; on success delete the entry; on
network failure leave it and retry with backoff; on a server rejection (RLS
denial, FK violation, validation error) move the entry to a failed state and
surface it to the user — never silently drop a price they recorded.

Pull (refresh cache): per table, fetch rows where `updated_at >
meta.lastSyncedAt[table]`, upsert into IndexedDB, advance the watermark.
Observations only when opt-in is on. Run on login, on reconnect, and on
manual refresh.

Hard-delete gap (must be handled explicitly): rows permanently deleted
server-side cannot be detected by an `updated_at` pull, so they'd linger
locally forever. Choose one and document it:
- (a) Periodic full reconciliation — occasionally fetch all ids for the
  household and drop local rows not present. Simple, correct, slightly
  heavier.
- (b) Tombstone table — a `deleted_rows(table, id, deleted_at,
  household_id)` written by delete triggers, pulled like any other table.
  More correct, more schema.

Recommendation: (a) for now — run a full id reconciliation on login and on
manual refresh. Revisit if it becomes slow.

Conflict resolution: last-write-wins on `updated_at`. Because observations
are append-only and deletes are soft, a superseded value is never destroyed
— it remains in history and can be recovered. Do not prompt the user to
choose. Document the known caveat: `touch_updated_at` stamps server time on
flush, so this is effectively "last flushed wins" rather than "last edited
wins." If true intent-time ordering is wanted later, add a
`client_updated_at` column and compare on that — note it as a future
option, don't build it now.

**5. Repository integration**

This is where the existing pattern pays off — screens should need almost no
changes.
- Reads: return local data when offline or when cached data is fresh; fall
  through to network otherwise. Products and stores read from cache first
  always (they're always cached). Observations read from cache when opt-in
  is on, else network.
- Writes: online → write through to Supabase and update the local cache;
  offline → write to local cache + outbox, return optimistically.
- Keep all of this inside the repositories. No screen should have to know
  whether it's online.

**6. Auth offline**
- Rely on Supabase's persisted session (localStorage) so `getSession()`
  works offline.
- Critical: a failed token refresh while offline must not sign the user out
  or bounce them to login. Distinguish "network unavailable" from "invalid
  credentials" — only the latter logs out. Getting this wrong locks people
  out of the app in exactly the dead zone they needed it in.
- Cold-starting offline with a valid persisted session must land the user
  on their home screen with cached data.

**7. UI**
- A persistent, unobtrusive offline indicator (e.g. a small bar or badge)
  when the device is offline.
- A pending count ("3 prices waiting to sync") and a sync status line,
  visible from home. Tapping it can show the queued items.
- Manual "Sync now" action.
- Failed-sync surfacing: anything the server rejected must be visible and,
  ideally, retryable or editable — not silently lost.
- "Make price history available offline" toggle in the Household & account
  section (this is the opt-in heavy caching). Show an approximate
  size/row count so users understand what they're enabling. Off by
  default; turning it off clears cached observations.
- Optimistically-saved records should be visually distinguishable as
  pending (a subtle marker in history) until confirmed.

**Constraints**
- No build step, no bundler, no framework. `idb` from CDN is acceptable;
  RxDB/PowerSync are not.
- Follow CLAUDE.md: any schema change (only if the tombstone option is
  chosen) gets a dated migration the human runs manually; commit only after
  the human tests.
- Do not weaken RLS or cache another household's data. Clear local storage
  on logout and household change.
- Service worker must never cache Supabase API responses.

**Acceptance**
- Airplane mode, app already used once: app opens, shows products and
  stores, and a price can be recorded — it appears immediately in history
  marked pending.
- Reconnect: pending prices sync automatically, marker clears, and they're
  visible on a second account in the same household.
- Airplane mode with history opt-in on: product detail shows full price
  history and the "Where to buy" comparison.
- Airplane mode with opt-in off: products/stores work; history shows a
  clear "unavailable offline" state rather than an error.
- Token refresh failing offline does not log the user out.
- A server-rejected sync is visibly reported, not dropped.
- Deploying a new app version prompts to update rather than silently
  serving stale files.

### Spec 5 — Sales, regular prices, and multi-buy promos
Goal: Record when a price is a sale price (and what the regular price is),
rank stores on stable regular prices while showing what you'd actually pay
today, and let shoppers capture multi-buy promos without doing arithmetic
in the aisle.

Present the plan for approval before implementing. This is a schema change
plus changes to the price form, the store-comparison logic, and the history
display.

**Data model**

Add to `observations`:
- `is_on_sale` (boolean, not null, default false)
- `regular_price` (numeric, nullable) — the non-sale price of the same
  package, filled only when `is_on_sale` is true
- `total_paid` (numeric, nullable) — for multi-buy entries: the total
  amount paid
- `promo_note` (text, nullable) — free-text description of the promo (e.g.
  "buy 2, 3rd at 50% off")

Keep `observed_price` meaning exactly what it means today: the effective
price for ONE package — what you'd pay per package right now. For
multi-buy entries this is computed (see below), not typed.
`quantity_purchased` already exists and is reused for multi-buy quantity.

Backfill: existing rows get `is_on_sale = false` and nulls elsewhere. Write
as a new dated migration under `docs/migrations/`; provide the SQL for the
human to run.

**Multi-buy computation**

When the user enters multi-buy mode, they provide total paid and quantity
bought. The app computes:

`observed_price = total_paid / quantity_purchased`

and stores that as the effective per-package price. All downstream logic
(unit prices, rankings, charts, analytics) consumes `observed_price` as
normal and requires no awareness that a promo occurred. This is the core
principle: normalize the promo into a comparable number at entry time so
complexity never leaks into the data model.

Per-unit prices (per sub-unit and per base unit, from Spec 4) are computed
from this effective `observed_price` as they already are.

**Price form changes**

Two optional, collapsed-by-default modes. Do not add permanent visible
fields — the simple case (type a price, save) must remain exactly as fast
as it is today.
- On sale toggle — a checkbox/switch labeled "This is a sale price". When
  enabled, reveal a single extra field: Regular price (₱). Keep it
  optional-but-encouraged; if left blank, `is_on_sale` is still true and
  `regular_price` stays null (handle this gracefully everywhere).
- Multi-buy toggle — a link/checkbox labeled roughly "Bought multiple /
  promo deal". When enabled, replace the single Price field with Total paid
  and Quantity bought, and show a live computed line: `= ₱83.33 each`
  (mirroring the existing live unit-price hint pattern). Also reveal an
  optional Promo note text field.

The two modes can be combined (a multi-buy that's also a sale). Keep the
existing live unit-price hint working off the computed effective price.

**Store comparison / "Where to buy" changes**

This is the important behavioral change:
- Ranking ("Cheapest" sort) uses regular price where known — i.e. for each
  store's latest observation, rank on `regular_price` if `is_on_sale` and
  `regular_price` is present, else on `observed_price`. Rationale: sale
  prices are transient; ranking on them would send people across town
  chasing expired promos.
- Display shows what you'd actually pay: the store card shows
  `observed_price` (the real current price), and when the latest
  observation is on sale, adds a clear sale marker plus the regular price
  struck through or noted (e.g. `₱80 · on sale (usually ₱100)`).
- Recency heuristic: if the latest observation at a store is on sale and
  dated within the last 7 days, mark it as possibly still active (e.g. "on
  sale as of 3 days ago"). Older than 7 days, show it as a past sale and
  lean on the regular price. Make the 7-day window a single named constant,
  not a magic number scattered around.
- The "Cheapest" badge follows the ranking rule (regular price), so it
  means "usually cheapest here", not "has a promo today".

**History display**

Each observation row shows the effective price as now, plus:
- a sale marker and the regular price when `is_on_sale`
- for multi-buy entries, a subtle line showing the origin (e.g. `₱250 for 3
  = ₱83.33 each`)
- the `promo_note` if present, styled like the existing notes line

**Analytics note (forward-looking, don't build yet)**

Ensure the data supports excluding sale observations from averages and
trend calculations later — analytics that mix promo prices into "average
price" and inflation tracking would be misleading. No analytics work in
this spec; just don't design anything that makes that exclusion hard.

**Constraints**
- No build step, no new dependency; vanilla JS, existing repository
  pattern.
- Follow CLAUDE.md: dated migration file, the human runs the SQL, commit
  only after the human tests, migration committed alongside its code.
- Observations remain append-only; these are additive columns only.
- Escape all rendered user text (`promo_note` especially).

**Acceptance**
- Simple entry unchanged: open form, type price, save — no extra taps.
- Sale entry: toggle "sale", enter ₱80 with regular ₱100 → history shows
  ₱80 with sale marker and "usually ₱100".
- Multi-buy: toggle, enter total ₱250 and quantity 3 → live hint shows "=
  ₱83.33 each", saves `observed_price` 83.33, history shows the derivation.
- Store ranking: a store whose latest price is a ₱80 sale (regular ₱100)
  does not outrank a store with a steady ₱90 regular price, but its card
  still displays ₱80 with the sale marker.
- A sale observation older than 7 days is not presented as currently
  active.

### Milestone A — Dashboard & price-trend chart
- Dashboard: totals (products, stores, observations), household members list,
  recent-activity feed (latest observations).
- Price-trend chart per product: price vs. time, filter by all stores / single
  store, windows 30d / 90d / 1y / all-time. Charting lib TBD (lightweight; a
  small canvas/SVG lib preferred over a heavy framework given no build step).

## Recently completed
- **Spec 4 — Two-level package model (count × unit-size)**, `cb11c61` /
  `docs/migrations/0008_two_level_package_model.sql`. A product's package is
  a count of same-size sub-units (100 softgels of 300mg; 10 sachets of 80g);
  simple single-quantity products stay `unit_count = 1`. See
  `docs/ARCHITECTURE.md` → "Two-level package model".
- **Real-world usage fixes** — products-screen search/archived-toggle
  preservation across the detail round trip (`f3d33c4`); `mg`/`gallon`/`fl
  oz` units; Back-button/nav-stack (`06f724a`), see
  `docs/ARCHITECTURE.md` → "Navigation & history".

## Later — Analytics (Phase 2 of original vision)
- Per-product stats: lowest / highest / average / most-recent price.
- Price-increase detection: latest vs previous, amount + %.
- Inflation tracking: 30/90/365-day trend, historical vs current average.
- Store comparison ranking (avg / lowest-ever / most-recent).
- Best-value-per-package within a product family (unit-price comparison).
- Price volatility (most stable / most volatile products).
- Once Spec 5 ships: exclude sale-priced observations from averages/trend
  calculations (Spec 5 is designed so this data is available; not built as
  part of Spec 5 itself).

## Later — Phase 3 smart features
- Favorites.
- Shopping basket / regular list.
- Per-store basket cost optimization ("cheapest store for my basket").
- Price-change alerts (severity bands: 0-5% low, 5-15% med, 15%+ high).
- Data-quality anomaly detection on entry (flag values far from history).
- Reports export (CSV / Excel).

## Deferred infrastructure
- Product photos: Supabase Storage; `photo_url` reserved. May be scrapped.

(Offline support was here as a one-line placeholder; it's now fully
specified as Spec 6 above, in "Next up".)

## Explicitly rejected
Cross-household sharing; multi-household membership; adopt/copy stores-with-prices;
curated starter catalog; in-app password reset; single-use or dynamic-expiry
invite codes.

## Known follow-ups / tech debt
- Owner-only enforcement for invite controls + ownership handoff when an owner
  leaves (currently any member can manage invites; owner-leave can orphan
  ownership). Bundle these together.
