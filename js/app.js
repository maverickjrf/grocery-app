import { render, escape, icons } from './ui.js';
import { authRepository } from './auth.js';
import { householdRepository } from './household.js';
import { showStoresScreen } from './stores_screen.js';
import { showProductsScreen } from './products_screen.js';
import { storeRepository } from './stores.js';
import { session } from './session.js';
import { startShoppingScan } from './shopping.js';
import { confirmDialog } from './dialog.js';

// ---------- LOGIN / SIGNUP ----------
function showAuthScreen(mode = 'signin') {
  const isSignup = mode === 'signup';
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${icons.cart}</div>
        <h1>Grocery Price Tracker</h1></div>
      <p class="subtitle">${isSignup ? 'Create your account' : 'Welcome back'}</p>
      <label class="field"><span>Username</span>
        <input id="username" type="text" autocapitalize="none" autocorrect="off" /></label>
      <label class="field"><span>Password</span>
        <input id="password" type="password" /></label>
      <p id="error" class="error" hidden></p>
      <button id="submit" class="btn-primary">${isSignup ? 'Create account' : 'Sign in'}</button>
      <p class="switch">${isSignup
        ? 'Already have an account? <a id="toggle" href="#">Sign in</a>'
        : 'New here? <a id="toggle" href="#">Create an account</a>'}</p>
    </div></div>`);

  const errorEl = document.getElementById('error');
  const submitEl = document.getElementById('submit');
  const showError = (m) => { errorEl.textContent = m; errorEl.hidden = false; };

  document.getElementById('toggle').onclick = (e) => {
    e.preventDefault(); showAuthScreen(isSignup ? 'signin' : 'signup');
  };
  submitEl.onclick = async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    errorEl.hidden = true;
    if (!username || !password) return showError('Please enter a username and password.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    submitEl.disabled = true;
    submitEl.textContent = isSignup ? 'Creating…' : 'Signing in…';
    try {
      if (isSignup) await authRepository.signUp(username, password);
      else await authRepository.signIn(username, password);
      await showMain();
    } catch (err) {
      showError(friendlyError(err));
      submitEl.disabled = false;
      submitEl.textContent = isSignup ? 'Create account' : 'Sign in';
    }
  };
}

function friendlyError(err) {
  const msg = (err && err.message) || 'Something went wrong.';
  if (msg.includes('Invalid login credentials')) return 'Wrong username or password.';
  if (msg.includes('already registered')) return 'That username is already taken.';
  return msg;
}

// ---------- ROUTER ----------
async function showMain() {
  render(`<div class="loading">Loading…</div>`);
  let household;
  try { household = await householdRepository.getMyHousehold(); }
  catch { return showAuthScreen('signin'); }
  if (household) showHome(household);
  else showHouseholdGate('create');
}

// ---------- CREATE / JOIN HOUSEHOLD ----------
function showHouseholdGate(mode = 'create') {
  const isJoin = mode === 'join';
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${icons.cart}</div>
        <h1>${isJoin ? 'Join a household' : 'Create a household'}</h1></div>
      <p class="subtitle">${isJoin
        ? 'Enter the invite code a family member shared with you.'
        : 'Start a new household — you can invite family after.'}</p>
      <label class="field"><span>${isJoin ? 'Invite code' : 'Household name'}</span>
        <input id="hinput" type="text" ${isJoin ? 'autocapitalize="characters"' : ''}
          placeholder="${isJoin ? 'e.g. 4F9A2C' : 'e.g. Our Home'}" /></label>
      <p id="error" class="error" hidden></p>
      <button id="submit" class="btn-primary">${isJoin ? 'Join household' : 'Create household'}</button>
      <p class="switch">${isJoin
        ? 'Want to start fresh? <a id="toggle" href="#">Create one instead</a>'
        : 'Have an invite code? <a id="toggle" href="#">Join instead</a>'}</p>
      <p class="switch"><a id="logout" href="#">Log out</a></p>
    </div></div>`);

  const errorEl = document.getElementById('error');
  const submitEl = document.getElementById('submit');
  const showError = (m) => { errorEl.textContent = m; errorEl.hidden = false; };

  document.getElementById('toggle').onclick = (e) => {
    e.preventDefault(); showHouseholdGate(isJoin ? 'create' : 'join');
  };
  document.getElementById('logout').onclick = async (e) => {
    e.preventDefault(); await authRepository.signOut(); showAuthScreen('signin');
  };
  submitEl.onclick = async () => {
    const value = document.getElementById('hinput').value.trim();
    errorEl.hidden = true;
    if (!value) return showError(isJoin ? 'Please enter an invite code.' : 'Please enter a household name.');
    submitEl.disabled = true;
    submitEl.textContent = isJoin ? 'Joining…' : 'Creating…';
    try {
      if (isJoin) await householdRepository.joinHousehold(value);
      else await householdRepository.createHousehold(value);
      await showMain();
    } catch (err) {
      showError((err && err.message) || 'Something went wrong.');
      submitEl.disabled = false;
      submitEl.textContent = isJoin ? 'Join household' : 'Create household';
    }
  };
}

