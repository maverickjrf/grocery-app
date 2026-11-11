# Deployment & Operations

This app has one moving part to deploy: static files. There is no backend —
the data lives in IndexedDB on the phone — and no build step.

## Front-end: GitHub Pages

- The front-end is a set of static files (`index.html`, `js/`, `css/`) served
  directly by GitHub Pages from the `main` branch.
- **Deploying is `git push` to `main`.** There is no build, no CI compile
  step, and nothing else to run.
- Propagation takes about **1 minute** after a push. If you don't see your
  change, hard-refresh (Ctrl/Cmd+Shift+R) — GitHub Pages and browsers both
  cache aggressively.
- Live URL: https://maverickjrf.github.io/grocery-app/

## Service worker & caching

`sw.js` (repo root, so its scope is `/grocery-app/`) caches the app shell so
the app loads without a network. What this changes about deploying:

- **You do not have to bump anything on a normal deploy.** The worker
  revalidates every cached file in the background and, when GitHub Pages
  returns a changed `ETag`/`Last-Modified`, shows the user "A new version is
  ready — Reload". The files are already cached by then, so the reload is
  instant. `CACHE_VERSION` in `sw.js` exists only as a hard reset; bump it to
  force every client to discard its caches wholesale.
- **A user may be one load behind.** The first load after a deploy is served
  from cache while the update downloads; the prompt appears once it has. This
  is deliberate — it is what makes the app open instantly and work offline.
  Hard-refresh to skip the wait.
- `SHELL_ASSETS` in `sw.js` lists the files precached on install. **Add new
  `js/*.js` files to it.** Forgetting is not fatal — anything missed is cached
  the first time it's used online — but it will not be there on a cold
  offline start until then.

### If a bad service worker ships

Recovery, in order of severity:

1. **Open `https://maverickjrf.github.io/grocery-app/?sw=off`** — unregisters
   the worker, deletes every cache, and skips re-registering for that load.
   Reload normally afterwards. Note this *does* reinstall the worker on that
   next normal load, which is what you want once a fix has shipped; if the
   worker is badly broken, keep using the `?sw=off` URL until it is. This is
   the built-in kill switch — give this URL to anyone who is stuck. It only
   clears cached app files; the IndexedDB data is never touched.
2. Push a fix and bump `CACHE_VERSION` so clients drop their old caches.
3. Worst case, delete `sw.js` and push. Browsers that 404 on the worker file
   drop the registration on their next update check.

Note that step 1 only helps the person who opens that URL. There is no way to
remotely un-deploy a worker already installed on someone's phone, which is why
the registration in `js/sw_register.js` is wrapped so a failure can never
block start-up.

## Data: on the device

There is no database to deploy. Each phone's data is in its own IndexedDB
(`grocery-local`); a deploy changes the code that reads it, never the data.

- **A deploy cannot lose data, but a bad upgrade path can.** Changing the
  object stores or indexes means bumping `DB_VERSION` in `js/local_db.js` and
  handling the old version in `onupgradeneeded`. That code runs once, on the
  user's only copy, with no undo. Never clear or recreate a store holding real
  data there (the v1→v2 clear was safe only because v1 was a cache).
- **Adding a field to a row needs no upgrade at all** — IndexedDB is
  schemaless. Read old rows as if the field were missing, and add it to the
  column lists in `js/backup.js` or backups will drop it.
- **Backups are the safety net.** Before testing anything risky on the real
  phone, make a backup from Backup & restore.
- **Desktop testing has its own data.** DevTools → Application → IndexedDB →
  `grocery-local`. That panel doesn't live-update: right-click → Refresh
  IndexedDB. Restore a backup file on desktop to test against real data.

The old Supabase project is retired; `docs/migrations/` is kept only as a
historical record of its schema.

## Camera / HTTPS requirement

Barcode scanning uses the device camera via `getUserMedia`, which browsers
only allow on secure contexts: **HTTPS or `localhost`**. GitHub Pages serves
over HTTPS by default, so the live site works; a plain local static server
over `http://` on a LAN IP will not get camera access. Laptop webcams also
tend to fail on 1D barcodes — test scanning on a phone via the live URL.
