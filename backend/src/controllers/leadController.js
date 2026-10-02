import {
  createLead,
  getAllLeads,
  getLeadById,
  updateLead,
  deleteLead,
  transferLead,
  getLeadsDashboard,
} from '../models/leadModel.js';

// Roles allowed to see the whole pipeline rather than their own slice.
const CAN_SCOPE_ALL = new Set(['super_admin', 'admin', 'hr', 'master']);

// A recruiter's panel is their own pipeline by default. Without this the panel
// received every lead in the CRM sorted newest-first, so a recruiter's own older
// leads sat dozens of pages deep with no control to isolate them. Only a
// privileged role may opt out with ?scope=all.
const recruiterOwner = (req, scope) =>
  req.user.role === 'recruiter' && !(scope === 'all' && CAN_SCOPE_ALL.has(req.user.role))
    ? { ownerId: req.user.id, ownerName: req.user.name }
    : {};

export const addLead = async (req, res) => {
  try {
    const { name, phone, age, source, status, notes, recruiter_id, created_by_name, dob, scheduled_date } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Lead name is required' });
    }
    const data = {
      name,
      phone: phone || null,
      age: age || null,
      source: source || 'Walk-in',
      status: status,
      notes: notes || null,
      recruiter_id: recruiter_id || null,
      created_by: req.user.id,
      created_by_name: created_by_name || req.user.name || null,
      dob: dob || null,
      scheduled_date: scheduled_date || null,
    };
    if (status === 'scheduled') {
      data.scheduled_by = req.user.id;
      data.scheduled_at = new Date().toISOString();
      data.scheduled_by_name = req.user.name || null;
    }
    const lead = await createLead(data);
    return res.status(201).json({ message: 'Lead created successfully', lead });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listLeads = async (req, res) => {
  try {
    const { recruiter_id, status, search, source, scope, created_by } = req.query;
    const filters = { recruiter_id, status, search, source };
    const isTelecaller = req.user.role === 'telecaller' || (req.user.role === 'worker' && (req.user.department || '').toLowerCase().trim() === 'fro');
    if (isTelecaller) filters.created_by = req.user.id;
    else if (created_by) filters.created_by = created_by;
    Object.assign(filters, recruiterOwner(req, scope));
    const leads = await getAllLeads(filters);
    return res.json(leads);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getLead = async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    return res.json(lead);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editLead = async (req, res) => {
  try {
    const existing = await getLeadById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Lead not found' });

    const isTelecaller = req.user.role === 'telecaller' || (req.user.role === 'worker' && (req.user.department || '').toLowerCase().trim() === 'fro');
    if ((req.user.role === 'recruiter' || isTelecaller) && existing.created_by !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own leads' });
    }

    const { name, phone, age, source, status, notes, recruiter_id, dob, scheduled_date } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (age !== undefined) updates.age = age;
    if (source) updates.source = source;
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (recruiter_id !== undefined) updates.recruiter_id = recruiter_id;
    if (dob !== undefined) updates.dob = dob;
    if (scheduled_date !== undefined) updates.scheduled_date = scheduled_date;
    if (status === 'scheduled' && existing.status !== 'scheduled') {
      updates.scheduled_by = req.user.id;
      updates.scheduled_at = new Date().toISOString();
      updates.scheduled_by_name = req.user.name || null;
    }
    const lead = await updateLead(req.params.id, updates);
    return res.json({ message: 'Lead updated successfully', lead });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeLead = async (req, res) => {
  try {
    const result = await deleteLead(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const transferLeadOwner = async (req, res) => {
  try {
    const existing = await getLeadById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Lead not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ message: 'You can only transfer leads you own' });
    }

    const { new_owner_id, new_owner_name } = req.body;
    if (!new_owner_id) return res.status(400).json({ message: 'new_owner_id is required' });

    const lead = await transferLead(req.params.id, new_owner_id, new_owner_name || null);
    return res.json({ message: 'Lead transferred successfully', lead });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const dashboard = async (req, res) => {
  try {
    const stats = await getLeadsDashboard(recruiterOwner(req, req.query.scope));
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
