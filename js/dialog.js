import { escape } from './ui.js';
import { pushModal, goBack } from './nav.js';

// actions: [{ label, style: 'primary'|'secondary'|'danger'|'text', value }]
// Resolves to the chosen action's `value`, or null if cancelled/dismissed.
export function confirmDialog({ title, message = '', actions }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const btns = actions.map((a, i) =>
      `<button class="btn-${a.style || 'secondary'}" data-i="${i}">${escape(a.label)}</button>`).join('');
    overlay.innerHTML = `<div class="modal">
      <h2>${escape(title)}</h2>
      ${message ? `<p class="subtitle" style="margin-bottom:18px">${escape(message)}</p>` : ''}
      <div class="dialog-actions">${btns}</div>
    </div>`;
    document.body.appendChild(overlay);

    let settled = false;
    let chosen = null;
    // The only place this modal actually closes — whether reached via a
    // button below, the backdrop, or hardware/browser Back.
    pushModal(() => { settled = true; overlay.remove(); resolve(chosen); });

    const trigger = (v) => { if (settled) return; settled = true; chosen = v; goBack(); };
    overlay.onclick = (e) => { if (e.target === overlay) trigger(null); };
    overlay.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => trigger(actions[Number(b.dataset.i)].value);
    });
  });
}