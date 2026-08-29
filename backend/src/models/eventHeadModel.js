import db from '../config/db.js';

// ─── EVENTS ───
export const createEventHeadEvent = async (data) => {
  const { data: result, error } = await db.from('event_head_events').insert([{ ...data, updated_at: new Date() }]).select().single();
  if (error) throw error;
  return result;
};

// Bulk insert from an events sheet import. No ON CONFLICT (events have no
// natural unique key) — the caller dedupes rows before calling.
export const insertEventHeadEventsBulk = async (rows) => {
  if (!rows || !rows.length) return [];
  const withTs = rows.map(r => ({ ...r, updated_at: new Date() }));
  const { data, error } = await db.from('event_head_events').insert(withTs).select('id');
  if (error) throw error;
  return data || [];
};

export const getAllEventHeadEvents = async (filters = {}) => {
  const { ngo_id, sector_id, activity_id, status, month, year } = filters;
  let query = db.from('event_head_events').select('*').order('created_at', { ascending: false });
  if (ngo_id) query = query.eq('ngo_id', ngo_id);
  if (sector_id) query = query.eq('sector_id', sector_id);
  if (activity_id) query = query.eq('activity_id', activity_id);
  if (status) query = query.eq('status', status);
  if (month && year) {
    const m = Number(month), y = Number(year);
    if (m >= 1 && m <= 12) {
      query = query.gte('date', `${y}-${String(m).padStart(2, '0')}-01`)
        .lt('date', `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getEventHeadEventById = async (id) => {
  const { data, error } = await db.from('event_head_events').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

export const updateEventHeadEvent = async (id, updates) => {
  const { data, error } = await db.from('event_head_events').update({ ...updates, updated_at: new Date() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteEventHeadEvent = async (id) => {
  const { error } = await db.from('event_head_events').delete().eq('id', id);
  if (error) throw error;
  return { message: 'Event deleted' };
};

export const getEventHeadEventsByMonth = async (month, year) => {
  const m = Number(month), y = Number(year);
  const { data, error } = await db.from('event_head_events').select('*')
    .gte('date', `${y}-${String(m).padStart(2, '0')}-01`)
    .lt('date', `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
};

export const getEventHeadEventsByNgo = async (ngoId) => {
  const { data, error } = await db.from('event_head_events').select('*').eq('ngo_id', ngoId).order('date', { ascending: false });
  if (error) throw error;
  return data;
};

export const getEventHeadEventsByState = async (state) => {
  const { data, error } = await db.from('event_head_events').select('*').ilike('state', state).order('date', { ascending: false });
  if (error) throw error;
  return data;
};

export const getEventHeadDashboard = async () => {
  const { data, error } = await db.from('event_head_events').select('*');
  if (error) throw error;
  const total = data.length;
  const upcoming = data.filter(e => e.status === 'Approved' && new Date(e.date) > new Date()).length;
  const today = data.filter(e => e.date === new Date().toISOString().slice(0, 10)).length;
  const completed = data.filter(e => e.status === 'Completed').length;
  const cancelled = data.filter(e => ['Cancelled', 'Postponed'].includes(e.status)).length;
  const budgetTotal = data.reduce((s, e) => s + (+e.budget || 0), 0);
  const beneficiariesTotal = data.reduce((s, e) => s + (+e.expected_beneficiaries || 0), 0);
  return { total, upcoming, today, completed, cancelled, budget_total: budgetTotal, beneficiaries_total: beneficiariesTotal };
};

const pad2 = (n) => String(n).padStart(2, '0');
const monthBounds = (month, year) => {
  const y = year ? Number(year) : null;
  if (month) {
    const m = Number(month);
    if (!(m >= 1 && m <= 12)) return null;
    const yearForMonth = y || new Date().getFullYear();
    const next = m === 12 ? `${yearForMonth + 1}-01-01` : `${yearForMonth}-${pad2(m + 1)}-01`;
    return { from: `${yearForMonth}-${pad2(m)}-01`, to: next };
  }
  if (y && Number.isFinite(y)) return { from: `${y}-01-01`, to: `${y + 1}-01-01` };
  return null;
};

// Lean projection of events for the dashboard stats calculation.
// Applies the scalar filters (ngo/sector/activity) and the month+year window.
export const getEventHeadDashboardEvents = async (filters = {}) => {
  const { ngo_id, sector_id, activity_id, month, year } = filters;
  let query = db.from('event_head_events')
    .select('id, name, date, start_time, end_time, venue, status, ngo_id, sector_id, activity_id, budget, expected_beneficiaries');
  if (ngo_id) query = query.eq('ngo_id', ngo_id);
  if (sector_id) query = query.eq('sector_id', sector_id);
  if (activity_id) query = query.eq('activity_id', activity_id);
  const bounds = monthBounds(month, year);
  if (bounds) query = query.gte('date', bounds.from).lt('date', bounds.to);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

// ─── ASSETS ───
export const createAsset = async (data) => {
  const { data: result, error } = await db.from('event_head_assets').insert([{ ...data, available_qty: data.quantity, updated_at: new Date() }]).select().single();
  if (error) throw error;
  return result;
};

export const getAllAssets = async () => {
  const { data, error } = await db.from('event_head_assets').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getAssetById = async (id) => {
  const { data, error } = await db.from('event_head_assets').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

export const updateAsset = async (id, updates) => {
  const { data, error } = await db.from('event_head_assets').update({ ...updates, updated_at: new Date() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteAsset = async (id) => {
  const { error } = await db.from('event_head_assets').delete().eq('id', id);
  if (error) throw error;
  return { message: 'Asset deleted' };
};

export const issueAsset = async (assetId, qty) => {
  const asset = await getAssetById(assetId);
  const newIssued = (asset.issued_qty || 0) + qty;
  const newAvailable = (asset.available_qty || asset.quantity) - qty;
  return updateAsset(assetId, { issued_qty: newIssued, available_qty: newAvailable });
};

export const returnAsset = async (assetId) => {
  const asset = await getAssetById(assetId);
  return updateAsset(assetId, { issued_qty: 0, available_qty: asset.quantity, damaged_qty: 0 });
};

// ─── MATERIALS ───
export const createMaterial = async (data) => {
  const balance = +data.opening_stock + +data.received - +data.issued;
  const { data: result, error } = await db.from('event_head_materials').insert([{ ...data, balance, updated_at: new Date() }]).select().single();
  if (error) throw error;
  return result;
};

export const getAllMaterials = async () => {
  const { data, error } = await db.from('event_head_materials').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateMaterial = async (id, updates) => {
  const balance = +updates.opening_stock + +updates.received - +updates.issued;
  const { data, error } = await db.from('event_head_materials').update({ ...updates, balance, updated_at: new Date() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteMaterial = async (id) => {
  const { error } = await db.from('event_head_materials').delete().eq('id', id);
  if (error) throw error;
  return { message: 'Material deleted' };
};

export const getMaterialStock = async () => {
  const { data, error } = await db.from('event_head_materials').select('name, balance, opening_stock, received, issued').order('balance', { ascending: true });
  if (error) throw error;
  return data;
};

export const adjustMaterialStock = async (id, adjustment) => {
  const mat = await db.from('event_head_materials').select('*').eq('id', id).single().then(r => r.data);
  const newBalance = (mat.balance || 0) + adjustment;
  return updateMaterial(id, { balance: Math.max(0, newBalance) });
};

// ─── DISTRIBUTIONS ───
export const createDistribution = async (eventId, data) => {
  const { data: result, error } = await db.from('event_head_distributions').insert([{ ...data, event_id: eventId }]).select().single();
  if (error) throw error;
  if (data.material_id && data.quantity) {
    const mat = await db.from('event_head_materials').select('*').eq('id', data.material_id).single().then(r => r.data);
    if (mat) await updateMaterial(data.material_id, { issued: (mat.issued || 0) + +data.quantity, opening_stock: mat.opening_stock, received: mat.received });
  }
  return result;
};

export const getDistributionsByEvent = async (eventId) => {
  const { data, error } = await db.from('event_head_distributions').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

// ─── VOLUNTEERS ───
export const createVolunteer = async (data) => {
  const { data: result, error } = await db.from('event_head_volunteers').insert([data]).select().single();
  if (error) throw error;
  return result;
};

export const getAllVolunteers = async () => {
  const { data, error } = await db.from('event_head_volunteers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateVolunteer = async (id, updates) => {
  const { data, error } = await db.from('event_head_volunteers').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// ─── EXPENSES ───
export const createExpense = async (eventId, data) => {
  const { data: result, error } = await db.from('event_head_expenses').insert([{ ...data, event_id: eventId }]).select().single();
  if (error) throw error;
  return result;
};

export const getExpensesByEvent = async (eventId) => {
  const { data, error } = await db.from('event_head_expenses').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const deleteExpense = async (eventId, id) => {
  const { error } = await db.from('event_head_expenses').delete().eq('id', id).eq('event_id', eventId);
  if (error) throw error;
  return { message: 'Expense deleted' };
};

// ─── VEHICLES ───
export const createVehicle = async (data) => {
  const { data: result, error } = await db.from('event_head_vehicles').insert([data]).select().single();
  if (error) throw error;
  return result;
};

export const getAllVehicles = async () => {
  const { data, error } = await db.from('event_head_vehicles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const assignVehicle = async (data) => {
  const { data: result, error } = await db.from('event_head_vehicles').insert([data]).select().single();
  if (error) throw error;
  return result;
};

// ─── MEDIA ───
export const createMedia = async (eventId, data) => {
  const { data: result, error } = await db.from('event_head_media').insert([{ ...data, event_id: eventId }]).select().single();
  if (error) throw error;
  return result;
};

export const getMediaByEvent = async (eventId) => {
  const { data, error } = await db.from('event_head_media').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const deleteMedia = async (eventId, id) => {
  const { error } = await db.from('event_head_media').delete().eq('id', id).eq('event_id', eventId);
  if (error) throw error;
  return { message: 'Media deleted' };
};

// ─── ATTENDANCE ───
export const createAttendance = async (eventId, data) => {
  const { data: result, error } = await db.from('event_head_attendance').insert([{ ...data, event_id: eventId }]).select().single();
  if (error) throw error;
  return result;
};

export const getAttendanceByEvent = async (eventId) => {
  const { data, error } = await db.from('event_head_attendance').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

// ─── CHECKLIST ───
export const getChecklistByEvent = async (eventId) => {
  const { data, error } = await db.from('event_head_checklist').select('*').eq('event_id', eventId).order('id', { ascending: true });
  if (error) throw error;
  return data;
};

export const upsertChecklistItem = async (eventId, item) => {
  if (item.id) {
    const { data, error } = await db.from('event_head_checklist').update({ status: item.status, notes: item.notes }).eq('id', item.id).eq('event_id', eventId).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from('event_head_checklist').insert([{ event_id: eventId, label: item.label, status: item.status, notes: item.notes }]).select().single();
  if (error) throw error;
  return data;
};

// ─── PARTNERS (CSR) ───
export const getAllPartners = async () => {
  const { data, error } = await db.from('event_head_partners').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data;
};

// ─── DONORS ───
export const getAllDonors = async () => {
  const { data, error } = await db.from('event_head_donors').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data;
};

// ─── SECTORS (Dynamic 12-sector reference, seeded via migration) ───
export const getAllEventHeadSectors = async () => {
  const { data, error } = await db.from('event_head_sectors').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
};

export const getSectorActivityCounts = async (ngoId) => {
  let query = db.from('event_head_activities').select('id, sector_id, ngo_id');
  if (ngoId) query = query.eq('ngo_id', ngoId);
  const { data, error } = await query;
  if (error) throw error;
  const counts = {};
  for (const a of data || []) if (a.sector_id) counts[a.sector_id] = (counts[a.sector_id] || 0) + 1;
  return counts;
};

export const getSectorEventCounts = async (ngoId) => {
  let query = db.from('event_head_events').select('id, sector_id, ngo_id');
  if (ngoId) query = query.eq('ngo_id', ngoId);
  const { data, error } = await query;
  if (error) throw error;
  const counts = {};
  for (const e of data || []) if (e.sector_id) counts[e.sector_id] = (counts[e.sector_id] || 0) + 1;
  return counts;
};

// ─── ACTIVITIES (NGO → Sector → Activity) ───
export const createActivity = async (data) => {
  const { data: result, error } = await db.from('event_head_activities').insert([{ ...data, updated_at: new Date() }]).select().single();
  if (error) throw error;
  return result;
};

// Bulk upsert from a sheet import. Only actually-inserted rows are returned
// (ON CONFLICT ... DO NOTHING skips existing), so callers can report
// inserted vs skipped_existing counts precisely.
export const insertActivitiesBulk = async (rows) => {
  if (!rows || !rows.length) return [];
  const { data, error } = await db.from('event_head_activities')
    .upsert(rows, { onConflict: 'ngo_id,sector_id,name', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data || [];
};

export const getAllActivities = async ({ ngo_id, sector_id } = {}) => {
  let query = db.from('event_head_activities').select('*').order('created_at', { ascending: false });
  if (ngo_id) query = query.eq('ngo_id', ngo_id);
  if (sector_id) query = query.eq('sector_id', sector_id);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getActivityById = async (id) => {
  const { data, error } = await db.from('event_head_activities').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};

export const updateActivity = async (id, updates) => {
  const { data, error } = await db.from('event_head_activities').update({ ...updates, updated_at: new Date() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const getActivityEventCounts = async () => {
  const { data, error } = await db.from('event_head_events').select('id, activity_id');
  if (error) throw error;
  const counts = {};
  for (const e of data || []) if (e.activity_id) counts[e.activity_id] = (counts[e.activity_id] || 0) + 1;
  return counts;
};

// ─── NGO CONTEXT (read-only, Event Head workspace) ───
const EVENT_HEAD_NGO_CODES = ['bsct', 'mann', 'aflf'];

export const getAllEventHeadNgos = async () => {
  const { data, error } = await db.from('ngos').select('id, name, code').order('name', { ascending: true });
  if (error) throw error;
  return (data || []).sort((a, b) => {
    const ia = EVENT_HEAD_NGO_CODES.indexOf(String(a.code || a.name || '').toLowerCase());
    const ib = EVENT_HEAD_NGO_CODES.indexOf(String(b.code || b.name || '').toLowerCase());
    return (ia === -1 ? 9 : ia) - (ib === -1 ? 9 : ib) || String(a.name || a.code).localeCompare(String(b.name || b.code));
  });
};

export const getEventHeadNgoById = async (ngoId) => {
  if (!ngoId) return null;
  const { data, error } = await db.from('ngos').select('id, name, code').eq('id', ngoId).maybeSingle();
  if (error) return null;
  return data;
};
