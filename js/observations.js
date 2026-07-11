import { supabase } from './config.js';
import { unitPrice, baseUnitFor } from './units.js';

export const observationRepository = {
  async recordObservation(p) {
    const row = {
      product_id: p.productId,
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      calculated_unit_price: unitPrice(p.observedPrice, p.packageQuantity, p.packageUnit),
      package_quantity: p.packageQuantity,
      package_unit: p.packageUnit,
      base_unit: baseUnitFor(p.packageUnit),
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      source: 'price_update',
    };
    if (crypto && crypto.randomUUID) row.id = crypto.randomUUID();
    const { error } = await supabase.from('observations').insert(row);
    if (error) throw error;
  },

  // Edit an existing entry. Recalculates the unit price from its own package snapshot.
  async updateObservation(id, p) {
    const { error } = await supabase.from('observations').update({
      store_id: p.storeId,
      observed_price: p.observedPrice,
      quantity_purchased: p.quantityPurchased ?? null,
      observation_date: p.observationDate,
      notes: (p.notes || '').trim() || null,
      calculated_unit_price: unitPrice(p.observedPrice, p.packageQuantity, p.packageUnit),
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

  async getHistoryForProduct(productId) {
    const { data, error } = await supabase.from('observations')
      .select('id, store_id, observed_price, calculated_unit_price, quantity_purchased, observation_date, notes, base_unit, package_quantity, package_unit, recorded_by_name, store:stores(name, location)')
      .eq('product_id', productId)
      .eq('is_deleted', false)
      .order('observation_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
};