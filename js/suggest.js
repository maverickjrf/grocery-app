import { escape } from './ui.js';
import { productRepository } from './products.js';
import { storeRepository } from './stores.js';

const LIMIT = 8;

// Where each kind's existing values come from. Names skip archived rows —
// suggesting a product or store you retired would steer people back to it —
// while brands and categories are vocabulary and keep every spelling ever used.
const SOURCES = {
  product:  { rows: () => productRepository.getProducts(), col: 'name' },
  brand:    { rows: () => productRepository.getProducts({ includeArchived: true }), col: 'brand' },
  store:    { rows: () => storeRepository.getStores(), col: 'name' },
  category: { rows: () => productRepository.getProducts({ includeArchived: true }), col: 'category' },
};

// Distinct values containing the query, case-insensitively — the same rule
// the old server-side ILIKE used. Dedupe ignores case too, so "Coke" and
// "coke" don't both appear and invite a third spelling.
async function suggestions(cfg, q) {
  const needle = q.toLowerCase();
  const seen = new Map();
  for (const row of await cfg.rows()) {
    const v = (row[cfg.col] || '').trim();
    if (!v || !v.toLowerCase().includes(needle)) continue;
    if (!seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b)).slice(0, LIMIT);
}

// Attach type-ahead to an <input>. kind = 'product' | 'brand' | 'store' | 'category'
export function attachSuggest(input, kind) {
  const cfg = SOURCES[kind];
  if (!cfg) return;

  const box = document.createElement('div');
  box.className = 'suggest-box';
  box.hidden = true;
  // input sits inside a positioned wrapper so the dropdown aligns under it
  const wrap = document.createElement('div');
  wrap.className = 'suggest-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  wrap.appendChild(box);

  let timer = null;
  let items = [];
  let active = -1;

  const hide = () => { box.hidden = true; active = -1; };
  const paint = () => {
    if (!items.length) { hide(); return; }
    box.innerHTML = items.map((v, i) =>
      `<button type="button" class="suggest-item ${i === active ? 'is-active' : ''}" data-i="${i}">${escape(v)}</button>`).join('');
    box.hidden = false;
    box.querySelectorAll('[data-i]').forEach(b => {
      b.onmousedown = (e) => { e.preventDefault(); choose(Number(b.dataset.i)); };
    });
  };
  const choose = (i) => {
    if (items[i] == null) return;
    input.value = items[i];
    hide();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const lookup = async () => {
    const q = input.value.trim();
    try {
      // don't suggest an exact match of what's already fully typed
      items = (await suggestions(cfg, q))
        .filter(v => v.toLowerCase() !== q.toLowerCase());
      active = -1;
      paint();
    } catch { hide(); }
  };

  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(lookup, 180); // debounce so we don't query every keystroke
  });
  input.addEventListener('focus', () => { if (input.value.trim()) lookup(); });
  input.addEventListener('blur', () => setTimeout(hide, 120));
  input.addEventListener('keydown', (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { hide(); }
  });
}