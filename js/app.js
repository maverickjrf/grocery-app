import { render, escape, icons } from './ui.js';
import { showStoresScreen } from './stores_screen.js';
import { showProductsScreen } from './products_screen.js';
import { showDataScreen } from './data_screen.js';
import { storeRepository } from './stores.js';
import { backupRepository } from './backup.js';
import { session } from './session.js';
import { startShoppingScan } from './shopping.js';
import { registerServiceWorker } from './sw_register.js';
import { requestPersistentStorage } from './local_db.js';

// How long without a backup before Home starts mentioning it. The data lives
// on one phone; this is the only thing standing between a lost phone and
// losing every price.
const BACKUP_NUDGE_DAYS = 14;

// ---------- HOME ----------
function showHome() {
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${icons.cart}</div>
        <h1>Grocery Price Tracker</h1></div>

      <div class="shopping-bar">
        <label class="shopping-store">
          <span>Shopping at</span>
          <select id="current-store"><option value="">Loading stores…</option></select>
        </label>
        <button id="scan-shop" class="btn-primary">Scan a product</button>
      </div>

      <button id="products" class="btn-secondary">Manage products</button>
      <button id="stores" class="btn-secondary">Manage stores</button>
      <button id="data" class="btn-secondary">Backup &amp; restore</button>
      <p id="backup-nudge" class="hint backup-nudge" hidden></p>
    </div></div>`);

  document.getElementById('products').onclick = () => showProductsScreen(showHome);
  document.getElementById('stores').onclick = () => showStoresScreen(showHome);
  document.getElementById('data').onclick = () => showDataScreen(showHome);
  document.getElementById('scan-shop').onclick = () => startShoppingScan(showHome);

  (async () => {
    const sel = document.getElementById('current-store');
    let stores = [];
    try { stores = await storeRepository.getStores(); } catch { /* ignore */ }
    if (!stores.length) {
      sel.innerHTML = `<option value="">No stores yet — add one first</option>`;
      return;
    }
    const saved = session.getCurrentStoreId();
    sel.innerHTML = stores.map(s =>
      `<option value="${escape(s.id)}" ${s.id === saved ? 'selected' : ''}>${escape(s.name)}${s.location ? ' — ' + escape(s.location) : ''}</option>`).join('');
    if (!saved || !stores.some(s => s.id === saved)) {
      sel.value = stores[0].id;
      session.setCurrentStoreId(stores[0].id);
    }
    sel.onchange = () => session.setCurrentStoreId(sel.value);
  })();

  showBackupNudge();
}

async function showBackupNudge() {
  try {
    const [counts, lastAt] = await Promise.all([
      backupRepository.counts(), backupRepository.lastBackupAt(),
    ]);
    if (!counts.observations) return; // nothing worth backing up yet
    const ageDays = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 86400000 : Infinity;
    if (ageDays < BACKUP_NUDGE_DAYS) return;
    const el = document.getElementById('backup-nudge');
    if (!el) return; // already navigated away
    el.textContent = lastAt
      ? `Last backup was ${Math.floor(ageDays)} days ago — worth making a fresh one.`
      : 'No backup yet — your prices exist only on this phone.';
    el.hidden = false;
  } catch { /* a reminder must never break Home */ }
}

// ---------- START ----------
// Neither is awaited: offline support and storage persistence must never sit
// between the user and the first screen, or be able to break start-up.
registerServiceWorker();
requestPersistentStorage();
showHome();
