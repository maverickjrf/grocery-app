import { supabase } from './config.js';
import { getMeta, setMeta, ensureHousehold, isNetworkError } from './local_db.js';
import { markOffline } from './connectivity.js';

const HOUSEHOLD_CACHE_KEY = 'household';

export const householdRepository = {
  // Cached, because this is the first call the app makes after start-up: if
  // it throws, the router sends the user to the sign-in screen. Without a
  // saved copy, opening the app with no signal would look like being logged
  // out — locked out of the app in exactly the dead zone it was built for.
  //
  // Only the household itself is cached. The invite code deliberately is not
  // read from cache below, since a stale code is worse than no code.
  async getMyHousehold() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('role, household_id, households!profiles_household_id_fkey(id, name, invite_code, invite_expires_at)')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      if (!data.household_id || !data.households) {
        await setMeta(HOUSEHOLD_CACHE_KEY, null);
        return null;
      }

      const household = {
        id: data.households.id,
        name: data.households.name,
        inviteCode: data.households.invite_code,
        inviteExpiresAt: data.households.invite_expires_at,
        role: data.role,
      };
      // Wipes every cached row if this is a different household than the one
      // last seen on this device.
      await ensureHousehold(household.id);
      try { await setMeta(HOUSEHOLD_CACHE_KEY, household); } catch { /* cache unavailable */ }
      return household;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      markOffline();
      let cached = null;
      try { cached = await getMeta(HOUSEHOLD_CACHE_KEY); } catch { /* none saved */ }
      if (!cached) throw err;
      // Offline: an invite code can't be trusted to still be valid, and
      // rotating or retiring one needs the server anyway.
      return { ...cached, inviteCode: null, inviteExpiresAt: null };
    }
  },

  async createHousehold(name) {
    const { error } = await supabase.rpc('create_household', { p_name: name });
    if (error) throw error;
  },

  async joinHousehold(inviteCode) {
    const { error } = await supabase.rpc('join_household', { p_invite_code: inviteCode });
    if (error) throw error;
  },

  async leaveHousehold() {
    const { error } = await supabase.rpc('leave_household');
    if (error) throw error;
  },

  async rotateInviteCode() {
    const { error } = await supabase.rpc('rotate_invite_code');
    if (error) throw error;
  },

  async retireInviteCode() {
    const { error } = await supabase.rpc('retire_invite_code');
    if (error) throw error;
  },
};