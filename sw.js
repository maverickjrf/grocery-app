// Service worker — makes the app shell load without a network.
//
// Lives at the repo root on purpose: served from GitHub Pages the file is
// /grocery-app/sw.js, which gives it the /grocery-app/ scope the app needs.
// Registered from js/sw_register.js.
//
// Strategy per request kind:
//   same-origin shell   stale-while-revalidate — instant load, self-healing
//   navigations         same, falling back to the cached index.html
//   CDN modules         cache-first, filled in at runtime
//   *.supabase.co       network-only, NEVER cached
//
// Why Supabase is never cached: serving a stale API response would show one
// household data that may no longer be theirs, and would mask the offline
// state the UI needs to react to. Caching domain data is IndexedDB's job
// (Merge B), where it can be scoped to a household and cleared on logout.
//
// Why stale-while-revalidate rather than a hand-bumped cache version: there
// is no build step here, so filenames carry no content hash. If correctness
// depended on remembering to bump CACHE_VERSION on every deploy, one missed
// bump would pin every user to stale JS with no way to recover. Instead each
// shell response is revalidated in the background, and a changed
// ETag/Last-Modified raises the "update available" prompt in the page.
// CACHE_VERSION below is only a hard reset lever.

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const CDN_CACHE = `cdn-${CACHE_VERSION}`;
const KEEP_CACHES = new Set([SHELL_CACHE, CDN_CACHE]);

// Module hosts we serve cache-first. Their responses are CORS-readable, so
// they cache and replay normally.
const CDN_HOSTS = new Set(['cdn.jsdelivr.net', 'esm.sh']);

// Precached on install for a cold offline start. Deliberately NOT the CDN
// module URLs: esm.sh answers with a shim that re-exports deeper versioned
// files, so caching the entry point alone would leave a broken module graph
// offline. Those are captured at runtime instead, whatever shape they take.
const SHELL_ASSETS = [
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/config.js',
  './js/dialog.js',
  './js/household.js',
  './js/insights.js',
  './js/nav.js',
  './js/observations.js',
  './js/product_detail.js',
  './js/product_form.js',
  './js/products.js',
  './js/products_screen.js',
  './js/scanner.js',
  './js/session.js',
  './js/shopping.js',
  './js/stores.js',
  './js/stores_screen.js',
  './js/suggest.js',
  './js/sw_register.js',
  './js/ui.js',
  './js/units.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One at a time rather than cache.addAll: addAll is all-or-nothing, so a
    // single renamed or mistyped path would fail the whole install. Anything
    // missed here is picked up by the fetch handler on first use, which keeps
    // this list an optimization for cold offline starts rather than something
    // that has to be perfectly maintained.
    await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => !KEEP_CACHES.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Sent by the page when the user accepts an update that needs a new worker.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // writes always go straight to network

  const url = new URL(request.url);

  if (url.hostname.endsWith('.supabase.co')) return; // never ours to touch

  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return; // anything else: untouched

  // A navigation always resolves to the one app-shell document, so cache it
  // under a fixed key — otherwise a deep link or a ?sw=off URL would each
  // cache their own copy under a different query string.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE, './index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
});

// Serve the cached copy at once, refresh it in the background, and speak up
// if what came back differs from what we had.
async function staleWhileRevalidate(event, cacheName, cacheKey) {
  const request = event.request;
  const key = cacheKey || request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(key);

  const revalidate = fetch(request).then(async (response) => {
    if (response && response.ok) {
      if (cached && hasChanged(cached, response)) await announceUpdate();
      await cache.put(key, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cached) {
    // Keep the worker alive for the background refresh, but don't make the
    // page wait on it — that background fetch is exactly what would hang in
    // a dead zone.
    event.waitUntil(revalidate);
    return cached;
  }

  const network = await revalidate;
  return network || offlineResponse(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return offlineResponse(request);
  }
}

// ETag first, Last-Modified as a fallback. If neither is comparable we say
// "unchanged": a missed prompt is a much smaller problem than nagging the
// user to reload on every single load.
function hasChanged(cached, fresh) {
  const cachedTag = cached.headers.get('ETag');
  const freshTag = fresh.headers.get('ETag');
  if (cachedTag && freshTag) return cachedTag !== freshTag;

  const cachedAt = cached.headers.get('Last-Modified');
  const freshAt = fresh.headers.get('Last-Modified');
  if (cachedAt && freshAt) return cachedAt !== freshAt;

  return false;
}

// Announced once per worker lifetime. The worker can be torn down and
// restarted, so the page guards against showing the banner twice as well.
let updateAnnounced = false;
async function announceUpdate() {
  if (updateAnnounced) return;
  updateAnnounced = true;
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'SHELL_UPDATED' });
}

function offlineResponse(request) {
  const accept = request.headers.get('Accept') || '';
  const isDocument = request.mode === 'navigate' || accept.includes('text/html');
  return new Response(
    isDocument ? '<h1>Offline</h1><p>Open the app once while connected, then it will work offline.</p>' : '',
    {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': isDocument ? 'text/html; charset=utf-8' : 'text/plain' },
    }
  );
}
