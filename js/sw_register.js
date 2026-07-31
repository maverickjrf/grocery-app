import { icons } from './ui.js';

// Registers the service worker and owns the "update available" prompt.
//
// A service worker is an enhancement, never a dependency: everything here is
// wrapped so that a failure to register, an unsupported browser, or an
// outright broken worker leaves the app behaving exactly as it did before.
// Nothing in this module is awaited by app start-up.

// Escape hatch: loading the app with ?sw=off unregisters the worker and
// deletes every cache, and skips re-registering for that load. Reload
// normally afterwards — which will install the worker again, so once a fix
// has shipped this is self-resolving. The documented recovery route if a bad
// worker ever ships; see docs/DEPLOYMENT.md.
const KILL_SWITCH_PARAM = 'sw';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Service workers need HTTPS or localhost. Opening index.html off the disk
  // is a legitimate way to poke at the app; don't throw errors at it.
  if (!window.isSecureContext) return;

  if (new URLSearchParams(location.search).get(KILL_SWITCH_PARAM) === 'off') {
    uninstall();
    return;
  }

  // Registering after load keeps the worker's install (which precaches ~23
  // files) from competing with the app's own first paint.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  // Raised by the worker when a background revalidation finds changed files.
  // The new files are already cached by this point, so a plain reload is
  // enough to pick them up.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHELL_UPDATED') showUpdateBanner();
  });
}

async function register() {
  try {
    // Resolved against this module, not the page, so the scope is right no
    // matter which URL the app was opened at.
    const swUrl = new URL('../sw.js', import.meta.url);
    const registration = await navigator.serviceWorker.register(swUrl);
    watchForWorkerUpdate(registration);
  } catch (err) {
    console.warn('Service worker registration failed — app continues without offline support.', err);
  }
}

// The other way an update arrives: sw.js itself changed, so a new worker is
// waiting to take over. That one needs the worker swapped, not just a reload.
function watchForWorkerUpdate(registration) {
  if (registration.waiting) showUpdateBanner(registration);

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // A worker reaching "installed" with something already in control means
      // this is a replacement, not the very first install — only then is
      // there anything for the user to update to.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }
    });
  });
}

async function uninstall() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    console.info('Service worker and caches cleared.');
  } catch (err) {
    console.warn('Could not fully clear the service worker.', err);
  }
}

let bannerShown = false;
function showUpdateBanner(registration = null) {
  if (bannerShown) return;
  bannerShown = true;

  const banner = document.createElement('div');
  banner.className = 'sw-update';
  // Static text only — nothing user-supplied reaches this markup.
  banner.innerHTML = `
    <span class="sw-update-text">A new version is ready.</span>
    <button type="button" class="sw-update-reload">Reload</button>
    <button type="button" class="sw-update-dismiss" aria-label="Dismiss">${icons.close}</button>`;
  document.body.appendChild(banner);

  banner.querySelector('.sw-update-dismiss').onclick = () => banner.remove();
  banner.querySelector('.sw-update-reload').onclick = async () => {
    // Look the worker up at click time rather than trusting what was known
    // when the banner appeared. Both an updated file and a new worker can
    // raise this banner, and the file-change message carries no registration
    // — so if that message won the race, a plain reload would leave the new
    // worker waiting and the banner would come straight back on the next
    // load. That is the "had to reload twice" bug.
    let waiting = registration && registration.waiting;
    if (!waiting) {
      try {
        const current = await navigator.serviceWorker.getRegistration();
        waiting = current && current.waiting;
      } catch { /* fall through to a plain reload */ }
    }
    if (!waiting) { location.reload(); return; }
    // Swap the worker first, then reload once it has taken control, so the
    // reload is served by the new version rather than racing it.
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };
}
