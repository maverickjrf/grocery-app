import { supabase } from './config.js';
import { baseUnitFor, normalizeQuantity, totalBaseQuantity } from './units.js';

const PRODUCT_FIELDS =
  'id, name, brand, category, barcode, unit_count, unit_size, unit_size_unit, base_unit, total_base_quantity';

export const productRepository = {
  async getProducts({ includeArchived = false } = {}) {
    let q = supabase.from('products')
      .select(PRODUCT_FIELDS + ', photo_url, archived')
      .order('name', { ascending: true })
      .order('total_base_quantity', { ascending: true });
    if (!includeArchived) q = q.eq('archived', false);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async findByBarcode(barcode) {
    const code = (barcode || '').trim();
    // UPC-A (12 digits) and EAN-13 (13 digits, leading 0) are the same code —
    // a scan can come back in either form depending on the scanner/label, so
    // match against both rather than requiring an exact stored form.
    const variants = [code];
    if (code.length === 13 && code.startsWith('0')) variants.push(code.slice(1));
    else if (code.length === 12) variants.push('0' + code);
    const { data, error } = await supabase.from('products')
      .select(PRODUCT_FIELDS)
      .in('barcode', variants).limit(1);
    if (error) throw error;
    return data[0] || null;
  },

  async createProduct(p) {
    const { data, error } = await supabase.from('products')
      .insert(await this._toRow(p))
      .select(PRODUCT_FIELDS)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProduct(id, p) {
    const { data, error } = await supabase.from('products')
      .update(await this._toRow(p)).eq('id', id)
      .select(PRODUCT_FIELDS)
      .single();
    if (error) throw error;
    return data;
  },

  async setArchived(id, archived) {
    const { error } = await supabase.from('products').update({ archived }).eq('id', id);
    if (error) throw error;
  },

  async deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  },

  // Counts ALL price rows (even hidden ones) — used to decide archive vs. permanent delete
  async countAllObservations(productId) {
    const { count, error } = await supabase.from('observations')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);
    if (error) throw error;
    return count || 0;
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