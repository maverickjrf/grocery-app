import { supabase } from './config.js';
import { pricePerBase, pricePerSubunit, baseUnitFor } from './units.js';
import { readThrough, replaceByIndex, getAllByIndex, STORES } from './local_db.js';

// `product_id` and `created_at` are selected for the local copy's sake: the
// first indexes cached history by product, the second reproduces the server's
// tie-break between prices recorded on the same day.
const HISTORY_FIELDS =
  'id, product_id, store_id, observed_price, calculated_unit_price, calculated_price_per_subunit, ' +
  'quantity_purchased, observation_date, created_at, notes, base_unit, unit_count, unit_size, unit_size_unit, ' +
  'recorded_by_name, store:stores(name, location)';

// The package snapshot every observation carries, so history stays correct even
// if the product is later reshaped. `p` supplies unitCount/unitSize/unitSizeUnit —
// from the product when recording, from the row's OWN snapshot when editing.
function packageSnapshot(p) {
  const count = p.unitCount > 0 ? p.unitCount : 1;
  return {
    unit_count: count,
    unit_size: p.unitSize,
    unit_size_unit: p.unitSizeUnit,
    base_unit: baseUnitFor(p.unitSizeUnit),
    // Legacy snapshot columns, kept in step for one migration cycle.
    package_quantity: count * p.unitSize,
    package_unit: p.unitSizeUnit,
  };
}

function prices(p) {
  const count = p.unitCount > 0 ? p.unitCount : 1;
  return {
    calculated_unit_price: pricePerBase(p.observedPrice, count, p.unitSize, p.unitSizeUnit),
    calculated_price_per_subunit: pricePerSubunit(p.observedPrice, count),
  };
}

export const observationRepository = {
  async recordObservation(p) {
    const row = {
      product_id: p.productId,
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      source: 'price_update',
      ...packageSnapshot(p),
      ...prices(p),
    };
    if (crypto && crypto.randomUUID) row.id = crypto.randomUUID();
    const { error } = await supabase.from('observations').insert(row);
    if (error) throw error;
  },

  // Edit an existing entry. Recalculates both prices from its own package
  // snapshot — never from the live product row.
  async updateObservation(id, p) {
    const { error } = await supabase.from('observations').update({
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      ...prices(p),
    }).eq('id', id);
    if (error) throw error;
  },

  async softDeleteObservation(id) {
    const { error } = await supabase.from('observations').update({ is_deleted: true }).eq('id', id);
    if (error) throw error;
  },

  async hardDeleteObservation(id) {
    const { error } = await supabase.from('observations').delete().eq('id', id);
    if (error) throw error;
  },

  // Cached per product. Rows are saved exactly as the server returns them —
  // including the embedded store name — so the saved copy needs no join
  // rebuilt offline. The cost is that a store renamed while offline shows its
  // old name in history until the next successful fetch, which is a fair
  // trade for not maintaining a second lookup.
  async getHistoryForProduct(productId) {
    const rows = await readThrough({
      fetch: async () => {
        const { data, error } = await supabase.from('observations')
          .select(HISTORY_FIELDS)
          .eq('product_id', productId)
          .eq('is_deleted', false)
          .order('observation_date', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        // Deleted rows are filtered by the query, so replacing this product's
        // saved rows wholesale is also what drops ones deleted since.
        return data;
      },
      save: (data) => replaceByIndex(STORES.observations, 'product_id', productId, data),
      load: () => getAllByIndex(STORES.observations, 'product_id', productId),
    });
    return [...rows].sort((a, b) =>
      String(b.observation_date).localeCompare(String(a.observation_date)) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')));
  },
};
