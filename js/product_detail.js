import { render, escape, icons } from './ui.js';
import { storeRepository } from './stores.js';
import { observationRepository } from './observations.js';
import { pricePerBase, pricePerSubunit, scalePerBasePrice, formatPackage, baseUnitFor } from './units.js';
import { computeStoreSummary, relativeDays } from './insights.js';
import { session } from './session.js';
import { confirmDialog } from './dialog.js';
import { pushScreen, goBack, modalController } from './nav.js';

const peso = (n) => '₱' + Number(n).toLocaleString('en-PH',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The derived-price line for one observation, read off its OWN package snapshot:
// "₱60.00 / L", or "₱33.33 / g · ₱10.00 each" when it came in multiples.
function unitPriceLine(r) {
  const count = Number(r.unit_count ?? 1);
  const scaled = scalePerBasePrice(Number(r.calculated_unit_price), r.base_unit);
  let line = `${peso(scaled.price)} / ${escape(scaled.unit)}`;
  if (count > 1) {
    const each = r.calculated_price_per_subunit != null
      ? Number(r.calculated_price_per_subunit)
      : pricePerSubunit(Number(r.observed_price), count);
    line += ` · ${peso(each)} each`;
  }
  return line;
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH',
    { year: 'numeric', month: 'short', day: 'numeric' });
}

