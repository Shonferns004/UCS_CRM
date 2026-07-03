import { getAllNgos } from '../models/ngoModel.js';
import { getAllUsers, getUsersCountByRole } from '../models/userModel.js';
import { getAllHRs } from '../models/hrModel.js';
import { getAllWorkers } from '../models/workerModel.js';
import supabase from '../config/supabase.js';

function calcDateRange(period) {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);

  let from, prevFrom, prevTo;
  const dur = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : period === '1y' ? 365 : null;

  if (dur) {
    const s = new Date(now); s.setDate(s.getDate() - dur + 1);
    from = s.toISOString().slice(0, 10);
    const ps = new Date(s); ps.setDate(ps.getDate() - dur);
    prevFrom = ps.toISOString().slice(0, 10);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    prevTo = pe.toISOString().slice(0, 10);
  } else {
    from = '1970-01-01';
    prevFrom = '1970-01-01';
    prevTo = '1970-01-01';
  }
  return { from, to: end, prevFrom, prevTo, dur, isAll: !dur };
}

function calcChange(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
}

export const getSuperAdminDashboard = async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const range = calcDateRange(period);

    const ngos = await getAllNgos();
    const [users, hrs, workers] = await Promise.all([
      getAllUsers({}),
      getAllHRs({}),
      getAllWorkers(),
    ]);

    /* ── Period-filtered stats ── */
    const userCreated = users.filter(u => u.created_at?.slice(0, 10) >= range.from);
    const workerCreated = workers.filter(w => w.created_at?.slice(0, 10) >= range.from);
    const activeUsers = userCreated.filter(u => u.is_active).length;

    /* ── Previous period stats for change % ── */
    const prevUserCreated = users.filter(u => {
      const d = u.created_at?.slice(0, 10);
      return d >= range.prevFrom && d <= range.prevTo;
    }).length;
    const prevWorkerCreated = workers.filter(w => {
      const d = w.created_at?.slice(0, 10);
      return d >= range.prevFrom && d <= range.prevTo;
    }).length;

    const stats = {
      totalNgos: ngos.length,
      totalUsers: userCreated.length,
      activeUsers,
      totalWorkers: workerCreated.length,
      activeWorkers: workerCreated.filter(w => w.is_active).length,
      totalHr: hrs.length,
      totalRecruiters: userCreated.filter(u => u.role === 'recruiter').length,
      workersJoinedThisMonth: period === 'all'
        ? 0
        : (() => {
            const ms = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
            return workers.filter(w => w.created_at >= ms).length;
          })(),
    };

    /* ── KPI changes ── */
    const kpiChanges = {
      totalNgos: 0,
      totalUsers: calcChange(userCreated.length, prevUserCreated),
      activeUsers: 0,
      totalWorkers: calcChange(workerCreated.length, prevWorkerCreated),
      totalHr: 0,
      totalRecruiters: 0,
    };

    /* ── NGO counts ── */
    const ngoUserCounts = await Promise.all(
      ngos.map(async (ngo) => ({
        id: ngo.id, name: ngo.name, code: ngo.code,
        users: (await getAllUsers({ ngo_id: ngo.id })).filter(
          u => u.created_at?.slice(0, 10) >= range.from
        ).length,
        workers: workers.filter(w => w.ngo_id === ngo.id && w.created_at?.slice(0, 10) >= range.from).length,
      }))
    );

    /* ── Role distribution ── */
    const roleDistribution = {};
    userCreated.forEach(u => {
      roleDistribution[u.role] = (roleDistribution[u.role] || 0) + 1;
    });

    /* ── Department worker counts ── */
    const deptWorkers = {};
    workerCreated.forEach(w => {
      if (w.department) deptWorkers[w.department] = (deptWorkers[w.department] || 0) + 1;
    });

    /* ── Gender counts ── */
    const genderCounts = { Male: 0, Female: 0, Other: 0 };
    workerCreated.forEach(w => {
      if (w.gender && genderCounts[w.gender] !== undefined) genderCounts[w.gender]++;
    });

    /* ── Attendance ── */
    const { data: attendance } = await supabase
      .from('attendance')
      .select('status, date, worker_id, punch_in_time')
      .gte('date', range.from)
      .lte('date', range.to);

    const attendanceStatus = { present: 0, late: 0, absent: 0, leave: 0 };
    const uniquePills = { present: new Set(), late: new Set(), absent: new Set(), leave: new Set() };
    const workerDept = {};
    workerCreated.forEach(w => { workerDept[w.id] = w.department; });

    const deptPivot = {};
    const workerMap = {};
    workers.forEach(w => { workerMap[w.id] = { name: w.name, department: w.department }; });

    const attendanceDetails = { present: [], late: [], absent: [] };

    (attendance || []).forEach(a => {
      if (attendanceStatus[a.status] !== undefined) {
        attendanceStatus[a.status]++;
        uniquePills[a.status].add(a.worker_id);
      }
      const dept = workerDept[a.worker_id];
      if (dept) {
        if (!deptPivot[dept]) deptPivot[dept] = { department: dept, present: 0, late: 0, absent: 0 };
        if (deptPivot[dept][a.status] !== undefined) deptPivot[dept][a.status]++;
      }
      if (attendanceDetails[a.status]) {
        const w = workerMap[a.worker_id];
        const time = a.punch_in_time
          ? (() => {
              const ms = new Date(a.punch_in_time).getTime() + 5.5 * 60 * 60 * 1000;
              const d = new Date(ms);
              return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
            })()
          : '';
        attendanceDetails[a.status].push({
          name: w?.name || 'Unknown',
          dept: w?.department || '',
          time,
        });
      }
    });

    const attendanceWorkerCounts = {
      present: uniquePills.present.size,
      late: uniquePills.late.size,
      absent: uniquePills.absent.size,
      leave: uniquePills.leave.size,
    };
    const deptAttendance = Object.values(deptPivot);

    const totalAtt = Object.values(attendanceStatus).reduce((s, v) => s + v, 0);
    const attendancePercent = totalAtt > 0
      ? Math.round((attendanceStatus.present / totalAtt) * 1000) / 10
      : 0;

    /* ── Previous period attendance for comparison ── */
    const { data: prevAtt } = await supabase
      .from('attendance')
      .select('status')
      .gte('date', range.prevFrom)
      .lte('date', range.prevTo);
    const prevAttCount = (prevAtt || []).length;
    const prevPresent = (prevAtt || []).filter(a => a.status === 'present').length;
    const prevAttPercent = prevAttCount > 0 ? Math.round((prevPresent / prevAttCount) * 1000) / 10 : 0;
    kpiChanges.attendancePercent = calcChange(attendancePercent, prevAttPercent);

    /* ── Pending leaves ── */
    const { count: pendingLeaves } = await supabase
      .from('leaves')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    /* ── Monthly trend (based on period range) ── */
    const { data: monthData } = await supabase
      .from('attendance')
      .select('date, status')
      .gte('date', range.from)
      .lte('date', range.to);

    const dateMap = {};
    const startDate = new Date(range.from);
    const endDate = new Date(range.to);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      dateMap[ds] = { date: ds, present: 0, late: 0, absent: 0 };
    }
    (monthData || []).forEach(a => {
      if (dateMap[a.date] && dateMap[a.date][a.status] !== undefined) {
        dateMap[a.date][a.status]++;
      }
    });
    const monthlyAttendance = Object.values(dateMap);

    /* ── Salary payable (always all-time) ── */
    const { data: salaries } = await supabase
      .from('salary_history')
      .select('worker_id, salary')
      .is('to_month', null);
    const salarySet = new Set();
    let totalSalaryPayable = 0;
    (salaries || []).forEach(s => {
      if (!salarySet.has(s.worker_id)) {
        salarySet.add(s.worker_id);
        totalSalaryPayable += parseFloat(s.salary || 0);
      }
    });

    /* ── Recent notices ── */
    const { data: recentNotices } = await supabase
      .from('notices')
      .select('id, title, content, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);

    /* ── Upcoming events ── */
    const today = new Date().toISOString().slice(0, 10);
    const { data: upcomingEvents } = await supabase
      .from('events')
      .select('id, title, description, event_date, event_time, location')
      .gte('event_date', today)
      .eq('is_active', true)
      .order('event_date', { ascending: true })
      .limit(5);

    return res.json({
      stats,
      kpiChanges,
      attendancePercent,
      deptAttendance,
      ngoUserCounts,
      roleDistribution,
      deptWorkers,
      genderCounts,
      attendanceStatus,
      attendanceWorkerCounts,
      attendanceDetails,
      pendingLeaves: pendingLeaves || 0,
      monthlyAttendance,
      totalSalaryPayable,
      recentNotices: recentNotices || [],
      upcomingEvents: upcomingEvents || [],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getHrDashboard = async (req, res) => {
  try {
    const workers = await getAllWorkers();
    const users = await getAllUsers({});

    const totalWorkers = workers.length;
    const recruiters = users.filter((u) => u.role === 'recruiter').length;
    const totalNgos = (await getAllNgos()).length;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const newThisMonth = workers.filter((w) => w.created_at >= monthStart).length;

    const { data: leaves } = await supabase
      .from('leaves')
      .select('status')
      .eq('status', 'pending');
    const pendingLeaves = leaves?.length || 0;

    const { data: attendance } = await supabase
      .from('attendance')
      .select('status');
    const statusCounts = { present: 0, late: 0, absent: 0, leave: 0 };
    (attendance || []).forEach((a) => {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
    });

    const deptWorkers = {};
    workers.forEach((w) => {
      if (w.department) deptWorkers[w.department] = (deptWorkers[w.department] || 0) + 1;
    });

    const genderCounts = { Male: 0, Female: 0, Other: 0 };
    workers.forEach((w) => {
      if (w.gender && genderCounts[w.gender] !== undefined) genderCounts[w.gender]++;
    });

    return res.json({
      stats: { totalWorkers, recruiters, pendingLeaves, newThisMonth, totalNgos, totalUsers: users.length },
      attendanceStatus: statusCounts,
      deptWorkers,
      genderCounts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getHoadminDashboard = async (req, res) => {
  try {
    const ngoId = req.user.ngo_id;
    const workers = ngoId ? await getAllWorkers(ngoId) : await getAllWorkers();
    const users = ngoId ? await getAllUsers({ ngo_id: ngoId }) : await getAllUsers({});

    const userCounts = {};
    users.forEach((u) => { userCounts[u.role] = (userCounts[u.role] || 0) + 1; });

    const { data: attendance } = await supabase
      .from('attendance')
      .select('status, workers!inner(ngo_id)');

    const statusCounts = { present: 0, late: 0, absent: 0, leave: 0 };
    const workerIds = new Set(workers.map((w) => w.id));
    (attendance || []).forEach((a) => {
      if (workerIds.has(a.worker_id) && statusCounts[a.status] !== undefined) statusCounts[a.status]++;
    });

    const deptWorkers = {};
    workers.forEach((w) => {
      if (w.department) deptWorkers[w.department] = (deptWorkers[w.department] || 0) + 1;
    });

    return res.json({
      stats: { totalWorkers: workers.length, ...userCounts },
      attendanceStatus: statusCounts,
      deptWorkers,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAccountsDashboard = async (req, res) => {
  try {
    const ngoId = req.user.ngo_id;
    const workers = ngoId ? await getAllWorkers(ngoId) : await getAllWorkers();

    const { data: attendance } = await supabase
      .from('attendance')
      .select('worker_id, status, date, late_minutes');

    const workerIds = new Set(workers.map((w) => w.id));
    const monthAttendance = (attendance || []).filter((a) => workerIds.has(a.worker_id));

    const deptWorkers = {};
    workers.forEach((w) => {
      if (w.department) deptWorkers[w.department] = (deptWorkers[w.department] || 0) + 1;
    });

    return res.json({
      stats: { totalWorkers: workers.length },
      deptWorkers,
      attendanceCount: monthAttendance.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getRecruiterDashboard = async (req, res) => {
  try {
    const workers = await getAllWorkers();
    const totalWorkers = workers.length;
    return res.json({ stats: { totalWorkers } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getLeadsDashboard = async (req, res) => {
  try {
    return res.json({ stats: { totalLeads: 0, callsToday: 0 } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getTelecallerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    const { count: assignedLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .or(`recruiter_id.eq.${userId},created_by.eq.${userId}`);

    const { count: callsToday } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('telecaller_id', userId)
      .gte('call_time', today);

    const { count: callsThisMonth } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('telecaller_id', userId)
      .gte('call_time', monthStart);

    const { data: followUps } = await supabase
      .from('call_logs')
      .select('id')
      .eq('telecaller_id', userId)
      .lte('follow_up_date', today)
      .not('follow_up_date', 'is', null);

    const followUpsDue = followUps ? new Set(followUps.map(f => f.id)).size : 0;

    return res.json({
      stats: {
        assignedLeads: assignedLeads || 0,
        callsToday: callsToday || 0,
        callsThisMonth: callsThisMonth || 0,
        followUpsDue,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getTeamLeadDashboard = async (req, res) => {
  try {
    return res.json({ stats: { teamSize: 0, pendingTasks: 0 } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
