import { supabase } from './config.js';
import { escape } from './ui.js';

const RPC = {
  product:  { fn: 'suggest_product_names', col: 'name' },
  brand:    { fn: 'suggest_brands',        col: 'brand' },
  store:    { fn: 'suggest_store_names',   col: 'name' },
  category: { fn: 'suggest_categories',    col: 'category' },
};

// Attach type-ahead to an <input>. kind = 'product' | 'brand' | 'store'
export function attachSuggest(input, kind) {
  const cfg = RPC[kind];
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
      const { data, error } = await supabase.rpc(cfg.fn, { p_query: q });
      if (error) throw error;
      // don't suggest an exact match of what's already fully typed
      items = (data || []).map(r => r[cfg.col])
        .filter(v => v && v.toLowerCase() !== q.toLowerCase());
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