export function showProductDetail(product, onBack) {
  pushScreen(onBack);
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">${escape(product.name)}</h1>
      </header>
      <div class="app-content">
        <div class="detail-head">
          <div class="detail-title">${escape(product.name)} ${escape(formatPackage(product))}</div>
          <div class="detail-sub">${[product.brand, product.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
          ${product.barcode ? `<div class="detail-meta">Barcode: ${escape(product.barcode)}</div>` : ''}
        </div>
        <div id="detail-body"><div class="loading">Loading…</div></div>
      </div>
      <button class="fab" id="record" aria-label="Record price">${icons.plus}</button>
    </div>`);
  document.getElementById('back').onclick = () => goBack();
  document.getElementById('record').onclick = () => openPriceForm(product, {
    defaultStoreId: session.getCurrentStoreId(),
    onSaved: () => loadBody(product),
  });
  loadBody(product);
}

let storeSort = 'cheapest'; // or 'recent'

async function loadBody(product) {
  const el = document.getElementById('detail-body');
  if (!el) return;
  let history;
  try { history = await observationRepository.getHistoryForProduct(product.id); }
  catch (err) {
    el.innerHTML = `<p class="error">${escape(err.message || 'Could not load history.')}</p>`;
    return;
  }

  if (!history.length) {
    el.innerHTML = `<div class="empty-state">
      <p>No prices recorded yet.</p>
      <p class="subtitle">Tap the + button to record the first price.</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="section-title">Where to buy</h2>
    <div class="store-sort">
      <button class="chip" data-sort="cheapest">Cheapest</button>
      <button class="chip" data-sort="recent">Most recent</button>
    </div>
    <div id="wheretobuy"></div>
    <h2 class="section-title" style="margin-top:24px">All prices</h2>
    <ul class="history-list">${history.map(r => `
      <li class="history-item">
        <div class="history-row">
          <div class="history-main">
            <div class="history-price">${peso(r.observed_price)}</div>
            <div class="history-unit">${unitPriceLine(r)}</div>
          </div>
          <div class="history-meta">
            <div class="history-store">${escape(r.store?.name || 'Unknown store')}</div>
            <div class="history-sub">${formatDate(r.observation_date)} · ${escape(r.recorded_by_name || 'someone')}</div>
            ${r.notes ? `<div class="history-notes">${escape(r.notes)}</div>` : ''}
          </div>
        </div>
        <div class="history-actions">
          <button class="link-btn" data-edit="${r.id}">Edit</button>
          <button class="link-btn link-danger" data-del="${r.id}">Delete</button>
        </div>
      </li>`).join('')}</ul>`;

  // Where-to-buy comparison
  const summary = computeStoreSummary(history);
  const cheapestId = summary.cheapest ? summary.cheapest.storeId : null;
  const storeUnitLine = (s) => {
    const scaled = scalePerBasePrice(s.latestUnitPrice, s.baseUnit);
    let line = `${peso(scaled.price)} / ${escape(scaled.unit)}`;
    if (s.latestUnitCount > 1 && s.latestSubunitPrice != null) {
      line += ` · ${peso(s.latestSubunitPrice)} each`;
    }
    return line;
  };
  const renderStores = () => {
    const list = [...summary.stores];
    if (storeSort === 'cheapest') list.sort((a, b) => a.latestPrice - b.latestPrice);
    else list.sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1));
    document.getElementById('wheretobuy').innerHTML = list.map(s => `
      <div class="store-card ${s.storeId === cheapestId ? 'is-cheapest' : ''}">
        <div class="store-card-main">
          <div class="store-card-name">${escape(s.storeName)}${s.storeId === cheapestId ? ' <span class="badge-cheap">Cheapest</span>' : ''}</div>
          <div class="store-card-sub">${s.location ? escape(s.location) + ' · ' : ''}updated ${escape(relativeDays(s.latestDate))}</div>
        </div>
        <div class="store-card-price">
          <div class="store-card-amount">${peso(s.latestPrice)}</div>
          <div class="store-card-unit">${storeUnitLine(s)}</div>
        </div>
      </div>`).join('');
    el.querySelectorAll('.chip').forEach(c =>
      c.classList.toggle('chip-active', c.dataset.sort === storeSort));
  };
  el.querySelectorAll('.chip').forEach(c => {
    c.onclick = () => { storeSort = c.dataset.sort; renderStores(); };
  });
  renderStores();

  // Edit / delete on each price
  el.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => openPriceForm(product, {
      observation: history.find(h => h.id === b.dataset.edit),
      onSaved: () => loadBody(product),
    });
  });
  el.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => confirmDeletePrice(product, history.find(h => h.id === b.dataset.del));
  });
}

async function confirmDeletePrice(product, o) {
  const choice = await confirmDialog({
    title: 'Delete this price?',
    message: `${peso(o.observed_price)} at ${o.store?.name || 'a store'} on ${formatDate(o.observation_date)}.`,
    actions: [
      { label: 'Hide — recoverable later', style: 'secondary', value: 'soft' },
      { label: 'Delete forever', style: 'danger', value: 'hard' },
      { label: 'Cancel', style: 'text', value: null },
    ],
  });
  if (!choice) return;
  try {
    if (choice === 'soft') await observationRepository.softDeleteObservation(o.id);
    else await observationRepository.hardDeleteObservation(o.id);
    loadBody(product);
  } catch (err) {
    alert(err.message || 'Could not delete the price.');
  }
}

// Shared add/edit price form. Pass `observation` to edit an existing entry.
export async function openPriceForm(product, { defaultStoreId = null, observation = null, onSaved = null } = {}) {
  const isEdit = !!observation;
  // On edit, the package comes from the observation's OWN snapshot — never from
  // the live product, so reshaping a product can't rewrite its price history.
  const src = isEdit ? observation : product;
  const pkgCount = Number(src.unit_count ?? 1);
  const pkgSize = Number(src.unit_size);
  const pkgUnit = src.unit_size_unit;
  const base = baseUnitFor(pkgUnit);

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
    const dismiss = modalController(overlay);
    overlay.querySelector('#ok').onclick = () => dismiss();
    overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const selectedStore = isEdit ? observation.store_id : defaultStoreId;

  overlay.innerHTML = `<div class="modal modal-scroll">
    <h2>${isEdit ? 'Edit price' : 'Record price'}</h2>
    <p class="subtitle" style="margin-bottom:16px">${escape(product.name)} ${escape(formatPackage(src))}</p>
    <label class="field"><span>Store</span>
      <select id="o-store">${stores.map(s =>
        `<option value="${s.id}" ${s.id === selectedStore ? 'selected' : ''}>${escape(s.name)}${s.location ? ' — ' + escape(s.location) : ''}</option>`).join('')}</select></label>
    <label class="field"><span>Price (₱)</span>
      <input id="o-price" type="number" inputmode="decimal" min="0" step="any"
        value="${isEdit ? escape(String(observation.observed_price)) : ''}" placeholder="e.g. 90" /></label>
    <p class="hint" id="o-unit">Unit price will show here as you type.</p>
    <label class="field"><span>Date</span>
      <input id="o-date" type="date" value="${isEdit ? escape(observation.observation_date) : today}" max="${today}" /></label>
    <label class="field"><span>Quantity bought (optional)</span>
      <input id="o-qty" type="number" inputmode="decimal" min="0" step="any"
        value="${isEdit && observation.quantity_purchased != null ? escape(String(observation.quantity_purchased)) : ''}" placeholder="e.g. 2" /></label>
    <label class="field"><span>Notes (optional)</span>
      <input id="o-notes" type="text" value="${isEdit && observation.notes ? escape(observation.notes) : ''}" placeholder="e.g. on sale, or which branch" /></label>
    <p id="o-error" class="error" hidden></p>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancel">Cancel</button>
      <button class="btn-primary" id="save">${isEdit ? 'Save changes' : 'Save price'}</button>
    </div></div>`;
  document.body.appendChild(overlay);

  const dismiss = modalController(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
  overlay.querySelector('#cancel').onclick = () => dismiss();

  const priceInput = overlay.querySelector('#o-price');
  const unitHint = overlay.querySelector('#o-unit');
  const updateUnit = () => {
    const v = parseFloat(priceInput.value);
    if (v > 0) {
      const scaled = scalePerBasePrice(pricePerBase(v, pkgCount, pkgSize, pkgUnit), base);
      unitHint.textContent = `= ${peso(scaled.price)} per ${scaled.unit}`
        + (pkgCount > 1 ? ` · ${peso(pricePerSubunit(v, pkgCount))} each` : '');
      unitHint.classList.add('hint-strong');
    } else {
      unitHint.textContent = 'Unit price will show here as you type.';
      unitHint.classList.remove('hint-strong');
    }
  };
  priceInput.oninput = updateUnit;
  updateUnit();
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
    const common = {
      storeId: overlay.querySelector('#o-store').value,
      observedPrice: price,
      quantityPurchased: qtyRaw ? parseFloat(qtyRaw) : null,
      observationDate: date,
      notes: overlay.querySelector('#o-notes').value,
      unitCount: pkgCount,
      unitSize: pkgSize,
      unitSizeUnit: pkgUnit,
    };
    try {
      if (isEdit) await observationRepository.updateObservation(observation.id, common);
      else await observationRepository.recordObservation({ ...common, productId: product.id });
      dismiss();
      if (onSaved) onSaved();
    } catch (err) {
      fail(err.message || 'Could not save the price.');
      saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save changes' : 'Save price';
    }
  };
}