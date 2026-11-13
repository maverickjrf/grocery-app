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

A Web Push experiment (`8ddb07f`) was tried and removed again (2026-11-13):
it worked technically, but needing to allow notifications for the browser
itself, and ideally to install the app, was too much friction. Not planned
for this app. The removal is deployed.

**Deployed, untested — the human checks on the phone (2026-11-13):**
- zxing loads on the first scan instead of at boot (`loadZxing()` in
  `js/scanner.js`).
- Home reminders: `js/reminders.js` holds a hard-coded list, shown on Home
  until "Done"; dismissals live in the `meta` store (`dismissedReminders`).
  One reminder so far: the GTIN-14 check below.

## Waiting on

**The human checks the two changes above on the phone**: Home shows the
reminder card, Done hides it; the first scan opens the camera (after a short
load), later scans open at once.

Unconfirmed: the GTIN-14 matching (`f33a33d`) — scan the Phoenix garbage bag
and the Knorr pork cubes; each should open its found panel. The Home reminder
covers this; remove its entry from `REMINDERS` once confirmed.

Backups: the human keeps regular backups in the phone's storage (their
choice; Drive not wanted for now). Supabase is left to auto-pause.

## Next

- Offered, not agreed: a "Share prices" export for giving data to others —
  strips notes, quantity bought, recorder names, hidden prices and archived
  items (a normal backup includes all of it).
- Spec 5 (sales/promos) — present the plan for approval first. Add its new
  columns to `COLUMNS` in `js/backup.js`.

## Working agreements

- **Prefer less machinery.** Question whether a design is justified at this
  app's real scale before building it.
- **Test first, commit after.** Data work is tested on desktop against a local
  IndexedDB; only the camera scanner needs the live HTTPS URL on a phone.
- **Desktop DevTools is the main test surface.** Application → IndexedDB →
  `grocery-local`; right-click → **Refresh IndexedDB** (it doesn't
  live-update).
