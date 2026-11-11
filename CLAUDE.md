# CLAUDE.md — Developer Guide for Claude Code

You are working on **Grocery Price Tracker**, a grocery price-tracking PWA
whose database lives on the device (IndexedDB) — single user, no server, no
sign-in. **At the start of every session**, before doing anything else and
whether or not asked: read `docs/STATUS.md` (what's in flight right now), then
`docs/ARCHITECTURE.md`, `docs/schema.md`, and `docs/ROADMAP.md`. Treat those
four files plus this one as the source of truth.

## Golden rules
1. **No build step, ever.** Vanilla JS ES modules, plain CSS. Do not introduce
   npm, bundlers, TypeScript, JSX, or a framework. Dependencies load as ESM from
   a CDN (esm.sh / jsdelivr) with **pinned versions**.
2. **Repository pattern is mandatory.** All data access lives in a
   `*Repository` object inside the relevant `js/<feature>.js`, built on the
   helpers in `js/local_db.js`. UI/render code must never touch IndexedDB
   directly. This is the seam a server would plug into if one ever returns.
3. **The device holds the only copy of the data.** Treat it accordingly:
   - Never clear, delete or recreate an object store holding real data in an
     `onupgradeneeded` path. Upgrades run once, on the user's only copy, with
     no undo.
   - Anything that wipes or replaces data (restore, a future "reset") goes
     through `confirmDialog` and offers a backup first.
   - A new row field must be added to the column lists in `js/backup.js`,
     or backups silently drop it.
   - Recovery tools (`?sw=off`) must never touch IndexedDB.
4. **Observations are append-only.** Never hard-delete by default; use the
   `is_deleted` soft-delete flag. Deletes and any destructive action require a
   confirmation dialog (`confirmDialog` in `js/dialog.js`).
5. **Preserve integrity snapshots.** New observation logic must keep the
   package-size snapshots, and keep `recorded_by_name` on imported rows. Do not
   compute historical unit prices from the live product row.
6. **Client-generated UUIDs** (`newId()` in `js/local_db.js`) for every new
   record.

## Data model invariants
- Rows keep the old server's snake_case shape so they stay insertable into a
  server later. Don't rename fields casually.
- Integrity rules a database would enforce (e.g. no deleting a product that
  still has prices) live in the repositories.
- Unit conversions live only in `js/units.js`. Add a unit = one table entry.
- Barcodes are matched only through `gtinKey` in `js/products.js`.
- Free-text fields (product name/brand/category, store name) must use the
  type-ahead (`attachSuggest` in `js/suggest.js`) on any new form that edits them.

## Coding style
- 2-space indent, semicolons, single quotes, `const`/`let` (never `var`).
- Small pure helpers over cleverness. Keep DOM rendering in template strings
  consistent with existing screens.
- **Always escape** user data rendered into HTML with `escape()` from `js/ui.js`.
  No unescaped interpolation of user/DB values into innerHTML — treat this as a
  security rule, not a preference. Restored backup files are untrusted input.
- Currency: format with the existing `peso()` helper (PHP, 2 dp).
- Errors: repositories throw; UI catches and shows a friendly message.
  `local_db.js` already turns IndexedDB failures into readable messages; never
  surface a raw DOMException to users.
- Icons: add to the `icons` map in `js/ui.js` (24px stroke SVG), don't inline.

## Changing the data schema
- Adding a field to rows: no upgrade needed (IndexedDB is schemaless). Read
  old rows as if the field were missing, default it in `parseBackup`, and add
  it to `COLUMNS` in `js/backup.js`.
- Adding/removing an object store or index: bump `DB_VERSION` in
  `js/local_db.js` and handle each old version explicitly in
  `onupgradeneeded`, preserving data (rule 3). Update `docs/schema.md`.
- `docs/migrations/` is historical (the retired Supabase schema). Don't add
  to it.

## Testing parameters
- No automated test framework is set up (deliberate, given no build step). Do
  **not** add Jest/Vitest/Playwright without asking. Pure helpers can be
  spot-checked with a throwaway Node script in the scratchpad.
- For each change, provide a **manual test checklist**: exact click-path, what to
  observe, and an IndexedDB check where relevant (DevTools → Application →
  IndexedDB → `grocery-local`; right-click → Refresh IndexedDB, it doesn't
  live-update).
- Desktop Chrome on `localhost` is the main test surface. Restore a backup file
  there to test against real data — never experiment on the phone's only copy
  without a fresh backup.
- Barcode/camera features: note that they require HTTPS or localhost, and that
  laptop webcams fail on 1D barcodes — test on a phone via the live URL.

## Secrets & safety
- The repo is public. Do not commit anything that isn't already public.
- **Never commit backup or export files** (`grocery-backup*.json`,
  `grocery-export*.json` — gitignored). Price history is personal data.

## Deploy
- `git push` to `main` deploys via GitHub Pages. There is no server.

## Commit & deploy discipline
Pushing to `main` deploys live to GitHub Pages, so a commit is a deploy. Treat
committing as a gated action, not an automatic one:

- **Never commit or push until the human has tested the change and said it works.**
  Write the code, give the manual test checklist, then STOP. Wait for an
  explicit "it works, commit it" before staging anything.
- **Show before committing.** Before committing, run `git status` and show exactly
  what will be staged. The human is the last line of defence against a secret
  or a data file reaching this public repo — never commit files they haven't
  seen staged.
- Use clear, imperative commit messages describing what changed and why.

## Session continuity
`docs/STATUS.md` is the single source of truth for "where we left off" — it
persists across VSCode restarts and new conversations, unlike chat history.
- **Read it first, always** — at the start of every session, before touching
  any code, even if the human doesn't mention it (see the top of this file).
- **Keep it current, not historical.** Overwrite it at natural checkpoints:
  handing off a manual test checklist, right after a commit, or when told to
  stop. It should describe right now, not everything that ever happened — git
  history is the log; this file is the pointer.
- Keep entries short: what's in flight, what's uncommitted and why, what's
  blocked on the human, what's next.

## When unsure
Ask before: adding dependencies, adding a server or any sync, changing
`DB_VERSION` upgrade logic, introducing a build step, or building anything
under "Explicitly rejected" in the roadmap.
