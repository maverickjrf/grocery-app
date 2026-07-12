# Deployment & Operations

This app has two moving parts to deploy: static front-end files, and a hosted
Supabase backend. Neither has a build step or a server process to manage.

## Front-end: GitHub Pages

- The front-end is a set of static files (`index.html`, `js/`, `css/`) served
  directly by GitHub Pages from the `main` branch.
- **Deploying is `git push` to `main`.** There is no build, no CI compile
  step, and nothing else to run.
- Propagation takes about **1 minute** after a push. If you don't see your
  change, hard-refresh (Ctrl/Cmd+Shift+R) — GitHub Pages and browsers both
  cache aggressively.
- Live URL: https://maverickjrf.github.io/grocery-app/

## Backend: hosted Supabase

The backend is a managed Supabase project — Postgres, Auth, and Row Level
Security (RLS). There is no application server; the browser talks to Supabase
directly over its auto-generated PostgREST API.

Configuration values live in [js/config.js](../js/config.js):

| Value                       | Where it lives         | Safe to expose publicly? |
|------------------------------|-------------------------|---------------------------|
| `SUPABASE_URL`                | `js/config.js`          | Yes                        |
| `SUPABASE_PUBLISHABLE_KEY`    | `js/config.js`          | Yes — protection comes from RLS, not key secrecy |
| `service_role` / secret key   | **nowhere in this repo** | **No — never put this in front-end code or commit it anywhere** |

The publishable key can only do what RLS policies allow. All real
access control is enforced by Postgres, keyed on `current_household_id()` —
see [docs/schema.md](schema.md).

## Database changes

Schema changes are **not** auto-deployed. The workflow is:

1. Write an idempotent SQL snippet (`if not exists`, `create or replace`,
   `drop policy if exists`, etc.) under `docs/migrations/`, named with a
   datestamp.
2. A human runs that snippet by hand in the **Supabase SQL editor** against
   the hosted project.
3. Commit the snippet to the repo so `docs/migrations/` stays the record of
   what's been applied.

There is no migration runner and no automatic sync between the repo and the
live database — the SQL editor step is mandatory and manual.

## Camera / HTTPS requirement

Barcode scanning uses the device camera via `getUserMedia`, which browsers
only allow on secure contexts: **HTTPS or `localhost`**. GitHub Pages serves
over HTTPS by default, so the live site works; a plain local static server
over `http://` on a LAN IP will not get camera access. Laptop webcams also
tend to fail on 1D barcodes — test scanning on a phone via the live URL.

## If you ever want to self-host Supabase

Right now the backend is Supabase's hosted (managed) offering — no server to
patch, back up, or scale. If that ever changes, the replacement is
Supabase's own self-hosted stack (Postgres, GoTrue, PostgREST, Realtime,
Storage, Kong), deployed via
[Supabase's official `docker-compose` setup](https://supabase.com/docs/guides/self-hosting/docker),
not a hand-written one — this app has no server component of its own to
containerize; only Supabase itself would move.

Before doing this, be aware it reintroduces exactly the operational cost this
project deliberately avoided: a server to run, patch, and pay for, plus
backup/monitoring that hosted Supabase currently handles for free. It would
also require migrating all existing data (schema + rows) from the hosted
project into the self-hosted one. Treat this as a deliberate, occasional
decision, not a default — see "Supabase over Firebase" in
[docs/ARCHITECTURE.md](ARCHITECTURE.md) for why hosted was chosen in the
first place.
