import { scanBarcode } from './scanner.js';
import { productRepository } from './products.js';
import { observationRepository } from './observations.js';
import { computeStoreSummary, relativeDays } from './insights.js';
import { session } from './session.js';
import { openPriceForm, showProductDetail } from './product_detail.js';
import { openProductForm } from './product_form.js';
import { escape } from './ui.js';

const peso = (n) => '₱' + Number(n).toLocaleString('en-PH',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sizeLabel(p) {
  const q = Number(p.package_quantity), u = p.package_unit;
  return ['ml', 'L', 'g', 'kg'].includes(u) ? `${q}${u}` : `${q} ${u}${q === 1 ? '' : 's'}`;
}

export async function startShoppingScan(onHome) {
  const code = await scanBarcode();
  if (!code) return; // cancelled — home is still underneath
  let product = null;
  try { product = await productRepository.findByBarcode(code); }
  catch (err) { alert(err.message || 'Lookup failed.'); return; }

  if (product) showFoundPanel(product, onHome);
  else showNotFound(code, onHome);
}

// Close the current panel and jump straight into another scan
function scanNext(overlay, onHome) {
  overlay.remove();
  startShoppingScan(onHome);
}

function loopButtons() {
  return `<div class="scan-loop">
    <button class="btn-primary" id="next">Scan next</button>
    <button class="btn-secondary" id="done">Done</button>
  </div>`;
}

function showNotFound(code, onHome) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <h2>New product</h2>
    <p class="subtitle" style="margin-bottom:16px">Barcode ${escape(code)} isn't in your products yet. Add it now so you can record its price.</p>
    <button class="btn-secondary" id="add" style="margin-bottom:4px">Add this product</button>
    ${loopButtons()}</div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  overlay.querySelector('#add').onclick = () => {
    close();
    openProductForm({
      prefill: { barcode: code, scannedNew: true },
      onSaved: (saved) => { if (saved) showFoundPanel(saved, onHome); },
    });
  };
  overlay.querySelector('#next').onclick = () => scanNext(overlay, onHome);
  overlay.querySelector('#done').onclick = close;
}

function showFoundPanel(product, onHome) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><div class="loading">Loading…</div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const paint = async () => {
    const currentStoreId = session.getCurrentStoreId();
    let history = [];
    try { history = await observationRepository.getHistoryForProduct(product.id); } catch { /* show anyway */ }
    const summary = computeStoreSummary(history);

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
      ${loopButtons()}`;

    overlay.querySelector('#record').onclick = () =>
      openPriceForm(product, { defaultStoreId: currentStoreId, onSaved: () => paint() });
    overlay.querySelector('#history').onclick = () => { close(); showProductDetail(product, onHome); };
    overlay.querySelector('#next').onclick = () => scanNext(overlay, onHome);
    overlay.querySelector('#done').onclick = close;
  };

  paint();
}