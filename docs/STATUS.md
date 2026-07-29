# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`. **Two-level package model (count × unit-size)** is coded and
awaiting human test — NOT committed yet. Lets a product describe packages as a
count of same-size sub-units (100 softgels of 300mg; 10 sachets of 80g) while
keeping simple single-quantity products (1.5L Coke) just as easy to enter.
- New: `docs/migrations/0008_two_level_package_model.sql` — adds `unit_count`/
  `unit_size`/`unit_size_unit`/`total_base_quantity` to `products`, matching
  snapshot + `calculated_price_per_subunit` to `observations`. **Not yet run in
  Supabase.** Legacy `package_quantity`/`package_unit`/`normalized_quantity`
  kept as a rollback net for one cycle (see file header).
- `js/units.js`: added `totalBaseQuantity`, `pricePerSubunit`, `pricePerBase`,
  `scaleQuantity`, `scalePerBasePrice`, `formatQuantity`, `formatPackage`
  (replaces the three duplicated `sizeLabel`/`formatSize` copies in
  `products_screen.js`/`product_detail.js`/`shopping.js`). Removed the old
  single-quantity `unitPrice` (superseded by `pricePerBase`).
- `js/products.js`, `js/observations.js`: repository queries/writes updated;
  legacy columns still written in parallel for the rollback net.
- `js/product_form.js`: progressive disclosure — form defaults to today's
  Size + Unit layout; a "This comes in multiples" toggle reveals Count.
- `js/product_detail.js`: price form edits derive package fields from the
  observation's own snapshot (never the live product); detail/history show
  both ₱/base-unit and ₱-each when `unit_count > 1`.
- Docs updated: `schema.md`, `ARCHITECTURE.md` ("Two-level package model"),
  `migrations/README.md`.
- Sanity-checked the math in isolation (Node, not the app) — CoQ10 100ct →
  `100 × 300mg (30g)`, ₱33.33/g, ₱10.00 each; 50ct → ₱40.00/g, ₱12.00 each
  (100ct correctly cheaper per unit); iced tea → `10 × 80g (800g)`; Coke
  unchanged `1.5L`. Still needs the real manual test pass below.

**Next action for the human:** run `0008_two_level_package_model.sql` in the
Supabase SQL editor, then work through the manual test checklist (existing
products display unchanged; add a multi-unit product per the acceptance
examples; edit a product's shape and confirm old price history doesn't move;
repeat in the second account on the shared household). Report back "it works,
commit it" — nothing has been committed or pushed yet.

---

Prior to this: the three "real-world usage fixes" (search preservation,
new units, Back-button/nav-stack) are done, confirmed, and live — see git log
(`f3d33c4`, `06f724a`) and `docs/ARCHITECTURE.md` → "Navigation & history" for
the current design. Home-exit interception was tried twice and abandoned as
not achievable on Samsung Internet; reverted via `git revert` (`915f842`,
`0acb73a`) rather than force-push, so Back from Home just exits — final,
no further action needed there.

## Waiting on
The human: run migration `0008`, test the package-model change (see checklist
handed over with it), say "it works, commit it."

## Next up
After the package-model change is committed: resume Milestone A (dashboard)
per `docs/ROADMAP.md`.
