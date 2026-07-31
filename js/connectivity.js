// Offline state and the bar that announces it.
//
// State comes from whether requests actually succeed, not from
// navigator.onLine — which reports "online" for a phone holding a wifi or
// cell connection that carries no traffic. That is exactly the dead-zone
// case this feature exists for, so asking the browser would get it wrong
// precisely when it matters. navigator.onLine is used only as a shortcut for
// recovering early: when it flips back on we clear the bar optimistically and
// let the next real request confirm.
//
// This matters more than it looks for a price app: a saved price shown as if
// it were current could send someone to a store on week-old information.

let offline = false;
let bar = null;

export function markOnline() {
  if (!offline) return;
  offline = false;
  render();
}

export function markOffline() {
  if (offline) return;
  offline = true;
  render();
}

export function isOffline() {
  return offline;
}

function render() {
  if (!offline) {
    if (bar) { bar.remove(); bar = null; }
    return;
  }
  if (bar) return;
  bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.textContent = 'Offline — showing saved data';
  document.body.appendChild(bar);
}

// The browser losing its connection is trustworthy; the browser claiming to
// have one is not. So only the "lost it" direction acts immediately.
window.addEventListener('offline', markOffline);
window.addEventListener('online', markOnline);
