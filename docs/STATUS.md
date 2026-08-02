# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now

**Deployed, not yet verified: a second barcode leading-zero fix** in
`js/products.js`. Pushed ahead of testing because camera scanning needs HTTPS
on a real phone — the same inversion the offline work needed.

*Cause, now confirmed from real data.* The stored codes are 14-digit GTIN-14
(`04800375003646`) while the scans come back 13-digit EAN-13
(`4800375003646`) — Phoenix garbage bag and Knorr pork cubes both. `f8d9258`
only ever handled 12 ↔ 13, and specifically generated **no** variants for a
13-digit code that does not start with `0`, so the 14-digit stored form was
never asked for. 13 ↔ 14 was simply never covered.

*Fix.* Matching is structural instead of a special case: every code reduces
to a GTIN-14 key (`gtinKey` — separators forgiven, zero-padded to 14), the DB
is asked for all valid lengths at once so the lookup stays indexed, and a
miss falls back to comparing keys across the cached product list, which also
catches a stored value with a stray space or dash.

Two deliberate limits, both verified: **8-digit EAN-8 is excluded** from the
equivalence (the human's call — an EAN-8 is its own number, not a short
EAN-13, and padding it could collide with a 12-digit code beginning in
zeros), and only *zero* padding is equated, so a true ITF-14 carton code with
a non-zero indicator digit stays a distinct product.

**Next action: the human tests this on the phone** — scan the Phoenix garbage
bag and the Knorr pork cubes and confirm each opens its found panel instead
of "New product"; confirm an unknown product still reports as new; confirm
the same scan works in airplane mode after Home has loaded once.

**Spec 6 — Offline support is half done.** Merge A (app shell) and Merge B1
(offline reads) are live and verified. Merge B2 (offline writes) is the
remaining piece and has not been started.

What works offline today: the app opens, and products, stores, price history
and "Where to buy" all read from a local copy. Scanning a known barcode
works. You stay signed in.

What does not: **any write**. Recording a price, adding or editing a product
or store all require a connection and show "You're offline. This needs a
connection — try again once you're back online." A *fresh* sign-in also needs
a connection, permanently — the password has to be checked by the server, and
caching credentials to fake it would be a worse trade.

Last commits: `17d2b07` (history warm-up), `738dd6b`, `47c0082` (fixes from
mobile testing), `0ad7324` (B1), `fb25c7d` (Merge A).

## Waiting on

1. **Testing the barcode fix on the phone.** It is pushed and live; nothing
   more can be checked from a desktop, since camera scanning needs HTTPS on a
   real device.
2. **B2 vs Spec 5** — deliberately deferred. The human chose to land the
   barcode fix first and decide the order next session.

Open question, not blocking: **where the 14-digit stored codes came from.**
ITF is in the scanner's format list (`js/scanner.js`), and ITF-14 is what is
printed on outer cartons and multipacks, so an earlier scan may have read the
carton rather than the unit. Worth a glance at whether other products carry
14-digit codes; the fix makes it harmless either way.

## Next up — Spec 6 Merge B2: offline writes

The design in `docs/ROADMAP.md` still describes the *original* single Merge B;
sections 3 and 4 (outbox, flush, retry, conflict handling) and the pending
markers in section 7 are what remains. **Read the annotation block at the top
of the Spec 6 section first** — several parts of that text are already
superseded.

Groundwork already in place:
- `local_db.js` creates an empty **`outbox`** object store (keyPath `seq`,
  autoIncrement), so B2 needs no IndexedDB version bump.
- `requireNetwork()` wraps every write with an 8s timeout and a friendly
  offline message — that is the exact seam an outbox slots into.
- A `generation` counter already discards saves whose fetch began before a
  cache wipe.

Sharp edges found while building B1 that B2 has to deal with:
1. **`find_or_create_family` blocks offline product creation.**
   `createProduct` → `_toRow` calls that RPC *before* it can build the row,
   so the row cannot be constructed without a server. Queue the *payload* and
   resolve `family_id` at flush time. `family_id` is not in `PRODUCT_FIELDS`,
   so a locally-cached product without one renders fine.
2. **Only observations generate client UUIDs.** `recordObservation` sets
   `row.id`; `createProduct` and `createStore` do not. Optimistic offline rows
   need ids — extend those two (CLAUDE.md rule 6).
