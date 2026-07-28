// Centralized navigation: makes the browser/hardware Back button and the
// app's own back arrows / modal-close controls converge on one code path,
// via a stack kept in lockstep with the History API.
//
// Rule of thumb for callers: call pushScreen()/pushModal() exactly once per
// genuine "enter a new level" (a button/list-item opens a screen or modal).
// Never call it from a function that merely repaints an already-entered
// level (search filtering, a post-save refresh, restoring after Back) —
// that's what causes phantom extra history levels.
const stack = []; // { kind: 'screen'|'modal', onBack: fn }

// One buffer history entry so Back at Home always fires popstate (instead of
// leaving the page outright with no chance to react) — see the popstate
// listener below for the double-back-to-exit confirmation this enables.
history.pushState({}, '');

function enter(kind, onBack) {
  history.pushState({}, '');
  stack.push({ kind, onBack });
}

export function pushScreen(onBack) { enter('screen', onBack); }
export function pushModal(onBack) { enter('modal', onBack); }

// Call instead of closing/navigating directly, from anywhere: back arrows,
// Cancel buttons, backdrop clicks, dialog actions, a completed save. Always
// routes through popstate so hardware Back and in-app Back share one path.
export function goBack() {
  if (!stack.length) return; // nothing of ours pushed — let the browser do its default thing (e.g. leave the app)
  history.back();
}

// Helper for the common modal shape: open once, close once, optionally chain
// into another screen/modal once the close has actually completed (so a new
// push never races an in-flight history.back()).
export function modalController(overlay) {
  let closed = false;
  let afterClose = null;
  pushModal(() => {
    closed = true;
    overlay.remove();
    if (afterClose) afterClose();
  });
  return (next) => {
    if (closed) return; // already closed (e.g. hardware Back beat a slow save to the punch)
    closed = true;
    afterClose = next || null;
    goBack();
  };
}

const EXIT_CONFIRM_MS = 1800;
let confirmingExit = false;
let confirmTimer = null;

function showExitToast() {
  const toast = document.createElement('div');
  toast.className = 'exit-toast';
  toast.textContent = 'Press back again to exit';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), EXIT_CONFIRM_MS);
}

window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) { top.onBack(); return; }

  // Nothing of ours left — at Home. A second Back within the window actually
  // exits (we're already one step into leaving, so finish it); otherwise
  // absorb this press, hint, and re-arm the buffer entry for next time.
  if (confirmingExit) {
    clearTimeout(confirmTimer);
    confirmingExit = false;
    history.back();
    return;
  }
  confirmingExit = true;
  showExitToast();
  history.pushState({}, '');
  confirmTimer = setTimeout(() => { confirmingExit = false; }, EXIT_CONFIRM_MS);
});
