import { supabase } from './config.js';
import { forgetEverything } from './local_db.js';

// Turn a username into a hidden email so we can use Supabase Auth (email-based)
// while the user only ever types a username.
const USERNAME_DOMAIN = '@grocery.local';
const toEmail = (username) => username.trim().toLowerCase() + USERNAME_DOMAIN;
const toUsername = (email) => email.replace(USERNAME_DOMAIN, '');

export const authRepository = {
  async signUp(username, password) {
    const { data, error } = await supabase.auth.signUp({
      email: toEmail(username), password,
    });
    if (error) throw error;
    return data.user;
  },

  async signIn(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: toEmail(username), password,
    });
    if (error) throw error;
    return data.user;
  },

  // Never throws. Signing out has to work with no network — and a failure
  // here previously skipped the cache wipe entirely, because the call threw
  // before reaching it, leaving a household's products and prices readable
  // on a device someone had just signed out of.
  async signOut() {
    try { await supabase.auth.signOut(); }
    catch { /* server unreachable; the local session is cleared regardless */ }
    await forgetEverything();
  },

  // Reads the session Supabase persists in localStorage, so it answers
  // without a network. Wrapped because a thrown error here would otherwise
  // reject app start-up outright.
  async getCurrentUser() {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      const u = data.session.user;
      return { id: u.id, username: toUsername(u.email) };
    } catch {
      return null;
    }
  },
};