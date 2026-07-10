const KEY = 'currentStoreId';

export const session = {
  getCurrentStoreId() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  setCurrentStoreId(id) {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};