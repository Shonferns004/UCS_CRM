// Read-only Overview aggregates for one worker (Accounts → Operations →
// Employee Detail → Overview). See docs/overview-metric-dictionary.md for the
// metric definitions; this module implements them by REUSING the existing
// authoritative model functions — it never re-implements attribution, target
// precedence, or attendance rules.

import { getWorkerCollectionReceipts, getDailyCollectionByWorker } from '../models/froDonorLogModel.js';
import { dedupeCollectionReceipts, totalCollectionAmount } from './froCollectionMatch.js';
import { getTargetByWorker, getLatestTargetBeforeMonth } from '../models/froTargetModel.js';
import { resolveMonthlyTarget } from './froMonthlyTarget.js';
import { getMonthlyAttendance } from '../models/attendanceModel.js';
import { getApprovedLeaves, getWorkerLeaves } from '../models/leaveModel.js';
import { getActiveSalaryByWorker, getSalariesByWorker } from '../models/salaryModel.js';
import { getWorkerById } from '../models/workerModel.js';
import { getWorkerLoans } from '../models/loanModel.js';
import { getWorkerTickets } from '../models/attendanceCorrectionModel.js';
import { getWorkerRequests } from '../models/profileUpdateRequestModel.js';

const MAX_RANGE_DAYS = 1096; // 3 years — Overview must never run an unbounded scan
const MAX_TARGET_MONTHS = 36;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// workers.created_at arrives as a Date from pg or a string from the supabase
// wrapper; both need a YYYY-MM-DD IST-safe day (the stored value is already
// the joining instant, sliced to the day it names in UTC — consistent with
// how payroll everywhere else reads it).
const asDay = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const istToday = () => {
  // IST = UTC+5:30. Shifting before toISOString names the IST calendar day.
  return new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 10);
};

const monthKeyOf = (day) => String(day).slice(0, 7); // 'YYYY-MM'

const addMonths = (monthKey, n) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const clampDay = (day, lo, hi) => (day < lo ? lo : day > hi ? hi : day);

/**
 * Resolve + validate the from/to window.
 * Returns { from, to, defaulted, clamped } or throws a typed error.
 */
export function resolveRange(query = {}) {
  const today = istToday();
  let to = DAY_RE.test(String(query.to || '')) ? String(query.to) : today;
  let from = DAY_RE.test(String(query.from || '')) ? String(query.from) : `${today.slice(0, 7)}-01`;
  let clamped = false;
  if (to > today) { to = today; clamped = true; }
  if (from > to) { from = to; clamped = true; }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) {
    // Pull `from` forward rather than rejecting — Lifetime still answers, with
    // an explicit flag, instead of erroring or scanning forever.
    const t = Date.parse(`${to}T00:00:00Z`);
    from = new Date(t - (MAX_RANGE_DAYS - 1) * 86400000).toISOString().slice(0, 10);
    clamped = true;
  }
  return { from, to, defaulted: !query.from && !query.to, clamped };
}

/**
 * Per-month resolved targets across a range, using the SAME precedence the FRO
 * panel uses (froMonthlyTarget.resolveMonthlyTarget): month-M manual row beats
 * auto; auto beats a stale earlier row; month 4+ carries forward.
 */
async function resolveTargetsForRange(workerId, joiningDay, salary, from, to) {
  const out = [];
  let month = monthKeyOf(from);
  const endMonth = monthKeyOf(to);
  let n = 0;
  let priorRow = null;
  while (month <= endMonth && n < MAX_TARGET_MONTHS) {
    const currentRow = await getTargetByWorker(workerId, `${month}-01`);
    if (n === 0) priorRow = await getLatestTargetBeforeMonth(workerId, `${month}-01`);
    // refDate = the month itself, so historical months resolve the target that
    // applied THEN (tenure-based auto target), never today's tenure.
    const refDate = new Date(Date.parse(`${month}-${String(daysInMonth(month)).padStart(2, '0')}T00:00:00Z`));
    const resolved = resolveMonthlyTarget({ joiningDate: joiningDay, salary, currentRow, priorRow, refDate });
    out.push({
      month,
      target: resolved.target,
      source: resolved.source,
      source_month: resolved.sourceMonth || null,
      configured: resolved.source !== 'not_set',
    });
    if (currentRow) priorRow = currentRow;
    month = addMonths(month, 1);
    n += 1;
  }
  return { months: out, truncated: month <= endMonth };
}

