// Each unit belongs to a "dimension" and has a factor to convert it to the base unit.
// Add a future unit = add one line here. Nothing else in the app changes.
const UNITS = {
  ml:    { dimension: 'volume', base: 'L',     factor: 0.001 },
  L:     { dimension: 'volume', base: 'L',     factor: 1 },
  g:     { dimension: 'weight', base: 'kg',    factor: 0.001 },
  kg:    { dimension: 'weight', base: 'kg',    factor: 1 },
  piece: { dimension: 'count',  base: 'piece', factor: 1 },
  dozen: { dimension: 'count',  base: 'piece', factor: 12 },
  pack:  { dimension: 'pack',   base: 'pack',  factor: 1 },
};

export const UNIT_OPTIONS = Object.keys(UNITS);

export function baseUnitFor(unit) {
  const u = UNITS[unit];
  if (!u) throw new Error('Unknown unit: ' + unit);
  return u.base;
}

// Convert a package quantity to its base unit. 500 ml -> 0.5 (L); 1 dozen -> 12 (piece)
export function normalizeQuantity(quantity, unit) {
  const u = UNITS[unit];
  if (!u) throw new Error('Unknown unit: ' + unit);
  return quantity * u.factor;
}

// Price per base unit. unitPrice(90, 1.5, 'L') -> 60 (per L)
export function unitPrice(price, quantity, unit) {
  const normalized = normalizeQuantity(quantity, unit);
  return normalized ? price / normalized : null;
}

export function perBaseLabel(unit) {
  return 'per ' + baseUnitFor(unit);
}