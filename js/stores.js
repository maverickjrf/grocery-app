import { supabase } from './config.js';
import { readThrough, requireNetwork, replaceAll, getAll, STORES } from './local_db.js';

export const storeRepository = {
  // Fetches every store, archived included, and filters locally — same reason
  // as products: one cached copy rather than one per filter.
  async getStores({ includeArchived = false } = {}) {
    const rows = await readThrough({
      fetch: async () => {
        const { data, error } = await supabase.from('stores')
          .select('id, name, location, archived')
          .order('name', { ascending: true });
        if (error) throw error;
        return data;
      },
      save: (data) => replaceAll(STORES.stores, data),
      load: () => getAll(STORES.stores),
    });
    const visible = includeArchived ? rows : rows.filter((s) => !s.archived);
    return [...visible].sort((a, b) => a.name.localeCompare(b.name));
  },
  async createStore(name, location) {
    return requireNetwork(async () => {
      const { error } = await supabase.from('stores')
        .insert({ name: name.trim(), location: (location || '').trim() || null });
      if (error) throw error;
    });
  },
  async updateStore(id, { name, location }) {
    return requireNetwork(async () => {
      const { error } = await supabase.from('stores')
        .update({ name: name.trim(), location: (location || '').trim() || null })
        .eq('id', id);
      if (error) throw error;
    });
  },
  async setArchived(id, archived) {
    return requireNetwork(async () => {
      const { error } = await supabase.from('stores').update({ archived }).eq('id', id);
      if (error) throw error;
    });
  },
};