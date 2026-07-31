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

  async signOut() {
    const { error } = await supabase.auth.signOut();
    // Cleared even if the sign-out call itself failed: leaving a household's
    // products and prices readable on a device someone just signed out of is
    // the wrong way to fail.
    await forgetEverything();
    if (error) throw error;
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