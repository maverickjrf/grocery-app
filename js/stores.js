import { STORES, getAll, put, update, newId, nowIso } from './local_db.js';

export const storeRepository = {
  async getStores({ includeArchived = false } = {}) {
    const rows = await getAll(STORES.stores);
    const visible = includeArchived ? rows : rows.filter((s) => !s.archived);
    return visible.sort((a, b) => a.name.localeCompare(b.name));
  },
  async createStore(name, location) {
    const now = nowIso();
    await put(STORES.stores, {
      id: newId(),
      name: name.trim(),
      location: (location || '').trim() || null,
      archived: false,
      created_at: now,
      updated_at: now,
    });
  },
  async updateStore(id, { name, location }) {
    await update(STORES.stores, id, (old) => ({
      ...old,
      name: name.trim(),
      location: (location || '').trim() || null,
      updated_at: nowIso(),
    }));
  },
  async setArchived(id, archived) {
    await update(STORES.stores, id, (old) => ({ ...old, archived, updated_at: nowIso() }));
  },
};
