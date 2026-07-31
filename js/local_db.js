import { markOnline, markOffline, isOffline } from './connectivity.js';

// Local copy of household data, so screens still have something to show when
// the network is gone. Raw IndexedDB — the needs here are put/getAll/clear,
// which is not worth a dependency.
//
// There is deliberately no sync engine and no "changed since" bookkeeping.
// Every read fetches the full list and replaces the saved copy wholesale, so
// normal use of the app *is* the sync, and a row deleted on the server simply
// isn't in the next fetch. Tracking timestamps would buy nothing at household
// scale and would reintroduce the problem of noticing deleted rows.

const DB_NAME = 'grocery-local';
const DB_VERSION = 1;

// Stop waiting on a request that is never coming back. A phone showing full
// bars in a dead zone will happily leave a fetch pending forever, which is
// the difference between "shows saved prices" and "spins".
const NETWORK_TIMEOUT_MS = 8000;

export const STORES = {
  products: 'products',
  stores: 'stores',
  observations: 'observations',
  meta: 'meta',
  // Unused until offline writes land (Merge B2). Created now because adding
  // an object store later means bumping DB_VERSION and writing an upgrade
  // path; an empty store costs nothing.
  outbox: 'outbox',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.products)) db.createObjectStore(STORES.products, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.stores)) db.createObjectStore(STORES.stores, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.observations)) {
        const obs = db.createObjectStore(STORES.observations, { keyPath: 'id' });
        obs.createIndex('product_id', 'product_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
      if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: 'seq', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    // Private browsing and some locked-down settings block IndexedDB outright.
    // That costs offline support, never the app.
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function runTransaction(storeName, mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = work(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function getAll(storeName) {
  return runTransaction(storeName, 'readonly', (store) => store.getAll());
}

export function getAllByIndex(storeName, indexName, value) {
  return runTransaction(storeName, 'readonly', (store) => store.index(indexName).getAll(value));
}

export async function getMeta(key) {
  return runTransaction(STORES.meta, 'readonly', (store) => store.get(key));
}

export async function setMeta(key, value) {
  return runTransaction(STORES.meta, 'readwrite', (store) => store.put(value, key));
}

// Replace an entire store's contents. Wholesale replacement is what lets rows
// deleted on the server disappear locally without any extra machinery.
export function replaceAll(storeName, rows) {
  return runTransaction(storeName, 'readwrite', (store) => {
    store.clear();
    for (const row of rows) store.put(row);
  });
}

// Replace only the rows matching an index value — used for price history,
// which is fetched one product at a time and must not wipe other products.
export function replaceByIndex(storeName, indexName, value, rows) {
  return runTransaction(storeName, 'readwrite', (store) => {
    const cursorRequest = store.index(indexName).openCursor(IDBKeyRange.only(value));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); return; }
      for (const row of rows) store.put(row);
    };
  });
}

export async function clearAll() {
  const db = await openDb();
  const names = [...db.objectStoreNames];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const name of names) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// A stale cache belonging to a household the user has left is a privacy
// problem, not just a wrong number. Any change of household wipes everything.
const HOUSEHOLD_KEY = 'householdId';
export async function ensureHousehold(householdId) {
  try {
    const previous = await getMeta(HOUSEHOLD_KEY);
    if (previous && previous !== householdId) await clearAll();
    if (previous !== householdId) await setMeta(HOUSEHOLD_KEY, householdId);
  } catch { /* no local storage available — nothing cached to leak */ }
}

// Bumped on every wipe. A read started before sign-out can still be in
// flight when the clear finishes — the Home screen warms the product cache
// in the background, so this is easy to hit — and saving its result would
// quietly repopulate the store of a household nobody is signed into.
let generation = 0;

export async function forgetEverything() {
  generation += 1;
  try { await clearAll(); } catch { /* nothing to clear */ }
}

// A Postgres/PostgREST rejection carries a code and means the request was
// heard and refused — those must reach the user unchanged. Anything else
// (fetch rejected, timed out) is treated as "no usable network".
function isNetworkError(err) {
  if (!err) return false;
  if (err.code) return false;
  if (err.name === 'TimeoutError') return true;
  if (err.name === 'TypeError') return true;
  return /fetch|network|offline|timed? ?out/i.test(err.message || '');
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('Request timed out');
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// The one pattern every cached read uses: try the network, save what comes
// back, and fall back to the saved copy only when the network itself failed.
//
// `save` and `load` are passed in rather than assumed, because price history
// is stored per product while products and stores are stored wholesale.
export async function readThrough({ fetch: fetchFn, save, load }) {
  // Already known to be offline: answer from the saved copy immediately
  // rather than spending the whole timeout rediscovering it. Without this,
  // every offline read sat for 8 seconds first — which is what made
  // scanning a barcode offline feel like the app had frozen.
  if (isOffline() || navigator.onLine === false) {
    try {
      const cached = await load();
      if (cached && cached.length) return cached;
    } catch { /* nothing saved — fall through and try the network anyway */ }
  }

  const startedAt = generation;
  try {
    const rows = await withTimeout(fetchFn(), NETWORK_TIMEOUT_MS);
    markOnline();
    // Dropped if the cache was wiped while this was in flight.
    try { if (startedAt === generation) await save(rows); } catch { /* cache write failed; the data is still good */ }
    return rows;
  } catch (err) {
    if (!isNetworkError(err)) throw err; // a real refusal — let the UI say so
    markOffline();
    let cached = [];
    try { cached = await load(); } catch { /* no local copy available */ }
    if (!cached || !cached.length) throw offlineError(
      "You're offline, and this hasn't been saved on this device yet. Open it once while connected.");
    return cached;
  }
}

// Network failures reach the UI as "TypeError: Failed to fetch", which is not
// a sentence to show anyone. Repositories throw, the UI prints err.message —
// so the friendly wording has to be attached here.
function offlineError(message) {
  const err = new Error(message);
  err.offline = true;
  return err;
}

// For writes, which have no offline path yet (Merge B2). Adds the same 8s
// timeout the reads get — without it a mutating call can hang forever on a
// connection that never answers — and turns a network failure into something
// worth reading. "TypeError: Failed to fetch" is not a message to show
// anyone.
export async function requireNetwork(run) {
  try {
    const result = await withTimeout(run(), NETWORK_TIMEOUT_MS);
    markOnline();
    return result;
  } catch (err) {
    if (!isNetworkError(err)) throw err; // a real refusal keeps its own message
    markOffline();
    throw offlineError(
      "You're offline. This needs a connection — try again once you're back online.");
  }
}

export { isNetworkError };
