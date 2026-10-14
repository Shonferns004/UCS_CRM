import db from '../config/db.js';
import {
  getAbsenceProofsByWorker,
  getAbsenceProofById,
  upsertAbsenceProof,
  updateAbsenceProofStatus,
  listAbsenceProofs,
} from '../models/absenceProofModel.js';
import { getLeavesInRange } from '../models/leaveModel.js';
import { findUnauthorizedAbsences, expandLeaveDatesForDetection } from '../utils/absenceRules.js';
import { resolveLateGrace } from '../utils/latePolicy.js';
import { getISTToday } from '../utils/salaryDays.js';
import { notifyNgoAdmins } from '../services/adminNotifyService.js';
import { notifyWorker } from '../services/fcmService.js';
import { getWorkerById } from '../models/workerModel.js';

const pad = (n) => String(n).padStart(2, '0');

async function dbAttendanceRange(workerId, startDate, endDate) {
  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('worker_id', workerId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbHolidayRange(startDate, endDate) {
  const { data, error } = await db.from('holidays').select('date').gte('date', startDate).lte('date', endDate);
  if (error) throw error;
  return (data || []).map((h) => h.date);
}

// Build the worker-facing actionable list for a month: which dates were
// unauthorized, what proof state each is in, and whether the grace is at
// risk. Fabricates absent rows for missing weekdays exactly like payroll.
function buildActionable({ year, monthIdx, daysInMonth, records, leaves, proofs, holidayDates, worker }) {
  const monthStr = `${year}-${pad(monthIdx + 1)}`;
  const ist = getISTToday();
  const isCurrentMonth = year === ist.year && monthIdx === ist.month;
  const viewDay = isCurrentMonth ? ist.day : daysInMonth + 1;

  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${pad(d)}`;
    monthDays.push({ date: dateStr, day: d, dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr + 'T00:00:00Z').getUTCDay()] });
  }

  const createdAt = worker?.created_at ? String(worker.created_at).slice(0, 10) : '';
  const joinedThisMonth = createdAt.slice(0, 7) === monthStr;
  const joinDay = joinedThisMonth ? Number(createdAt.slice(8, 10)) : 1;
  const joinDateStr = `${monthStr}-${pad(joinDay)}`;
  const beforeJoinSet = new Set(monthDays.filter((d) => joinedThisMonth && d.date < joinDateStr).map((d) => d.date));
  const holidaySet = new Set((holidayDates || []).map((d) => String(d).slice(0, 10)));

  const recDates = new Set((records || []).map((r) => String(r.date).slice(0, 10)));
  const fabricated = [];
  for (const day of monthDays) {
    if (beforeJoinSet.has(day.date) || day.dayName === 'Sun' || holidaySet.has(day.date) || day.day > viewDay) continue;
    if (!recDates.has(day.date)) fabricated.push({ date: day.date, status: 'absent' });
  }

  const evalResult = findUnauthorizedAbsences({
    monthDays,
    records: [...(records || []), ...fabricated],
    leaves,
    absenceProofs: proofs,
    holidaySet,
    beforeJoinSet,
    viewDay,
  });

  const grace = resolveLateGrace(worker?.late_grace_minutes ?? null);
  return {
    month: monthStr,
    graceMinutes: grace,
    graceForfeited: evalResult.graceForfeited,
    unauthorizedAbsences: evalResult.unauthorizedAbsences,
  };
}

// GET /api/absence-proofs/actionable?month=YYYY-MM
// Worker: the dates for the app-home banner, their proof states, and whether
// the monthly grace is already forfeited.
export const myActionable = async (req, res) => {
  try {
    const workerId = req.user.id;
    const worker = await getWorkerById(workerId);
    const monthStr = req.query.month || currentMonthStr();
    const result = await computeActionable(workerId, monthStr, worker);
    if (result === null) return res.status(400).json({ message: 'Invalid month' });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// GET /api/absence-proofs/worker/:workerId?month=YYYY-MM  (admin / HR)
// Same computation for any worker — the HR panel reads graceForfeited so its
// client-side salary preview charges the grace exactly like payroll (Option A).
export const workerMonth = async (req, res) => {
  try {
    const worker = await getWorkerById(req.params.workerId);
    if (!worker) return res.status(404).json({ message: 'Worker not found' });
    const monthStr = req.query.month || currentMonthStr();
    const result = await computeActionable(worker.id, monthStr, worker);
    if (result === null) return res.status(400).json({ message: 'Invalid month' });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

function currentMonthStr() {
  const ist = getISTToday();
  return `${ist.year}-${pad(ist.month + 1)}`;
}

// Shared month evaluation: fabricates absent rows, runs the detection util,
// and returns the month's grace state. Returns null for an invalid month.
async function computeActionable(workerId, monthStr, worker) {
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const monthIdx = m - 1;
  const daysInMonth = new Date(Date.UTC(y, monthIdx + 1, 0)).getUTCDate();
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${pad(daysInMonth)}`;

  const [records, leaves, proofs, holidayDates] = await Promise.all([
    dbAttendanceRange(workerId, startDate, endDate),
    getLeavesInRange(startDate, endDate, workerId).catch(() => []),
    getAbsenceProofsByWorker(workerId, startDate, endDate).catch(() => []),
    dbHolidayRange(startDate, endDate),
  ]);

  return buildActionable({ year: y, monthIdx, daysInMonth, records, leaves, proofs, holidayDates, worker });
}

// POST /api/absence-proofs
// Worker uploads { date, proof_base64, mime_type, leave_id? }. Only allowed
// for a rejected/pending full-day leave date (no-leave = auto-forfeit, no
// proof chance) and never after HR has reviewed the row.
export const upload = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { date, proof_base64, mime_type, leave_id } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    }
    if (!proof_base64 || typeof proof_base64 !== 'string' || proof_base64.length < 100) {
      return res.status(400).json({ message: 'A proof image is required' });
    }
    if (proof_base64.length > 8 * 1024 * 1024) {
      return res.status(400).json({ message: 'Proof image is too large' });
    }

    // The date must sit under a rejected or pending FULL-DAY-family leave.
    const ist = getISTToday();
    const nowMonth = `${ist.year}-${pad(ist.month + 1)}`;
    const daysInMonth = new Date(Date.UTC(ist.year, ist.month + 1, 0)).getUTCDate();
    const startDate = `${nowMonth}-01`;
    const endDate = `${nowMonth}-${pad(daysInMonth)}`;
    const leaves = await getLeavesInRange(startDate, endDate, workerId).catch(() => []);
    const covering = leaves.find((l) => {
      if (!['rejected', 'pending'].includes(l.status)) return false;
      if (!['full_day', 'vacational', 'emergency'].includes(l.type)) return false;
      return expandLeaveDatesForDetection(l).includes(date);
    });
    if (!covering) {
      return res.status(400).json({ message: 'Proof can only be uploaded for a rejected or pending leave day' });
    }

    const proof = await upsertAbsenceProof({
      workerId,
      date,
      leaveId: leave_id || covering.id,
      proofData: proof_base64,
      proofMime: mime_type || 'image/jpeg',
    }).catch((e) => {
      if (e?.code === 'ALREADY_REVIEWED') return null;
      throw e;
    });
    if (!proof) {
      return res.status(400).json({ message: 'This absence has already been reviewed. Contact HR.' });
    }

    const workerName = req.user?.name || `Worker ${workerId}`;
    await notifyNgoAdmins(
      req.user?.ngo_id,
      'Absence proof uploaded',
      `${workerName} uploaded an absence proof for ${date}`,
      'absence_proof',
      proof?.id,
    ).catch(() => {});

    return res.status(201).json({ message: 'Proof uploaded — awaiting review', proof });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// GET /api/absence-proofs/pending  (admin / HR)
export const listPending = async (req, res) => {
  try {
    const rows = await listAbsenceProofs('pending');
    return res.json({ proofs: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUT /api/absence-proofs/:id/status  (admin / HR)
export const review = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_remark } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }
    const existing = await getAbsenceProofById(id);
    if (!existing) return res.status(404).json({ message: 'Proof not found' });
    if (existing.reviewed_at) {
      return res.status(400).json({ message: `Proof is already ${existing.status}` });
    }

    const updated = await updateAbsenceProofStatus(id, status, admin_remark || null, req.user?.id || null);
    await notifyWorker(
      existing.worker_id,
      status === 'approved' ? 'Absence proof approved' : 'Absence proof rejected',
      status === 'approved'
        ? `Your proof for ${String(existing.date).slice(0, 10)} was approved — your late grace is safe.`
        : `Your proof for ${String(existing.date).slice(0, 10)} was rejected — this month's late grace is forfeited.`,
      'absence_proof',
      id,
    ).catch(() => {});

    return res.json({ message: `Proof ${status}`, proof: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
