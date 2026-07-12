# Grocery Price Tracker

A household grocery price-tracking Progressive Web App. Family members record
prices they observe in stores, and the app tracks price history, computes unit
prices, and shows where each product is cheapest. All pricing data is
user-observed — the app does not scrape or auto-look-up external prices.

## Tech stack

- **Front-end:** Vanilla JavaScript (ES modules), no framework.
- **Styling:** Hand-written CSS with CSS custom properties; light/dark via
  `prefers-color-scheme`.
- **Backend:** [Supabase](https://supabase.com) (hosted) — Postgres, Auth, Row
  Level Security (RLS), PostgREST auto-API, and PL/pgSQL RPC functions.
- **Hosting:** [GitHub Pages](https://pages.github.com/) (static).
- **Barcode scanning:** [ZXing](https://github.com/zxing-js/library)
  (`@zxing/browser` + `@zxing/library`), loaded as ESM from esm.sh.
- **Supabase client:** `@supabase/supabase-js@2`, loaded as ESM from jsdelivr.

**No build step.** There is no npm install, bundler, or compile step — every
dependency is loaded directly as a pinned-version ESM import from a CDN. Edits
deploy by committing and pushing static files.

## Quick start

1. Clone the repo:
   ```
   git clone https://github.com/maverickjrf/grocery-app.git
   cd grocery-app
   ```
2. Serve the folder with any static file server (a build step is neither
   needed nor supported) — for example VS Code's **Live Server** extension, or:
   ```
   python -m http.server
   ```
3. Set your Supabase project credentials in [js/config.js](js/config.js):
   ```js
   const SUPABASE_URL = 'https://<your-project>.supabase.co';
   const SUPABASE_PUBLISHABLE_KEY = '<your-publishable-key>';
   ```
   These are safe to keep in client code — access is protected by Postgres Row
   Level Security, not by hiding the key. Never put the Supabase
   `service_role`/secret key here.
4. Open the served URL in your browser. Barcode scanning requires HTTPS or
   `localhost`, and works best on a phone camera (laptop webcams struggle with
   1D barcodes).

## Deploying

Deployment is just `git push` to `main` — GitHub Pages serves the static files
directly from the branch. There is no server and nothing to build. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for details, including how database
schema changes are applied.

## Documentation

See the [docs/](docs/) folder for the full picture:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architectural decisions and
  the reasoning behind them, implemented features, and what's on hold.
- [docs/schema.md](docs/schema.md) — full database schema, RLS policies, and
  helper functions.
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's next, what's later, and what's
  been explicitly rejected.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — how the app is hosted and
  operated day to day.
- `docs/migrations/` — idempotent SQL snippets applied by hand in the
  Supabase SQL editor.
- [CLAUDE.md](CLAUDE.md) — developer guide and ground rules for working in
  this codebase.
