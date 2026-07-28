# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`, tree clean. All three real-world-usage specs (see
`docs/ROADMAP.md` → "Real-world usage fixes") are done and confirmed working
on the human's Android phone (Samsung Internet):
- **Spec 3 (units):** `js/units.js` — added `mg`, `gallon`, `fl oz` (US
  customary; imperial deliberately skipped, see `docs/ARCHITECTURE.md`).
- **Spec 1 (search preservation):** search text + archived toggle survive
  the product-detail round trip; clearable, sticky search bar. `f3d33c4`.
- **Spec 2 (Back-button/history):** `js/nav.js` stack synced with
  `history.pushState`/`popstate` — hardware Back now navigates in-app and
  closes modals before leaving a screen. `06f724a`.

Resolved: **Home exit behavior stays plain-exit.** Two attempts at
intercepting Back from Home were tried and both failed on the human's phone
(Samsung Internet), then rolled back via `git revert` (not force-push, to
keep public history honest):
- Hard block (absorb Back indefinitely) — `b272593`, reverted as `915f842`.
- Double-back-to-exit (toast + one-shot re-arm) — `6061444`, reverted as
  `0acb73a`.

Both rely on re-pushing history state from inside a `popstate` handler;
Samsung Internet (Chromium-based) appears to defeat that technique outright,
even a single one-shot use, likely as anti-scam-site protection. Conclusion:
this isn't reliably achievable from web JS on that browser, so Back from Home
just exits immediately — the behavior already confirmed working in `06f724a`.
`docs/ARCHITECTURE.md` → "Navigation & history" reflects this as final,
without the exit-interception history (kept here in STATUS instead, since
ARCHITECTURE describes current design, not attempts that were tried and
dropped).

## Waiting on
Nothing. All three specs plus the Back-button work are live and confirmed.

## Next up
Resume Milestone A (dashboard) per `docs/ROADMAP.md`.
