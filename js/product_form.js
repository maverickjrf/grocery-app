import { escape, icons } from './ui.js';
import { productRepository } from './products.js';
import { UNIT_OPTIONS, perBaseLabel } from './units.js';
import { scanBarcode } from './scanner.js';
import { attachSuggest } from './suggest.js';

// options: { product (edit mode), prefill:{barcode, scannedNew}, onSaved(savedProduct) }
export function openProductForm({ product = null, prefill = {}, onSaved = null } = {}) {
  const isEdit = !!product;
  const barcodeValue = isEdit ? (product.barcode || '') : (prefill.barcode || '');
  const unitOptions = UNIT_OPTIONS.map(u =>
    `<option value="${u}" ${isEdit && product.package_unit === u ? 'selected' : ''}>${u}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-scroll">
      <h2>${isEdit ? 'Edit product' : 'Add product'}</h2>
      ${prefill.scannedNew ? `<p class="hint scan-new-hint">New barcode — not in your products yet. Add its details below.</p>` : ''}
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
        <div class="scan-row">
          <input id="p-barcode" type="text" value="${escape(barcodeValue)}" placeholder="Scan or type" />
          <button type="button" class="btn-scan" id="p-scan" aria-label="Scan barcode">${icons.scan}</button>
        </div></label>
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

  overlay.querySelector('#p-scan').onclick = async () => {
    const code = await scanBarcode();
    if (code) overlay.querySelector('#p-barcode').value = code;
  };

  const nameInput = overlay.querySelector('#p-name');
  attachSuggest(nameInput, 'product');
  attachSuggest(overlay.querySelector('#p-brand'), 'brand');
  attachSuggest(overlay.querySelector('#p-category'), 'category');
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
      let saved;
      if (isEdit) { await productRepository.updateProduct(product.id, payload); saved = product; }
      else { saved = await productRepository.createProduct(payload); }
      close();
      if (onSaved) onSaved(saved);
    } catch (err) {
      fail(err.message || 'Could not save the product.');
      saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Add';
    }
  };
}