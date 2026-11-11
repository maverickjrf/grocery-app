# Data Schema (IndexedDB)

Database `grocery-local`, version **2**, defined in `js/local_db.js`. All data
lives on the device; there is no server. Rows keep the snake_case shape of the
old Supabase tables so they could be inserted into a server again unchanged.

Timestamps are ISO-8601 strings set by the repositories (`created_at` on
create, `updated_at` on every write). Imported rows keep whatever timestamps
the file had (they can be null). Ids are client-generated UUIDs.

## Object stores

### `stores` — keyPath `id`
| field      | type    | notes                         |
|------------|---------|-------------------------------|
| id         | string  | UUID                          |
| name       | string  | required                      |
| location   | string \| null |                        |
| archived   | boolean | default false                 |
| created_at | string  | ISO timestamp                 |
| updated_at | string  | ISO timestamp                 |

### `products` — keyPath `id`
| field               | type    | notes                                   |
|---------------------|---------|-------------------------------------------|
| id                  | string  | UUID                                    |
| barcode             | string \| null | matched on `gtinKey` (see ARCHITECTURE) |
| name                | string  | required                                |
| brand               | string \| null |                                  |
| category            | string \| null |                                  |
| unit_count          | number  | sub-units per package; simple products = 1 |
| unit_size           | number  | size of one sub-unit, > 0               |
| unit_size_unit      | string  | a unit from `js/units.js`               |
| base_unit           | string  | base unit of that dimension: L, kg, piece, pack |
| total_base_quantity | number  | unit_count × unit_size, in base_unit    |
| archived            | boolean | default false                           |
| created_at          | string  |                                         |
| updated_at          | string  |                                         |
- A product with any observations (hidden ones included) can only be
  archived, not deleted — enforced in `productRepository.deleteProduct`.

### `observations` — keyPath `id`, index `product_id`
The append-only heart of the app.
| field                        | type    | notes                          |
|------------------------------|---------|----------------------------------|
| id                           | string  | UUID                           |
| product_id                   | string  | → products.id (indexed)        |
| store_id                     | string  | → stores.id                    |
| observed_price               | number  | price of one package           |
| quantity_purchased           | number \| null |                         |
| calculated_unit_price        | number  | price per base unit            |
| calculated_price_per_subunit | number  | price ÷ unit_count             |
| unit_count                   | number  | package snapshot               |
| unit_size                    | number  | package snapshot               |
| unit_size_unit               | string  | package snapshot               |
| base_unit                    | string  | package snapshot               |
| observation_date             | string  | `YYYY-MM-DD`                   |
| source                       | string  | `'price_update'`               |
| notes                        | string \| null |                         |
| recorded_by_name             | string \| null | set on prices imported from the household era; null for new ones |
| is_deleted                   | boolean | soft-delete flag               |
| created_at                   | string  | tie-break within a day         |
| updated_at                   | string  |                                |
- History reads join the store's `name`/`location` on in JS as
  `store: { name, location }` — not stored.

### `meta` — out-of-line keys
| key            | value                                  |
|----------------|----------------------------------------|
| `lastBackupAt` | ISO timestamp of the last backup download |

## Backup file format
One JSON object, written by `backupRepository.exportAll` and read by
`parseBackup` in `js/backup.js`:

```json
{ "format": "grocery-export", "version": 2, "exported_at": "…",
  "stores": [ … ], "products": [ … ], "observations": [ … ] }
```

- `version: 1` is the one-off export from the Supabase build; it carries extra
  columns (`household_id`, `created_by`, `observed_by`, `family_id`,
  `photo_url`, `package_quantity`, `package_unit`, `normalized_quantity`),
  which the parser drops.
- Every row is included, archived and soft-deleted ones too.
- Restore replaces all three stores in one transaction, so a failure leaves
  the previous data untouched.

## History
- **v1** (Supabase era): an offline *cache* of server data, plus an unused
  `outbox` store. Cleared on upgrade to v2; `outbox` deleted.
- The Supabase schema itself (RLS, households, profiles, invite codes, product
  families) is retired. `docs/migrations/` is kept as a historical record.
