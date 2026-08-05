import { getMonthsEmployed } from './incentive.js';

export function shiftDate(dateStr, days) {
  const dt = new Date(dateStr + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Mirrors computeSundayStats() — every worked Sunday (present/late, even a
// cancelled one) is paid; on top, (totalSundays - 1) are paid free from the
// non-cancelled, not-worked pool. Cap = total Sundays in the month.
export function computeSundayStats({ year, month, daysInMonth, records, skipBeforeDate, lateJoin }) {
  const inRange = (dateStr) => !skipBeforeDate || dateStr >= skipBeforeDate;
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dates.push({ date: dateStr, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00Z').getUTCDay()] });
  }

  const sundays = [];
  const cancelled = new Set();
  let regularAbsences = 0;
  for (const day of dates) {
    if (day.dayName === 'Sun') { sundays.push(day.date); continue; }
    if (!inRange(day.date)) continue;
    const rec = records.find(r => r.date === day.date);
    if (rec?.status === 'absent') {
      regularAbsences++;
      if (day.dayName === 'Sat') {
        const ns = shiftDate(day.date, 1);
        if (inRange(ns)) cancelled.add(ns);
      } else if (day.dayName === 'Mon') {
        const ps = shiftDate(day.date, -1);
        if (inRange(ps)) cancelled.add(ps);
      }
    }
  }

  const totalSundays = sundays.filter(inRange);
  const extraSundays = [];
  if (regularAbsences >= 6 || lateJoin) {
    for (const s of totalSundays) {
      if (!cancelled.has(s)) {
        cancelled.add(s);
        extraSundays.push(s);
      }
    }
  }

  const eligibleSundays = totalSundays.filter(s => !cancelled.has(s));
  const isAttended = (s) => {
    const rec = records.find(r => r.date === s);
    return !!rec && (rec.status === 'present' || rec.status === 'late');
  };
  const attendedEligible = eligibleSundays.filter(isAttended);
  const attendedCancelled = totalSundays.filter(s => cancelled.has(s) && isAttended(s));
  const workedAll = attendedEligible.length + attendedCancelled.length;
  const eligibleNotWorked = eligibleSundays.length - attendedEligible.length;
  const baseline = Math.max(0, Math.min(totalSundays.length - 1, eligibleNotWorked));
  const paidSundays = workedAll + baseline;
  const unpaidCount = eligibleNotWorked - baseline;
  const attendedEligibleSet = new Set(attendedEligible);
  const unpaidSundays = eligibleSundays.filter(s => !attendedEligibleSet.has(s)).slice(0, unpaidCount);

  return {
    totalSundays: totalSundays.length,
    attendedSundays: workedAll,
    attendedCancelledDates: attendedCancelled,
    paidSundays,
    eligibleSundays,
    cancelledSundays: totalSundays.filter(s => cancelled.has(s)),
    extraSundays,
    unpaidSundays,
  };
}

// Full paid-days computation — mirrors getMySalaryBreakdown() in
// salaryController.js. `records` are the worker's attendance rows
// ({ date, status, late_minutes }) for the month; `createdAt` is the worker's
// created_at. `month` is 0-based.
export function computePaidDays({ year, month, daysInMonth, records, createdAt }) {
  const pad = n => String(n).padStart(2, '0');
  const joinDate = createdAt ? new Date(createdAt) : null;
  const joinedThisMonth = joinDate && !isNaN(joinDate.getTime())
    ? joinDate.getFullYear() === year && joinDate.getMonth() === month
    : false;
  const joinDay = joinedThisMonth ? joinDate.getUTCDate() : 1;
  const joinDateStr = `${year}-${pad(month + 1)}-${pad(joinDay)}`;

  const afterJoin = joinedThisMonth ? records.filter(r => r.date >= joinDateStr) : records;
  const halfDayCount = afterJoin.filter(r => r.status === 'half-day').length;

  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    monthDays.push({ date: dateStr, day: d, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00Z').getUTCDay()] });
  }

  const beforeJoin = joinedThisMonth ? monthDays.filter(d => d.date < joinDateStr) : [];
  const beforeJoinSet = new Set(beforeJoin.map(d => d.date));

  const deducted = new Set();

  for (const day of monthDays) {
    if (beforeJoinSet.has(day.date)) { deducted.add(day.date); continue; }
    if (day.dayName === 'Sun') continue;
    const rec = records.find(r => r.date === day.date);
    if (rec?.status === 'absent') {
      deducted.add(day.date);
      if (day.dayName === 'Sat') {
        const ns = shiftDate(day.date, 1);
        if (!beforeJoinSet.has(ns)) deducted.add(ns);
      } else if (day.dayName === 'Mon') {
        const ps = shiftDate(day.date, -1);
        if (!beforeJoinSet.has(ps)) deducted.add(ps);
      }
    }
  }

  const lateJoin = joinedThisMonth && joinDay > 10;
  const sundayStats = computeSundayStats({
    year,
    month,
    daysInMonth,
    records,
    skipBeforeDate: joinedThisMonth ? joinDateStr : null,
    lateJoin,
  });
  for (const d of sundayStats.unpaidSundays) deducted.add(d);
  for (const d of sundayStats.extraSundays) deducted.add(d);

  const paidDays = Math.max(0, daysInMonth - (joinedThisMonth ? (joinDay - 1) : 0) - deducted.size - halfDayCount * 0.5 + sundayStats.attendedCancelledDates.length);

  const totalLateMinutes = afterJoin.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
  let lateDeductionDays = 0;
  if (totalLateMinutes > 480) {
    lateDeductionDays = Math.round((totalLateMinutes / 480) * 2) / 2;
  } else if (totalLateMinutes > 240) {
    lateDeductionDays = 1;
  } else if (totalLateMinutes > 180) {
    lateDeductionDays = 0.5;
  }

  const joiningDeduction = (joinedThisMonth && getMonthsEmployed(createdAt) <= 3) ? 1.5 : 0;

  return {
    joinedThisMonth,
    joinDay,
    presentRaw: records.filter(r => r.status === 'present').length,
    halfDayCount,
    totalLateMinutes,
    lateDeductionDays,
    joiningDeduction,
    deducted,
    deductedCount: deducted.size,
    absentDatesAfterJoin: afterJoin.filter(r => r.status === 'absent').map(r => r.date),
    sundayAdd: sundayStats.attendedCancelledDates.length,
    extraSundays: sundayStats.extraSundays,
    sundayStats,
    paidDays,
    totalDueDays: Math.max(0, paidDays - lateDeductionDays - joiningDeduction),
  };
}
