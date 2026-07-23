import supabase from '../config/supabase.js';

export const createLead = async (data) => {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return lead;
};

export const getAllLeads = async (filters = {}) => {
  let query = supabase
    .from('leads')
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .order('created_at', { ascending: false });

  if (filters.recruiter_id) query = query.eq('recruiter_id', filters.recruiter_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.created_by) query = query.eq('created_by', filters.created_by);
  if (filters.search) {
    const escaped = filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '');
    query = query.or(`name.ilike.*${escaped}*,email.ilike.*${escaped}*,phone.ilike.*${escaped}*`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getLeadById = async (id) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const updateLead = async (id, updates) => {
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .single();
  if (error) throw error;
  return data;
};

export const deleteLead = async (id) => {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { message: 'Lead deleted successfully' };
};

export const getLeadsByRecruiter = async (recruiterId) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`recruiter_id.eq.${recruiterId},created_by.eq.${recruiterId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const transferLead = async (id, newCreatedBy, newCreatedByName) => {
  const { data, error } = await supabase
    .from('leads')
    .update({ created_by: newCreatedBy, created_by_name: newCreatedByName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .single();
  if (error) throw error;
  return data;
};

export const getLeadsDashboard = async () => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const total = data.length;
  const today = new Date().toISOString().slice(0, 10);
  const newToday = data.filter((l) => l.created_at?.slice(0, 10) === today).length;
  const byStatus = {};
  data.forEach((l) => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  });
  const selected = byStatus['selected'] || 0;
  const rejected = byStatus['rejected'] || 0;
  const conversionRate = total > 0 ? ((selected / (selected + rejected)) * 100).toFixed(1) : 0;

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    last7.push({ date: ds, count: data.filter((l) => l.created_at?.slice(0, 10) === ds).length });
  }

  return { total, newToday, byStatus, conversionRate: parseFloat(conversionRate), last7 };
};
