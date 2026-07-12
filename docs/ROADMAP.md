# Roadmap

## Status
MVP complete and in real-world use. Three design-hardening milestones done
(attribution + leave/switch; type-ahead + search; invite security).

## Next up
### Milestone A — Dashboard & price-trend chart
- Dashboard: totals (products, stores, observations), household members list,
  recent-activity feed (latest observations).
- Price-trend chart per product: price vs. time, filter by all stores / single
  store, windows 30d / 90d / 1y / all-time. Charting lib TBD (lightweight; a
  small canvas/SVG lib preferred over a heavy framework given no build step).

## Later — Analytics (Phase 2 of original vision)
- Per-product stats: lowest / highest / average / most-recent price.
- Price-increase detection: latest vs previous, amount + %.
- Inflation tracking: 30/90/365-day trend, historical vs current average.
- Store comparison ranking (avg / lowest-ever / most-recent).
- Best-value-per-package within a product family (unit-price comparison).
- Price volatility (most stable / most volatile products).

## Later — Phase 3 smart features
- Favorites.
- Shopping basket / regular list.
- Per-store basket cost optimization ("cheapest store for my basket").
- Price-change alerts (severity bands: 0-5% low, 5-15% med, 15%+ high).
- Data-quality anomaly detection on entry (flag values far from history).
- Reports export (CSV / Excel).

## Deferred infrastructure
- Offline support: PWA app-shell caching first, then offline
  record-and-sync (RxDB or hand-rolled IndexedDB queue). Groundwork already in
  schema (client UUIDs, updated_at, soft-deletes) and code (repository pattern).
- Product photos: Supabase Storage; `photo_url` reserved. May be scrapped.

## Explicitly rejected
Cross-household sharing; multi-household membership; adopt/copy stores-with-prices;
curated starter catalog; in-app password reset; single-use or dynamic-expiry
invite codes.

## Known follow-ups / tech debt
- Owner-only enforcement for invite controls + ownership handoff when an owner
  leaves (currently any member can manage invites; owner-leave can orphan
  ownership). Bundle these together.
