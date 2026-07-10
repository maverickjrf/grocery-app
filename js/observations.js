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
    // Client-generated ID: an offline-created record already has its final identity.
    if (crypto && crypto.randomUUID) row.id = crypto.randomUUID();

    const { error } = await supabase.from('observations').insert(row);
    if (error) throw error;
  },

  async getHistoryForProduct(productId) {
    const { data, error } = await supabase.from('observations')
      .select('id, observed_price, calculated_unit_price, quantity_purchased, observation_date, notes, base_unit, store:stores(name), observer:profiles!observed_by(username)')
      .eq('product_id', productId)
      .eq('is_deleted', false)
      .order('observation_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
};