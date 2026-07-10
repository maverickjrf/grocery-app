import { supabase } from './config.js';

export const householdRepository = {
  // Returns the current user's household, or null if they haven't joined one yet.
  async getMyHousehold() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('role, household_id, households(id, name, invite_code)')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    if (!data.household_id || !data.households) return null;

    return {
      id: data.households.id,
      name: data.households.name,
      inviteCode: data.households.invite_code,
      role: data.role,
    };
  },

  async createHousehold(name) {
    const { error } = await supabase.rpc('create_household', { p_name: name });
    if (error) throw error;
  },

  async joinHousehold(inviteCode) {
    const { error } = await supabase.rpc('join_household', { p_invite_code: inviteCode });
    if (error) throw error;
  },
};