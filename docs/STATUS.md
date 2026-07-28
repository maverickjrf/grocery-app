# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`. All three real-world-usage specs (see `docs/ROADMAP.md` →
"Real-world usage fixes") are done and confirmed working on the human's
Android phone (Samsung Internet):
- **Spec 3 (units):** `js/units.js` — added `mg`, `gallon`, `fl oz` (US
  customary; imperial deliberately skipped, see `docs/ARCHITECTURE.md`).
- **Spec 1 (search preservation):** `js/products_screen.js` threads search
  text + archived toggle through the product-detail round trip; `js/ui.js`
  (new `close` icon) and `css/styles.css` add a clearable, sticky search bar.
  Committed and pushed as `f3d33c4`.
- **Spec 2 (Back-button/history):** `js/nav.js` (stack +
  `pushScreen`/`pushModal`/`goBack`/`modalController`, see
  `docs/ARCHITECTURE.md` → "Navigation & history"). Committed and pushed as
  `06f724a`, confirmed working: hardware Back now navigates in-app and
  closes modals before leaving a screen.

Follow-up in flight — **Home exit behavior**, not yet tested or committed:
- First attempt was a hard block (Back at Home absorbed indefinitely).
  Committed as `b272593`, pushed, but **failed on the human's phone** —
  Samsung Internet (Chromium-based) defeated the repeated re-push-on-Back
  trick, likely its anti-back-hijack protection (that pattern is commonly
  abused by scam sites, so browsers actively fight it). **Rolled back via
  `git revert` as `915f842`** (not a force-push/history rewrite — kept the
  public history honest) rather than layering a fix on top of a known-bad
  commit.
- Now trying **double-back-to-exit** instead: first Back at Home shows a
  "Press back again to exit" toast (`.exit-toast` in `css/styles.css`) and
  re-arms a buffer history entry; a second Back within ~1.8s completes the
  exit. Uses the same underlying technique (one `pushState` inside the
  `popstate` handler) but only once instead of looping — flagged to the
  human as *likely* but not certain to survive the same browser protection
  that killed the hard block. See `docs/ARCHITECTURE.md` → "Navigation &
  history".

## Waiting on
Human to test double-back-to-exit on their Android phone (Samsung Internet).
If it also fails, the fallback is to drop Home-exit interception entirely and
keep the plain "Back at Home exits immediately" behavior from `06f724a`,
which is already confirmed working.

## Next up
1. Test double-back-to-exit live → confirm, or fall back to plain exit.
2. Resume Milestone A (dashboard) per `docs/ROADMAP.md`.
