import { baseUnitFor, totalBaseQuantity } from './units.js';
import { STORES, getAll, put, update, remove, countByIndex, newId, nowIso } from './local_db.js';

// One product's barcode can be written several ways. UPC-A (12), EAN-13 and
// ITF-14 are the same number at different lengths, differing only by leading
// zeros — the label prints one form, the scanner may report another, and a
// human typing it in copies whatever they see. Real example from this
// household: Phoenix garbage bag stored as 04800375003646 and scanned as
// 4800375003646. GS1's answer is to compare on the 14-digit zero-padded form,
// so that is the key everything here reduces to.
//
// Lengths 12-14 only, for two reasons. An 8-digit EAN-8 is its own number,
// not a shortened EAN-13, so padding it out would be claiming an equivalence
// that does not exist — and it could then collide with a genuine 12-digit
// code that happens to begin with zeros. Anything else (a CODE-128
// alphanumeric, a partial code typed by hand) gets null and matches
// literally, which is the safe direction to fail in.
//
// Note this only ever equates codes whose extra leading digits are zeros. A
// true ITF-14 carton code like 14800375003646 has a non-zero indicator digit
// and stays a distinct product — a case of 24 is not the same thing as one
// unit, and must not be matched as if it were.
export function gtinKey(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[\s-]/g, '');
  if (!/^\d{12,14}$/.test(digits)) return null;
  return digits.padStart(14, '0');
}

const byNameThenSize = (a, b) =>
  a.name.localeCompare(b.name) ||
  Number(a.total_base_quantity) - Number(b.total_base_quantity);

export const productRepository = {
  async getProducts({ includeArchived = false } = {}) {
    const rows = await getAll(STORES.products);
    const visible = includeArchived ? rows : rows.filter((p) => !p.archived);
    return visible.sort(byNameThenSize);
  },

  // Archived products included: scanning something you archived should find
  // it, not offer to create a duplicate.
  async findByBarcode(barcode) {
    const code = (barcode || '').trim();
    if (!code) return null;
    const key = gtinKey(code);
    const all = await getAll(STORES.products);
    return all.find((p) => (key
      ? gtinKey(p.barcode) === key
      : (p.barcode || '').trim() === code)) || null;
  },

  async createProduct(p) {
    const now = nowIso();
    const row = { id: newId(), ...toRow(p), archived: false, created_at: now, updated_at: now };
    return put(STORES.products, row);
  },

  async updateProduct(id, p) {
    return update(STORES.products, id, (old) => ({ ...old, ...toRow(p), updated_at: nowIso() }));
  },

  async setArchived(id, archived) {
    await update(STORES.products, id, (old) => ({ ...old, archived, updated_at: nowIso() }));
  },

  // Permanent, so it refuses while any price (hidden ones included) still
  // points at the product — the job the server's foreign key used to do.
  // The screen checks first, but the rule belongs here.
  async deleteProduct(id) {
    if (await this.countAllObservations(id)) {
      const err = new Error('This product still has recorded prices, so it can only be archived.');
      err.friendly = true;
      throw err;
    }
    await remove(STORES.products, id);
  },

  // Counts ALL price rows (even hidden ones) — used to decide archive vs. permanent delete
  async countAllObservations(productId) {
    return countByIndex(STORES.observations, 'product_id', productId);
  },
};

function toRow(p) {
  const count = p.unitCount > 0 ? p.unitCount : 1;
  return {
    name: p.name.trim(),
    brand: (p.brand || '').trim() || null,
    category: (p.category || '').trim() || null,
    barcode: (p.barcode || '').trim() || null,
    unit_count: count,
    unit_size: p.unitSize,
    unit_size_unit: p.unitSizeUnit,
    base_unit: baseUnitFor(p.unitSizeUnit),
    total_base_quantity: totalBaseQuantity(count, p.unitSize, p.unitSizeUnit),
  };
}
