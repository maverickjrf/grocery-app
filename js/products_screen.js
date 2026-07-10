import { render, escape, icons } from './ui.js';
import { productRepository } from './products.js';
import { UNIT_OPTIONS, perBaseLabel } from './units.js';

const BOX_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

export function showProductsScreen(onExit) { renderList(onExit); }

function formatSize(p) {
  const q = Number(p.package_quantity);
  const u = p.package_unit;
  if (['ml', 'L', 'g', 'kg'].includes(u)) return `${q}${u}`;
  return `${q} ${u}${q === 1 ? '' : 's'}`;
}

async function renderList(onExit) {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">Products</h1>
      </header>
      <div class="app-content"><div class="loading">Loading…</div></div>
      <button class="fab" id="add" aria-label="Add product">${icons.plus}</button>
    </div>`);
  document.getElementById('back').onclick = onExit;
  document.getElementById('add').onclick = () => openForm(onExit, null);

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
        <p class="subtitle">Add items you buy — like Coca-Cola 1.5L or Rice 5kg.</p>
      </div>`;
    return;
  }

  content.innerHTML = `<ul class="list">${products.map(p => `
    <li class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">${escape(p.name)} ${escape(formatSize(p))}</div>
        <div class="list-item-sub">${[p.brand, p.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" data-edit="${p.id}" aria-label="Edit">${icons.edit}</button>
      </div>
    </li>`).join('')}</ul>`;

  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openForm(onExit, products.find(p => p.id === btn.dataset.edit));
  });
}

function openForm(onExit, product) {
  const isEdit = !!product;
  const unitOptions = UNIT_OPTIONS.map(u =>
    `<option value="${u}" ${isEdit && product.package_unit === u ? 'selected' : ''}>${u}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-scroll">
      <h2>${isEdit ? 'Edit product' : 'Add product'}</h2>
      <label class="field"><span>Product name</span>
        <input id="p-name" type="text" value="${isEdit ? escape(product.name) : ''}" placeholder="e.g. Coca-Cola" /></label>
      <label class="field"><span>Brand (optional)</span>
        <input id="p-brand" type="text" value="${isEdit && product.brand ? escape(product.brand) : ''}" placeholder="e.g. Coca-Cola" /></label>
      <label class="field"><span>Category (optional)</span>
        <input id="p-category" type="text" value="${isEdit && product.category ? escape(product.category) : ''}" placeholder="e.g. Beverages" /></label>
      <div class="field-row">
        <label class="field"><span>Package size</span>
          <input id="p-qty" type="number" inputmode="decimal" min="0" step="any"
            value="${isEdit ? escape(product.package_quantity) : ''}" placeholder="1.5" /></label>
        <label class="field"><span>Unit</span>
          <select id="p-unit">${unitOptions}</select></label>
      </div>
      <p class="hint" id="p-hint"></p>
      <label class="field"><span>Barcode (optional)</span>
        <input id="p-barcode" type="text" value="${isEdit && product.barcode ? escape(product.barcode) : ''}" placeholder="Scanning comes next — or type it" /></label>
      <p id="m-error" class="error" hidden></p>
      <div class="modal-actions">
        <button class="btn-secondary" id="cancel">Cancel</button>
        <button class="btn-primary" id="save">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#cancel').onclick = close;

  const unitSel = overlay.querySelector('#p-unit');
  const hint = overlay.querySelector('#p-hint');
  const updateHint = () => { hint.textContent = `Price will be tracked ${perBaseLabel(unitSel.value)}.`; };
  unitSel.onchange = updateHint; updateHint();

  const nameInput = overlay.querySelector('#p-name');
  nameInput.focus();
  const errorEl = overlay.querySelector('#m-error');
  const saveBtn = overlay.querySelector('#save');
  const fail = (m) => { errorEl.textContent = m; errorEl.hidden = false; };

  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    const qty = parseFloat(overlay.querySelector('#p-qty').value);
    errorEl.hidden = true;
    if (!name) return fail('Please enter a product name.');
    if (!qty || qty <= 0) return fail('Please enter a package size greater than 0.');

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    const payload = {
      name,
      brand: overlay.querySelector('#p-brand').value,
      category: overlay.querySelector('#p-category').value,
      packageQuantity: qty,
      packageUnit: unitSel.value,
      barcode: overlay.querySelector('#p-barcode').value,
    };
    try {
      if (isEdit) await productRepository.updateProduct(product.id, payload);
      else await productRepository.createProduct(payload);
      close();
      renderList(onExit);
    } catch (err) {
      fail(err.message || 'Could not save the product.');
      saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Add';
    }
  };
}