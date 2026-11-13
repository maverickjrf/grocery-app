import { render, escape, icons, showBusy } from './ui.js';
import { backupRepository, parseBackup, downloadJson } from './backup.js';
import { relativeDays } from './insights.js';
import { confirmDialog } from './dialog.js';
import { pushScreen, goBack } from './nav.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const describe = (c) =>
  `${plural(c.products, 'product')}, ${plural(c.stores, 'store')}, ${plural(c.observations, 'price')}`;

export function showDataScreen(onExit) {
  pushScreen(onExit);
  paintDataScreen();
}

// Repaints in place after a backup or restore — never calls pushScreen.
async function paintDataScreen(notice = '') {
  render(`
    <div class="app-screen">
      <header class="app-bar">
        <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
        <h1 class="app-bar-title">Backup &amp; restore</h1>
      </header>
      <div class="app-content"><div class="loading">Loading…</div></div>
    </div>`);
  document.getElementById('back').onclick = () => goBack();
  const content = document.querySelector('.app-content');

  let counts, lastAt, protectedStorage;
  try {
    [counts, lastAt, protectedStorage] = await Promise.all([
      backupRepository.counts(),
      backupRepository.lastBackupAt(),
      backupRepository.storageProtected(),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">${escape(err.message || 'Could not read the saved data.')}</p>`;
    return;
  }

  const lastLine = lastAt
    ? `Last backup: ${escape(relativeDays(lastAt.slice(0, 10)))}.`
    : 'No backup made on this device yet.';

  content.innerHTML = `
    ${notice ? `<p class="data-notice">${escape(notice)}</p>` : ''}
    <div class="data-facts">
      <p>On this device: <strong>${escape(describe(counts))}</strong>.</p>
      <p>${lastLine}</p>
      <p class="subtitle">${protectedStorage
        ? 'The browser has agreed not to clear this data on its own.'
        : 'The browser may clear this data if the phone runs low on space.'}
        Your prices exist only on this device — keep a recent backup somewhere
        else, like Google Drive.</p>
    </div>

    <h2 class="section-title">Back up</h2>
    <p class="subtitle">Saves everything to one file, including archived items and hidden prices.</p>
    <button id="backup" class="btn-primary">Download backup</button>

    <h2 class="section-title" style="margin-top:24px">Restore</h2>
    <p class="subtitle">Replaces everything on this device with a backup file. Also reads the
      export from the old online version of the app.</p>
    <button id="restore" class="btn-secondary">Restore from a file…</button>
    <input id="restore-file" type="file" accept=".json,application/json" hidden />
    <p id="data-error" class="error" hidden></p>`;

  const errorEl = document.getElementById('data-error');
  const showError = (m) => { errorEl.textContent = m; errorEl.hidden = false; };

  document.getElementById('backup').onclick = async () => {
    errorEl.hidden = true;
    try {
      await backUp();
      paintDataScreen('Backup downloaded. Move it somewhere off this phone to keep it safe.');
    } catch (err) {
      showError(err.message || 'Could not make the backup.');
    }
  };

  const fileInput = document.getElementById('restore-file');
  document.getElementById('restore').onclick = () => { errorEl.hidden = true; fileInput.click(); };
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // so picking the same file again still fires
    if (!file) return;
    try {
      const restored = await restoreFrom(file, counts);
      if (restored) paintDataScreen(`Restored ${describe(restored)}.`);
    } catch (err) {
      showError(err.message || 'Could not restore that file.');
    }
  };
}

async function backUp() {
  const data = await backupRepository.exportAll();
  downloadJson(data, `grocery-backup-${data.exported_at.slice(0, 10)}.json`);
  await backupRepository.markBackedUp(data.exported_at);
}

// Returns the restored counts, or null if the user backed out.
async function restoreFrom(file, current) {
  const parsed = parseBackup(await file.text());
  const incoming = {
    products: parsed.products.length,
    stores: parsed.stores.length,
    observations: parsed.observations.length,
  };
  const deviceHasData = current.products + current.stores + current.observations > 0;
  const fromWhen = parsed.exportedAt
    ? ` from ${new Date(parsed.exportedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`
    : '';

  const choice = await confirmDialog({
    title: deviceHasData ? 'Replace everything on this device?' : 'Restore this backup?',
    message: `The file${fromWhen} has ${describe(incoming)}.`
      + (deviceHasData
        ? ` This device's ${describe(current)} will be replaced, not merged.`
        : ''),
    actions: [
      ...(deviceHasData ? [{ label: 'Back up this device first, then replace', style: 'secondary', value: 'backup-then' }] : []),
      { label: deviceHasData ? 'Replace' : 'Restore', style: deviceHasData ? 'danger' : 'primary', value: 'go' },
      { label: 'Cancel', style: 'text', value: null },
    ],
  });
  if (!choice) return null;
  if (choice === 'backup-then') await backUp();

  const done = showBusy('Restoring…');
  try { await backupRepository.replaceAll(parsed); }
  finally { done(); }
  return incoming;
}
