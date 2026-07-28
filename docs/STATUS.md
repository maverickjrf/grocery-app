# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`. All three real-world-usage specs (see `docs/ROADMAP.md` →
"Real-world usage fixes") are done:
- **Spec 3 (units):** `js/units.js` — added `mg`, `gallon`, `fl oz` (US
  customary; imperial deliberately skipped, see `docs/ARCHITECTURE.md`).
- **Spec 1 (search preservation):** `js/products_screen.js` threads search
  text + archived toggle through the product-detail round trip; `js/ui.js`
  (new `close` icon) and `css/styles.css` add a clearable, sticky search bar.
  Committed and pushed as `f3d33c4`.
- **Spec 2 (Back-button/history):** `js/nav.js` (stack +
  `pushScreen`/`pushModal`/`goBack`/`modalController`, see
  `docs/ARCHITECTURE.md` → "Navigation & history"), wired into
  `js/dialog.js`, `js/scanner.js`, `js/product_detail.js`,
  `js/product_form.js`, `js/products_screen.js`, `js/stores_screen.js`,
  `js/shopping.js`. Committed and pushed as `06f724a`, **confirmed working by
  the human on Android** (hardware Back now navigates in-app and closes
  modals before leaving a screen).

Uncommitted follow-up, not yet pushed: Back at Home now hard-blocks instead
of exiting (a guard `history.pushState` in `js/nav.js` is refilled whenever
Back fires with an empty stack) — the human's request after confirming Spec 2
worked; you leave the app via the OS home/recents instead. Doc note added to
`docs/ARCHITECTURE.md` → "Navigation & history".

Note on the earlier confusion: the hardware-Back-closes-the-app behavior seen
right after `f3d33c4` was not caused by that commit (it touched no
navigation code) — it was a pre-existing gap Spec 2 has now fixed.

## Waiting on
Nothing — human is testing the Home exit-guard change live on Android next,
same pattern as before (push first, rollback via `git revert` if it breaks
anything, since they're the only user right now).

## Next up
1. Confirm the Home exit-guard behaves as expected.
2. Resume Milestone A (dashboard) per `docs/ROADMAP.md`.
