# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `main`, tree otherwise clean. Working a batch of three real-world-usage
specs (see `docs/ROADMAP.md` → "Real-world usage fixes"). No schema changes in
any of the three — no migration file needed this round.

Uncommitted code changes, not yet tested by the human:
- **Spec 3 (units):** `js/units.js` — added `mg`, `gallon`, `fl oz` (US
  customary; imperial deliberately skipped, see `docs/ARCHITECTURE.md`).
- **Spec 1 (search preservation):** `js/products_screen.js` (thread search
  text + archived toggle through the product-detail round trip instead of
  resetting it), `js/ui.js` (new `close` icon), `css/styles.css` (`.search-row`
  / `.search-clear` for the new × button).
- Docs updated to match: `docs/ARCHITECTURE.md` (unit engine note),
  `docs/ROADMAP.md` (new "Real-world usage fixes" section ahead of Milestone A).

**Spec 2 (Back-button/history)** — plan approved (small `js/nav.js` stack
integrated with `history.pushState`/`popstate`; every screen and every modal —
including `js/shopping.js`'s scan-loop panels — routes through it; Home is the
nav-stack root; pre-login screens are out of scope). Not implemented yet —
intentionally sequenced after Specs 1 and 3 are tested, since it's an 8-file
change and the human wanted the smaller wins verified independently first.

## Waiting on
Human to manually test Specs 1 and 3 (checklist given in chat), then say
"it works, commit it" per "Commit & deploy discipline" in `CLAUDE.md`. Only
after that: build Spec 2 (`js/nav.js` + wiring) as its own pass.

## Next up
1. Human tests Specs 1 & 3 → commit.
2. Implement Spec 2 (nav stack), its own manual test checklist, commit.
3. Resume Milestone A (dashboard) per `docs/ROADMAP.md`.
