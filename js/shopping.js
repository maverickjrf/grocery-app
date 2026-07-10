import { scanBarcode } from './scanner.js';
import { productRepository } from './products.js';
import { observationRepository } from './observations.js';
import { computeStoreSummary, relativeDays } from './insights.js';
import { session } from './session.js';
import { openPriceForm, showProductDetail } from './product_detail.js';
import { escape } from './ui.js';

const peso = (n) => '₱' + Number(n).toLocaleString('en-PH',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sizeLabel(p) {
  const q = Number(p.package_quantity), u = p.package_unit;
  return ['ml', 'L', 'g', 'kg'].includes(u) ? `${q}${u}` : `${q} ${u}${q === 1 ? '' : 's'}`;
}

export async function startShoppingScan(onHome) {
  const code = await scanBarcode();
  if (!code) return;
  let product = null;
  try { product = await productRepository.findByBarcode(code); }
  catch (err) { alert(err.message || 'Lookup failed.'); return; }

  if (!product) { showNotFound(code); return; }
  showFoundPanel(product, onHome);
}

function showNotFound(code) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <h2>Not in your products yet</h2>
    <p class="subtitle" style="margin-bottom:8px">Barcode ${escape(code)} isn't in your list. Add it from Manage products first, then you can record its price.</p>
    <div class="modal-actions"><button class="btn-primary" id="ok">OK</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#ok').onclick = close;
}

function showFoundPanel(product, onHome) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><div class="loading">Loading…</div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const paint = async () => {
    let history = [];
    try { history = await observationRepository.getHistoryForProduct(product.id); } catch { /* show anyway */ }
    const summary = computeStoreSummary(history);
    const currentStoreId = session.getCurrentStoreId();

    const cheapestHtml = summary.cheapest
      ? `<div class="cheapest-callout">
           <div class="cheapest-label">Cheapest lately</div>
           <div class="cheapest-store">${escape(summary.cheapest.storeName)}</div>
           <div class="cheapest-price">${peso(summary.cheapest.latestPrice)}
             <span>· ${escape(relativeDays(summary.cheapest.latestDate))}</span></div>
         </div>`
      : `<p class="subtitle" style="margin:8px 0 16px">No prices recorded yet — be the first to log one.</p>`;

    overlay.querySelector('.modal').innerHTML = `
      <h2>${escape(product.name)} ${escape(sizeLabel(product))}</h2>
      <div class="found-sub">${[product.brand, product.category].filter(Boolean).map(escape).join(' · ') || 'No brand'}</div>
      ${cheapestHtml}
      <button class="btn-primary" id="record">Record price here</button>
      <button class="btn-secondary" id="history">View full history</button>
      <button class="btn-text" id="close">Close</button>`;

    overlay.querySelector('#record').onclick = () =>
      openPriceForm(product, { defaultStoreId: currentStoreId, onSaved: () => paint() });
    overlay.querySelector('#history').onclick = () => { close(); showProductDetail(product, onHome); };
    overlay.querySelector('#close').onclick = close;
  };

  paint();
}