import {
  createInventoryItem,
  getAllInventoryItems,
  getInventoryItemById,
  updateInventoryItem,
  deleteInventoryItem,
  bulkInsertInventoryItems,
} from '../models/simInventoryModel.js';

export const INVENTORY_STATUSES = ['Available', 'Assigned', 'Expired', 'Lost', 'Damaged', 'Inactive'];

const alwaysPresentFields = [
  'sim_number', 'sim_type', 'provider', 'status', 'location',
  'mobile_id', 'device', 'imei', 'assigned_to', 'team',
  'assignment_date', 'issue_date', 'expiry_date', 'notes',
];

function clean(data) {
  const c = { ...data };
  delete c.id;
  delete c.created_at;
  delete c.updated_at;
  alwaysPresentFields.forEach((k) => {
    if (c[k] === undefined || c[k] === null) c[k] = '';
    if (c[k] === '') c[k] = null;
  });
  if (!c.status || !INVENTORY_STATUSES.includes(c.status)) c.status = 'Available';
  return c;
}

function computeExpiry(expiryDate, today = new Date()) {
  if (!expiryDate) return { days_left: null, derived_status: 'Inactive' };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(`${expiryDate}T00:00:00`).getTime();
  const days = Math.round((end - start) / 86400000);
  if (days > 30) return { days_left: days, derived_status: 'Active' };
  if (days >= 1) return { days_left: days, derived_status: 'Expiring Soon' };
  return { days_left: days, derived_status: 'Expired' };
}

function finalStatus(item, derived) {
  const base = (item.status || 'Available').trim();
  if (['Lost', 'Damaged', 'Inactive'].includes(base)) return base;
  if (base === 'Assigned') return 'Assigned';
  if (base === 'Expired' || derived.derived_status === 'Expired') return 'Expired';
  return base === 'Available' ? derived.derived_status : base;
}

export const addInventoryItem = async (req, res) => {
  try {
    const body = clean(req.body);
    if (!body.sim_number || !String(body.sim_number).trim()) {
      return res.status(400).json({ message: 'SIM Number is required' });
    }
    const derived = computeExpiry(body.expiry_date);
    body.status = finalStatus({ status: body.status }, derived);
    body.created_by = req.user?.login_id || req.user?.id || req.user?.name || null;
    const item = await createInventoryItem(body);
    return res.status(201).json({ message: 'SIM added to inventory', item, days_left: derived.days_left });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'SIM Number already exists in inventory' });
    }
    return res.status(500).json({ message: error.message });
  }
};

export const listInventoryItems = async (req, res) => {
  try {
    const items = await getAllInventoryItems();
    const now = new Date();
    const withMeta = items.map((it) => {
      const derived = computeExpiry(it.expiry_date, now);
      const status = finalStatus(it, derived);
      return { ...it, days_left: derived.days_left, derived_status: status };
    });
    return res.json(withMeta);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getInventoryItem = async (req, res) => {
  try {
    const item = await getInventoryItemById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });
    const derived = computeExpiry(item.expiry_date);
    return res.json({ ...item, days_left: derived.days_left, derived_status: finalStatus(item, derived) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editInventoryItem = async (req, res) => {
  try {
    const body = clean(req.body);
    if (!body.sim_number || !String(body.sim_number).trim()) {
      return res.status(400).json({ message: 'SIM Number is required' });
    }
    const derived = computeExpiry(body.expiry_date);
    body.status = finalStatus({ status: body.status }, derived);
    const item = await updateInventoryItem(req.params.id, body);
    return res.json({ message: 'Inventory item updated', item, days_left: derived.days_left });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'SIM Number already exists in inventory' });
    }
    return res.status(500).json({ message: error.message });
  }
};

export const removeInventoryItem = async (req, res) => {
  try {
    await deleteInventoryItem(req.params.id);
    return res.json({ message: 'Inventory item deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const assignInventoryItem = async (req, res) => {
  try {
    const item = await getInventoryItemById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });
    const { mobile_id, device, imei, assigned_to, team, assignment_date } = req.body;
    if (!mobile_id || !String(mobile_id).trim()) {
      return res.status(400).json({ message: 'Mobile ID No. is required' });
    }
    const updated = await updateInventoryItem(req.params.id, {
      mobile_id: String(mobile_id).trim(),
      device: device || item.device || null,
      imei: imei || item.imei || null,
      assigned_to: assigned_to || item.assigned_to || null,
      team: team || item.team || null,
      assignment_date: assignment_date || new Date().toISOString().slice(0, 10),
      status: 'Assigned',
    });
    return res.json({ message: 'SIM assigned', item: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !INVENTORY_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const item = await updateInventoryItem(req.params.id, { status });
    const derived = computeExpiry(item.expiry_date);
    return res.json({ message: 'Status updated', item: { ...item, ...derived } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteBulk = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No items selected' });
    }
    for (const id of ids) {
      await deleteInventoryItem(id);
    }
    return res.json({ message: `${ids.length} item(s) deleted` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const importInventoryItems = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No rows to import' });
    }
    const valid = [];
    const invalid = [];
    const used = new Set();
    for (const raw of rows) {
      const row = clean(raw);
      const missing = !row.sim_number || !String(row.sim_number).trim();
      const dup = row.sim_number ? used.has(String(row.sim_number).trim()) : true;
      if (row.sim_number) used.add(String(row.sim_number).trim());
      if (missing || dup) {
        invalid.push({ row, reason: missing ? 'Missing SIM Number' : 'Duplicate SIM Number' });
        continue;
      }
      const derived = computeExpiry(row.expiry_date);
      row.status = finalStatus({ status: row.status }, derived);
      row.created_by = req.user?.login_id || req.user?.name || null;
      valid.push(row);
    }
    const inserted = valid.length ? await bulkInsertInventoryItems(valid) : [];
    return res.status(201).json({
      message: `Imported ${inserted.length} item(s)`,
      valid: inserted.length,
      invalid: invalid.length,
      invalidRows: invalid,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
