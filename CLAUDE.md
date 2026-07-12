# CLAUDE.md — Developer Guide for Claude Code

You are working on **Grocery Price Tracker**, a household grocery price-tracking
PWA. **At the start of every session**, before doing anything else and whether
or not asked: read `docs/STATUS.md` (what's in flight right now), then
`docs/ARCHITECTURE.md`, `docs/schema.md`, and `docs/ROADMAP.md`. Treat those
four files plus this one as the source of truth.

## Golden rules
1. **No build step, ever.** Vanilla JS ES modules, plain CSS. Do not introduce
   npm, bundlers, TypeScript, JSX, or a framework. Dependencies load as ESM from
   a CDN (esm.sh / jsdelivr) with **pinned versions**.
2. **Repository pattern is mandatory.** All Supabase access lives in a
   `*Repository` object inside the relevant `js/<feature>.js`. UI/render code must
   never call `supabase.*` directly. This preserves the offline-sync seam.
3. **Security lives in the database.** Every domain table has RLS keyed on
   `current_household_id()`. Never rely on client-side checks for access control.
   When adding a table, add RLS policies in the same migration. Never trust a
   client-passed `household_id` or `user_id` in SQL functions or trigger rows —
   always derive identity from `auth.uid()` and scope from
   `current_household_id()`; a parameter or client-supplied column value is not
   authorization.
4. **Observations are append-only.** Never hard-delete by default; use the
   `is_deleted` soft-delete flag. Deletes and any destructive action require a
   confirmation dialog (`confirmDialog` in `js/dialog.js`).
5. **Preserve integrity snapshots.** New observation logic must keep the
   package-size and `recorded_by_name` snapshots. Do not compute historical unit
   prices from the live product row.
6. **Client-generated UUIDs** for new records where a repository already does so;
   keep this for offline-readiness.

## Data model invariants
- Everything domain-level is scoped by `household_id`; one active household per
  user (`profiles.household_id`).
- Unit conversions live only in `js/units.js`. Add a unit = one table entry.
- Free-text fields (product name/brand/category, store name) must use the
  type-ahead (`attachSuggest` in `js/suggest.js`) on any new form that edits them.

## Coding style
- 2-space indent, semicolons, single quotes, `const`/`let` (never `var`).
- Small pure helpers over cleverness. Keep DOM rendering in template strings
  consistent with existing screens.
- **Always escape** user data rendered into HTML with `escape()` from `js/ui.js`.
  No unescaped interpolation of user/DB values into innerHTML — treat this as a
  security rule, not a preference.
- Currency: format with the existing `peso()` helper (PHP, 2 dp).
- Errors: repositories throw; UI catches and shows a friendly message. Reuse the
  existing friendly-error mappers; never surface raw Postgres errors to users.
- Icons: add to the `icons` map in `js/ui.js` (24px stroke SVG), don't inline.

## Database / migration workflow
- SQL is **not** version-controlled automatically. Every schema change must be
  written as an idempotent SQL snippet (use `if not exists`,
  `create or replace`, `drop policy if exists`) and appended to a new file under
  `docs/migrations/` with a datestamp, AND applied by the human in the Supabase
  SQL editor. Never assume you can run SQL against the database yourself.
- New tables: `id uuid pk default gen_random_uuid()`, `household_id`,
  `created_at`, `updated_at` (+ touch trigger), and soft-delete where records are
  user data. Add RLS + grants in the same snippet.

## Testing parameters
- No automated test framework is set up (deliberate, given no build step). Do
  **not** add Jest/Vitest/Playwright without asking.
- For each change, provide a **manual test checklist**: exact click-path, what to
  observe, and a Supabase table check where relevant.
- Every data-mutating change must be verified in **two accounts sharing one
  household** to confirm sharing + RLS still hold.
- Barcode/camera features: note that they require HTTPS or localhost, and that
  laptop webcams fail on 1D barcodes — test on a phone via the live URL.

## Secrets & safety
- The Supabase URL and **publishable** key are safe in client code
  (`js/config.js`); protection is RLS. Never place the service_role/secret key in
  the front-end or repo.
- Do not commit anything that isn't already public. The repo is public.

## Deploy
- `git push` to `main` deploys via GitHub Pages. There is no server.
- Schema-change commit order is governed by "Commit & deploy discipline" below —
  SQL is run and tested *before* the commit, not after.

## Commit & deploy discipline
Pushing to `main` deploys live to GitHub Pages, so a commit is a deploy. Treat
committing as a gated action, not an automatic one:

- **Never commit or push until the human has tested the change and said it works.**
  Write the code (and any migration file), give the manual test checklist, then
  STOP. Wait for an explicit "it works, commit it" before staging anything.
- **Show before committing.** Before committing, run `git status` and show exactly
  what will be staged. The human is the last line of defence against a secret
  (an .env, a key, a *.sql dump) reaching this public repo — never commit files
  they haven't seen staged.
- **Database changes are committed with their code.** When a change includes a
  schema migration, the sequence is: write the app code + the dated migration file
  → the human runs the SQL in Supabase → the human tests the app → only then
  commit the code and the migration file together in one commit. Never commit a
  feature whose migration hasn't been run and tested.
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
Ask before: adding dependencies, changing the auth model, altering RLS,
introducing a build step, or building anything under "Explicitly rejected" in the
roadmap.
