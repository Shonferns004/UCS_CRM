import db from '../config/db.js';
import { getRangeCollectionByWorker } from '../models/froDonorLogModel.js';
import { getActiveSalaryByWorkers } from '../models/salaryModel.js';
import { monthsSinceJoining, calculateAutoTarget } from './froAutoTarget.js';

// Single source of truth for the FRO leaderboard. Both the admin High/Low panels
// (getFroPerformance) and the FRO My-Leads strip (getMyPerformance) rank through
// this service so the two screens can never disagree.

const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// Working days: every Sunday is off except the month's last Sunday (paid leave).
export function workingDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let lastSunday = 0;
  for (let d = lastDay; d >= 1; d--) {
    if (new Date(y, m - 1, d).getDay() === 0) { lastSunday = d; break; }
  }
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const sunday = new Date(y, m - 1, d).getDay() === 0;
    if (!sunday || d === lastSunday) count++;
  }
  return count;
}

export function workingDaysBetween(startDay, endDay) {
  let count = 0;
  const cursor = new Date(`${startDay}T00:00:00`);
  const last = new Date(`${endDay}T00:00:00`);
  while (cursor <= last) {
    if (cursor.getDay() !== 0) { count++; cursor.setDate(cursor.getDate() + 1); continue; }
    const nextWeek = new Date(cursor); nextWeek.setDate(cursor.getDate() + 7);
    if (nextWeek.getMonth() !== cursor.getMonth()) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Org-wide leaderboard of active, non-test FROs for [startDay, endDay].
// Returns every roster member (rank is null when they hold no monthly target);
// the list is NOT pre-sorted so callers can order it however they display it.
export async function buildFroLeaderboard({ startDay, endDay, todayDay } = {}) {
  const today = todayDay || istDay();
  const start = startDay || today;
  const end = endDay || today;

  const { data: froRows } = await db
    .from('workers')
    .select('id, name, is_test, is_active, created_at')
    .eq('department', 'FRO');
  const roster = (froRows || []).filter(w => w.is_active !== false && w.is_test !== true && w.id);
  if (roster.length === 0) return [];
  const ids = roster.map(w => w.id);

  const monthStr = start.slice(0, 7);
  const monthStartDay = `${monthStr}-01`;
  const lastDayNum = new Date(Number(monthStr.slice(0, 4)), Number(monthStr.slice(5, 7)), 0).getDate();
  const monthEndDay = `${monthStr}-${String(lastDayNum).padStart(2, '0')}`;
  const isMonthRange = start === monthStartDay;
  const isTodayOnly = start === today && end === today;

  const [monthColl, periodColl, todayColl] = await Promise.all([
    getRangeCollectionByWorker(ids, monthStartDay, monthEndDay),
    isMonthRange ? Promise.resolve(null) : getRangeCollectionByWorker(ids, start, end),
    isTodayOnly ? Promise.resolve(null) : getRangeCollectionByWorker(ids, today, today),
  ]);

  const { data: targetRows } = await db
    .from('fro_monthly_targets')
    .select('fro_worker_id, target_amount, achieved_target')
    .eq('month', monthStartDay);
  const targetMap = {};
  for (const t of targetRows || []) {
    const key = String(t.fro_worker_id);
    const current = targetMap[key];
    if (!current || Number(t.target_amount || 0) > current.target_amount) {
      targetMap[key] = {
        target_amount: Number(t.target_amount || 0),
        achieved_target: t.achieved_target == null ? null : Number(t.achieved_target),
      };
    }
  }

  // A new FRO's target is not in fro_monthly_targets. It is derived from their
  // current salary for their first three months, and the derived value OVERRIDES
  // any stored row — that is exactly what getMyPerformance does for the FRO's own
  // strip. Reading only the table here left the Telecaller board, the High/Low
  // cards and the leaderboard at 0 for every new hire while their own strip showed
  // the right number. Salary is fetched in one batch; the N per-worker salary
  // lookups this replaces made the leaderboard endpoint noticeably slow.
  const salaryByWorker = await getActiveSalaryByWorkers(ids);
  const autoTargetByWorker = {};
  const refDate = new Date();
  for (const w of roster) {
    const monthsEmployed = monthsSinceJoining(w.created_at, refDate);
    const salaryRow = salaryByWorker.get(w.id);
    const auto = calculateAutoTarget(salaryRow ? Number(salaryRow.salary || 0) : 0, monthsEmployed);
    if (auto !== null) autoTargetByWorker[w.id] = auto;
  }

  const { data: attRows } = await db
    .from('attendance')
    .select('worker_id, date, status')
    .gte('date', monthStartDay)
    .lte('date', monthEndDay)
    .in('worker_id', ids);
  const workedDaysMap = {};
  for (const r of attRows || []) {
    if (r.status !== 'present' && r.status !== 'late') continue;
    if (!workedDaysMap[r.worker_id]) workedDaysMap[r.worker_id] = new Set();
    workedDaysMap[r.worker_id].add(String(r.date).slice(0, 10));
  }

  const workingDays = workingDaysInMonth(monthStr);
  const rangeWorkingDays = isTodayOnly ? 1 : workingDaysBetween(start, end);

  const list = roster.map(w => {
    const id = w.id;
    const monthCollection = monthColl[id] || 0;
    const target = targetMap[id];
    // Auto wins over the stored row for months 0-2 (same precedence as the FRO's
    // own strip); from month 3 on it is the stored target only.
    const autoTarget = autoTargetByWorker[id];
    const monthlyTarget = autoTarget != null ? autoTarget : (target?.target_amount || 0);
    const achievedTarget = (target?.achieved_target != null && Number(target.achieved_target) > 0)
      ? Number(target.achieved_target)
      : monthCollection;
    const workedDays = workedDaysMap[id]?.size || 0;
    const perDayCollection = workingDays > 0 ? monthlyTarget / workingDays : 0;
    const remainingDays = Math.max(workingDays - workedDays, 0);
    const remainingTarget = Math.max(monthlyTarget - achievedTarget, 0);
    const averageCollection = remainingDays > 0 ? remainingTarget / remainingDays : 0;
    const paceTarget = remainingDays > 0 && averageCollection > 0 ? averageCollection : perDayCollection;
    const periodCollection = periodColl ? (periodColl[id] || 0) : monthCollection;
    const periodTarget = isMonthRange
      ? monthlyTarget
      : (isTodayOnly ? paceTarget : perDayCollection * rangeWorkingDays);
    const performancePct = periodTarget > 0 ? Math.round((periodCollection / periodTarget) * 1000) / 10 : 0;
    return {
      id,
      name: (w.name || '').trim(),
      rank: null,
      collection_amount: monthCollection,
      today_collection: todayColl ? (todayColl[id] || 0) : (isTodayOnly ? periodCollection : 0),
      period_collection: periodCollection,
      period_target: periodTarget,
      monthly_target: monthlyTarget,
      // 'auto' = derived from salary in the first three months, 'manual' = the
      // stored row, 'not_set' = neither. Surfaced so a blank-looking target can be
      // told apart from one that is genuinely 0.
      target_source: autoTarget != null ? 'auto' : (target ? 'manual' : 'not_set'),
      achieved_target: achievedTarget,
      working_days: workingDays,
      worked_days: workedDays,
      remaining_working_days: remainingDays,
      per_day_collection: perDayCollection,
      remaining_target: remainingTarget,
      average_collection: averageCollection,
      pace_target: paceTarget,
      performance_pct: performancePct,
    };
  });

  // One deterministic comparator everywhere: period performance, then month
  // collection, then name. Without this an all-tie day ranked by DB order and the
  // two screens produced different numbers. The period is whatever the caller
  // asked for (today / week / month / custom), so the rank follows that period.
  list
    .filter(p => p.monthly_target > 0)
    .sort((a, b) =>
      (b.performance_pct - a.performance_pct)
      || (b.collection_amount - a.collection_amount)
      || a.name.localeCompare(b.name))
    .forEach((p, i) => { p.rank = i + 1; });

  return list;
}
