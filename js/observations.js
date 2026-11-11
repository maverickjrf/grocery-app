import { pricePerBase, pricePerSubunit, baseUnitFor } from './units.js';
import { STORES, getAll, getAllByIndex, put, update, remove, newId, nowIso } from './local_db.js';

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
    const now = nowIso();
    await put(STORES.observations, {
      id: newId(),
      product_id: p.productId,
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      source: 'price_update',
      ...packageSnapshot(p),
      ...prices(p),
      // There is one user now, so there is nobody to attribute to. Kept as a
      // column because imported prices carry the household member's name.
      recorded_by_name: null,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
  },

  // Edit an existing entry. Recalculates both prices from its own package
  // snapshot — never from the live product row.
  async updateObservation(id, p) {
    await update(STORES.observations, id, (old) => ({
      ...old,
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      ...prices(p),
      updated_at: nowIso(),
    }));
  },

  async softDeleteObservation(id) {
    await update(STORES.observations, id, (old) => ({ ...old, is_deleted: true, updated_at: nowIso() }));
  },

  async hardDeleteObservation(id) {
    await remove(STORES.observations, id);
  },

  // Newest first. Each row gets `store: { name, location }` joined on, which
  // is the shape the screens and insights.js were written against — the only
  // join in the app, done in JS against a store list of a few dozen rows.
  async getHistoryForProduct(productId) {
    const [rows, stores] = await Promise.all([
      getAllByIndex(STORES.observations, 'product_id', productId),
      getAll(STORES.stores),
    ]);
    const storeById = new Map(stores.map((s) => [s.id, s]));
    return rows
      .filter((o) => !o.is_deleted)
      .map((o) => {
        const s = storeById.get(o.store_id);
        return { ...o, store: s ? { name: s.name, location: s.location } : null };
      })
      .sort((a, b) =>
        String(b.observation_date).localeCompare(String(a.observation_date)) ||
        String(b.created_at || '').localeCompare(String(a.created_at || '')));
  },
};