/**
 * GET /api/accounts/workers/:id/overview?from&to
 *
 * KPI block only. All aggregation is server-side; the browser receives
 * numbers, not receipt rows.
 */
export async function getWorkerOverview(req, res) {
  try {
    const workerId = req.params.id;
    let worker = null;
    try { worker = await getWorkerById(workerId); } catch (e) { if (e?.code !== 'PGRST116') throw e; }
    if (!worker) return res.status(404).json({ message: 'Worker not found' });

    const { from, to, defaulted, clamped } = resolveRange(req.query);
    const joiningDay = asDay(worker.created_at);
    const today = istToday();
    const partial = [];
    if (clamped) partial.push('range_clamped_to_3_years');
    if (joiningDay && from < joiningDay) partial.push('range_starts_before_joining');

    // ── Collection (authoritative attribution: name-first, log fallback) ──
    const receipts = await getWorkerCollectionReceipts(workerId, from, to, { startDay: from, endDay: to });
    const deduped = dedupeCollectionReceipts(receipts);
    const collectionAmount = totalCollectionAmount(deduped);
    const receiptCount = deduped.length;

    // ── Targets (month-granularity; range figure = sum of monthly targets) ──
    const salaryRow = await getActiveSalaryByWorker(workerId);
    const salary = Number(salaryRow?.salary) || 0;
    const targets = await resolveTargetsForRange(workerId, joiningDay || from, salary, from, to);
    const configured = targets.months.filter(m => m.configured);
    const targetAmount = configured.length > 0
      ? configured.reduce((s, m) => s + Number(m.target || 0), 0)
      : null;

    let achievementPct = null;
    let remaining = null;
    let surplus = null;
    if (targetAmount != null && targetAmount > 0) {
      achievementPct = Math.round((collectionAmount / targetAmount) * 1000) / 10;
      remaining = Math.max(targetAmount - collectionAmount, 0);
      surplus = collectionAmount > targetAmount ? collectionAmount - targetAmount : null;
    }

    // ── Attendance (same tables the Attendance tab reads) ──
    // Only fetched for ranges where a summary is meaningful; the tab remains
    // the authoritative detailed view.
    let attendance = null;
    const attFrom = joiningDay && joiningDay > from ? joiningDay : from;
    if (attFrom <= to) {
      try {
        const records = await getMonthlyAttendance(workerId, attFrom, to);
        const leaves = await getApprovedLeaves(workerId);
        const leaveDates = new Set();
        for (const l of leaves || []) {
          const s = l.leave_date || l.start_date;
          const e = l.leave_date || l.end_date;
          if (!s || e === undefined) continue;
          if (s > to || (e || s) < attFrom) continue;
          const end = e || s;
          for (let d = s; d <= end; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
            if (d >= attFrom && d <= to) leaveDates.add(d);
          }
        }
        const statusCounts = {};
        for (const r of records || []) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        const presentDays = (records || []).filter(r => r.status !== 'absent' && r.status !== 'leave').length;
        const eligibleEnd = to < today ? to : today;
        const eligibleDays = Math.max(0, Math.round((Date.parse(`${eligibleEnd}T00:00:00Z`) - Date.parse(`${attFrom}T00:00:00Z`)) / 86400000) + 1 - leaveDates.size);
        attendance = {
          present_days: presentDays,
          eligible_days: eligibleDays,
          pct: eligibleDays > 0 ? Math.round((presentDays / eligibleDays) * 1000) / 10 : null,
          status_counts: statusCounts,
          approved_leave_days: leaveDates.size,
        };
      } catch { attendance = { unavailable: true }; partial.push('attendance_unavailable'); }
    }

    // ── Tenure ──
    let tenure = null;
    if (joiningDay) {
      const end = to < today ? to : today;
      const days = Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${joiningDay}T00:00:00Z`)) / 86400000));
      const active = !['offboarded', 'absconded', 'terminated'].includes(String(worker.employment_status || '').toLowerCase());
      tenure = { days, joining_date: joiningDay, active, status: worker.employment_status || 'active' };
    }

    return res.json({
      employee: { id: worker.id, name: worker.name },
      range: { from, to, tz: 'Asia/Kolkata', defaulted, clamped },
      collection: { amount: collectionAmount, receipt_count: receiptCount, date_field: 'receipt_date' },
      target: {
        amount: targetAmount,
        months_covered: configured.length,
        granularity: 'monthly_sum',
        truncated: targets.truncated || false,
        by_month: targets.months,
      },
      achievement: { pct: achievementPct, remaining, surplus },
      attendance,
      tenure,
      partial,
      // Contribution is deliberately absent: no approved cost model yet.
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/accounts/workers/:id/collection-trend?from&to&interval=day|week|month
 *
 * Buckets the same attributed receipts by receipt_date (IST). Week buckets
 * start Sunday, matching the existing batch collection stats.
 */
export async function getWorkerCollectionTrend(req, res) {
  try {
    const workerId = req.params.id;
    let worker = null;
    try { worker = await getWorkerById(workerId); } catch (e) { if (e?.code !== 'PGRST116') throw e; }
    if (!worker) return res.status(404).json({ message: 'Worker not found' });

    const { from, to } = resolveRange(req.query);
    const interval = ['day', 'week', 'month'].includes(req.query.interval) ? req.query.interval : 'day';

    const byDay = await getDailyCollectionByWorker(workerId, from, to, { startDay: from, endDay: to });
    const series = [];
    if (interval === 'day') {
      // Walk every day so zero-collection days render as zero, not missing.
      for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        series.push({ bucket: d, amount: byDay[d] || 0 });
      }
    } else if (interval === 'month') {
      const map = new Map();
      for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        const k = monthKeyOf(d);
        map.set(k, (map.get(k) || 0) + (byDay[d] || 0));
      }
      for (const [k, amount] of [...map.entries()].sort()) series.push({ bucket: k, amount });
    } else {
      // Sunday-start weeks in IST.
      const map = new Map();
      for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
        const weekStart = new Date(Date.parse(`${d}T00:00:00Z`) - dow * 86400000).toISOString().slice(0, 10);
        map.set(weekStart, (map.get(weekStart) || 0) + (byDay[d] || 0));
      }
      for (const [k, amount] of [...map.entries()].sort()) series.push({ bucket: k, amount });
    }

    // Monthly targets for the same range so the chart can draw target series
    // and a cumulative comparison without a second request.
    const salaryRow = await getActiveSalaryByWorker(workerId);
    const targets = await resolveTargetsForRange(
      workerId,
      asDay(worker.created_at) || from,
      Number(salaryRow?.salary) || 0,
      from, to,
    );

    return res.json({
      employee: { id: worker.id, name: worker.name },
      range: { from, to, tz: 'Asia/Kolkata' },
      interval,
      date_field: 'receipt_date',
      series,
      targets_by_month: targets.months,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/accounts/workers/:id/heatmap?from&to
 *
 * Daily collection (amount + qualifying receipt count) plus the attendance
 * status for each day, for the Overview heatmap and monthly performance
 * table. Same attribution as every other surface; aggregation server-side.
 */
export async function getWorkerHeatmap(req, res) {
  try {
    const workerId = req.params.id;
    let worker = null;
    try { worker = await getWorkerById(workerId); } catch (e) { if (e?.code !== 'PGRST116') throw e; }
    if (!worker) return res.status(404).json({ message: 'Worker not found' });

    const { from, to } = resolveRange(req.query);
    const joiningDay = asDay(worker.created_at);

    // Same deduped receipt set the KPI total uses; bucket amount AND count.
    const receipts = await getWorkerCollectionReceipts(workerId, from, to, { startDay: from, endDay: to });
    const deduped = dedupeCollectionReceipts(receipts);
    const byDay = {};
    for (const r of deduped) {
      const amount = Number(r.amount || 0);
      if (amount <= 0) continue;
      const day = r.receipt_date ? String(r.receipt_date).slice(0, 10) : null;
      if (!day) continue;
      if (!byDay[day]) byDay[day] = { amount: 0, count: 0 };
      byDay[day].amount += amount;
      byDay[day].count += 1;
    }

    // Attendance statuses per day (the same table the Attendance tab reads).
    const attendanceByDay = {};
    try {
      const records = await getMonthlyAttendance(workerId, from, to);
      for (const r of records || []) attendanceByDay[String(r.date).slice(0, 10)] = r.status;
      const leaves = await getApprovedLeaves(workerId);
      for (const l of leaves || []) {
        const s = l.leave_date || l.start_date;
        const e = l.leave_date || l.end_date;
        if (!s) continue;
        if (s > to || (e || s) < from) continue;
        const end = e || s;
        for (let d = s; d <= end; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
          if (d >= from && d <= to && !attendanceByDay[d]) attendanceByDay[d] = 'leave';
        }
      }
    } catch { /* heatmap still renders collection without attendance */ }

    const salaryRow = await getActiveSalaryByWorker(workerId);
    const targets = await resolveTargetsForRange(
      workerId, joiningDay || from, Number(salaryRow?.salary) || 0, from, to,
    );

    return res.json({
      employee: { id: worker.id, name: worker.name },
      range: { from, to, tz: 'Asia/Kolkata' },
      joining_date: joiningDay,
      days: Object.entries(byDay)
        .map(([date, v]) => ({ date, amount: v.amount, count: v.count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      attendance: attendanceByDay,
      targets_by_month: targets.months,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/accounts/workers/:id/timeline?from&to
 *
 * Union of the dated tables that record this worker's history, newest first.
 * Sources without per-change history say so honestly (history_unavailable)
 * rather than implying the union is complete. Also returns contribution =
 * collection − salary over the same range, explicitly labelled partial
 * (salary is the only cost tracked; see docs/overview-metric-dictionary.md).
 */
export async function getWorkerTimeline(req, res) {
  try {
    const workerId = req.params.id;
    let worker = null;
    try { worker = await getWorkerById(workerId); } catch (e) { if (e?.code !== 'PGRST116') throw e; }
    if (!worker) return res.status(404).json({ message: 'Worker not found' });

    const { from, to } = resolveRange(req.query);
    const joiningDay = asDay(worker.created_at);

    const events = [];
    const sources = {};

    // Every source below is wrapped: one missing/broken table degrades to an
    // explicit history_unavailable marker instead of failing the endpoint.
    const source = async (key, label, fn) => {
      try {
        const rows = await fn();
        sources[key] = { label, ok: true, count: (rows || []).length };
        return rows || [];
      } catch {
        sources[key] = { label, ok: false, count: 0 };
        return [];
      }
    };

    // Joined — workers has created_at only; field-level edits are NOT tracked.
    if (joiningDay && joiningDay <= to) {
      events.push({
        date: joiningDay, type: 'joined', title: 'Joined',
        detail: worker.employment_status ? `Status now: ${worker.employment_status}` : null,
      });
    }

    const salaries = await source('salary_history', 'Salary changes', () => getSalariesByWorker(workerId));
    for (const s of salaries) {
      const day = `${String(s.from_month || '').slice(0, 10)}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > to || (s.to_month && String(s.to_month).slice(0, 10) < from)) continue;
      events.push({
        date: day, type: 'salary', title: `Salary set — ₹${Number(s.salary || 0).toLocaleString('en-IN')}/mo`,
        detail: s.to_month ? `until ${String(s.to_month).slice(0, 10)}` : 'active',
      });
    }

    const leaves = await source('leaves', 'Leaves', () => getWorkerLeaves(workerId));
    for (const l of leaves) {
      const day = String(l.applied_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) continue;
      const when = l.leave_date || l.start_date || null;
      events.push({
        date: day, type: 'leave', title: `Leave ${l.status || 'requested'}${l.type ? ` (${l.type})` : ''}`,
        detail: when ? `for ${when}${l.end_date && l.end_date !== when ? ` → ${l.end_date}` : ''}` : null,
      });
    }

    const loans = await source('loans', 'Loans & advances', () => getWorkerLoans(workerId));
    for (const ln of loans) {
      const day = String(ln.applied_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) continue;
      events.push({
        date: day, type: 'loan', title: `Loan ${ln.status || 'applied'} — ₹${Number(ln.amount || 0).toLocaleString('en-IN')}`,
        detail: ln.purpose || ln.reason || null,
      });
    }

    const corrections = await source('attendance_corrections', 'Attendance corrections', () => getWorkerTickets(workerId));
    for (const c of corrections) {
      const day = String(c.created_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) continue;
      events.push({
        date: day, type: 'correction', title: `Attendance correction ${c.status || 'requested'}`,
        detail: c.reason || c.reason_text || null,
      });
    }

    const requests = await source('profile_update_requests', 'Profile update requests', () => getWorkerRequests(workerId));
    for (const r of requests) {
      const day = String(r.created_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) continue;
      const keys = r.requested_changes && typeof r.requested_changes === 'object' ? Object.keys(r.requested_changes) : null;
      events.push({
        date: day, type: 'profile', title: `Profile update ${r.status || 'requested'}`,
        detail: keys && keys.length ? `fields: ${keys.join(', ')}` : null,
      });
    }

    const targets = await source('targets', 'Targets', async () => {
      const salaryRow = await getActiveSalaryByWorker(workerId);
      const t = await resolveTargetsForRange(
        workerId, joiningDay || from, Number(salaryRow?.salary) || 0, from, to,
      );
      return t.months.filter(m => m.configured).map(m => ({ month: m.month, target: m.target, source: m.source }));
    });
    for (const t of targets) {
      events.push({
        date: `${t.month}-01`, type: 'target', title: `Target ${t.source === 'manual' ? 'set' : 'applied'} — ₹${Number(t.target).toLocaleString('en-IN')}`,
        detail: t.source,
      });
    }

    events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const capped = events.slice(0, 200);

    // ── Partial contribution: collection − salary, same range ──
    let contribution = null;
    try {
      const receipts = await getWorkerCollectionReceipts(workerId, from, to, { startDay: from, endDay: to });
      const collectionAmount = totalCollectionAmount(dedupeCollectionReceipts(receipts));
      // Daily-prorated salary across the range from salary_history rows.
      let salaryAmount = 0;
      const activeFor = (month) => [...salaries].filter(s =>
        String(s.from_month || '').slice(0, 7) <= month &&
        (!s.to_month || String(s.to_month).slice(0, 7) >= month)
      ).sort((a, b) => String(b.from_month).localeCompare(String(a.from_month)))[0];
      for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        const row = activeFor(d.slice(0, 7));
        if (!row) continue;
        const dim = daysInMonth(d.slice(0, 7));
        salaryAmount += (Number(row.salary) || 0) / dim;
      }
      contribution = {
        collection: collectionAmount,
        salary: Math.round(salaryAmount),
        value: Math.round(collectionAmount - salaryAmount),
        label: 'Collection minus salary — partial contribution',
        note: 'Salary is the only cost tracked. Not profit.',
      };
    } catch { /* contribution omitted rather than guessed */ }

    return res.json({
      employee: { id: worker.id, name: worker.name },
      range: { from, to, tz: 'Asia/Kolkata' },
      events: capped,
      truncated: events.length > capped.length,
      total_events: events.length,
      sources,
      history_unavailable: [
        'worker_field_edits — profile changes are not versioned; only profile update requests appear',
      ],
      contribution,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
