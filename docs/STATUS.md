# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`, tree clean, everything pushed and live.
**Spec 6 Merge A (service worker + app shell)** (`fb25c7d`) is tested and
confirmed working. The app now loads without a network. No schema change,
no migration.

Verified on the human's device: normal online use unaffected (which also
clears the Supabase version pin); airplane-mode cold open renders the app
instead of the browser's offline page; offline data screens error rather
than showing stale prices (confirming Supabase responses are never cached);
DevTools shows the worker activated with `shell-v1` / `cdn-v1` populated.

Still unverified, neither blocking:
- **The "new version is ready" prompt** — needs a deploy *after* the worker
  was installed, so the next push is its first real test. Watch for it.
- **`?sw=off` kill switch** — untested. Worth trying once so it's known to
  work *before* it's ever needed.

New: `sw.js` (repo root, so its scope is `/grocery-app/`) and
`js/sw_register.js`. Touched: `js/app.js` (one non-awaited call),
`css/styles.css` (update banner), `js/config.js` (pinned Supabase),
`docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`.

Caching, per request kind: same-origin shell = stale-while-revalidate;
navigations = cached `index.html`; CDN hosts = cache-first, filled at
runtime; `*.supabase.co` = **network-only, never cached**.

Two approved deviations from the Spec 6 text in `docs/ROADMAP.md` (the
roadmap still describes the original plan; these supersede it):
1. **CDN modules are runtime-cached, not precached.** esm.sh returns a shim
   that re-exports deeper versioned files, so precaching the entry URL alone
   would leave a broken module graph offline.
2. **No hand-bumped cache version.** Nothing is content-hashed without a
   build step, so one forgotten bump would pin users to stale JS forever.
   Background revalidation + a changed `ETag`/`Last-Modified` raises the
   "new version is ready" prompt instead; `CACHE_VERSION` is only a hard
   reset.

Also in this change: `@supabase/supabase-js` pinned `@2` → `@2.111.0` (what
`@2` resolved to at the time, so no behaviour change is expected) — CLAUDE.md
requires pinned versions, and a floating major would let service-worker-cached
bytes drift from what was tested.

**Merge A explicitly does NOT** add IndexedDB, the outbox, sync, an offline
indicator, or offline auth. Data screens will still error with no connection
— that is Merge B and is expected.

Known, not addressed: the whole zxing barcode graph loads at boot because
`products_screen.js` statically imports `scanner.js`. Making it a dynamic
import would shrink the offline-critical surface a lot. Deliberately left
out of Merge A as a behaviour change.

Prior to this, committed and live and confirmed working on the human's
phone: **stuck-modal fix** (`d739db9`) — `dismiss()` now removes a modal
overlay itself rather than waiting for a `popstate` that may never arrive,
so a completed save can no longer strand the modal reading "Saving…";
`dialog.js`/`scanner.js` moved onto `modalController` for the same
guarantee. History semantics untouched. And the **barcode UPC-A/EAN-13
matching fix** (`f8d9258`) — a scan can decode as 12-digit UPC-A while the
stored barcode is 13-digit EAN-13 (leading `0`) or vice versa.

---

Prior to that: **Two-level package model (count × unit-size)** (`cb11c61`) is tested,
committed, and deployed. Lets a product describe packages as a count of
same-size sub-units (100 softgels of 300mg; 10 sachets of 80g) while keeping
simple single-quantity products (1.5L Coke) just as easy to enter.
- `docs/migrations/0008_two_level_package_model.sql` — adds `unit_count`/
  `unit_size`/`unit_size_unit`/`total_base_quantity` to `products`, matching
  snapshot + `calculated_price_per_subunit` to `observations`. Run in Supabase
  and confirmed working. Legacy `package_quantity`/`package_unit`/
  `normalized_quantity` kept as a rollback net for one cycle (see file header).
- `js/units.js` gained `totalBaseQuantity`, `pricePerSubunit`, `pricePerBase`,
  `scaleQuantity`/`scalePerBasePrice` (display ladder), `formatPackage`
  (replaces three duplicated `sizeLabel`/`formatSize` copies).
- Form (`js/product_form.js`): defaults to the old Size+Unit layout; "This
  comes in multiples" toggle reveals Count. Detail/history
  (`js/product_detail.js`) show ₱/base-unit and ₱-each when `unit_count > 1`,
  always from the observation's own snapshot, never the live product.
- Confirmed on the human's phone: CoQ10 100ct → `100 × 300mg (30g)`; iced tea
  → `10 × 80g (800g)`; Coke unchanged `1.5L`.

Known follow-up, deliberately deferred (not a blocker): the human found
**recording a price** (`openPriceForm` in `js/product_detail.js`) feels more
complicated now — likely the "Quantity bought" field sitting next to the new
per-package unit-price hint line. Human said to let it sit ("nanibago" — not
used to it yet) and revisit later rather than redesign now.

---

Prior to this: the three "real-world usage fixes" (search preservation,
new units, Back-button/nav-stack) are done, confirmed, and live — see git log
(`f3d33c4`, `06f724a`) and `docs/ARCHITECTURE.md` → "Navigation & history" for
the current design. Home-exit interception was tried twice and abandoned as
not achievable on Samsung Internet; reverted via `git revert` (`915f842`,
`0acb73a`) rather than force-push, so Back from Home just exits — final,
no further action needed there.

## Waiting on
Nothing. Ready to plan **Spec 6 Merge B** (local data layer + sync).

## Next up
Per `docs/ROADMAP.md`, one spec at a time, each planned and approved before
any code: **Spec 6 (offline support)** first, then **Spec 5 (sales, regular
prices, multi-buy promos)**, then **Milestone A (dashboard)**. Full spec text
for 5 and 6 is in `docs/ROADMAP.md` → "Next up" so nothing gets lost between
sessions. Also revisit the price-recording-form UX friction noted above once
there's been more time using the multi-unit feature — natural to fold into
the Spec 5 form work, since that spec touches the same form.
