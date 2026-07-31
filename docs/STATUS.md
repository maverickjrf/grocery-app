# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`, uncommitted change pending human test:
**Barcode matching fix** (`js/products.js` → `findByBarcode`). Real-world
testing found that a rack/shelf scan can decode as UPC-A (12 digits) while
the product's stored barcode is EAN-13 (13 digits, leading `0`) or vice
versa — same code, different form — causing `findByBarcode` to miss and
treat a known product as new. Fix matches both the 12- and 13-digit form of
the scanned code, no schema change, no migration needed. **Needs a manual
test before commit**: scan a product whose stored barcode is 12 digits with
a scan that would decode as 13 (or vice versa) and confirm it's found
instead of offered as "new barcode."

Also noted from real-world testing: adding a new product occasionally
freezes on "Saving…" (row is actually created server-side — confirmed by
reloading — but the client never gets the response back, so the button
never un-sticks). Root cause is a Supabase call with no timeout, most
likely triggered by a connectivity blip. Decided **not** to patch this
standalone — it's the same class of problem **Spec 6 (offline support)**
already exists to solve (outbox, optimistic UI, retry), so fold it into
that spec's scope rather than fixing it twice.

---

Prior to this: **Two-level package model (count × unit-size)** (`cb11c61`) is tested,
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
Nothing. Package-model feature is on hold for a while by choice, not blocked.

## Next up
Per `docs/ROADMAP.md`, one spec at a time, each planned and approved before
any code: **Spec 6 (offline support)** first, then **Spec 5 (sales, regular
prices, multi-buy promos)**, then **Milestone A (dashboard)**. Full spec text
for 5 and 6 is in `docs/ROADMAP.md` → "Next up" so nothing gets lost between
sessions. Also revisit the price-recording-form UX friction noted above once
there's been more time using the multi-unit feature — natural to fold into
the Spec 5 form work, since that spec touches the same form.
