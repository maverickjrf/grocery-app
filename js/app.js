import { authRepository } from './auth.js';

const app = document.getElementById('app');
const render = (html) => { app.innerHTML = html; };
const escape = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CART_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"
  stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`;

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

  document.getElementById('toggle').onclick = (e) => {
    e.preventDefault();
    showAuthScreen(isSignup ? 'signin' : 'signup');
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
      await showHome();
    } catch (err) {
      showError(friendlyError(err));
      submitEl.disabled = false;
      submitEl.textContent = isSignup ? 'Create account' : 'Sign in';
    }
  };

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
}

function friendlyError(err) {
  const msg = (err && err.message) || 'Something went wrong.';
  if (msg.includes('Invalid login credentials')) return 'Wrong username or password.';
  if (msg.includes('already registered')) return 'That username is already taken.';
  return msg;
}

async function showHome() {
  const user = await authRepository.getCurrentUser();
  render(`
    <div class="screen-center"><div class="card">
      <h1>Welcome, ${escape(user ? user.username : 'there')}</h1>
      <p class="subtitle">You're logged in. Next we'll build households and start
        adding stores and products.</p>
      <button id="logout" class="btn-secondary">Log out</button>
    </div></div>`);
  document.getElementById('logout').onclick = async () => {
    await authRepository.signOut();
    showAuthScreen('signin');
  };
}

(async function start() {
  const user = await authRepository.getCurrentUser();
  if (user) await showHome();
  else showAuthScreen('signin');
})();