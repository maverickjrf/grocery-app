import { render, escape, icons } from './ui.js';
import { storeRepository } from './stores.js';
import { observationRepository } from './observations.js';
import { unitPrice, baseUnitFor } from './units.js';

const peso = (n) => '₱' + Number(n).toLocaleString('en-PH',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sizeLabel(p) {
  const q = Number(p.package_quantity), u = p.package_unit;
  return ['ml', 'L', 'g', 'kg'].includes(u) ? `${q}${u}` : `${q} ${u}${q === 1 ? '' : 's'}`;
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH',
    { year: 'numeric', month: 'short', day: 'numeric' });
}

export function showProductDetail(product, onBack) {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">${escape(product.name)}</h1>
      </header>
      <div class="app-content">
        <div class="detail-head">
          <div class="detail-title">${escape(product.name)} ${escape(sizeLabel(product))}</div>
          <div class="detail-sub">${[product.brand, product.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
          ${product.barcode ? `<div class="detail-meta">Barcode: ${escape(product.barcode)}</div>` : ''}
        </div>
        <h2 class="section-title">Price history</h2>
        <div id="history"><div class="loading">Loading…</div></div>
      </div>
      <button class="fab" id="record" aria-label="Record price">${icons.plus}</button>
    </div>`);
  document.getElementById('back').onclick = onBack;
  document.getElementById('record').onclick = () => openPriceForm(product);

  renderHistory(product);
}

async function renderHistory(product) {
  const el = document.getElementById('history');
  let rows;
  try { rows = await observationRepository.getHistoryForProduct(product.id); }
  catch (err) {
    el.innerHTML = `<p class="error">${escape(err.message || 'Could not load history.')}</p>`;
    return;
  }

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state">
      <p>No prices recorded yet.</p>
      <p class="subtitle">Tap the + button to record the first price.</p></div>`;
    return;
  }

  el.innerHTML = `<ul class="history-list">${rows.map(r => `
    <li class="history-item">
      <div class="history-main">
        <div class="history-price">${peso(r.observed_price)}</div>
        <div class="history-unit">${peso(r.calculated_unit_price)} / ${escape(r.base_unit)}</div>
      </div>
      <div class="history-meta">
        <div class="history-store">${escape(r.store?.name || 'Unknown store')}</div>
        <div class="history-sub">${formatDate(r.observation_date)} · ${escape(r.observer?.username || 'someone')}</div>
        ${r.notes ? `<div class="history-notes">${escape(r.notes)}</div>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

async function openPriceForm(product) {
  let stores = [];
  try { stores = await storeRepository.getStores(); } catch { /* handled below */ }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  if (!stores.length) {
    overlay.innerHTML = `<div class="modal">
      <h2>Add a store first</h2>
      <p class="subtitle" style="margin-bottom:18px">You need at least one store before recording a price. Go back and open Manage stores to add one.</p>
      <div class="modal-actions"><button class="btn-primary" id="ok">OK</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#ok').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const base = baseUnitFor(product.package_unit);

  overlay.innerHTML = `<div class="modal modal-scroll">
    <h2>Record price</h2>
    <p class="subtitle" style="margin-bottom:16px">${escape(product.name)} ${escape(sizeLabel(product))}</p>
    <label class="field"><span>Store</span>
      <select id="o-store">${stores.map(s =>
        `<option value="${s.id}">${escape(s.name)}${s.location ? ' — ' + escape(s.location) : ''}</option>`).join('')}</select></label>
    <label class="field"><span>Price (₱)</span>
      <input id="o-price" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 90" /></label>
    <p class="hint" id="o-unit">Unit price will show here as you type.</p>
    <label class="field"><span>Date</span>
      <input id="o-date" type="date" value="${today}" max="${today}" /></label>
    <label class="field"><span>Quantity bought (optional)</span>
      <input id="o-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 2" /></label>
    <label class="field"><span>Notes (optional)</span>
      <input id="o-notes" type="text" placeholder="e.g. on sale, or which branch" /></label>
    <p id="o-error" class="error" hidden></p>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancel">Cancel</button>
      <button class="btn-primary" id="save">Save price</button>
    </div></div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#cancel').onclick = close;

  const priceInput = overlay.querySelector('#o-price');
  const unitHint = overlay.querySelector('#o-unit');
  const updateUnit = () => {
    const v = parseFloat(priceInput.value);
    if (v > 0) {
      unitHint.textContent = `= ${peso(unitPrice(v, Number(product.package_quantity), product.package_unit))} per ${base}`;
      unitHint.classList.add('hint-strong');
    } else {
      unitHint.textContent = 'Unit price will show here as you type.';
      unitHint.classList.remove('hint-strong');
    }
  };
  priceInput.oninput = updateUnit;
  priceInput.focus();

  const errorEl = overlay.querySelector('#o-error');
  const saveBtn = overlay.querySelector('#save');
  const fail = (m) => { errorEl.textContent = m; errorEl.hidden = false; };

  saveBtn.onclick = async () => {
    const price = parseFloat(priceInput.value);
    const date = overlay.querySelector('#o-date').value;
    const qtyRaw = overlay.querySelector('#o-qty').value;
    errorEl.hidden = true;
    if (!price || price <= 0) return fail('Please enter a price greater than 0.');
    if (!date) return fail('Please choose a date.');

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      await observationRepository.recordObservation({
        productId: product.id,
        storeId: overlay.querySelector('#o-store').value,
        observedPrice: price,
        quantityPurchased: qtyRaw ? parseFloat(qtyRaw) : null,
        observationDate: date,
        notes: overlay.querySelector('#o-notes').value,
        packageQuantity: Number(product.package_quantity),
        packageUnit: product.package_unit,
      });
      close();
      renderHistory(product);
    } catch (err) {
      fail(err.message || 'Could not save the price.');
      saveBtn.disabled = false; saveBtn.textContent = 'Save price';
    }
  };
}