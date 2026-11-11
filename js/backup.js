import { STORES, getAll, getMeta, setMeta, replaceAllData, isStoragePersisted } from './local_db.js';

// Backup and restore. Everything lives on one device now, so a wiped browser
// profile or a lost phone is total loss unless a file exists somewhere else.
// The same parser reads both a backup made here and the one-off export taken
// from Supabase before it was retired — one feature, two jobs.

const FORMAT = 'grocery-export';
const VERSION = 2; // 1 = the Supabase export; 2 = backups from the local app
const LAST_BACKUP_KEY = 'lastBackupAt';

// The columns kept per table. Anything else in a file is dropped, which is how
// the Supabase export loses what no longer means anything: household_id,
// created_by/observed_by, family_id, photo_url, and the legacy package columns
// (package_quantity, package_unit, normalized_quantity).
const COLUMNS = {
  stores: ['id', 'name', 'location', 'archived', 'created_at', 'updated_at'],
  products: [
    'id', 'barcode', 'name', 'brand', 'category',
    'unit_count', 'unit_size', 'unit_size_unit', 'base_unit', 'total_base_quantity',
    'archived', 'created_at', 'updated_at',
  ],
  observations: [
    'id', 'product_id', 'store_id', 'observed_price', 'quantity_purchased',
    'calculated_unit_price', 'calculated_price_per_subunit',
    'unit_count', 'unit_size', 'unit_size_unit', 'base_unit',
    'observation_date', 'source', 'notes', 'recorded_by_name', 'is_deleted',
    'created_at', 'updated_at',
  ],
};

// Required non-empty, per table. A row missing one of these would break a
// screen later, so the whole file is refused rather than half-imported.
const REQUIRED = {
  stores: ['id', 'name'],
  products: ['id', 'name', 'unit_size', 'unit_size_unit', 'base_unit', 'total_base_quantity'],
  observations: ['id', 'product_id', 'store_id', 'observed_price', 'calculated_unit_price',
    'unit_size', 'unit_size_unit', 'base_unit', 'observation_date'],
};

// Postgres numeric can arrive as a string depending on the client; the app
// does arithmetic on these, so make them numbers once, here.
const NUMERIC = new Set([
  'unit_count', 'unit_size', 'total_base_quantity', 'observed_price', 'quantity_purchased',
  'calculated_unit_price', 'calculated_price_per_subunit',
]);

function friendly(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

function normalizeRow(table, raw, index) {
  if (!raw || typeof raw !== 'object') throw friendly(`The file is damaged: ${table} entry ${index + 1} isn't a record.`);
  const row = {};
  for (const col of COLUMNS[table]) {
    let v = raw[col];
    if (v === undefined) v = null;
    if (v !== null && NUMERIC.has(col)) {
      v = Number(v);
      if (!Number.isFinite(v)) throw friendly(`The file is damaged: ${table} entry ${index + 1} has a bad ${col}.`);
    }
    row[col] = v;
  }
  for (const col of REQUIRED[table]) {
    if (row[col] === null || row[col] === '') {
      throw friendly(`The file is damaged: ${table} entry ${index + 1} is missing ${col}.`);
    }
  }
  if (row.unit_count === null) row.unit_count = 1;
  if (table === 'observations') {
    row.is_deleted = row.is_deleted === true;
    row.source = row.source || 'price_update';
    if (row.calculated_price_per_subunit === null) row.calculated_price_per_subunit = row.observed_price / row.unit_count;
  } else {
    row.archived = row.archived === true;
  }
  return row;
}

// Text in → normalized, checked data out. Throws a readable message for
// anything that isn't a complete, consistent backup. Nothing is written.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw friendly("That file isn't a backup — it couldn't be read as JSON."); }

  if (!data || data.format !== FORMAT) throw friendly("That file isn't a Grocery Price Tracker backup.");
  if (!(data.version >= 1 && data.version <= VERSION)) {
    throw friendly('That backup was made by a newer version of the app. Reload the app and try again.');
  }

  const out = { exportedAt: data.exported_at || null };
  for (const table of Object.keys(COLUMNS)) {
    if (!Array.isArray(data[table])) throw friendly(`The file is damaged: it has no ${table} list.`);
    out[table] = data[table].map((r, i) => normalizeRow(table, r, i));
  }

  // Every price must point at a product and a store in the same file — the
  // old foreign keys guaranteed this for the Supabase export, and a backup is
  // written whole, so a miss means the file was edited or truncated.
  const productIds = new Set(out.products.map((p) => p.id));
  const storeIds = new Set(out.stores.map((s) => s.id));
  const orphan = out.observations.find((o) => !productIds.has(o.product_id) || !storeIds.has(o.store_id));
  if (orphan) throw friendly('The file is damaged: some prices point at a product or store that isn\'t in it.');

  return out;
}

export const backupRepository = {
  async counts() {
    const [stores, products, observations] = await Promise.all([
      getAll(STORES.stores), getAll(STORES.products), getAll(STORES.observations),
    ]);
    return { stores: stores.length, products: products.length, observations: observations.length };
  },

  // Everything, archived and hidden rows included — a backup that drops rows
  // isn't one.
  async exportAll() {
    const [stores, products, observations] = await Promise.all([
      getAll(STORES.stores), getAll(STORES.products), getAll(STORES.observations),
    ]);
    const exportedAt = new Date().toISOString();
    return { format: FORMAT, version: VERSION, exported_at: exportedAt, stores, products, observations };
  },

  async markBackedUp(at) {
    try { await setMeta(LAST_BACKUP_KEY, at); } catch { /* only a reminder */ }
  },

  // Whether the browser has promised not to clear this site's data on its own.
  storageProtected: isStoragePersisted,

  async lastBackupAt() {
    try { return (await getMeta(LAST_BACKUP_KEY)) || null; } catch { return null; }
  },

  // Destructive: replaces, never merges. Merging two copies of the same data
  // would need conflict rules this app has no use for; the screen confirms
  // before calling this.
  async replaceAll(parsed) {
    await replaceAllData(parsed);
  },
};

// Hands a file to the browser as a download. DOM work, so it lives beside the
// repository rather than in it.
export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
