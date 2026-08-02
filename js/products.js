import { supabase } from './config.js';
import { baseUnitFor, normalizeQuantity, totalBaseQuantity } from './units.js';
import { readThrough, requireNetwork, replaceAll, getAll, STORES } from './local_db.js';

const PRODUCT_FIELDS =
  'id, name, brand, category, barcode, unit_count, unit_size, unit_size_unit, base_unit, total_base_quantity';

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

// The stored value could be sitting in any of those lengths, so ask the
// database for all of them at once — still an indexed lookup, unlike a
// pattern match.
function barcodeVariants(code) {
  const key = gtinKey(code);
  if (!key) return [code];
  const forms = new Set([code]);
  for (const len of [12, 13, 14]) {
    if (key.slice(0, 14 - len) === '0'.repeat(14 - len)) forms.add(key.slice(14 - len));
  }
  return [...forms];
}

export const productRepository = {
  // Fetches every product, archived included, and filters locally. One query
  // and one cached copy serves both the normal and "show archived" views —
  // caching a separate copy per filter would be two sets to keep in step.
  async getProducts({ includeArchived = false } = {}) {
    const rows = await readThrough({
      fetch: async () => {
        const { data, error } = await supabase.from('products')
          .select(PRODUCT_FIELDS + ', photo_url, archived')
          .order('name', { ascending: true })
          .order('total_base_quantity', { ascending: true });
        if (error) throw error;
        return data;
      },
      save: (data) => replaceAll(STORES.products, data),
      load: () => getAll(STORES.products),
    });
    const visible = includeArchived ? rows : rows.filter((p) => !p.archived);
    // The saved copy comes back in insertion order, so re-apply the sort the
    // server would have done.
    return [...visible].sort((a, b) =>
      a.name.localeCompare(b.name) ||
      Number(a.total_base_quantity) - Number(b.total_base_quantity));
  },

  // Scanning in a store is the likeliest place to have no signal, so this
  // falls back to the saved products rather than failing the scan.
  async findByBarcode(barcode) {
    const code = (barcode || '').trim();
    const variants = barcodeVariants(code);

    const rows = await readThrough({
      fetch: async () => {
        const { data, error } = await supabase.from('products')
          .select(PRODUCT_FIELDS)
          .in('barcode', variants).limit(1);
        if (error) throw error;
        return data; // an empty result is a real answer: no such barcode
      },
      // A single-product lookup must not overwrite the full product cache.
      save: () => Promise.resolve(),
      // Offline this is the only path that runs — readThrough answers from the
      // saved copy and never reaches the fallback below — so match on the key
      // here, not on the variant list, and the rule stays the same either way.
      load: async () => {
        const cached = await getAll(STORES.products);
        const key = gtinKey(code);
        return cached.filter((p) => (key
          ? gtinKey(p.barcode) === key
          : (p.barcode || '').trim() === code));
      },
    });
    if (rows[0]) return rows[0];

    // Nothing matched literally. A stored code can still be the same number
    // written in a way no variant list predicts — a space or dash typed in by
    // hand, an unusual length. Compare on the key across the whole product
    // list before declaring the barcode unknown; that read is cached, and this
    // only runs on a miss.
    const key = gtinKey(code);
    if (!key) return null;
    const all = await this.getProducts({ includeArchived: true });
    return all.find((p) => gtinKey(p.barcode) === key) || null;
  },

  async createProduct(p) {
    return requireNetwork(async () => {
      const { data, error } = await supabase.from('products')
        .insert(await this._toRow(p))
        .select(PRODUCT_FIELDS)
        .single();
      if (error) throw error;
      return data;
    });
  },

  async updateProduct(id, p) {
    return requireNetwork(async () => {
      const { data, error } = await supabase.from('products')
        .update(await this._toRow(p)).eq('id', id)
        .select(PRODUCT_FIELDS)
        .single();
      if (error) throw error;
      return data;
    });
  },

  async setArchived(id, archived) {
    return requireNetwork(async () => {
      const { error } = await supabase.from('products').update({ archived }).eq('id', id);
      if (error) throw error;
    });
  },

  async deleteProduct(id) {
    return requireNetwork(async () => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    });
  },

  // Counts ALL price rows (even hidden ones) — used to decide archive vs. permanent delete
  async countAllObservations(productId) {
    return requireNetwork(async () => {
      const { count, error } = await supabase.from('observations')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId);
      if (error) throw error;
      return count || 0;
    });
  },

  async _toRow(p) {
    const { data: family_id, error } = await supabase.rpc('find_or_create_family',
      { p_brand: p.brand || '', p_name: p.name });
    if (error) throw error;
    const count = p.unitCount > 0 ? p.unitCount : 1;
    const totalInUnit = count * p.unitSize;
    return {
      family_id,
      name: p.name.trim(),
      brand: (p.brand || '').trim() || null,
      category: (p.category || '').trim() || null,
      barcode: (p.barcode || '').trim() || null,
      unit_count: count,
      unit_size: p.unitSize,
      unit_size_unit: p.unitSizeUnit,
      base_unit: baseUnitFor(p.unitSizeUnit),
      total_base_quantity: totalBaseQuantity(count, p.unitSize, p.unitSizeUnit),
      // Legacy columns, kept in step for one migration cycle as a rollback net.
      // They keep their original meaning: the total size of the whole package.
      package_quantity: totalInUnit,
      package_unit: p.unitSizeUnit,
      normalized_quantity: normalizeQuantity(totalInUnit, p.unitSizeUnit),
    };
  },
};