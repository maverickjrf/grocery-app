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

// How long to wait for a history.back() to actually land before assuming it
// never will. Only ever reached when the nav stack and the browser's real
// history have desynced; a normal traversal fires popstate immediately.
const BACK_LANDED_TIMEOUT_MS = 500;

// Helper for the common modal shape: open once, close once, optionally chain
// into another screen/modal once the close has actually completed (so a new
// push never races an in-flight history.back()).
//
// `onClosed` runs exactly once however the modal was closed — a button, the
// backdrop, or hardware/browser Back — which is where a dialog resolves its
// promise or a scanner releases the camera.
//
// Two guarantees matter here, both learned the hard way:
//  - The overlay is removed by dismiss() itself, never left to popstate. If the
//    stack has desynced, history.back() can no-op and popstate never arrives —
//    which used to strand the modal on screen with a completed save still
//    reading "Saving…", recoverable only by restarting the browser.
//  - onClosed/afterClose still run even if that traversal never lands, so no
//    caller is left awaiting a promise that popstate was supposed to settle.
// History itself is untouched: we never force-pop the stack, so Back behaves
// exactly as before.
export function modalController(overlay, onClosed = null) {
  let closed = false;  // overlay torn down
  let settled = false; // onClosed / afterClose have run
  let afterClose = null;

  const settle = () => {
    if (settled) return;
    settled = true;
    closed = true;
    overlay.remove(); // no-op if dismiss() already removed it
    if (onClosed) onClosed();
    if (afterClose) afterClose();
  };

  pushModal(settle);

  return (next) => {
    if (closed) return; // already closed (e.g. hardware Back beat a slow save to the punch)
    closed = true;
    afterClose = next || null;
    overlay.remove();
    if (!stack.length) { settle(); return; } // nothing to traverse — settle now
    goBack();
    setTimeout(settle, BACK_LANDED_TIMEOUT_MS);
  };
}

window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) top.onBack();
});
