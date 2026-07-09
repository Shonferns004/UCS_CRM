import supabase from '../config/supabase.js';

export const getUserNgoAccess = async (userId) => {
  // Super admin sentinel — return all NGOs
  if (userId === 0 || userId === '0') {
    const { data: allNgos } = await supabase.from('ngos').select('id, name');
    return (allNgos || []).map(n => ({ ngo_id: n.id, ngo_name: n.name }));
  }

  // Check if user is global admin (hoadmin) — they see all NGOs
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (user?.role === 'admin' || user?.role === 'super_admin') {
    const { data: allNgos } = await supabase.from('ngos').select('id, name');
    return (allNgos || []).map(n => ({ ngo_id: n.id, ngo_name: n.name }));
  }

  const { data, error } = await supabase
    .from('user_ngo_access')
    .select('ngo_id, ngos!inner(name)')
    .eq('user_id', userId);
  if (error) throw error;
  if (data && data.length > 0) {
    return data.map(d => ({ ngo_id: d.ngo_id, ngo_name: d.ngos?.name }));
  }

  // Fallback: check if user is an NGO Admin worker
  const { data: wrk } = await supabase
    .from('workers')
    .select('department, ngo_id')
    .eq('id', userId)
    .maybeSingle();
  if (wrk && wrk.department?.toLowerCase() === 'ngo admin') {
    const { data: allocations } = await supabase
      .from('worker_ngo_allocations')
      .select('ngo_id, ngos(name)')
      .eq('worker_id', userId);
    if (allocations && allocations.length > 0) {
      return allocations.map(a => ({ ngo_id: a.ngo_id, ngo_name: a.ngos?.name }));
    }
    if (wrk.ngo_id) {
      const { data: ngo } = await supabase.from('ngos').select('id, name').eq('id', wrk.ngo_id).single();
      if (ngo) return [{ ngo_id: ngo.id, ngo_name: ngo.name }];
    }
  }

  return [];
};

export const setUserNgoAccess = async (userId, ngoIds) => {
  const { error: delError } = await supabase
    .from('user_ngo_access')
    .delete()
    .eq('user_id', userId);
  if (delError) throw delError;

  if (!ngoIds || ngoIds.length === 0) return [];

  const rows = ngoIds.map(ngo_id => ({ user_id: userId, ngo_id }));
  const { data, error } = await supabase
    .from('user_ngo_access')
    .insert(rows)
    .select('ngo_id');
  if (error) throw error;
  return data;
};
