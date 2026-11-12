# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now

**The local-first pivot is live and working on the phone (2026-11-12).** The
Supabase export was restored there. See `docs/ARCHITECTURE.md` →
"Local-first".

**Deployed but NOT yet verified: fix for the scan → add product → record
price flow.** After adding a product from an unknown scan on Home, the found
panel (with "Record price here") flashed and vanished: `product_form.js`
called `onSaved` straight after `dismiss()`, so the form's own pending
`history.back()` landed after the panel had opened and closed it. Now
chained through `dismiss(next)`. Pushed *before* testing, deliberately — the
path is only reachable by scanning a barcode, which needs the phone camera.

## Waiting on

**The human tests on the phone:** Home → Scan a product → unknown barcode →
Add this product → save → the found panel stays up → Record price here
(current store preselected) → saved price appears as "Cheapest lately" →
one Back press returns to Home. Revert route: `git revert HEAD`, push.

Still unverified from the pivot: the GTIN-14 matching (`f33a33d`) — scan the
Phoenix garbage bag and the Knorr pork cubes; each should open its found
panel.

## Next

- Offered, not agreed: open the Record price form after *creating* a product
  from Manage products too (today it only returns to the list).
- The Supabase project can be paused/deleted; keep `grocery-export.json`
  until a phone backup exists off the phone.
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