3. **`recorded_by_name` is set by a BEFORE INSERT trigger** from `auth.uid()`,
   so an offline-recorded price has no recorder name until it syncs. Show the
   current user's name optimistically; never *send* one (the trigger
   overwrites it, which is what keeps attribution honest — see migration
   0007).
4. **`household_id` / `created_by` / `observed_by` are DB defaults**, filled
   server-side at flush. Local rows will not have them.
5. **Hard deletes must not be queued** — they are irreversible; require
   connectivity, per the roadmap.
6. **`suggest.js` type-ahead is RPC-backed** and fails offline. Not addressed
   in B1; degrade it to distinct values from cached products, or accept that
   suggestions are empty offline.

Recommended shape, consistent with how B1 went: keep it small, resist the
spec's machinery, and get it in front of real use early.

### Spec 5 — decided this session, not yet built
Real use turned up the bug Spec 5 exists to fix: a sale price was tagged
"cheapest". Two design points are now settled and written into
`docs/ROADMAP.md` — read them there before planning it:
- **Ranking never uses a sale price.** Regular price if recorded, else that
  store's latest non-sale price, else the sale price but with no "Cheapest"
  badge. The spec's original straight fallback to `observed_price` is
  superseded; making regular price mandatory was rejected.
- **Recent-sale badge in three places** — store card, product list row, and
  product detail header — off one shared 7-day constant.

Also settled: existing rows where a sale was entered as a plain price get
**marked as sales through the normal edit form** once the flag exists. Do not
launder sale prices into the notes field — that was considered and rejected,
because a free-text note cannot raise a badge or be excluded from averages.

### After that
**Milestone A** (dashboard & price-trend chart). One spec at a time, each
planned and approved before any code.

## Known follow-ups (none blocking)

- **Price-form UX friction.** The human found recording a price
  (`openPriceForm` in `js/product_detail.js`) more complicated after Spec 4 —
  likely "Quantity bought" sitting beside the per-package unit-price hint.
  They chose to let it sit ("nanibago") rather than redesign. Natural to fold
  into Spec 5, which touches the same form.
- **zxing loads on every boot.** `products_screen.js` statically imports
  `scanner.js`, so the whole barcode library is in the critical path even
  when never scanning. A dynamic `import()` inside `scanBarcode()` would
  shrink the offline-critical surface a lot. Behaviour change; deliberately
  not bundled into the offline work.
- **`?sw=off` kill switch is still untested.** Worth trying once so it is
  known to work *before* it is ever needed. Note it clears the service worker
  but **not** IndexedDB — for that, sign out (which wipes it) or clear site
  data.
- **RLS-denial-vs-offline is reasoned, not tested.** `isNetworkError` treats
  anything carrying a Postgres error code as a genuine refusal; a supabase-js
  network failure arrives as `{ message: 'TypeError: Failed to fetch', code:
  '' }` — falsy code, so it correctly falls through to the message test. Hard
  to trigger deliberately.
- **Warm-up timing.** `warmOfflineCopy()` runs in the background after Home
  loads, so going offline within a second or two of signing in may catch it
  unfinished. Not observed in practice; if it becomes a problem the fix is
  showing warm-up progress.
- **Owner-only invite controls + ownership handoff** when an owner leaves
  (from `docs/ROADMAP.md` tech debt). Any member can currently manage
  invites; an owner leaving can orphan ownership.

## Working agreements confirmed this session

- **Offline/PWA work must be pushed to be tested** — service workers, camera
  and airplane-mode behaviour only exist over HTTPS on a real device. So the
  normal test-before-commit rule inverts here: write it, push it, then test.
  Write `STATUS.md` as "deployed, not yet verified" *before* staging.
- **Desktop DevTools beats airplane mode for testing.** Network tab →
  throttling → Offline, and the IndexedDB panel is right there. That panel
  does not live-update: right-click `grocery-local` → **Refresh IndexedDB**.
- **Prefer less machinery.** B1 was specced at 400-500 lines and landed at
  ~250 after the human pushed back; dropping delta-sync watermarks also
  deleted the entire hard-delete problem. Question whether the roadmap's
  design is justified at this app's actual data scale before building it.
