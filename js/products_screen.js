import { render, escape, icons } from './ui.js';
import { productRepository } from './products.js';
import { scanBarcode } from './scanner.js';
import { showProductDetail } from './product_detail.js';
import { openProductForm } from './product_form.js';
import { confirmDialog } from './dialog.js';
import { formatPackage } from './units.js';
import { pushScreen, goBack } from './nav.js';

const BOX_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

export function showProductsScreen(onExit) {
  pushScreen(onExit);
  paintProductsScreen(onExit, false, '');
}

// Repaints the whole screen for the given (includeArchived, query) state.
// Used for a fresh entry (via showProductsScreen), for in-place refreshes
// (search/toggle/save), and to restore this screen when the detail screen's
// Back is triggered — never calls pushScreen itself, so none of those add a
// phantom extra level to the nav stack.
async function paintProductsScreen(onExit, includeArchived, initialQuery) {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">Products</h1>
        <button class="icon-btn app-bar-action" id="scan" aria-label="Scan barcode">${icons.scan}</button>
      </header>
      <div class="app-content">
        <div class="search-row">
          <input id="product-search" class="search-input" type="search"
            placeholder="Search products by name, brand, category, barcode"
            value="${escape(initialQuery)}" />
          <button class="icon-btn search-clear" id="search-clear" aria-label="Clear search" hidden>${icons.close}</button>
        </div>
        <div id="product-list"><div class="loading">Loading…</div></div>
      </div>
      <button class="fab" id="add" aria-label="Add product">${icons.plus}</button>
    </div>`);
  const reload = () => paintProductsScreen(onExit, includeArchived, searchEl.value);
  document.getElementById('back').onclick = () => goBack();
  document.getElementById('add').onclick = () => openProductForm({ onSaved: reload });
  document.getElementById('scan').onclick = () => scanAndRoute(reload);

  const listEl = document.getElementById('product-list');
  const searchEl = document.getElementById('product-search');
  const clearEl = document.getElementById('search-clear');
  const updateClearVisibility = () => { clearEl.hidden = !searchEl.value; };
  clearEl.onclick = () => { searchEl.value = ''; updateClearVisibility(); paintList(); searchEl.focus(); };
  updateClearVisibility();

  let products;
  try { products = await productRepository.getProducts({ includeArchived }); }
  catch (err) {
    listEl.innerHTML = `<p class="error">${escape(err.message || 'Could not load products.')}</p>`;
    return;
  }

  const toggle = `<label class="show-archived">
    <input type="checkbox" id="showArchived" ${includeArchived ? 'checked' : ''} />
    Show archived products</label>`;

  const matches = (p, q) => {
    if (!q) return true;
    const hay = [p.name, p.brand, p.category, p.barcode].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  };

  const paintList = () => {
    const q = searchEl.value.trim().toLowerCase();
    const shown = products.filter(p => matches(p, q));

    if (!shown.length) {
      listEl.innerHTML = toggle + `
        <div class="empty-state">
          <div class="empty-icon">${BOX_ICON}</div>
          <p>${products.length ? 'No products match your search.' : (includeArchived ? 'No products found.' : 'No products yet.')}</p>
          <p class="subtitle">${products.length ? 'Try a different term.' : 'Add items you buy — or tap the scan icon to add one by barcode.'}</p>
        </div>`;
    } else {
      listEl.innerHTML = toggle + `<ul class="list">${shown.map(p => `
        <li class="list-item ${p.archived ? 'is-archived' : ''}">
          <button class="list-item-main list-item-open" data-open="${p.id}">
            <div class="list-item-title">${escape(p.name)} ${escape(formatPackage(p))}${p.archived ? ' <span class="tag">Archived</span>' : ''}</div>
            <div class="list-item-sub">${[p.brand, p.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
          </button>
          <div class="list-item-actions">
            ${p.archived
              ? `<button class="link-btn" data-restore="${p.id}">Restore</button>`
              : `<button class="icon-btn" data-edit="${p.id}" aria-label="Edit">${icons.edit}</button>
                 <button class="icon-btn" data-del="${p.id}" aria-label="Delete">${icons.trash}</button>`}
          </div>
        </li>`).join('')}</ul>`;
    }

    document.getElementById('showArchived').onchange = (e) => paintProductsScreen(onExit, e.target.checked, searchEl.value);
    listEl.querySelectorAll('[data-open]').forEach(btn => {
      btn.onclick = () => showProductDetail(
        products.find(p => p.id === btn.dataset.open),
        () => paintProductsScreen(onExit, includeArchived, searchEl.value));
    });
    listEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => openProductForm({ product: products.find(p => p.id === btn.dataset.edit), onSaved: reload });
    });
    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => confirmDeleteProduct(products.find(p => p.id === btn.dataset.del), reload);
    });
    listEl.querySelectorAll('[data-restore]').forEach(btn => {
      btn.onclick = async () => {
        try { await productRepository.setArchived(btn.dataset.restore, false); reload(); }
        catch (err) { alert(err.message || 'Could not restore the product.'); }
      };
    });
  };

  searchEl.oninput = () => { updateClearVisibility(); paintList(); };
  paintList();
}

async function confirmDeleteProduct(product, reload) {
  let count = 0;
  try { count = await productRepository.countAllObservations(product.id); }
  catch (err) { alert(err.message || 'Could not check the product.'); return; }

  if (count === 0) {
    const c = await confirmDialog({
      title: 'Delete this product?',
      message: 'It has no recorded prices, so nothing will be lost.',
      actions: [
        { label: 'Delete forever', style: 'danger', value: 'delete' },
        { label: 'Cancel', style: 'text', value: null },
      ],
    });
    if (c !== 'delete') return;
    try { await productRepository.deleteProduct(product.id); reload(); }
    catch (err) { alert(err.message || 'Could not delete the product.'); }
  } else {
    const c = await confirmDialog({
      title: 'Archive this product?',
      message: `It has ${count} recorded price${count === 1 ? '' : 's'}. Archiving hides it but keeps its price history.`,
      actions: [
        { label: 'Archive', style: 'primary', value: 'archive' },
        { label: 'Cancel', style: 'text', value: null },
      ],
    });
    if (c !== 'archive') return;
    try { await productRepository.setArchived(product.id, true); reload(); }
    catch (err) { alert(err.message || 'Could not archive the product.'); }
  }
}

async function scanAndRoute(reload) {
  const code = await scanBarcode();
  if (!code) return;
  let existing = null;
  try { existing = await productRepository.findByBarcode(code); }
  catch (err) { alert(err.message || 'Barcode lookup failed.'); return; }
  if (existing) openProductForm({ product: existing, onSaved: reload });
  else openProductForm({ prefill: { barcode: code, scannedNew: true }, onSaved: reload });
}