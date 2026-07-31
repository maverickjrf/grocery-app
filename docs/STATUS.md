# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
**DEPLOYED BUT NOT YET VERIFIED — stuck-modal fix** (`js/nav.js`,
`js/dialog.js`, `js/scanner.js`). No schema change, no migration.

Pushed deliberately *before* testing, by explicit request: the fix touches
the barcode scanner and camera release, which can only be exercised over
HTTPS on a real phone, so the live GitHub Pages URL is the only way to test
it. This is a knowing exception to the normal "test before commit" rule, not
a lapse. **If the Back button or modals misbehave, revert first and
diagnose after** — `git revert` (not force-push), as with `915f842` /
`0acb73a`. The manual test checklist is in "Waiting on" below.

Real-world symptom: adding a product froze with the button stuck reading
"Saving…", yet the product *was* saved (visible after restarting the
browser). First diagnosed as a connectivity blip; the human pushed back
that the connection was stable, and re-tracing the **success** path found
the actual defect.

`render()` only replaces `#app`, but modal overlays live on `document.body`
— so the *only* thing that removed a modal was the `popstate` listener in
`nav.js`. On success `product_form.js` called `dismiss()`, which called
`goBack()`, which **silently no-ops when the nav stack is empty**, and
`history.back()` fires no popstate when the stack has desynced from real
browser history. In that case the overlay was never removed, `closed` was
already `true` so further `dismiss()` calls were permanent no-ops, and the
button text was never restored (only the `catch` branch does that). Hence:
save succeeds, modal stranded forever. Needs no network fault at all.

Fix (in `modalController`, so every modal benefits):
- `dismiss()` now removes the overlay **itself** instead of waiting for
  popstate — the visible UI no longer depends on a traversal landing.
- New `onClosed` callback runs exactly once on every close path, with a
  `BACK_LANDED_TIMEOUT_MS` (500ms) safety net so a caller is never left
  awaiting a promise popstate was supposed to settle.
- `dialog.js` and `scanner.js` converted from raw `pushModal`+`goBack` onto
  `modalController` — they had the same latent bug (a dialog whose promise
  never resolves; a camera never released).
- History semantics deliberately **untouched** — the stack is never
  force-popped, so Back behaves exactly as before. This matters: Back has
  already been reverted twice here (`915f842`, `0acb73a`).

Not attributable to Spec 4 despite the timing — the nav machinery predates
it (`06f724a`) and Spec 4 added no `pushScreen`/`pushModal` calls. Most
likely desync source is the scan→form path: `scanBarcode()` resolves from
*inside* the popstate handler, and `scanAndRoute` then pushes a new history
entry in the very next microtask.

Known tradeoff to watch when testing: the 500ms net means a chained
`dismiss(next)` (only used in `js/shopping.js`) could, if popstate were ever
slower than 500ms, open the next modal before the traversal lands and have
it immediately popped. Same-document popstate is normally a few ms, so this
should not be reachable — but shopping-mode chaining is worth testing.

Prior to this, committed and live: **barcode UPC-A/EAN-13 matching fix**
(`f8d9258`) — a scan can decode as 12-digit UPC-A while the stored barcode
is 13-digit EAN-13 (leading `0`) or vice versa; `findByBarcode` now matches
both forms so a known product isn't offered as new.

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
**Human to test the stuck-modal fix on a phone, against the live URL.**
Nothing else is blocked. Checklist:
1. **The bug itself** — Products → **+** → fill in → **Add**: modal closes
   immediately, product appears. Repeat via the **scan** icon (scan → form →
   Add), the most likely desync path.
2. **Back button, every path** (the regression risk) — modal + hardware Back
   closes it without exiting the app; Products → detail → Back preserves
   search text and archived toggle; open a modal, **Cancel**, then Back →
   goes up one level, not two.
3. **Dialogs** — delete a product with no prices ("Delete forever") and one
   with prices ("Archive"); confirm, cancel, and dismiss one with hardware
   Back (should act as Cancel). Nothing hangs.
4. **Camera release** — scan, cancel a scan, hardware-Back out of a scan.
   After each, the camera indicator goes off and the scanner reopens fine.
5. **Shopping-mode chaining** (the 500ms tradeoff) — from the found panel,
   "Add product" and "Scan next": the next modal opens and *stays* open.
6. **Two accounts, one household** — add a product on A, confirm on B.

## Next up
Per `docs/ROADMAP.md`, one spec at a time, each planned and approved before
any code: **Spec 6 (offline support)** first, then **Spec 5 (sales, regular
prices, multi-buy promos)**, then **Milestone A (dashboard)**. Full spec text
for 5 and 6 is in `docs/ROADMAP.md` → "Next up" so nothing gets lost between
sessions. Also revisit the price-recording-form UX friction noted above once
there's been more time using the multi-unit feature — natural to fold into
the Spec 5 form work, since that spec touches the same form.
