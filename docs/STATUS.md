# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
**DEPLOYED, AWAITING RE-TEST — Spec 6 Merge B1 + four fixes from the first
round of mobile testing.** Products, stores and price history come from a
saved local copy when the network is gone. **No schema change, no
migration** — code only.

Third round: **price history is now warmed for the whole household**, not
just for products whose detail screen happened to be opened online. The
per-product cache defeated the point of the feature — the product wanted in
a dead zone is the one you have *not* just been reading about. `Home` now
warms all products and all history once per session (`warmOfflineCopy` in
`js/app.js`), and `meta.historyWarmedAt` lets an empty result read as "no
prices recorded yet" rather than "not saved on this device"
(`readThrough`'s new `emptyIsAnswer`). `warmAllHistory` goes through
`readThrough` so it inherits the timeout and the wipe-race guard.

Second round of mobile testing found four, all fixed:

**A. IndexedDB was not cleared on sign-out — the privacy check failed.** Two
causes. `signOut()` awaited `supabase.auth.signOut()` *before* wiping, so if
that call threw (offline, or any failure) the wipe never ran. And the Home
screen's background product-cache warm-up could still be in flight and
re-save rows *after* the wipe finished. `signOut()` now never throws and
always wipes, and `local_db.js` keeps a `generation` counter so a read that
started before a wipe is dropped instead of repopulating.

**B. Offline felt frozen — every offline read waited the full 8s timeout**
before falling back to the cache. `readThrough` now answers straight from
the saved copy when already known to be offline. Scanning offline is
effectively instant.

**C. No feedback between a scan landing and its result.** The camera closes
immediately, so nothing visibly happened and people tap again. New
`showBusy()` in `ui.js` shows "Barcode scanned — looking it up…" over both
scan paths.

**D. Signing in offline showed a raw error.** It genuinely cannot work — the
password must be checked by the server, and caching credentials to fake it
would be worse than the inconvenience. Now says so, and points out that
staying signed in offline *does* work.

Prior round, also fixed:
1. **Offline refresh landed on "create a household".** `getMyHousehold()`
   used `supabase.auth.getUser()`, which is a *network* call that validates
   the token server-side. Offline it returns `{ user: null }` **without
   throwing**, so the network-error branch never ran and `null` read as "no
   household". Now uses `getSession()`, which reads the locally persisted
   session. (This was one of the two things flagged as reasoned-not-proven
   — the reasoning was right about `getSession`, but the code was calling
   `getUser`.)
2. **Update banner needed two reloads.** Both a changed file and a waiting
   worker raise it, but the file-change message carries no registration, so
   if it won the race the Reload button did a plain reload and left the new
   worker waiting — banner straight back. Reload now looks the registration
   up at click time.
3. **Offline scan / record price showed "TypeError: failed to fetch".**
   Writes had no offline handling at all. New `requireNetwork()` wrapper
   gives every write the same 8s timeout as reads and a readable message.
   `readThrough` no longer rethrows a raw fetch error when the cache is
   empty either.
4. **Offline scan found nothing** even for known products: the product cache
   is only filled by a read, and scanning is reachable from Home without
   ever opening the Products list. Home now warms it in the background.

Note fix 3 also puts a timeout on every write — which is the underlying
"stuck on Saving…" hazard from earlier in the project, now closed for real
rather than deferred to B2.

Pushed before testing, as this repo's offline work always must be: service
workers and airplane-mode behaviour only exist over HTTPS on a real device.
**If it misbehaves, `git revert` (never force-push)**; `?sw=off` clears the
service worker but *not* IndexedDB — for that, sign out (which wipes it) or
clear site data.

New: `js/local_db.js` (IndexedDB + the `readThrough` helper),
`js/connectivity.js` (offline state + bar). Modified: `js/products.js`,
`js/stores.js`, `js/observations.js`, `js/household.js`, `js/auth.js`,
`js/app.js`, `css/styles.css`, and `sw.js` (the two new modules added to
`SHELL_ASSETS`).

**Fixes a live lockout bug:** `showMain()` treated *any* error from
`getMyHousehold()` as "not signed in", so opening the app with no signal
dropped the user on the login screen. Now a network failure returns the
cached household instead, and only a genuine auth failure reaches sign-in.

Deliberately *less* than the roadmap specced, and the roadmap is annotated to
say so:
- **No sync engine, no watermarks, no hard-delete reconciliation.** Reads are
  network-first-then-save and replace the saved copy wholesale, so ordinary
  use is the sync and deleted rows drop out by themselves. This removed ~120
  lines and the two fiddliest bugs in the original design.
- **No opt-in toggle for history caching** — always cached.
- Offline detected by requests failing (8s timeout), not `navigator.onLine`,
  which lies for a connection that carries no traffic.

Landed at ~250 lines rather than the 400-500 first estimated, after the human
pushed back on the complexity. That pushback was correct.

**Merge B1 does NOT add offline writes.** Recording a price, adding a
product, or editing anything still needs a connection and will error offline.
That is Merge B2. `local_db.js` creates an empty `outbox` store now so B2
doesn't need an IndexedDB version bump.

Still unproven: whether an RLS denial surfaces as a real error rather than
being masked by cached data. `isNetworkError` treats anything carrying a
Postgres error code as a genuine refusal, and a network failure from
supabase-js arrives as `{ message: 'TypeError: Failed to fetch', code: '' }`
— an empty-string code, which is falsy, so it correctly falls through to the
message test. Reasoned, not tested; hard to trigger deliberately.

Prior to this, tested and live: **Spec 6 Merge A (service worker + app
shell)** (`fb25c7d`) — the app loads without a network.

Verified on the human's device: normal online use unaffected (which also
clears the Supabase version pin); airplane-mode cold open renders the app
instead of the browser's offline page; DevTools shows the worker activated
with `shell-v1` / `cdn-v1` populated. Offline data screens errored rather
than showing stale prices, confirming Supabase responses are never cached —
note B1 above deliberately changes that last one: data screens now show
*saved* data offline, from IndexedDB, never from the service worker.

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
**Human to re-test Merge B1 on mobile.** Needs HTTPS and airplane mode, so it
must be pushed to be tested.

Easiest on a desktop browser: DevTools → Network → throttling → **Offline**
is quicker than airplane mode, and the IndexedDB panel is right there.
Remember to right-click `grocery-local` → **Refresh IndexedDB**; that panel
does not live-update.

1. **History works offline for a product you never opened online.** Sign in,
   land on Home, wait a moment for the warm-up, then go offline and open a
   product whose detail screen you have not visited this session. Its price
   history and "Where to buy" should both be there. This is the fix.
2. **A product with no prices shows its normal empty state offline**, not
   "hasn't been saved on this device".
3. **Sign-out still wipes IndexedDB** — the warm-up now runs on every fresh
   sign-in, so re-check it does not repopulate after signing out. Try
   **online and offline**. Privacy check; matters most.
4. **Offline is still fast** — scanning answers well under a second.
5. **Nothing regressed online** — full pass, **no "Offline" bar** while
   connected.
6. **Two accounts, one household** — unchanged sharing.

## Next up
Per `docs/ROADMAP.md`, one spec at a time, each planned and approved before
any code: **Spec 6 (offline support)** first, then **Spec 5 (sales, regular
prices, multi-buy promos)**, then **Milestone A (dashboard)**. Full spec text
for 5 and 6 is in `docs/ROADMAP.md` → "Next up" so nothing gets lost between
sessions. Also revisit the price-recording-form UX friction noted above once
there's been more time using the multi-unit feature — natural to fold into
the Spec 5 form work, since that spec touches the same form.
