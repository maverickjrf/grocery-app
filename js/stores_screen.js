import { render, escape, icons } from './ui.js';
import { storeRepository } from './stores.js';

export function showStoresScreen(onExit) {
  renderList(onExit, { includeArchived: false });
}

async function renderList(onExit, { includeArchived }) {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">Stores</h1>
      </header>
      <div class="app-content"><div class="loading">Loading…</div></div>
      <button class="fab" id="add" aria-label="Add store">${icons.plus}</button>
    </div>`);
  document.getElementById('back').onclick = onExit;
  document.getElementById('add').onclick = () => openForm(onExit, null, includeArchived);

  const content = document.querySelector('.app-content');
  let stores;
  try {
    stores = await storeRepository.getStores({ includeArchived });
  } catch (err) {
    content.innerHTML = `<p class="error">${escape(err.message || 'Could not load stores.')}</p>`;
    return;
  }

  if (!stores.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icons.store}</div>
        <p>No stores yet.</p>
        <p class="subtitle">Add the shops you buy from — like S&amp;R, Landers, or SM.</p>
      </div>`;
    return;
  }

  const items = stores.map(s => `
    <li class="list-item ${s.archived ? 'is-archived' : ''}">
      <div class="list-item-main">
        <div class="list-item-title">${escape(s.name)}${s.archived ? ' <span class="tag">Archived</span>' : ''}</div>
        ${s.location ? `<div class="list-item-sub">${escape(s.location)}</div>` : ''}
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" data-edit="${s.id}" aria-label="Edit">${icons.edit}</button>
        <button class="icon-btn" data-archive="${s.id}" data-archived="${s.archived}"
          aria-label="${s.archived ? 'Restore' : 'Archive'}">${icons.archive}</button>
      </div>
    </li>`).join('');

  content.innerHTML = `
    <label class="show-archived">
      <input type="checkbox" id="showArchived" ${includeArchived ? 'checked' : ''} />
      Show archived stores
    </label>
    <ul class="list">${items}</ul>`;

  document.getElementById('showArchived').onchange = (e) =>
    renderList(onExit, { includeArchived: e.target.checked });

  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openForm(onExit, stores.find(s => s.id === btn.dataset.edit), includeArchived);
  });
  content.querySelectorAll('[data-archive]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await storeRepository.setArchived(btn.dataset.archive, btn.dataset.archived !== 'true');
        renderList(onExit, { includeArchived });
      } catch (err) {
        alert(err.message || 'Could not update the store.');
        btn.disabled = false;
      }
    };
  });
}

function openForm(onExit, store, includeArchived) {
  const isEdit = !!store;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? 'Edit store' : 'Add store'}</h2>
      <label class="field"><span>Store name</span>
        <input id="s-name" type="text" value="${isEdit ? escape(store.name) : ''}" placeholder="e.g. S&amp;R" /></label>
      <label class="field"><span>Location (optional)</span>
        <input id="s-loc" type="text" value="${isEdit && store.location ? escape(store.location) : ''}" placeholder="e.g. Pasig" /></label>
      <p id="m-error" class="error" hidden></p>
      <div class="modal-actions">
        <button class="btn-secondary" id="cancel">Cancel</button>
        <button class="btn-primary" id="save">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#cancel').onclick = close;

  const nameInput = overlay.querySelector('#s-name');
  nameInput.focus();
  const errorEl = overlay.querySelector('#m-error');
  const saveBtn = overlay.querySelector('#save');

  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    const location = overlay.querySelector('#s-loc').value;
    errorEl.hidden = true;
    if (!name) { errorEl.textContent = 'Please enter a store name.'; errorEl.hidden = false; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      if (isEdit) await storeRepository.updateStore(store.id, { name, location });
      else await storeRepository.createStore(name, location);
      close();
      renderList(onExit, { includeArchived });
    } catch (err) {
      errorEl.textContent = err.message || 'Could not save the store.';
      errorEl.hidden = false;
      saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Add';
    }
  };
}