import db from '../config/db.js';
import { istDateString } from '../utils/ist.js';
import { conversionRate } from '../utils/leads.js';

// `.or()` conditions are comma-separated and paren-balanced, so a display name
// carrying those characters would corrupt the filter string.
const sanitizeOrValue = (v) =>
  String(v == null ? '' : v).replace(/[,()*%_]/g, ' ').replace(/\s+/g, ' ').trim();

// A recruiter owns a lead when it is assigned to them (recruiter_id), when they
// entered it (created_by), or — for the rows that only ever kept a display name —
// when either *_by_name stamp matches. Must stay in step with the owner clause in
// leadBelongsTo() (backend/src/utils/leads.js) and with belongsToLead() in
// client/src/utils/leads.js.
const applyOwnerScope = (query, ownerId, ownerName) => {
  if (!ownerId) return query;
  const parts = [`recruiter_id.eq.${ownerId}`, `created_by.eq.${ownerId}`];
  const name = sanitizeOrValue(ownerName);
  if (name) parts.push(`created_by_name.ilike.${name}`, `scheduled_by_name.ilike.${name}`);
  return query.or(parts.join(','));
};

export const createLead = async (data) => {
  const { data: lead, error } = await db
    .from('leads')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return lead;
};

export const getAllLeads = async (filters = {}) => {
  let query = db
    .from('leads')
    .select('*, users!leads_recruiter_id_fkey(name, email)')
    .order('created_at', { ascending: false });

  query = applyOwnerScope(query, filters.ownerId, filters.ownerName);
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

export const getLeadsDashboard = async (owner = {}) => {
  let query = db
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  query = applyOwnerScope(query, owner.ownerId, owner.ownerName);
  const { data, error } = await query;
  if (error) throw error;

  const total = data.length;
  // Sessions are pinned to Asia/Kolkata, so "today" has to be an IST day here
  // too; toISOString() would label the evening before as the next day.
  const today = istDateString();
  const newToday = data.filter((l) => istDateString(l.created_at ? new Date(l.created_at) : null) === today).length;
  const byStatus = {};
  data.forEach((l) => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  });
  const conversion = conversionRate(data);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = istDateString(d);
    last7.push({ date: ds, count: data.filter((l) => istDateString(l.created_at ? new Date(l.created_at) : null) === ds).length });
  }

  return { total, newToday, byStatus, conversionRate: conversion, last7 };
};
