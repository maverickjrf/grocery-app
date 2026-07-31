import { render, escape, icons } from './ui.js';
import { authRepository } from './auth.js';
import { householdRepository } from './household.js';
import { showStoresScreen } from './stores_screen.js';
import { showProductsScreen } from './products_screen.js';
import { storeRepository } from './stores.js';
import { productRepository } from './products.js';
import { observationRepository } from './observations.js';
import { session } from './session.js';
import { startShoppingScan } from './shopping.js';
import { confirmDialog } from './dialog.js';
import { registerServiceWorker } from './sw_register.js';
import { isNetworkError } from './local_db.js';

// Whether this session has already filled the offline copy — declared here
// rather than beside warmOfflineCopy() below, because showAuthScreen() resets
// it and a `let` further down the file would be in its temporal dead zone.
let warmed = false;

// ---------- LOGIN / SIGNUP ----------
function showAuthScreen(mode = 'signin') {
  // Reaching the sign-in screen means signing out or starting cold, and the
  // cache has been wiped either way — so the next person to sign in on this
  // device must warm their own, not inherit a flag saying it was done.
  warmed = false;
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
  // Signing in has to reach the server to check the password — there is no
  // offline path for it, and storing credentials to fake one would be worse
  // than the inconvenience. Staying signed in offline does work; it's only a
  // fresh sign-in that can't.
  if (isNetworkError(err)) {
    return "You're offline. Signing in needs a connection — but once you've signed in on this device, you stay signed in offline.";
  }
  if (msg.includes('Invalid login credentials')) return 'Wrong username or password.';
  if (msg.includes('already registered')) return 'That username is already taken.';
  return msg;
}

// ---------- ROUTER ----------
async function showMain() {
  render(`<div class="loading">Loading…</div>`);
  let household;
  try { household = await householdRepository.getMyHousehold(); }
  catch (err) {
    // Losing signal is not signing out. Dropping someone on the login screen
    // because their connection died is how an offline-capable app manages to
    // lock people out in exactly the dead zone it was built for.
    if (isNetworkError(err)) return showOfflineNotice();
    return showAuthScreen('signin');
  }
  if (household) showHome(household);
  else showHouseholdGate('create');
}

// Only reachable before anything has ever been cached on this device — once
// the household has been seen once, getMyHousehold answers from the cache.
function showOfflineNotice() {
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${icons.cart}</div>
        <h1>No connection</h1></div>
      <p class="subtitle">You're still signed in, but this device hasn't saved
        a copy of your household yet. Reconnect once and it will be available
        offline afterwards.</p>
      <button id="retry" class="btn-primary">Try again</button>
    </div></div>`);
  document.getElementById('retry').onclick = () => showMain();
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
      showError(friendlyHouseholdError(err));
      submitEl.disabled = false;
      submitEl.textContent = isJoin ? 'Join household' : 'Create household';
    }
  };
}

function friendlyHouseholdError(err) {
  const m = (err && err.message) || '';
  if (m.includes('INVITE_EXPIRED'))
    return 'This invite code has expired or been retired. Ask a household member to generate a new one.';
  if (m.includes('INVITE_INVALID'))
    return "That invite code isn't valid. Double-check it with whoever shared it.";
  if (m.includes('already in a household'))
    return 'You are already in a household. Leave it first.';
  return m || 'Something went wrong.';
}

function expiryLabel(exp) {
  const ms = exp - new Date();
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `expires in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `expires in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
}

async function refreshInviteBlock(blockEl) {
  try {
    const hh = await householdRepository.getMyHousehold();
    if (hh) renderInviteSection(blockEl, hh);
  } catch { /* ignore */ }
}

function renderInviteSection(blockEl, household) {
  const code = household.inviteCode;
  const exp = household.inviteExpiresAt ? new Date(household.inviteExpiresAt) : null;
  const active = !!(code && exp && exp > new Date());

  let status;
  if (active) {
    status = `<div class="invite-row">
        <input id="invite" type="text" readonly value="${escape(code)}" />
        <button id="copy" class="btn-copy">Copy</button>
      </div>
      <p class="invite-status">Active · ${escape(expiryLabel(exp))}</p>`;
  } else if (code) {
    status = `<p class="invite-status invite-expired">This code has expired. Generate a new one to add members.</p>`;
  } else {
    status = `<p class="invite-status">No active invite code. Generate one to add members.</p>`;
  }

  blockEl.innerHTML = `
    <span class="field-label">Invite code — share to add family members</span>
    ${status}
    <div class="invite-actions">
      <button id="rotate" class="btn-secondary">Generate new code</button>
      ${code ? `<button id="retire" class="btn-text">Retire current code</button>` : ''}
    </div>`;

  const copyBtn = blockEl.querySelector('#copy');
  if (copyBtn) copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch { /* code is visible to copy manually */ }
  };

  const rotateBtn = blockEl.querySelector('#rotate');
  rotateBtn.onclick = async () => {
    rotateBtn.disabled = true; rotateBtn.textContent = 'Generating…';
    try { await householdRepository.rotateInviteCode(); await refreshInviteBlock(blockEl); }
    catch (err) { alert(err.message || 'Could not generate a new code.'); rotateBtn.disabled = false; rotateBtn.textContent = 'Generate new code'; }
  };

  const retireBtn = blockEl.querySelector('#retire');
  if (retireBtn) retireBtn.onclick = async () => {
    const choice = await confirmDialog({
      title: 'Retire this invite code?',
      message: 'The current code will stop working immediately. No one can join until you generate a new one.',
      actions: [
        { label: 'Retire code', style: 'danger', value: 'retire' },
        { label: 'Cancel', style: 'text', value: null },
      ],
    });
    if (choice !== 'retire') return;
    try { await householdRepository.retireInviteCode(); await refreshInviteBlock(blockEl); }
    catch (err) { alert(err.message || 'Could not retire the code.'); }
  };
}
// Fills the offline copy of everything a dead zone needs, in the background.
// The cache is only ever written by a read, so without this the products and
// prices someone can see offline are limited to whichever screens they
// happened to open while connected — which is the wrong way round, since the
// product you need with no signal is the one you have not just been reading
// about.
//
// Once per session, not per Home visit: history is the largest table here and
// re-fetching it on every tap back to Home would be wasteful. Sign-out clears
// the flag along with everything else.
function warmOfflineCopy() {
  if (warmed) return;
  warmed = true;
  Promise.allSettled([
    productRepository.getProducts(),
    observationRepository.warmAllHistory(),
  ]).then((results) => {
    // Let a failed attempt be retried on the next Home visit — the usual
    // cause is being offline right now, which may not be true later.
    if (results.some((r) => r.status === 'rejected')) warmed = false;
  });
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
        <div id="invite-block" style="margin-top:12px"></div>
        <button id="leave" class="btn-secondary">Leave household</button>
        <button id="logout" class="btn-secondary">Log out</button>
      </details>
    </div></div>`);

  renderInviteSection(document.getElementById('invite-block'), household);

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

  warmOfflineCopy();

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
// Deliberately not awaited: offline support must never sit between the user
// and the first screen, and it must never be able to break start-up.
registerServiceWorker();

(async function start() {
  const user = await authRepository.getCurrentUser();
  if (user) await showMain();
  else showAuthScreen('signin');
})();