import { authRepository } from './auth.js';
import { householdRepository } from './household.js';

const app = document.getElementById('app');
const render = (html) => { app.innerHTML = html; };
const escape = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CART_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"
  stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`;

// ---------- LOGIN / SIGNUP ----------
function showAuthScreen(mode = 'signin') {
  const isSignup = mode === 'signup';
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${CART_ICON}</div>
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

// ---------- ROUTER: sends you to the household gate or home ----------
async function showMain() {
  render(`<div class="loading">Loading…</div>`);
  let household;
  try {
    household = await householdRepository.getMyHousehold();
  } catch (err) {
    return showAuthScreen('signin');
  }
  if (household) showHome(household);
  else showHouseholdGate('create');
}

// ---------- CREATE OR JOIN A HOUSEHOLD ----------
function showHouseholdGate(mode = 'create') {
  const isJoin = mode === 'join';
  render(`
    <div class="screen-center"><div class="card">
      <div class="brand"><div class="brand-badge">${CART_ICON}</div>
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
      <div class="brand"><div class="brand-badge">${CART_ICON}</div>
        <h1>${escape(household.name)}</h1></div>
      <p class="subtitle">You're the ${escape(household.role)} of this household.</p>
      <label class="field"><span>Invite code — share this to add family members</span>
        <div class="invite-row">
          <input id="invite" type="text" readonly value="${escape(household.inviteCode)}" />
          <button id="copy" class="btn-copy">Copy</button>
        </div>
      </label>
      <p class="subtitle" style="margin-top:24px">Next we'll add stores and start recording prices.</p>
      <button id="logout" class="btn-secondary">Log out</button>
    </div></div>`);

  document.getElementById('copy').onclick = async () => {
    const b = document.getElementById('copy');
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      b.textContent = 'Copied!';
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    } catch { /* clipboard blocked — the code is visible to copy manually */ }
  };
  document.getElementById('logout').onclick = async () => {
    await authRepository.signOut();
    showAuthScreen('signin');
  };
}

// ---------- START ----------
(async function start() {
  const user = await authRepository.getCurrentUser();
  if (user) await showMain();
  else showAuthScreen('signin');
})();