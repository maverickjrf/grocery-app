// The app's database. IndexedDB on the device is the source of truth — there
// is no server behind it, and nothing on the read or write path touches the
// network. Raw IndexedDB rather than a wrapper: the needs here are get, put,
// delete and getAll, which is not worth a dependency.
//
// Why local at all: the app used to live on Supabase's free tier, which pauses
// a project after a week without traffic. Irregular use meant arriving at the
// supermarket to a sleeping database. A grocery app that needs a server warmed
// up before shopping has its dependency backwards. See docs/ARCHITECTURE.md →
// "Local-first".
//
// Rows keep the old server's snake_case shape, package snapshots included, so
// moving them to a server later would be a plain insert. No sync is built.

const DB_NAME = 'grocery-local';
// v1 was the offline *cache* of Supabase data (partial columns, an embedded
// store on each price, soft-deleted prices missing). v2 is the real database.
const DB_VERSION = 2;

export const STORES = {
  products: 'products',
  stores: 'stores',
  observations: 'observations',
  meta: 'meta',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(STORES.products)) db.createObjectStore(STORES.products, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.stores)) db.createObjectStore(STORES.stores, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.observations)) {
        const obs = db.createObjectStore(STORES.observations, { keyPath: 'id' });
        obs.createIndex('product_id', 'product_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);

      if (event.oldVersion === 1) {
        // The v1 cache is the wrong shape to keep as real data, and the real
        // data arrives by importing the Supabase export. Mixing the two would
        // leave cache-shaped rows that only half work.
        for (const name of [STORES.products, STORES.stores, STORES.observations, STORES.meta]) {
          tx.objectStore(name).clear();
        }
        // Was reserved for offline writes to a server. Every write is local now.
        if (db.objectStoreNames.contains('outbox')) db.deleteObjectStore('outbox');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer version of the app opened in another tab wants to upgrade —
      // step aside rather than leave it blocked.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close the app in other tabs, then reload.'));
  }).catch((err) => {
    dbPromise = null;
    throw storageError(err, 'open');
  });
  return dbPromise;
}

// Repositories throw and the UI prints err.message, so a raw DOMException
// ("QuotaExceededError", "InvalidStateError") would reach the screen. The
// original error stays on `cause` for the console.
function storageError(err, kind) {
  if (err && err.friendly) return err;
  const quota = err && err.name === 'QuotaExceededError';
  const message = quota
    ? "This device is out of storage space, so it couldn't save. Free some space and try again."
    : kind === 'write'
      ? "Couldn't save on this device. Try again — if it keeps happening, reload the app."
      : "Couldn't read this device's saved data. Try reloading the app.";
  const out = new Error(message);
  out.friendly = true;
  out.cause = err;
  return out;
}

function runTransaction(storeNames, mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? storeNames.map((n) => tx.objectStore(n))
      : tx.objectStore(storeNames);
    const result = work(stores);
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(storageError(tx.error, mode === 'readwrite' ? 'write' : 'read'));
    tx.onabort = () => reject(storageError(tx.error, mode === 'readwrite' ? 'write' : 'read'));
  }));
}

export function getAll(storeName) {
  return runTransaction(storeName, 'readonly', (store) => store.getAll());
}

export function getAllByIndex(storeName, indexName, value) {
  return runTransaction(storeName, 'readonly', (store) => store.index(indexName).getAll(value));
}

export function countByIndex(storeName, indexName, value) {
  return runTransaction(storeName, 'readonly', (store) => store.index(indexName).count(value));
}

export function get(storeName, id) {
  return runTransaction(storeName, 'readonly', (store) => store.get(id));
}

export function put(storeName, row) {
  return runTransaction(storeName, 'readwrite', (store) => { store.put(row); return row; });
}

export function remove(storeName, id) {
  return runTransaction(storeName, 'readwrite', (store) => { store.delete(id); });
}

export function getMeta(key) {
  return runTransaction(STORES.meta, 'readonly', (store) => store.get(key));
}

export function setMeta(key, value) {
  return runTransaction(STORES.meta, 'readwrite', (store) => { store.put(value, key); });
}

// Replace all data in one transaction — used by restore/import. One
// transaction means a failure part-way leaves the old data exactly as it was,
// rather than half of each.
export function replaceAllData({ stores, products, observations }) {
  const names = [STORES.stores, STORES.products, STORES.observations];
  return runTransaction(names, 'readwrite', ([s, p, o]) => {
    s.clear(); p.clear(); o.clear();
    for (const row of stores) s.put(row);
    for (const row of products) p.put(row);
    for (const row of observations) o.put(row);
  });
}

// Read-modify-write on one row, inside a single transaction so nothing can
// slip in between the read and the write. `change` receives the stored row
// and returns the new one; a missing row is reported, not invented.
export function update(storeName, id, change) {
  return runTransaction(storeName, 'readwrite', (store) => {
    let updated = null;
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      updated = change(req.result);
      store.put(updated);
    };
    return { get value() { return updated; } };
  }).then((box) => {
    if (!box.value) {
      const err = new Error("That item no longer exists on this device. Go back and try again.");
      err.friendly = true;
      throw err;
    }
    return box.value;
  });
}

export const nowIso = () => new Date().toISOString();

// Client-generated ids, as before. randomUUID only exists in a secure context
// (HTTPS or localhost); the fallback keeps a plain-http LAN test working.
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Asks the browser not to evict this site's data under storage pressure.
// Chrome grants it silently to an installed PWA; elsewhere it may say no,
// which is why backups exist. Never throws — it must not affect start-up.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* unsupported */ }
  return false;
}

export async function isStoragePersisted() {
  try { return Boolean(navigator.storage && await navigator.storage.persisted()); }
  catch { return false; }
}
