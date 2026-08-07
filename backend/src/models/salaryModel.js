import db from '../config/db.js';
import { getDayName, calculateAKI, getMonthsEmployed } from '../utils/incentive.js';
import { computePaidDays } from '../utils/salaryDays.js';

export const getSalariesByWorker = async (workerId) => {
  const { data, error } = await db
    .from('salary_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('from_month', { ascending: false });
  if (error) throw error;
  return data;
};

export const getActiveSalaryByWorker = async (workerId) => {
  const { data, error } = await db
    .from('salary_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('from_month', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
};

export const createSalary = async (salaryData) => {
  const { data, error } = await db
    .from('salary_history')
    .insert([salaryData])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateSalary = async (id, updates) => {
  const { data, error } = await db
    .from('salary_history')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getAllWorkersSalarySummary = async () => {
  const { data: workers, error: wErr } = await db
    .from('workers')
    .select('id, name, email, department, created_at')
    .order('created_at', { ascending: false });
  if (wErr) throw wErr;

  const { data: salaries, error: sErr } = await db
    .from('salary_history')
    .select('*')
    .order('from_month', { ascending: false });
  if (sErr) throw sErr;

  const latest = {};
  for (const s of salaries) {
    if (!latest[s.worker_id]) latest[s.worker_id] = s;
  }

  return workers.map(w => ({
    id: w.id,
    name: w.name,
    email: w.email,
    department: w.department,
    created_at: w.created_at,
    current_salary: latest[w.id]?.salary || null,
    current_salary_from: latest[w.id]?.from_month || null,
    current_salary_paid: latest[w.id]?.paid_at || null,
  }));
};

export const getPayrollData = async (month, extended = false) => {
  let year, monthIdx, startDate, endDate, daysInMonth;
  if (month) {
    const p = month.split('-');
    year = parseInt(p[0]);
    monthIdx = parseInt(p[1]) - 1;
    startDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    endDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIdx = now.getMonth();
    startDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    endDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  }

  const selectFields = extended
    ? 'id, name, account_number, ifsc_code, account_holder_name, bank_name, department, created_at'
    : 'id, name, account_number, ifsc_code';
  const { data: workers, error: wErr } = await db
    .from('workers')
    .select(selectFields)
    .order('name');
  if (wErr) throw wErr;

  const { data: salaries, error: sErr } = await db
    .from('salary_history')
    .select('*')
    .order('from_month', { ascending: false });
  if (sErr) throw sErr;

  const latestSalary = {};
  for (const s of salaries) {
    if (!latestSalary[s.worker_id]) latestSalary[s.worker_id] = s;
  }

  let targetsByWorker = {};
  let achievedByWorker = {};
  let akiByWorker = {};
  if (extended) {
    const { data: targets, error: tErr } = await db
      .from('incentive_targets')
      .select('worker_id, target_amount')
      .gte('month', startDate)
      .lte('month', endDate);
    if (!tErr) {
      for (const t of targets) {
        targetsByWorker[t.worker_id] = parseFloat(t.target_amount);
      }
    }

    const { data: achievements, error: aErr2 } = await db
      .from('daily_achievements')
      .select('worker_id, amount, date')
      .gte('date', startDate)
      .lte('date', endDate);
    if (!aErr2) {
      for (const a of achievements) {
        achievedByWorker[a.worker_id] = (achievedByWorker[a.worker_id] || 0) + parseFloat(a.amount || 0);
        const dayName = getDayName(a.date);
        akiByWorker[a.worker_id] = (akiByWorker[a.worker_id] || 0) + calculateAKI(parseFloat(a.amount || 0), dayName);
      }
    }
  }

  const { data: allAllocs, error: aErr } = await db
    .from('worker_ngo_allocations')
    .select('*, ngos(name)');
  if (aErr) throw aErr;

  const allocsByWorker = {};
  for (const a of allAllocs) {
    if (!allocsByWorker[a.worker_id]) allocsByWorker[a.worker_id] = [];
    allocsByWorker[a.worker_id].push(a);
  }

  const { data: attRecords, error: attErr } = await db
    .from('attendance')
    .select('worker_id, status, date')
    .gte('date', startDate)
    .lte('date', endDate);
  if (attErr) throw attErr;

  const attByWorker = {};
  for (const r of attRecords) {
    if (!attByWorker[r.worker_id]) attByWorker[r.worker_id] = [];
    attByWorker[r.worker_id].push(r);
  }

  // Fetch active loan deductions
  const { data: activeLoans, error: loanErr } = await db
    .from('worker_loans')
    .select('worker_id, monthly_deduction, remaining_amount, type')
    .in('status', ['approved', 'active'])
    .gt('remaining_amount', 0);
  const loanByWorker = {};
  if (!loanErr && activeLoans) {
    for (const l of activeLoans) {
      const ded = parseFloat(l.monthly_deduction || 0);
      if (ded > 0) {
        if (!loanByWorker[l.worker_id]) loanByWorker[l.worker_id] = [];
        loanByWorker[l.worker_id].push(l);
      }
    }
  }

  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIdx, d);
    monthDays.push({ date: d, dayName: dt.getDay() });
  }
  const allSundays = monthDays.filter(d => d.dayName === 0).length;

  const rows = [];
  for (const w of workers) {
    const sal = latestSalary[w.id];
    const salary = sal ? parseFloat(sal.salary) : 0;
    if (salary <= 0) continue;

    const perDay = salary / daysInMonth;
    const workerAtt = attByWorker[w.id] || [];
    const absentCount = workerAtt.filter(r => r.status === 'absent').length;
    const presentCount = workerAtt.filter(r => r.status === 'present').length;
    const totalDue = Math.round(salary - perDay * absentCount);

    let monthlyIncentive = 0;
    let akiPayout = 0;
    if (extended) {
      const target = targetsByWorker[w.id] || 0;
      const achieved = achievedByWorker[w.id] || 0;
      const totalAKI = akiByWorker[w.id] || 0;
      if (target > 0 && achieved >= target) {
        const overage = achieved - target;
        monthlyIncentive = Math.round(overage * 0.1);
        const monthsEmp = w.created_at ? getMonthsEmployed(w.created_at) : 99;
        akiPayout = monthsEmp <= 3 ? Math.round(totalAKI) : Math.round(totalAKI / 2);
      }
    }

    // Loan/advance deduction
    const workerLoans = loanByWorker[w.id] || [];
    const loanDeduction = workerLoans.reduce((sum, l) => sum + parseFloat(l.monthly_deduction || 0), 0);
    const netDue = totalDue - Math.round(loanDeduction);

    const workerAllocs = allocsByWorker[w.id] || [];
    if (workerAllocs.length === 0) {
      const row = {
        ngo_name: 'Unallocated',
        name: w.name,
        account_number: w.account_number || '',
        ifsc_code: w.ifsc_code || '',
        total_due: netDue,
      };
      if (extended) {
        row.account_holder_name = w.account_holder_name || '';
        row.bank_name = w.bank_name || '';
        row.salary = salary;
        row.per_day = Math.round(perDay);
        row.days_in_month = daysInMonth;
        row.present_days = presentCount;
        row.absent_days = absentCount;
        row.sundays = allSundays;
        row.department = w.department || '';
        row.date_of_joining = w.created_at || '';
        row.target = Math.round(targetsByWorker[w.id] || 0);
        row.achieved = Math.round(achievedByWorker[w.id] || 0);
        row.monthly_incentive = monthlyIncentive;
        row.aki_payout = akiPayout;
        row.loan_deduction = Math.round(loanDeduction);
      }
      rows.push(row);
    } else {
      for (const a of workerAllocs) {
        const portion = parseFloat(a.salary_portion);
        const portionDue = Math.round(netDue * (portion / salary));
        const portionPerDay = Math.round(portion / daysInMonth);
        const row = {
          ngo_name: a.ngos?.name || 'Unknown',
          name: w.name,
          account_number: w.account_number || '',
          ifsc_code: w.ifsc_code || '',
          total_due: portionDue,
        };
        if (extended) {
          row.account_holder_name = w.account_holder_name || '';
          row.bank_name = w.bank_name || '';
          row.salary = Math.round(portion);
          row.per_day = portionPerDay;
          row.days_in_month = daysInMonth;
          row.present_days = presentCount;
          row.absent_days = absentCount;
          row.sundays = allSundays;
          row.department = w.department || '';
          row.date_of_joining = w.created_at || '';
          row.target = Math.round(targetsByWorker[w.id] || 0);
          row.achieved = Math.round(achievedByWorker[w.id] || 0);
          row.monthly_incentive = monthlyIncentive;
          row.aki_payout = akiPayout;
          row.loan_deduction = Math.round(loanDeduction);
        }
        rows.push(row);
      }
    }
  }

  rows.sort((a, b) => a.ngo_name.localeCompare(b.ngo_name) || a.name.localeCompare(b.name));
  return { month: startDate, rows };
};

export const deleteSalary = async (id) => {
  const { error } = await db
    .from('salary_history')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { message: 'Salary record deleted' };
};

export const getPresentDaysByMonth = async (month) => {
  const p = String(month || '').split('-');
  if (p.length !== 2) throw new Error('month must be YYYY-MM');
  const year = parseInt(p[0], 10);
  const monthIdx = parseInt(p[1], 10) - 1;
  if (!year || monthIdx < 0 || monthIdx > 11) throw new Error('month must be YYYY-MM');
  const pad = n => String(n).padStart(2, '0');
  const monthStr = `${year}-${pad(monthIdx + 1)}`;
  const startDate = `${monthStr}-01`;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const endDate = `${monthStr}-${pad(daysInMonth)}`;

  const { data: workers, error: wErr } = await db
    .from('workers')
    .select('id, name, created_at');
  if (wErr) throw wErr;

  const { data: attRecords, error: aErr } = await db
    .from('attendance')
    .select('worker_id, status, date, late_minutes')
    .gte('date', startDate)
    .lte('date', endDate);
  if (aErr) throw aErr;

  const { data: holidays, error: hErr } = await db
    .from('holidays')
    .select('date')
    .gte('date', startDate)
    .lte('date', endDate);
  const holidayDates = (hErr || !holidays) ? [] : holidays.map(h => h.date);

  const { data: collLogs, error: collErr } = await db
    .from('fro_donor_logs')
    .select('amount_collected, fro_assignments!inner(fro_worker_id)')
    .or(
      `and(action.eq.donation,created_at.gte.${startDate},created_at.lte.${endDate}),` +
      `and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified,verified_at.gte.${startDate},verified_at.lte.${endDate}),` +
      `and(disposition_detail.eq.done,action.eq.disposition,created_at.gte.${startDate},created_at.lte.${endDate})`
    );
  const collectionByWorker = {};
  if (!collErr) {
    for (const d of collLogs || []) {
      const wid = d.fro_assignments && d.fro_assignments.fro_worker_id;
      if (!wid) continue;
      collectionByWorker[wid] = (collectionByWorker[wid] || 0) + parseFloat(d.amount_collected || 0);
    }
  }

  const counts = {};
  const attByWorker = {};
  for (const r of attRecords) {
    if (!attByWorker[r.worker_id]) attByWorker[r.worker_id] = [];
    attByWorker[r.worker_id].push(r);
    if (!counts[r.worker_id]) counts[r.worker_id] = { present: 0, late: 0, half: 0, absent: 0, leave: 0 };
    if (counts[r.worker_id][r.status] !== undefined) counts[r.worker_id][r.status]++;
    else counts[r.worker_id][r.status] = 1;
  }

  const rows = workers.map(w => {
    const c = counts[w.id] || { present: 0, late: 0, half: 0, absent: 0, leave: 0 };
    const calc = computePaidDays({
      year,
      month: monthIdx,
      daysInMonth,
      records: attByWorker[w.id] || [],
      createdAt: w.created_at || '',
      holidayDates,
    });
    return {
      worker_id: w.id,
      name: w.name,
      date_of_joining: w.created_at || '',
      present: c.present,
      late: c.late,
      half: c.half,
      absent: c.absent,
      leave: c.leave,
      paid_days: calc.paidDays,
      late_deduction_days: calc.lateDeductionDays,
      joining_deduction: calc.joiningDeduction,
      available_days: calc.available,
      absent_count: calc.absentDatesAfterJoin.length,
      half_days: calc.halfDayCount,
      leave_count: calc.leaveCount,
      sunday_count: calc.sundayStats.totalSundays,
      attended_sundays: calc.sundayStats.attendedSundays,
      unpaid_sundays: calc.sundayStats.unpaidSundays.length,
      clubbed_sundays: calc.clubbedSundays,
      extra_sundays: calc.extraSundayCount,
      free_sundays: calc.freeSundays,
      sunday_reasons: calc.sundayReasons.map(r => ({ date: r.date, reason: r.reason })),
      deducted_sundays: calc.sundayStats.cancelledSundays.length + calc.sundayStats.unpaidSundays.length,
      total_late_minutes: calc.totalLateMinutes,
      sunday_add: calc.sundayAdd,
      deducted_days: calc.deductedCount,
      worked_days: calc.totalDueDays,
      collection: collectionByWorker[w.id] || 0,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { month: startDate, days_in_month: daysInMonth, total_workers: rows.length, rows };
};

// Mirrors normalizeName() in the salary frontend so Excel names ("Nazreen
// Zahur Baig") resolve to DB workers ("Nazreen Baig").
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+-\s+.*$/g, '')
    .replace(/\bleft\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveWorkerByName(workers, name) {
  const n = normalizeName(name);
  let match = workers.find(w => normalizeName(w.name) === n);
  if (match) return match;
  const parts = n.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const firstLast = parts[0] + ' ' + parts[parts.length - 1];
    match = workers.find(w => normalizeName(w.name) === firstLast);
    if (match) return match;
    for (const w of workers) {
      const kp = normalizeName(w.name).split(' ').filter(Boolean);
      if (kp.length >= 2 && kp[0] + ' ' + kp[kp.length - 1] === firstLast) return w;
    }
  }
  return undefined;
}

// Daily attendance grid for one worker for a month — day-by-day status
// (present/late/half-day/absent/leave/sunday) with punch in/out times.
export const getWorkerAttendanceByName = async (month, name) => {
  const p = String(month || '').split('-');
  if (p.length !== 2) throw new Error('month must be YYYY-MM');
  const year = parseInt(p[0], 10);
  const monthIdx = parseInt(p[1], 10) - 1;
  if (!year || monthIdx < 0 || monthIdx > 11) throw new Error('month must be YYYY-MM');
  const pad = n => String(n).padStart(2, '0');
  const monthStr = `${year}-${pad(monthIdx + 1)}`;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${pad(daysInMonth)}`;

  const { data: workers, error: wErr } = await db
    .from('workers')
    .select('id, name, created_at');
  if (wErr) throw wErr;

  const worker = resolveWorkerByName(workers, name);
  if (!worker) return { worker: null, days_in_month: daysInMonth, stats: null, rows: [] };

  const { data: records, error: aErr } = await db
    .from('attendance')
    .select('*')
    .eq('worker_id', worker.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (aErr) throw aErr;

  const { data: leaves, error: lErr } = await db
    .from('leaves')
    .select('leave_date, start_date, end_date')
    .eq('worker_id', worker.id);
  const leaveDates = new Set();
  if (!lErr && leaves) {
    for (const l of leaves) {
      const start = l.leave_date || l.start_date;
      const end = l.leave_date || l.end_date;
      if (!start) continue;
      const s = new Date(start + 'T00:00:00Z');
      const e = new Date((end || start) + 'T00:00:00Z');
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        if (ds >= startDate && ds <= endDate) leaveDates.add(ds);
      }
    }
  }

  const recByDate = {};
  for (const r of records) recByDate[r.date] = r;

  const fmtTime = (t) => {
    if (!t) return null;
    const d = new Date(t);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  };

  const rows = [];
  const stats = { present: 0, late: 0, half: 0, absent: 0, leave: 0, sunday: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${pad(d)}`;
    const dow = new Date(Date.UTC(year, monthIdx, d)).getUTCDay();
    const rec = recByDate[dateStr];
    let status;
    if (rec) {
      status = rec.status;
    } else if (leaveDates.has(dateStr)) {
      status = 'leave';
    } else if (dow !== 0) {
      status = 'absent';
    } else {
      status = 'sunday';
    }
    if (stats[status] !== undefined) stats[status]++;
    const pi = rec && rec.punch_in_time ? new Date(rec.punch_in_time).getTime() : null;
    const po = rec && rec.punch_out_time ? new Date(rec.punch_out_time).getTime() : null;
    let hoursWorked = null;
    if (pi && po && !isNaN(pi) && !isNaN(po)) {
      const mins = Math.max(0, Math.round((po - pi) / 60000));
      hoursWorked = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    rows.push({
      date: dateStr,
      day: dow,
      status,
      id: rec ? rec.id : null,
      late_minutes: rec ? (rec.late_minutes || 0) : 0,
      punch_in: fmtTime(rec && rec.punch_in_time),
      punch_out: fmtTime(rec && rec.punch_out_time),
      hours_worked: hoursWorked,
    });
  }
  return { worker: { id: worker.id, name: worker.name, date_of_joining: worker.created_at || '' }, days_in_month: daysInMonth, stats, rows };
};
