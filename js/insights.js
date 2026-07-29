// history: observations for ONE product, newest first, each with
// store_id, store:{name,location}, observed_price, calculated_unit_price,
// calculated_price_per_subunit, unit_count, observation_date, base_unit
export function computeStoreSummary(history) {
  const byStore = new Map();
  for (const o of history) {
    const key = o.store_id;
    if (!byStore.has(key)) {
      // first time we see a store = its most recent price (history is newest-first)
      byStore.set(key, {
        storeId: key,
        storeName: o.store?.name || 'Unknown store',
        location: o.store?.location || null,
        latestPrice: Number(o.observed_price),
        latestUnitPrice: Number(o.calculated_unit_price),
        latestSubunitPrice: o.calculated_price_per_subunit != null
          ? Number(o.calculated_price_per_subunit) : null,
        latestUnitCount: Number(o.unit_count ?? 1),
        latestDate: o.observation_date,
        baseUnit: o.base_unit,
        lowestPrice: Number(o.observed_price),
        count: 0,
      });
    }
    const s = byStore.get(key);
    s.count += 1;
    s.lowestPrice = Math.min(s.lowestPrice, Number(o.observed_price));
  }
  const stores = [...byStore.values()];
  let cheapest = null;
  for (const s of stores) {
    if (!cheapest || s.latestPrice < cheapest.latestPrice) cheapest = s;
  }
  return { stores, cheapest, baseUnit: history[0]?.base_unit || null };
}

export function relativeDays(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((now - then) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return 'a week ago';
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
  if (diff < 60) return 'a month ago';
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`;
  return `${Math.floor(diff / 365)}y ago`;
}