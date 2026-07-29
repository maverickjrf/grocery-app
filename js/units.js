// Each unit belongs to a "dimension" and has a factor to convert it to the base unit.
// Add a future unit = add one line here. Nothing else in the app changes.
// US customary volume units (gallon, fl oz) — imperial variants deliberately
// omitted; see ARCHITECTURE.md "Unit engine" for why.
//
// `scale`   — part of its dimension's metric display ladder (mg→g→kg, ml→L), so
//             totals and prices can be restated at human scale. See scaleQuantity.
// `display` — how the unit reads next to a number: 'tight' (500ml),
//             'spaced' (12 fl oz), 'plural' (2 gallons, 3 pieces).
const UNITS = {
  ml:      { dimension: 'volume', base: 'L',     factor: 0.001,    scale: true, display: 'tight' },
  L:       { dimension: 'volume', base: 'L',     factor: 1,        scale: true, display: 'tight' },
  'fl oz': { dimension: 'volume', base: 'L',     factor: 0.0295735,             display: 'spaced' },
  gallon:  { dimension: 'volume', base: 'L',     factor: 3.78541,               display: 'plural' },
  mg:      { dimension: 'weight', base: 'kg',    factor: 0.000001, scale: true, display: 'tight' },
  g:       { dimension: 'weight', base: 'kg',    factor: 0.001,    scale: true, display: 'tight' },
  kg:      { dimension: 'weight', base: 'kg',    factor: 1,        scale: true, display: 'tight' },
  piece:   { dimension: 'count',  base: 'piece', factor: 1,                     display: 'plural' },
  dozen:   { dimension: 'count',  base: 'piece', factor: 12,                    display: 'plural' },
  pack:    { dimension: 'pack',   base: 'pack',  factor: 1,                     display: 'plural' },
};

export const UNIT_OPTIONS = Object.keys(UNITS);

function isKnownUnit(unit) {
  return Object.prototype.hasOwnProperty.call(UNITS, unit);
}

export function baseUnitFor(unit) {
  const u = UNITS[unit];
  if (!u) throw new Error('Unknown unit: ' + unit);
  return u.base;
}

// Convert a quantity to its base unit. 500 ml -> 0.5 (L); 1 dozen -> 12 (piece)
export function normalizeQuantity(quantity, unit) {
  const u = UNITS[unit];
  if (!u) throw new Error('Unknown unit: ' + unit);
  return quantity * u.factor;
}

export function perBaseLabel(unit) {
  return 'per ' + baseUnitFor(unit);
}

// ---------------------------------------------------------------------------
// Two-level packages: a package is `count` sub-units of `size` each.
// A simple product (1.5L Coke) is just count = 1. See ARCHITECTURE.md.
// ---------------------------------------------------------------------------

// Total package content in the dimension's base unit.
// totalBaseQuantity(100, 300, 'mg') -> 0.03 (kg)
export function totalBaseQuantity(count, size, unit) {
  return normalizeQuantity(count * size, unit);
}

// Price for one sub-unit (one softgel, one sachet). Simple products: the price itself.
export function pricePerSubunit(price, count) {
  return count > 0 ? price / count : null;
}

// Price per base unit across the whole package.
export function pricePerBase(price, count, size, unit) {
  const total = totalBaseQuantity(count, size, unit);
  return total ? price / total : null;
}

// The metric display ladder for a unit's dimension, ascending by factor.
// Units without `scale` (piece, pack, gallon, fl oz) stand alone.
function ladder(unit) {
  const u = UNITS[unit];
  if (!u) throw new Error('Unknown unit: ' + unit);
  if (!u.scale) return [unit];
  return UNIT_OPTIONS
    .filter(k => UNITS[k].scale && UNITS[k].dimension === u.dimension)
    .sort((a, b) => UNITS[a].factor - UNITS[b].factor);
}

// Kill floating-point dust (0.03 / 0.001 = 30.000000000000004) without
// rounding away legitimate precision.
function trim(n) {
  return String(Number(Number(n).toFixed(6)));
}

// Restate a quantity at human scale, stepping UP the ladder while it reads big.
// 30000 mg -> 30 g. 800 g -> 800 g (stays). Never steps below the given unit.
export function scaleQuantity(value, unit) {
  const rungs = ladder(unit);
  const inBase = normalizeQuantity(value, unit);
  let chosen = unit;
  for (const r of rungs) {
    if (UNITS[r].factor < UNITS[unit].factor) continue;
    if (Math.abs(inBase / UNITS[r].factor) >= 1) chosen = r;
    else break;
  }
  return { value: inBase / UNITS[chosen].factor, unit: chosen };
}

// Restate a per-base-unit price at human scale, stepping DOWN the ladder while
// it reads huge. ₱33333/kg -> ₱33.33/g. ₱200/kg and ₱60/L are left alone, so
// ordinary products display exactly as they always have.
export function scalePerBasePrice(price, baseUnit) {
  const rungs = ladder(baseUnit);
  let i = rungs.indexOf(baseUnit);
  let out = price;
  while (i > 0 && Math.abs(out) >= 1000) {
    i -= 1;
    out = price * UNITS[rungs[i]].factor;
  }
  return { price: out, unit: rungs[i] };
}

// "500ml", "12 fl oz", "3 pieces"
export function formatQuantity(value, unit) {
  const u = UNITS[unit];
  if (!u) return `${trim(value)} ${unit}`;
  const n = trim(value);
  if (u.display === 'tight') return `${n}${unit}`;
  if (u.display === 'spaced') return `${n} ${unit}`;
  return `${n} ${unit}${Number(value) === 1 ? '' : 's'}`;
}

// How a package reads to the user.
//   count = 1  ->  "1.5L"                 (unchanged from the single-quantity days)
//   count > 1  ->  "100 × 300mg (30g)"    count, size of each, computed total
// Accepts a product row or an observation's own package snapshot.
export function formatPackage(p) {
  if (!p) return '';
  const count = Number(p.unit_count ?? 1);
  const size = Number(p.unit_size);
  const unit = p.unit_size_unit;
  if (!isKnownUnit(unit) || !(size > 0)) return '';
  const each = formatQuantity(size, unit);
  if (!(count > 1)) return each;
  const total = scaleQuantity(count * size, unit);
  return `${trim(count)} × ${each} (${formatQuantity(total.value, total.unit)})`;
}
