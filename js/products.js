import { supabase } from './config.js';
import { baseUnitFor, normalizeQuantity } from './units.js';

export const productRepository = {
  async getProducts() {
    const { data, error } = await supabase.from('products')
      .select('id, name, brand, category, barcode, package_quantity, package_unit, base_unit, photo_url')
      .order('name', { ascending: true })
      .order('package_quantity', { ascending: true });
    if (error) throw error;
    return data;
  },

  async findByBarcode(barcode) {
    const { data, error } = await supabase.from('products')
      .select('id, name, brand, category, barcode, package_quantity, package_unit, base_unit')
      .eq('barcode', barcode).limit(1);
    if (error) throw error;
    return data[0] || null;
  },

  async createProduct(p) {
    const { error } = await supabase.from('products').insert(await this._toRow(p));
    if (error) throw error;
  },

  async updateProduct(id, p) {
    const { error } = await supabase.from('products').update(await this._toRow(p)).eq('id', id);
    if (error) throw error;
  },

  // Turns form input into a database row, computing base unit + normalized quantity
  async _toRow(p) {
    const { data: family_id, error } = await supabase.rpc('find_or_create_family',
      { p_brand: p.brand || '', p_name: p.name });
    if (error) throw error;
    return {
      family_id,
      name: p.name.trim(),
      brand: (p.brand || '').trim() || null,
      category: (p.category || '').trim() || null,
      barcode: (p.barcode || '').trim() || null,
      package_quantity: p.packageQuantity,
      package_unit: p.packageUnit,
      base_unit: baseUnitFor(p.packageUnit),
      normalized_quantity: normalizeQuantity(p.packageQuantity, p.packageUnit),
    };
  },
};