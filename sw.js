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
//
// There is no API to think about: the app's data lives in IndexedDB on the
// device, and the only thing fetched from elsewhere is the barcode library.
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
const CDN_HOSTS = new Set(['esm.sh']);

// Precached on install for a cold offline start. Deliberately NOT the CDN
// module URLs: esm.sh answers with a shim that re-exports deeper versioned
// files, so caching the entry point alone would leave a broken module graph
// offline. Those are captured at runtime instead, whatever shape they take.
const SHELL_ASSETS = [
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/backup.js',
  './js/data_screen.js',
  './js/dialog.js',
  './js/insights.js',
  './js/local_db.js',
  './js/nav.js',
  './js/observations.js',
  './js/product_detail.js',
  './js/product_form.js',
  './js/products.js',
  './js/products_screen.js',
  './js/push.js',
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

// Web Push (experiment — see js/push.js). The payload is JSON
// { title, body, url } sent by the outside trigger. Chrome requires every
// push to show a notification, so a missing or garbled payload still shows
// a generic one rather than nothing.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data.text() }; // plain text: use it as the body
  }
  const title = String(data.title || 'Grocery Price Tracker');
  const body = String(data.body || '');
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url: typeof data.url === 'string' ? data.url : '' },
  }));
});

// Tapping a notification: focus an open window of the app if there is one,
// otherwise open it. Only same-origin URLs are honoured, so a push payload
// can't send the user off to an arbitrary site.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  let target = scope;
  try {
    const wanted = new URL(event.notification.data && event.notification.data.url || '', scope);
    if (wanted.href.startsWith(scope)) target = wanted.href;
  } catch { /* keep the scope */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(scope));
    if (open) {
      await open.focus();
      if (target !== scope && 'navigate' in open) await open.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
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