// ---------- HOME ----------
function showHome(household) {
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${icons.cart}</div>
        <h1>${escape(household.name)}</h1></div>

      <div class="shopping-bar">
        <label class="shopping-store">
          <span>Shopping at</span>
          <select id="current-store"><option value="">Loading stores…</option></select>
        </label>
        <button id="scan-shop" class="btn-primary">Scan a product</button>
      </div>

      <button id="products" class="btn-secondary">Manage products</button>
      <button id="stores" class="btn-secondary">Manage stores</button>

      <details class="home-more">
        <summary>Household &amp; account</summary>
        <label class="field" style="margin-top:12px"><span>Invite code — share to add family members</span>
          <div class="invite-row">
            <input id="invite" type="text" readonly value="${escape(household.inviteCode)}" />
            <button id="copy" class="btn-copy">Copy</button>
          </div>
        </label>
        <button id="leave" class="btn-secondary">Leave household</button>
        <button id="logout" class="btn-secondary">Log out</button>
      </details>
    </div></div>`);

  document.getElementById('copy').onclick = async () => {
    const b = document.getElementById('copy');
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      b.textContent = 'Copied!';
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    } catch { /* code is visible to copy manually */ }
  };
  document.getElementById('products').onclick = () => showProductsScreen(() => showHome(household));
  document.getElementById('stores').onclick = () => showStoresScreen(() => showHome(household));
  document.getElementById('logout').onclick = async () => {
    await authRepository.signOut(); showAuthScreen('signin');
  };
  document.getElementById('scan-shop').onclick = () => startShoppingScan(() => showHome(household));

  document.getElementById('leave').onclick = async () => {
    const choice = await confirmDialog({
      title: 'Leave this household?',
      message: 'Your recorded prices stay with the household and your name remains on them. Afterward you can join or create another household.',
      actions: [
        { label: 'Leave household', style: 'danger', value: 'leave' },
        { label: 'Cancel', style: 'text', value: null },
      ],
    });
    if (choice !== 'leave') return;
    try {
      await householdRepository.leaveHousehold();
      session.setCurrentStoreId(null);
      await showMain();
    } catch (err) {
      alert(err.message || 'Could not leave the household.');
    }
  };

  // Fill the "Shopping at" selector and remember the choice
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
      `<option value="${s.id}" ${s.id === saved ? 'selected' : ''}>${escape(s.name)}${s.location ? ' — ' + escape(s.location) : ''}</option>`).join('');
    if (!saved || !stores.some(s => s.id === saved)) {
      sel.value = stores[0].id;
      session.setCurrentStoreId(stores[0].id);
    }
    sel.onchange = () => session.setCurrentStoreId(sel.value);
  })();
}

// ---------- START ----------
(async function start() {
  const user = await authRepository.getCurrentUser();
  if (user) await showMain();
  else showAuthScreen('signin');
})();