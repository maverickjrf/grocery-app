import { escape, icons } from './ui.js';
import { productRepository } from './products.js';
import { UNIT_OPTIONS, perBaseLabel, formatPackage } from './units.js';
import { scanBarcode } from './scanner.js';
import { attachSuggest } from './suggest.js';
import { modalController } from './nav.js';

// options: { product (edit mode), prefill:{barcode, scannedNew}, onSaved(savedProduct) }
export function openProductForm({ product = null, prefill = {}, onSaved = null } = {}) {
  const isEdit = !!product;
  const barcodeValue = isEdit ? (product.barcode || '') : (prefill.barcode || '');
  // A product that already comes in multiples opens with the count section shown.
  const startsMulti = isEdit && Number(product.unit_count) > 1;
  const unitOptions = UNIT_OPTIONS.map(u =>
    `<option value="${u}" ${isEdit && product.unit_size_unit === u ? 'selected' : ''}>${u}</option>`).join('');

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
      <label class="field" id="p-count-field" ${startsMulti ? '' : 'hidden'}><span>How many per pack?</span>
        <input id="p-count" type="number" inputmode="numeric" min="1" step="1"
          value="${startsMulti ? escape(String(product.unit_count)) : ''}" placeholder="e.g. 10" /></label>
      <div class="field-row">
        <label class="field"><span id="p-size-label">${startsMulti ? 'Size of each' : 'Package size'}</span>
          <input id="p-size" type="number" inputmode="decimal" min="0" step="any"
            value="${isEdit ? escape(String(product.unit_size)) : ''}" placeholder="1.5" /></label>
        <label class="field"><span>Unit</span>
          <select id="p-unit">${unitOptions}</select></label>
      </div>
      <button type="button" class="link-btn pack-toggle" id="p-multi">${startsMulti
        ? 'This is a single item'
        : 'This comes in multiples (e.g. 10 sachets, 100 capsules)'}</button>
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

  const dismiss = modalController(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
  overlay.querySelector('#cancel').onclick = () => dismiss();

  const unitSel = overlay.querySelector('#p-unit');
  const sizeInput = overlay.querySelector('#p-size');
  const countField = overlay.querySelector('#p-count-field');
  const countInput = overlay.querySelector('#p-count');
  const sizeLabelEl = overlay.querySelector('#p-size-label');
  const multiBtn = overlay.querySelector('#p-multi');
  const hint = overlay.querySelector('#p-hint');

  let multi = startsMulti;
  const currentCount = () => {
    if (!multi) return 1;
    const c = parseInt(countInput.value, 10);
    return c > 0 ? c : 1;
  };

  // Live preview: "100 × 300mg (30g) · price tracked per kg"
  const updateHint = () => {
    const size = parseFloat(sizeInput.value);
    const tracked = `Price will be tracked ${perBaseLabel(unitSel.value)}.`;
    if (!(size > 0)) { hint.textContent = tracked; return; }
    const label = formatPackage({
      unit_count: currentCount(), unit_size: size, unit_size_unit: unitSel.value,
    });
    hint.textContent = `${label} · ${tracked.toLowerCase()}`;
  };

  const setMulti = (on) => {
    multi = on;
    countField.hidden = !on;
    sizeLabelEl.textContent = on ? 'Size of each' : 'Package size';
    multiBtn.textContent = on
      ? 'This is a single item'
      : 'This comes in multiples (e.g. 10 sachets, 100 capsules)';
    if (on) countInput.focus(); else countInput.value = '';
    updateHint();
  };
  multiBtn.onclick = () => setMulti(!multi);

  unitSel.onchange = updateHint;
  sizeInput.oninput = updateHint;
  countInput.oninput = updateHint;
  updateHint();

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
    const size = parseFloat(sizeInput.value);
    errorEl.hidden = true;
    if (!name) return fail('Please enter a product name.');
    if (!size || size <= 0) {
      return fail(multi ? 'Please enter the size of each one, greater than 0.'
        : 'Please enter a package size greater than 0.');
    }
    let count = 1;
    if (multi) {
      count = parseInt(countInput.value, 10);
      if (!count || count < 1) return fail('Please enter how many come in the pack (1 or more).');
    }

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    const payload = {
      name,
      brand: overlay.querySelector('#p-brand').value,
      category: overlay.querySelector('#p-category').value,
      unitCount: count,
      unitSize: size,
      unitSizeUnit: unitSel.value,
      barcode: overlay.querySelector('#p-barcode').value,
    };
    try {
      const saved = isEdit
        ? await productRepository.updateProduct(product.id, payload)
        : await productRepository.createProduct(payload);
      // Chained, not called straight after: a caller may open another modal
      // (shopping's found panel does), and opened now it would be closed by
      // this form's own history.back() landing a moment later.
      dismiss(() => { if (onSaved) onSaved(saved); });
    } catch (err) {
      fail(err.message || 'Could not save the product.');
      saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Add';
    }
  };
}
