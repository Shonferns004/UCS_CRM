import db from '../config/db.js';

export const createLead = async (data) => {
  const { data: lead, error } = await db
    .from('leads')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return lead;
};

// ── Ownership ────────────────────────────────────────────────────────────────
// A lead belongs to a recruiter when they are either the assigned recruiter
// (HR sets recruiter_id when handing work over) or the person who entered it
// (the panel records created_by). Both have to be accepted or a recruiter loses
// sight of leads that were assigned to them rather than typed by them.
//
// Ids are compared numerically: JWT ids arrive as numbers while PostgREST hands
// back numbers too, but a caller-supplied id may be a string.
const normalizeOwnerIds = (ownerIds) => {
  if (!ownerIds) return null;
  const ids = ownerIds
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map(Number)
    .filter((id) => Number.isFinite(id));
  return [...new Set(ids)];
};

// One top-level OR per query, which is all PostgREST accepts.
const ownerOrFilter = (ownerIds) =>
  ownerIds.map((id) => `recruiter_id.eq.${id},created_by.eq.${id}`).join(',');

const escapeIlike = (term) =>
  String(term).replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\*/g, '');

const searchOrFilter = (term) => {
  const escaped = escapeIlike(term);
  return `name.ilike.*${escaped}*,email.ilike.*${escaped}*,phone.ilike.*${escaped}*`;
};

const matchesSearch = (rows, term) => {
  const needle = String(term).toLowerCase();
  return rows.filter((row) =>
    [row.name, row.email, row.phone].some((value) =>
      String(value ?? '').toLowerCase().includes(needle)
    )
  );
};

// Exported for the controllers and tests so ownership is defined in exactly one
// place: whoever routes decide who "me" is, this decides what "mine" means.
export const ownsLead = (lead, ownerIds) => {
  const ids = normalizeOwnerIds(Array.isArray(ownerIds) ? ownerIds : [ownerIds]);
  if (!lead || !ids || ids.length === 0) return false;
  // An unset column must not be coerced to 0, or a NULL recruiter_id would look
  // like a match for whoever happens to be recruiter 0.
  const matches = (value) => {
    if (value === null || value === undefined || value === '') return false;
    return ids.includes(Number(value));
  };
  return matches(lead.recruiter_id) || matches(lead.created_by);
};

export const getAllLeads = async (filters = {}) => {
  const ownerIds = normalizeOwnerIds(filters.ownerIds);
  if (ownerIds && ownerIds.length === 0) return [];

  let query = db
    .from('leads')
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .order('created_at', { ascending: false });

  if (ownerIds) query = query.or(ownerOrFilter(ownerIds));
  if (filters.recruiter_id) query = query.eq('recruiter_id', filters.recruiter_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.created_by) query = query.eq('created_by', filters.created_by);

  // Ownership and search are both ORs, and a query can only carry one. Ownership
  // is the security boundary so it stays in SQL, and the search is applied to the
  // already-owned rows here. That only ever narrows the caller's own leads.
  const searchInMemory = Boolean(filters.search) && Boolean(ownerIds);
  if (filters.search && !searchInMemory) query = query.or(searchOrFilter(filters.search));

  const { data, error } = await query;
  if (error) throw error;
  return searchInMemory ? matchesSearch(data || [], filters.search) : data;
};

export const getLeadById = async (id) => {
  const { data, error } = await db
    .from('leads')
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const updateLead = async (id, updates) => {
  const { data, error } = await db
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .single();
  if (error) throw error;
  return data;
};

export const deleteLead = async (id) => {
  const { error } = await db
    .from('leads')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { message: 'Lead deleted successfully' };
};

export const getLeadsByRecruiter = async (recruiterId) => {
  const { data, error } = await db
    .from('leads')
    .select('*')
    .or(`recruiter_id.eq.${recruiterId},created_by.eq.${recruiterId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const transferLead = async (id, newCreatedBy, newCreatedByName) => {
  const { data, error } = await db
    .from('leads')
    .update({ created_by: newCreatedBy, created_by_name: newCreatedByName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .single();
  if (error) throw error;
  return data;
};

export const getLeadsDashboard = async (filters = {}) => {
  const ownerIds = normalizeOwnerIds(filters.ownerIds);

  let data = [];
  if (!ownerIds || ownerIds.length > 0) {
    let query = db
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (ownerIds) query = query.or(ownerOrFilter(ownerIds));
    const { data: rows, error } = await query;
    if (error) throw error;
    data = rows || [];
  }

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
