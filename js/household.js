import { supabase } from './config.js';

export const householdRepository = {
  async getMyHousehold() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('role, household_id, households!profiles_household_id_fkey(id, name, invite_code, invite_expires_at)')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    if (!data.household_id || !data.households) return null;

    return {
      id: data.households.id,
      name: data.households.name,
      inviteCode: data.households.invite_code,
      inviteExpiresAt: data.households.invite_expires_at,
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