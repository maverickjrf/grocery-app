# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now

**The local-first pivot is live and working on the phone (2026-11-12).** The
Supabase export was restored there. See `docs/ARCHITECTURE.md` →
"Local-first".

The scan → add product → record price flow is fixed and verified on the phone
(`850a332`).

Creating a product in Manage products now opens the price form right after
(`ac5fb2c`, tested on desktop).

**Deployed, being tested on the phone: Web Push experiment (2026-11-13).** Purpose: find
out whether a PWA can receive server-sent push on Android, to decide on it
for a separate work project, with no real use case in this app yet. Files: `js/push.js`,
push/notificationclick handlers in `sw.js`, a "Push notifications (test)"
section on Backup & restore, `manifest.json` + `icons/` (the app had no
manifest), `.gitignore` entries. The sender is a Node script **outside the
repo** (Claude's session scratchpad, `push-sender/send.mjs` + `vapid.json`
holding the VAPID private key; the public key is in `js/push.js`). If the
scratchpad is lost, run `node send.mjs keys` to make a new pair, put the new
public key in `js/push.js`, and re-subscribe.

## Waiting on

**The human tests the push experiment** on desktop localhost, then on the
phone after a deploy (checklist was given in chat).

Unconfirmed: the GTIN-14 matching (`f33a33d`) — scan the Phoenix garbage bag
and the Knorr pork cubes; each should open its found panel.

The human should make a phone backup and put it in Drive; until then
`grocery-export.json` is the only off-phone copy. Supabase is left to
auto-pause.

## Next

- Offered, not agreed: a "Share prices" export for giving data to others —
  strips notes, quantity bought, recorder names, hidden prices and archived
  items (a normal backup includes all of it).
- Spec 5 (sales/promos) — present the plan for approval first. Add its new
  columns to `COLUMNS` in `js/backup.js`.
- Small follow-up: dynamic `import()` of zxing inside `scanBarcode()`.

## Working agreements

- **Prefer less machinery.** Question whether a design is justified at this
  app's real scale before building it.
- **Test first, commit after.** Data work is tested on desktop against a local
  IndexedDB; only the camera scanner needs the live HTTPS URL on a phone.
- **Desktop DevTools is the main test surface.** Application → IndexedDB →
  `grocery-local`; right-click → **Refresh IndexedDB** (it doesn't
  live-update).
