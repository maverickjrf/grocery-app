# Status — where we left off

This file is the pointer, not the log. It always describes *right now*: what's
in flight, what's waiting on the human, what's next. Git history is the log —
don't duplicate it here. Overwritten at natural checkpoints, not after every
message.

## Right now
Branch: `feature/claude-code-migration`.

`docs/migrations/` (the reconstructed, idempotent SQL source-of-truth for the
schema) plus `.gitignore`, `CLAUDE.md`, and the rest of `docs/` are written and
reviewed, but **not yet committed** — waiting on an explicit go-ahead per
"Commit & deploy discipline" in `CLAUDE.md`. `README.md` also has an uncommitted
rewrite (pre-dates this thread).

Two live SQL fixes have already been run by hand in the Supabase SQL editor and
confirmed working by the human, and are reflected in the migration files:
- `create_household()` — was leaving `invite_expires_at` NULL, which
  `join_household()` treats as expired; now sets a 3-day expiry via
  `generate_invite_code()`.
- `set_observation_recorder()` — was trusting client-supplied `observed_by`;
  now forces it to `auth.uid()`.

## Waiting on
Human go-ahead to stage and commit the untracked/modified files above.

## Next up
Nothing queued yet.
