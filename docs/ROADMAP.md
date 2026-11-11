# Roadmap

## Status
MVP complete. Real-world usage fixes, Spec 4 (two-level package model) and the
**local-first pivot** (2026-11-11) are done: the database moved onto the
device and Supabase, auth and households were removed — see
`docs/ARCHITECTURE.md` → "Local-first". Next: Spec 5 (sales/promos), then
Milestone A (dashboard). One spec at a time, each presented as a plan for
approval before any code is written.

## Next up

### Spec 6 — Offline support: obsolete
Superseded by the local-first pivot. Merge A (app shell) and Merge B1 (offline
reads) shipped and the service worker is still in use; **Merge B2 (offline
writes, outbox, sync engine) ceases to exist as work** — every write is local,
so there is nothing to queue or sync. The full original design is in git
history (`ROADMAP.md` before the pivot) if a server ever returns.

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

Backfill: existing rows get `is_on_sale = false` and nulls elsewhere. There
is no migration to run any more — treat a missing field as false/null when
reading, and default it in `parseBackup` (`js/backup.js`) so old backups
restore cleanly.

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
- Ranking ("Cheapest" sort) never ranks on a sale price. Rationale: sale
  prices are transient; ranking on them would send people across town
  chasing expired promos. For each store, the ranking price is:
  1. its latest observation's `regular_price`, if that observation is on
     sale and the regular price was filled in; else
  2. its latest observation that is **not** on sale, on `observed_price`;
     else
  3. the sale price — but a store ranked this way can never hold the
     "Cheapest" badge, because nothing is known about its usual price.

  > **Decided 2026-08-02, amending this spec.** The original text fell back
  > straight to `observed_price` when a sale had no regular price recorded,
  > which reproduces the exact bug that prompted the change: a sale price
  > was tagged cheapest in real use. Making the regular price mandatory was
  > considered and rejected — in the aisle you often genuinely don't know
  > the usual price, and forcing a guess puts bad data in the column the
  > ranking depends on.
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

**Recent-sale badge (decided 2026-08-02)**

"Was this on sale in the last 7 days?" must be answerable at a glance,
without opening anything. The same 7-day constant drives a badge in three
places: the store card in "Where to buy", the **product list** row, and the
**product detail header**. On the list and the header the badge means "some
store had this on sale within 7 days" — it is a prompt to look, not a claim
about a particular store. This is the main reason the sale flag is a column
and not a free-text remark: a note nobody can query cannot raise a badge.

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
- **Add the four new columns to `COLUMNS.observations` in `js/backup.js`.**
  The backup parser keeps only listed columns, so a column missing there is
  silently dropped from every restore.
- Commit only after the human tests.
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
- Dashboard: totals (products, stores, observations), recent-activity feed
  (latest observations).
- Price-trend chart per product: price vs. time, filter by all stores / single
  store, windows 30d / 90d / 1y / all-time. Charting lib TBD (lightweight; a
  small canvas/SVG lib preferred over a heavy framework given no build step).

## Recently completed
- **Local-first pivot**, 2026-11-11. IndexedDB is the database; Supabase,
  auth, households, invite codes, product families and the offline-cache
  machinery are gone. Backup & restore added, which also imported the
  Supabase data. See `docs/ARCHITECTURE.md` → "Local-first".
- **Spec 6 Merge B1 — Offline reads**, `0ad7324` (+ fixes `47c0082`,
  `738dd6b`, `17d2b07`). Superseded by the pivot.
- **Spec 6 Merge A — Service worker + app shell**, `fb25c7d`. The app loads
  without a network. See `docs/ARCHITECTURE.md` → "App shell caching".
- **Stuck-modal fix**, `d739db9`. `dismiss()` removes a modal overlay itself
  rather than waiting for a `popstate` that may never arrive, which could
  strand a completed save reading "Saving…". `dialog.js`/`scanner.js` moved
  onto `modalController`.
- **Barcode UPC-A/EAN-13 matching**, `f8d9258`. A scan can decode as
  12-digit UPC-A while the stored barcode is 13-digit EAN-13 (leading `0`);
  `findByBarcode` now matches both forms.
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
- Product photos: dropped with Supabase Storage. Would have to be IndexedDB
  blobs, which also bloat backups. Probably scrapped.
- Sync / an online database again: only for a concrete need (a second device
  or person). Row shapes are kept server-compatible; nothing else is built.

## Explicitly rejected
Adopt/copy stores-with-prices; curated starter catalog. (Household-era
rejections — cross-household sharing, multi-household membership, password
reset, invite-code variants — are moot now that there are no households.)

## Known follow-ups / tech debt
- Make the zxing import dynamic (inside `scanBarcode()`), so the barcode
  library stops loading on every boot. It is the only heavy dependency left.
