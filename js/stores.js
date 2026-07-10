import { supabase } from './config.js';

export const storeRepository = {
  async getStores({ includeArchived = false } = {}) {
    let query = supabase.from('stores')
      .select('id, name, location, archived')
      .order('name', { ascending: true });
    if (!includeArchived) query = query.eq('archived', false);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  async createStore(name, location) {
    const { error } = await supabase.from('stores')
      .insert({ name: name.trim(), location: (location || '').trim() || null });
    if (error) throw error;
  },
  async updateStore(id, { name, location }) {
    const { error } = await supabase.from('stores')
      .update({ name: name.trim(), location: (location || '').trim() || null })
      .eq('id', id);
    if (error) throw error;
  },
  async setArchived(id, archived) {
    const { error } = await supabase.from('stores').update({ archived }).eq('id', id);
    if (error) throw error;
  },
};