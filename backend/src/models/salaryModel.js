import supabase from '../config/supabase.js';
import { getDayName, calculateAKI, getMonthsEmployed } from '../utils/incentive.js';

export const getSalariesByWorker = async (workerId) => {
  const { data, error } = await supabase
    .from('salary_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('from_month', { ascending: false });
  if (error) throw error;
  return data;
};

export const getActiveSalaryByWorker = async (workerId) => {
  const { data, error } = await supabase
    .from('salary_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('from_month', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
};

export const createSalary = async (salaryData) => {
  const { data, error } = await supabase
    .from('salary_history')
    .insert([salaryData])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateSalary = async (id, updates) => {
  const { data, error } = await supabase
    .from('salary_history')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getAllWorkersSalarySummary = async () => {
  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select('id, name, email, department, created_at')
    .order('created_at', { ascending: false });
  if (wErr) throw wErr;

  const { data: salaries, error: sErr } = await supabase
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
  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select(selectFields)
    .order('name');
  if (wErr) throw wErr;

  const { data: salaries, error: sErr } = await supabase
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
    const { data: targets, error: tErr } = await supabase
      .from('incentive_targets')
      .select('worker_id, target_amount')
      .gte('month', startDate)
      .lte('month', endDate);
    if (!tErr) {
      for (const t of targets) {
        targetsByWorker[t.worker_id] = parseFloat(t.target_amount);
      }
    }

    const { data: achievements, error: aErr2 } = await supabase
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

  const { data: allAllocs, error: aErr } = await supabase
    .from('worker_ngo_allocations')
    .select('*, ngos(name)');
  if (aErr) throw aErr;

  const allocsByWorker = {};
  for (const a of allAllocs) {
    if (!allocsByWorker[a.worker_id]) allocsByWorker[a.worker_id] = [];
    allocsByWorker[a.worker_id].push(a);
  }

  const { data: attRecords, error: attErr } = await supabase
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
  const { data: activeLoans, error: loanErr } = await supabase
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
  const { error } = await supabase
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
  const startDate = `${year}-${pad(monthIdx + 1)}-01`;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const endDate = `${year}-${pad(monthIdx + 1)}-${pad(daysInMonth)}`;

  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select('id, name, created_at');
  if (wErr) throw wErr;

  const { data: attRecords, error: aErr } = await supabase
    .from('attendance')
    .select('worker_id, status')
    .gte('date', startDate)
    .lte('date', endDate);
  if (aErr) throw aErr;

  const counts = {};
  for (const r of attRecords) {
    if (!counts[r.worker_id]) counts[r.worker_id] = { present: 0, late: 0, half: 0, absent: 0, leave: 0 };
    if (counts[r.worker_id][r.status] !== undefined) counts[r.worker_id][r.status]++;
    else counts[r.worker_id][r.status] = 1;
  }

  const rows = workers.map(w => {
    const c = counts[w.id] || { present: 0, late: 0, half: 0, absent: 0, leave: 0 };
    return {
      worker_id: w.id,
      name: w.name,
      date_of_joining: w.created_at || '',
      present: c.present,
      late: c.late,
      half: c.half,
      absent: c.absent,
      leave: c.leave,
      worked_days: c.present + c.late + c.half * 0.5,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { month: startDate, days_in_month: daysInMonth, total_workers: rows.length, rows };
};
