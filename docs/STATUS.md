# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now

**The local-first pivot is deployed; tested on desktop, not yet on the phone
(2026-11-11).** IndexedDB is the database, Supabase/auth/households are
deleted, Backup & restore exists, docs and CLAUDE.md are updated. See
`docs/ARCHITECTURE.md` → "Local-first".

The Supabase data was exported and verified (`grocery-export.json`, outside
the repo, never committed) and restores correctly on desktop.

## Waiting on

**The human moves to the phone:** open the app (first launch may show the
old cached build — tap "A new version is ready — Reload"), then Backup &
restore → restore `grocery-export.json` from Drive/Downloads. The phone's v1
offline cache is cleared on first load, so it is empty until restored.

Then verify the GTIN-14 fix (`f33a33d`) there: scan the Phoenix garbage bag
and the Knorr pork cubes — each should open its found panel; an unknown code
still reports as new.

If the phone build is broken: `git revert HEAD` and push restores the
Supabase build (the project is still up). Data entered on the phone in the
meantime would need a backup download first.

## Next

- Once the phone is confirmed: the Supabase project can be paused/deleted.
- Then Spec 5 (sales/promos). Remember to add its columns to `js/backup.js`.
- Small follow-up: dynamic `import()` of zxing inside `scanBarcode()`.

## Working agreements

- **Prefer less machinery.** Question whether a design is justified at this
  app's real scale before building it.
- **Test first, commit after.** Data work is tested on desktop against a local
  IndexedDB; only the camera scanner needs the live HTTPS URL on a phone.
- **Desktop DevTools is the main test surface.** Application → IndexedDB →
  `grocery-local`; right-click → **Refresh IndexedDB** (it doesn't
  live-update).
