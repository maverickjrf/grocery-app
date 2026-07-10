import { render, escape, icons } from './ui.js';
import { productRepository } from './products.js';
import { scanBarcode } from './scanner.js';
import { showProductDetail } from './product_detail.js';
import { openProductForm } from './product_form.js';

const BOX_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

export function showProductsScreen(onExit) { renderList(onExit); }

function formatSize(p) {
  const q = Number(p.package_quantity), u = p.package_unit;
  if (['ml', 'L', 'g', 'kg'].includes(u)) return `${q}${u}`;
  return `${q} ${u}${q === 1 ? '' : 's'}`;
}

async function renderList(onExit) {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">Products</h1>
        <button class="icon-btn app-bar-action" id="scan" aria-label="Scan barcode">${icons.scan}</button>
      </header>
      <div class="app-content"><div class="loading">Loading…</div></div>
      <button class="fab" id="add" aria-label="Add product">${icons.plus}</button>
    </div>`);
  document.getElementById('back').onclick = onExit;
  document.getElementById('add').onclick = () => openProductForm({ onSaved: () => renderList(onExit) });
  document.getElementById('scan').onclick = () => scanAndRoute(onExit);

  const content = document.querySelector('.app-content');
  let products;
  try { products = await productRepository.getProducts(); }
  catch (err) {
    content.innerHTML = `<p class="error">${escape(err.message || 'Could not load products.')}</p>`;
    return;
  }

  if (!products.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${BOX_ICON}</div>
        <p>No products yet.</p>
        <p class="subtitle">Add items you buy — or tap the scan icon to add one by barcode.</p>
      </div>`;
    return;
  }

  content.innerHTML = `<ul class="list">${products.map(p => `
    <li class="list-item">
      <button class="list-item-main list-item-open" data-open="${p.id}">
        <div class="list-item-title">${escape(p.name)} ${escape(formatSize(p))}</div>
        <div class="list-item-sub">${[p.brand, p.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
      </button>
      <div class="list-item-actions">
        <button class="icon-btn" data-edit="${p.id}" aria-label="Edit">${icons.edit}</button>
      </div>
    </li>`).join('')}</ul>`;

  content.querySelectorAll('[data-open]').forEach(btn => {
    btn.onclick = () => showProductDetail(
      products.find(p => p.id === btn.dataset.open),
      () => showProductsScreen(onExit));
  });
  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openProductForm({
      product: products.find(p => p.id === btn.dataset.edit),
      onSaved: () => renderList(onExit),
    });
  });
}

async function scanAndRoute(onExit) {
  const code = await scanBarcode();
  if (!code) return;
  let existing = null;
  try { existing = await productRepository.findByBarcode(code); }
  catch (err) { alert(err.message || 'Barcode lookup failed.'); return; }
  if (existing) openProductForm({ product: existing, onSaved: () => renderList(onExit) });
  else openProductForm({ prefill: { barcode: code, scannedNew: true }, onSaved: () => renderList(onExit) });
}