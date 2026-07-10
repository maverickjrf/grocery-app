import { supabase } from './config.js';

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
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const u = data.session.user;
    return { id: u.id, username: toUsername(u.email) };
  },
};