# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`. Specs 1 and 3 (see `docs/ROADMAP.md` → "Real-world usage
fixes") are tested, committed (`f3d33c4`), and **not yet pushed** — waiting on
a go-ahead to push per "Commit & deploy discipline" in `CLAUDE.md`.
- **Spec 3 (units):** `js/units.js` — added `mg`, `gallon`, `fl oz` (US
  customary; imperial deliberately skipped, see `docs/ARCHITECTURE.md`).
- **Spec 1 (search preservation):** `js/products_screen.js` threads search
  text + archived toggle through the product-detail round trip; `js/ui.js`
  (new `close` icon) and `css/styles.css` add a clearable, sticky search bar
  (`.search-row` stays pinned under the header on scroll).

**Spec 2 (Back-button/history)** — implemented, **not yet tested or
committed**. New `js/nav.js` (stack + `pushScreen`/`pushModal`/`goBack`/
`modalController`, see `docs/ARCHITECTURE.md` → "Navigation & history").
Wired into `js/dialog.js`, `js/scanner.js`, `js/product_detail.js`,
`js/product_form.js`, `js/products_screen.js`, `js/stores_screen.js`,
`js/shopping.js`. `js/app.js` needed no changes (Home is the nav-stack root).
`js/products_screen.js` and `js/stores_screen.js` were each split into a
one-time "show" (pushes history) and a repaintable "paint" (search/toggle/
save refresh, and restoring after a deeper screen is popped) — necessary so
in-place refreshes don't each add a phantom extra Back level.

Note on why this was needed: the Spec 1/3 commit (`f3d33c4`, pushed and live)
does **not** touch navigation at all — the hardware-Back-closes-the-app
behavior reported after that push was a pre-existing gap (the app never used
the History API before now), not a regression from that commit.

## Waiting on
Human to manually test Spec 2 on an Android phone against the live-pushed
Spec 1/3 build (checklist given in chat), then say "it works, commit it."
Per discussion, this lands as its own commit on top of `f3d33c4` rather than
a squash/force-push.

## Next up
1. Human tests Spec 2 → commit → push.
2. Resume Milestone A (dashboard) per `docs/ROADMAP.md`.
