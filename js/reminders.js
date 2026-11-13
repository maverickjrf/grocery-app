import { getMeta, setMeta } from './local_db.js';

// One-off reminders shown on Home until tapped "Done" — for things to check
// in the aisle that are easy to forget between sessions. Add one = one entry
// here; an id must never be reused, or an old dismissal would hide it.
// Remove an entry once it's done for good.
export const REMINDERS = [
  {
    id: 'gtin14-check',
    text: 'Check the barcode fix: scan the Phoenix garbage bag and the Knorr pork cubes. Each should open its product, not "not found".',
  },
];

const DISMISSED_KEY = 'dismissedReminders';

// Dismissals sit in the meta store, which backups don't include — a restore
// on a new device shows reminders again, which is harmless.
export const reminderRepository = {
  async active() {
    let dismissed = [];
    try { dismissed = (await getMeta(DISMISSED_KEY)) || []; } catch { /* show them all */ }
    return REMINDERS.filter((r) => !dismissed.includes(r.id));
  },

  async dismiss(id) {
    const dismissed = (await getMeta(DISMISSED_KEY)) || [];
    if (!dismissed.includes(id)) await setMeta(DISMISSED_KEY, [...dismissed, id]);
  },
};
