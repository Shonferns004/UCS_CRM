import { useState, useEffect, useRef, useCallback } from 'react';
import { useHR } from '../store';
import { useSalaryPrivacy } from '../../../context/SalaryPrivacyContext';
import { useTeams } from '../../../components/useTeams';
import { Who, Avatar, Dropdown } from './ui';
import NgoSalary from './NgoSalary';
import { Plus, Trash, Check, Flask } from '../icons';
import { api } from '../../../api/auth';
import { istMonthKey, istDayKey } from '../../../utils/istDate';
import { exportAttendanceSheet } from '../../accounts/pages/Attendance';
import { parseDocumentsValue, joinDocumentLabels } from '../../../lib/documents';
import * as XLSX from 'xlsx-js-style';

function load() {
  try { return JSON.parse(sessionStorage.getItem('wrk') || '{}'); } catch { return {}; }
}
function save(v) {
  try { const d = load(); sessionStorage.setItem('wrk', JSON.stringify({ ...d, ...v })); } catch (e) { console.error('Error:', e.message); }
}

// --- Team pill styles (mirrors accounts/pages/Teams.jsx) ---
const TEAM_STYLE = {
  UFS1: { bg: '#E7F3EC', fg: '#1f6f3f' },
  UFS2: { bg: '#EAF1FB', fg: '#2563eb' },
  UFS3: { bg: '#FDF2E3', fg: '#B45309' },
  UFS4: { bg: '#F3E8F8', fg: '#7C3AED' },
  'No Team': { bg: '#F3F4F6', fg: '#6b7280' },
};
const teamTs = (name) => TEAM_STYLE[name] || { bg: '#EEF1F5', fg: '#4B5563' };

// Target source pills — same labels/colours as the FRO Targets screen, so the
// two views never disagree about where a number came from.
const fmtMonthShort = (m) => {
  if (!m) return 'an earlier month';
  const p = String(m).slice(0, 7).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(p[1], 10) - 1]} ${p[0]}`;
};
const TARGET_SOURCE_STYLE = {
  auto: { bg: '#fef3c7', color: '#92400e' },
  manual: { bg: '#dcfce7', color: '#166534' },
  carried_forward: { bg: '#dbeafe', color: '#1e40af' },
  not_set: { bg: '#fee2e2', color: '#991b1b' },
};
const targetSourceLabel = (t) => {
  if (!t) return '—';
  if (t.target_source === 'auto') return `Auto · month ${Math.min((t.months_employed ?? 0) + 1, 3)}`;
  if (t.target_source === 'manual') return 'Set for this month';
  if (t.target_source === 'carried_forward') return `Carried over from ${fmtMonthShort(t.target_source_month)}`;
  return 'Not set';
};

// The filter dropdowns have a fixed width so they don't resize when a longer
// option (e.g. "Absconded") is picked — the selected label gets ellipsised.
const clipValue = (fallback) => (selected) => (
  <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
    {selected ? (typeof selected === 'string' ? selected : selected.label) : fallback}
  </span>
);

function isComplete(w) {
  const val = (v) => v && typeof v === 'string' && v.trim() !== '';
  const edu = w.education || w.education_details || [];
  const firstEdu = edu[0] || {};
  const fam = w.family || w.family_details || [];
  const firstFam = fam[0] || {};
  return (
    val(w.name) &&
    val(w.father_husband_name) &&
    val(w.address) &&
    val(w.phone) &&
    val(w.dob) &&
    val(w.marital_status) &&
    val(w.email) &&
    val(w.gender) &&
    val(w.aadhar_number) &&
    val(firstEdu.degree) &&
    val(firstEdu.institution) &&
    val(firstEdu.year_of_passing || firstEdu.year) &&
    val(firstEdu.percentage) &&
    val(firstFam.name) &&
    val(firstFam.relationship) &&
    val(firstFam.occupation) &&
    val(firstFam.phone)
  );
}

function WhoWithPhoto({ name, role, photo_url }) {
  const [photoErr, setPhotoErr] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const hasPhoto = photo_url && !photoErr;
  const imgLoading = hasPhoto && !photoLoaded;
  useEffect(() => { setPhotoErr(false); setPhotoLoaded(false); }, [photo_url]);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      {imgLoading ? (
        <div className="sk" style={{ width:36, height:36, borderRadius:'50%', flexShrink:0 }} />
      ) : null}
      {hasPhoto ? (
        <img src={photo_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', flexShrink:0, display: photoLoaded ? 'block' : 'none' }}
          onLoad={() => setPhotoLoaded(true)} onError={() => { setPhotoErr(true); setPhotoLoaded(true); }} />
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!hasPhoto && !imgLoading ? <Avatar name={name} /> : null}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{role}</div>
        </div>
      </div>
    </div>
  );
}

export default function Workers({ onSelect, onOffboard, showAddForm = true, showNgoSalary = true, showBulkPrint = true, title = 'Volunteers', showPagarExport = false, showPayExports = true, salaryMode = false, onActionsReady }) {
  const { addWorker, DEPTS, deptLabel, updateWorker, fetchWorkers, fetchNGOs, fetchNgoSummaryList } = useHR();
  const { formatSalary, isSalaryUnlocked, promptUnlock, lockSalary } = useSalaryPrivacy();
  const { teams } = useTeams();
  const [teamFilter, setTeamFilter] = useState('');
  const [teamMsg, setTeamMsg] = useState('');
  const [teamErr, setTeamErr] = useState('');
  const [targetMap, setTargetMap] = useState({});
  const [targetDrafts, setTargetDrafts] = useState({});
  const [targetSaving, setTargetSaving] = useState({});
  const [workers, setWorkers] = useState([]);
  const [empIdMap, setEmpIdMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [dept, setDept] = useState(DEPTS?.[0] || '');
  const [client, setClient] = useState('BSCT');
  const [isTest, setIsTest] = useState(false);
  const [err, setErr] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [search, setSearch] = useState(load().search || '');
  const [roleFilter, setRoleFilter] = useState(load().roleFilter || '');
  const [statusFilter, setStatusFilter] = useState(['active','absconded','offboarded','all'].includes(load().statusFilter) ? load().statusFilter : 'active');
  const [showTest, setShowTest] = useState(load().showTest || false);
  const [entityFilter, setEntityFilter] = useState('All');
  // The table renders incrementally: PAGE_SIZE rows now, +PAGE_SIZE per
  // "Load more" click — no page-number jumping, so the first paint stays fast.
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [created, setCreated] = useState(null);
  const [salaryMap, setSalaryMap] = useState({});
  const [ngos, setNgos] = useState([]);
  const [ngoSummary, setNgoSummary] = useState([]);
  const [selectedNgos, setSelectedNgos] = useState([]);
  const [workerDetails, setWorkerDetails] = useState({});
  const [pagarMonth, setPagarMonth] = useState('');
  const [showPagarModal, setShowPagarModal] = useState(false);
  // NGO & Salary opens as an in-place modal instead of navigating to /hr/ngo.
  const [showNgoModal, setShowNgoModal] = useState(false);
  // Attendance Excel export: month picker modal (defaults to the current IST
  // month each time it opens) driving the shared sheet builder.
  const [attExportMonth, setAttExportMonth] = useState('');
  const [showAttExportModal, setShowAttExportModal] = useState(false);

  const doAttExport = async () => {
    if (!attExportMonth || !/^\d{4}-\d{2}$/.test(attExportMonth)) return;
    setShowAttExportModal(false);
    const [y, m] = attExportMonth.split('-').map(Number);
    const from = `${attExportMonth}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${attExportMonth}-${String(lastDay).padStart(2, '0')}`;
    const today = istDayKey();
    // A future month, or the tail of the current one, stops at today — the
    // sheet leaves future days blank anyway.
    const to = monthEnd > today ? today : monthEnd;
    if (to < from) { alert('No attendance to export for that month yet.'); return; }
    await exportAttendanceSheet(from, to);
  };
  const [salaryCompensations, setSalaryCompensations] = useState([]);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [compensationMonth, setCompensationMonth] = useState('');
  const [compensationWorkDate, setCompensationWorkDate] = useState('');
  const [compensationHolidayDate, setCompensationHolidayDate] = useState('');
  const [compensationName, setCompensationName] = useState('');
  const [compensationSaving, setCompensationSaving] = useState(false);
  const tableRef = useRef(null);

  // Freeze the page behind open modals: this layout scrolls on the body, so
  // hiding body overflow blocks wheel/touch/keyboard scrolling while a modal
  // is up. The padding-right compensates the vanishing scrollbar so the page
  // doesn't jump sideways.
  const anyModalOpen = showNgoModal || showPagarModal || showAttExportModal || showCompensationModal;
  useEffect(() => {
    if (!anyModalOpen) return;
    const body = document.body;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => { body.style.overflow = prevOverflow; body.style.paddingRight = prevPad; };
  }, [anyModalOpen]);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchWorkers('all').then(list => {
      setWorkers(list || []);
      setLoading(false);
      api('/db/query', { method: 'POST', body: JSON.stringify({ sql: 'SELECT id, employee_id FROM workers' }), _prefix: 'ucs' })
        .then(res => {
          const map = {};
          (res.rows || []).forEach(r => { if (r.employee_id) map[r.id] = r.employee_id; });
          setEmpIdMap(map);
        })
        .catch(() => {});
      return list || [];
    }).catch((err) => { console.error('API error:', err.message); setLoading(false); return []; });
  }, [fetchWorkers]);

  useEffect(() => {
    reload().then(list => {
      Promise.all((list || []).map(w =>
        api('/workers/' + w.id, { _prefix: 'ucs' }).catch((err) => { console.error('Error:', err.message); })
      )).then(details => {
        const map = {};
        for (const d of details) { if (d) map[d.id] = d; }
        setWorkerDetails(map);
      });
    });
    fetchNGOs().then(setNgos).catch((err) => { console.error('API error:', err.message); });
    fetchNgoSummaryList().then(setNgoSummary).catch((err) => { console.error('API error:', err.message); });
    api('/salary/workers-summary', { _prefix: 'ucs' })
      .then(data => {
        const map = {};
        for (const w of data) map[w.id] = w;
        setSalaryMap(map);
      })
      .catch((err) => { console.error('Error:', err.message); });
    if (showPagarExport) {
      api('/salary/compensations', { _prefix: 'ucs' })
        .then(data => setSalaryCompensations(data?.compensations || []))
        .catch((err) => { console.error('Compensation settings error:', err.message); });
    }
  }, [reload, showPagarExport]);

  const saveCompensation = async () => {
    if (!compensationMonth || !compensationWorkDate || !compensationHolidayDate) {
      alert('Select the month, compensatory work date, and holiday date.');
      return;
    }
    const entry = {
      month: compensationMonth,
      workDate: compensationWorkDate,
      holidayDate: compensationHolidayDate,
      name: compensationName.trim() || 'Compensatory holiday',
    };
    setCompensationSaving(true);
    try {
      const data = await api('/salary/compensations', {
        method: 'PUT',
        body: JSON.stringify({ compensations: [...salaryCompensations, entry] }),
        _prefix: 'ucs',
      });
      setSalaryCompensations(data?.compensations || []);
      setCompensationName('');
      setCompensationWorkDate('');
      setCompensationHolidayDate('');
      alert('Compensation saved.');
    } catch (err) {
      alert(err.message || 'Could not save compensation.');
    } finally {
      setCompensationSaving(false);
    }
  };

  const removeCompensation = async (entry) => {
    if (!window.confirm(`Remove ${entry.workDate} → ${entry.holidayDate}?`)) return;
    try {
      const data = await api('/salary/compensations', {
        method: 'PUT',
        body: JSON.stringify({
          compensations: salaryCompensations.filter(item => !(item.workDate === entry.workDate && item.holidayDate === entry.holidayDate)),
        }),
        _prefix: 'ucs',
      });
      setSalaryCompensations(data?.compensations || []);
    } catch (err) {
      alert(err.message || 'Could not remove compensation.');
    }
  };

  const roles = [...new Set(workers.map(w => (w.department || 'Team Member')).filter(Boolean))].sort();
  const clientOf = (w) => {
    if (!w.ngo_id) return 'Other';
    const ngo = ngos.find(n => n.id === w.ngo_id);
    if (!ngo) return 'Other';
    const name = (ngo.name || '').trim().toUpperCase();
    return name === 'OTHER' ? 'Other' : (name || 'Other');
  };
  const filtered = workers.filter(w => {
    if (w.is_test && (salaryMode || !showTest)) return false;
    const role = w.department || 'Team Member';
    if (roleFilter && role !== roleFilter) return false;
    const empStatus = w.employment_status || 'active';
    if (statusFilter && statusFilter !== 'all' && empStatus !== statusFilter) return false;
    if (entityFilter && entityFilter !== 'All' && clientOf(w) !== entityFilter) return false;
    if (salaryMode && teamFilter) {
      const isFro = (w.department || '').trim().toLowerCase() === 'fro';
      if (!isFro) return false;
      const t = (w.team || '').trim();
      if (teamFilter === 'No Team' ? t : t !== teamFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      role.toLowerCase().includes(q);
  });

  const visibleRows = filtered.slice(0, visibleCount);

  const CLIENTS = [...new Set([
    ...(ngos || []).filter(n => (n.name || '').trim().toUpperCase() !== 'TESTING')
      .map(n => (n.name || '').trim().toUpperCase() === 'OTHER' ? 'Other' : (n.name || '').trim().toUpperCase()).filter(Boolean),
    'Other',
  ])];
  const PALETTE = ['#5B6B4E', '#C08A2E', '#7A5C7E', '#B5603A', '#4F6472', '#88693D', '#2E7D32', '#1565C0', '#6A1B9A', '#00838F'];
  const CLIENT_COLORS = {};
  CLIENTS.forEach((c, i) => { CLIENT_COLORS[c] = PALETTE[i % PALETTE.length]; });
  const clientCounts = {};
  CLIENTS.forEach(c => { clientCounts[c] = 0; });
  workers.forEach(w => { if (w.is_test) return; const c = clientOf(w); if (clientCounts[c] !== undefined) clientCounts[c] += 1; else clientCounts[c] = 1; });
  const clientTotal = CLIENTS.reduce((s, c) => s + (clientCounts[c] || 0), 0);
  const clientPct = (c) => clientTotal ? Math.round((clientCounts[c] / clientTotal) * 100) : 0;

  // --- Salary-mode team tools (mirrors accounts/pages/Teams.jsx) ---
  const activeFros = workers.filter(w => !w.is_test && (w.department || '').trim().toLowerCase() === 'fro' && (w.employment_status || 'active') === 'active');
  const teamCounts = {};
  activeFros.forEach(w => { const t = w.team || 'No Team'; teamCounts[t] = (teamCounts[t] || 0) + 1; });
  const noTeamCount = teamCounts['No Team'] || 0;
  const teamOverview = [...teams.map(t => ({ key: t, label: t, count: teamCounts[t] || 0 })), ...(noTeamCount > 0 ? [{ key: 'No Team', label: 'No Team', count: noTeamCount }] : [])];

  // Same worklist as the FRO Targets screen: active FROs with no target for the
  // current month. Absconded FROs cannot collect, so they are never counted.
  const needsTargetNames = salaryMode ? Object.entries(targetMap).filter(([id, t]) => {
    if ((t.target_source || 'not_set') !== 'not_set') return false;
    const worker = workers.find(x => String(x.id) === String(id));
    return !worker || String(worker.employment_status || 'active').toLowerCase() !== 'absconded';
  }).map(([, t]) => t.name || 'Unknown').sort() : [];
  const needsTargetCount = needsTargetNames.length;

  // Active FROs still sitting in "No Team" — same worklist idea, so the names
  // behind the unassigned count are one glance away. (The overview's
  // `noTeamCount` above counts the same rows; this one carries the names.)
  const unassignedFroNames = salaryMode
    ? activeFros.filter(w => !(w.team || '').trim()).map(w => w.name || 'Unknown').sort()
    : [];

  const flashTeam = (m) => { setTeamMsg(m); setTimeout(() => setTeamMsg(''), 2600); };

  const setWorkerTeam = async (w, val) => {
    // Local first so the dropdown feels instant; rollback on failure.
    setWorkers(prev => prev.map(x => (x.id === w.id ? { ...x, team: val || null } : x)));
    try { await updateWorker(w.id, { team: val || null }); }
    catch (e) { setTeamErr(e.message); }
  };

  // Targets come from the one shared resolver (GET /ngo-admin/targets) so this
  // column shows the same number as the FRO Targets screen. Editing writes the
  // current IST month, exactly like FroTargets' modal does.
  const saveTarget = async (w) => {
    const raw = targetDrafts[w.id];
    if (raw === undefined) return;
    const saved = Number(targetMap[w.id]?.target || 0);
    const amount = Math.round(Number(raw === '' ? 0 : raw));
    if (!Number.isFinite(amount) || amount < 0) {
      setTargetDrafts(d => ({ ...d, [w.id]: String(saved) }));
      setTeamErr('Target must be a non-negative number.');
      return;
    }
    if (amount === saved) {
      if (String(raw) !== String(saved)) setTargetDrafts(d => ({ ...d, [w.id]: String(saved) }));
      return;
    }
    setTargetSaving(s => ({ ...s, [w.id]: true }));
    try {
      await api('/ngo-admin/targets', {
        method: 'POST',
        body: JSON.stringify({ fro_worker_id: w.id, month: istMonthKey(), target_amount: amount, ngo_id: w.ngo_id || undefined }),
        _prefix: 'ucs',
      });
      setTargetMap(m => ({ ...m, [w.id]: { ...(m[w.id] || {}), target: amount, target_source: 'manual' } }));
      setTargetDrafts(d => { const n = { ...d }; delete n[w.id]; return n; });
      flashTeam(`Target for ${w.name} set to ₹${amount.toLocaleString('en-IN')}.`);
    } catch (e) {
      setTargetDrafts(d => ({ ...d, [w.id]: String(saved) }));
      setTeamErr(e.message);
    } finally {
      setTargetSaving(s => { const n = { ...s }; delete n[w.id]; return n; });
    }
  };

  // Salary mode: this month's per-FRO targets for the Target column.
  useEffect(() => {
    if (!salaryMode) return;
    let alive = true;
    api('/ngo-admin/targets?month=' + istMonthKey(), { _prefix: 'ucs' })
      .then(d => {
        if (!alive) return;
        const m = {};
        (Array.isArray(d) ? d : []).forEach(r => { m[r.id] = { name: r.name, login_id: r.login_id, salary: r.salary, employment_status: r.employment_status, target: r.target, target_source: r.target_source, months_employed: r.months_employed, target_source_month: r.target_source_month }; });
        setTargetMap(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [salaryMode]);

  // The Manage Teams modal (and useTeams itself) announce team-list changes on
  // this event; a renamed or removed team must show up in the table immediately.
  useEffect(() => {
    if (!salaryMode) return;
    const onTeamsUpdated = () => { fetchWorkers('all').then(l => setWorkers(l || [])).catch(() => {}); };
    window.addEventListener('teams-updated', onTeamsUpdated);
    return () => window.removeEventListener('teams-updated', onTeamsUpdated);
  }, [salaryMode, fetchWorkers]);

  // FRO Targets' Download button, reused here: exports every row of the shared
  // /ngo-admin/targets feed (the FRO department only) for the current month.
  const downloadFroTargets = () => {
    const rows = Object.entries(targetMap).sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
    if (!rows.length) { setTeamErr('No FRO targets to download yet.'); return; }
    try {
      const workerById = {};
      workers.forEach(w => { workerById[String(w.id)] = w; });
      const data = rows.map(([id, r]) => ({
        'FRO Name': r.name || '',
        'Login ID': r.login_id || '',
        'Salary': Number(r.salary) || 0,
        'Team': workerById[String(id)]?.team || 'No Team',
        'Tenure (months)': r.months_employed != null ? r.months_employed + 1 : '',
        'Target': Number(r.target) || 0,
        'Source': targetSourceLabel(r),
        'Status': String(r.employment_status || 'active').toLowerCase() === 'absconded' ? 'Absconded' : 'Active',
        'Set for Month': fmtMonthShort(istMonthKey()),
      }));

      const header = Object.keys(data[0]);
      const ws = XLSX.utils.json_to_sheet(data, { header });
      ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 14 }];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'FRO Targets');

      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `fro-targets-${istMonthKey()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      flashTeam(`Downloaded targets for ${data.length} FRO${data.length === 1 ? '' : 's'}.`);
    } catch (e) { setTeamErr(e.message); }
  };

  const mountedSearch = useRef(false);
  useEffect(() => { if (!mountedSearch.current) { mountedSearch.current = true; return; } save({ search }); }, [search]);
  const mountedRole = useRef(false);
  useEffect(() => { if (!mountedRole.current) { mountedRole.current = true; return; } save({ roleFilter }); }, [roleFilter]);
  const mountedStatus = useRef(false);
  useEffect(() => { if (!mountedStatus.current) { mountedStatus.current = true; return; } save({ statusFilter }); }, [statusFilter]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, roleFilter, statusFilter, entityFilter, teamFilter]);

  const submit = async () => {
    if (!name.trim()) return;
    setErr('');
    setCreated(null);
    try {
      const body = { name: name.trim(), department: dept, is_test: isTest };
      const allocations = [];
      if (dept === 'NGO Admin' && selectedNgos.length > 0) {
        allocations.push(...selectedNgos.map(id => ({ ngo_id: id, salary_portion: 0 })));
      }
      const clientNgo = ngos.find(n => (n.name || '').trim().toUpperCase() === String(client).toUpperCase());
      if (clientNgo) allocations.push({ ngo_id: clientNgo.id, salary_portion: 0 });
      if (allocations.length > 0) body.allocations = allocations;
      const res = await addWorker(body);
      setCreated(res.worker);
      setName('');
      setDept(DEPTS?.[0] || '');
      setSelectedNgos([]);
      setIsTest(false);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const handlePagarExport = async () => {
    const today = new Date();
    const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setPagarMonth(defaultMonth);
    setShowPagarModal(true);
  };

  // In salary mode these four buttons live on the page's top strip next to
  // Manage Teams (AccountsPanel) instead of the card head. The strip can't
  // reach this component's state directly, so the handlers are handed up
  // once — through a ref that always holds the latest closures, so stale
  // captures (an empty targetMap on first render) never leak out. HR keeps
  // the same buttons down in the card head.
  const actionsRef = useRef(null);
  actionsRef.current = {
    downloadFroTargets,
    openAttExport: () => { setAttExportMonth(istMonthKey()); setShowAttExportModal(true); },
    openPagar: handlePagarExport,
    openCompensations: () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      setCompensationMonth(pagarMonth || currentMonth);
      setShowCompensationModal(true);
    },
  };
  useEffect(() => {
    if (!onActionsReady) return undefined;
    onActionsReady({
      downloadFroTargets: (...a) => actionsRef.current?.downloadFroTargets(...a),
      openAttExport: (...a) => actionsRef.current?.openAttExport(...a),
      openPagar: (...a) => actionsRef.current?.openPagar(...a),
      openCompensations: (...a) => actionsRef.current?.openCompensations(...a),
    });
    return () => onActionsReady(null);
  }, [onActionsReady]);

  const doPagarExport = async (month) => {
    try {
      const data = await api('/salary/pagar-export?month=' + month, { _prefix: 'ucs' });
      if (!data.rows || data.rows.length === 0) { alert('No payroll data for this month'); return; }

      const rows = data.rows;
      const daysInMonth = data.days_in_month || new Date(Date.UTC(new Date(month + '-01').getFullYear(), new Date(month + '-01').getMonth() + 1, 0)).getUTCDate();
      const monthDate = new Date(month + '-01');
      const monthName = monthDate.toLocaleString('default', { month: 'long' });
      const year = monthDate.getFullYear();

      // Column indices (0-based)
      const COL = {
        NAME: 0, NGO: 1, STATUS: 2, HOLD: 3, DOCS: 4, AC_HOLDER: 5, AC_REL: 6, BANK: 7, AC_NUM: 8, IFSC: 9, STATION: 10, DOJ: 11, SALARY: 12,
        TARGET: 13, TOTAL_ACH: 14, BSCT_ACH: 15, AFLF_ACH: 16, MANN_ACH: 17,
        BALANCE: 18, ACH_PCT: 19,
        PRES_DAYS: 20, ABSENT_DAYS: 21, HALF_DAYS: 22, LATE_DED: 23, SUN_DED: 24, TRAIN_DED: 25, NET_PRES: 26,
        MONTH_SAL: 27, INCENT_10: 28, TOTAL_AKI: 29, AKI: 30, GROSS: 31,
        OT: 32, PENDING: 33, ADVANCE: 34, NET_PAY: 35,
        COMP_SUN: 36, COMP_HOLIDAY: 37, REQUIRED_SUN: 38, IDLE_HRS: 39,
        FIRST_DAY_COL: 40
      };
      const TOTAL_LATE_COL = COL.FIRST_DAY_COL + daysInMonth;
      COL.TOTAL_LATE = TOTAL_LATE_COL;
      const TOTAL_COLS = TOTAL_LATE_COL + 1;

      const headers = [
        'Agent Name', 'NGO', 'Status', 'Hold / Released', 'Documents Submitted or Missing', 'Account Holder Name', 'Account Holder Relation',
        'Bank Name', 'Bank Account Number', 'IFSC Code', 'STATION', 'Date of Joining', 'Salary',
        'New Target', 'Total Achieved', 'BSCT Achieved', 'AFLF Achieved', 'Mann Achieved',
        'Balance', 'Achieved %',
        `${monthName} Present Days`, 'Absent Days', 'Half Days', 'Late Deduction', 'Sunday Deduction', 'Training Deduction', `Net ${monthName} Present Days`,
        `${monthName} Salary`, 'Monthly 10% Incentive', 'Total AKI', 'Aaj Ka Incentive (Daily 50% for PC)',
        'Gross Payable Salary',
        'OT/Appreciation/Extra Incentive', 'Any Pending Salary Paid for Previous Month',
        `Advance need to be deducted in ${monthName}, ${year}`, 'Net Payable Salary',
        'Compensatory Sunday', 'Compensated Holiday', 'Required Sunday Worked',
        // FRO idle for the month, summed from the daily disposition-timer
        // snapshots. Nil for non-FRO roles — the timer only runs for FROs.
        'Idle Time (Hrs)',
        ...Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(year, monthDate.getMonth(), i + 1);
          return d.toLocaleString('default', { day: '2-digit', month: 'short' });
        }),
        'Total Late Minutes'
      ];

      const wsData = [headers];
      const rowStyles = [];
      let activeFroCount = 0, mgmtCount = 0, hrCount = 0, abscondCount = 0;
      const CATEGORY_ORDER = ['Pg', 'Library', 'Suspense'];

      // JS accumulators so every subtotal / the Grand Total is an exact literal
      // (independent of Excel formula quirks like SUMIF wildcards or recalc).
      const makeSums = () => ({
        salary: 0, target: 0, achieved: 0, bsct: 0, aflf: 0, mann: 0,
        gross_present_days: 0, absent_days: 0, half_days: 0, late_deduction_days: 0, sunday_deduction_days: 0, training_deduction_days: 0, month_salary: 0, total_late_minutes: 0,
        compensatory_work_days: 0, compensated_holiday_days: 0, required_sunday_worked_days: 0,
        monthly_incentive: 0, total_aki: 0, aki_payout: 0, advance_deduction: 0,
        net_payable: 0, idle_hours: 0, daily: {}
      });
      const addSum = (sum, r) => {
        sum.salary += r.salary || 0;
        sum.target += r.target || 0;
        sum.achieved += r.achieved || 0;
        sum.bsct += r.achieved_bsct || 0;
        sum.aflf += r.achieved_aflf || 0;
        sum.mann += r.achieved_mann || 0;
        sum.gross_present_days += r.gross_present_days || 0;
        sum.absent_days += r.absent_days || 0;
        sum.half_days += r.half_days || 0;
        sum.late_deduction_days += r.late_deduction_days || 0;
        sum.total_late_minutes += r.total_late_minutes || 0;
        sum.sunday_deduction_days += r.sunday_deduction_days || 0;
        sum.training_deduction_days += r.training_deduction_days || 0;
        sum.idle_hours += (r.idle_seconds || 0) / 3600;
        sum.compensatory_work_days += r.compensatory_work_days || 0;
        sum.compensated_holiday_days += r.compensated_holiday_days || 0;
        sum.required_sunday_worked_days += r.required_sunday_worked_days || 0;
        sum.month_salary += r.month_salary || 0;
        sum.monthly_incentive += r.monthly_incentive || 0;
        sum.total_aki += r.total_aki || 0;
        sum.aki_payout += r.aki_payout || 0;
        sum.advance_deduction += r.advance_deduction || 0;
        sum.net_payable += r.net_payable || 0;
        const daily = r.daily || {};
        for (let d = 1; d <= daysInMonth; d++) {
          if (!sum.daily[d]) sum.daily[d] = 0;
          sum.daily[d] += daily[d] || 0;
        }
      };
      const froSums = makeSums(), mgmtSums = makeSums(), hrSums = makeSums(), abscondSums = makeSums();
      const catSumsByLabel = {};
      for (const label of CATEGORY_ORDER) catSumsByLabel[label] = makeSums();
      const grandSums = makeSums();
      const accAny = (sum, r) => { addSum(sum, r); addSum(grandSums, r); };

      for (const r of rows) {
        const daily = r.daily || {};
        const dailyArr = Array.from({ length: daysInMonth }, (_, i) => daily[i + 1] || 0);
        const row = [
          r.name,
          r.ngo || '',
          r.status || '',
          (r.salary_status || 'released').toUpperCase(),
          r.documents_status || '',
          r.account_holder_name || '',
          r.account_holder_relation || '',
          r.bank_name || '',
          r.account_number || '',
          r.ifsc_code || '',
          r.station || '',
          r.doj ? (() => { const d = r.doj.split('-'); return `${d[2]}-${d[1]}-${d[0]}`; })() : '',
          r.salary || 0,
          r.target || 0,
          r.achieved || 0,
          r.achieved_bsct || 0,
          r.achieved_aflf || 0,
          r.achieved_mann || 0,
          null, // Balance formula
          null, // Achieved % formula
          r.gross_present_days || 0,
          r.absent_days || 0,
          r.half_days || 0,
          r.late_deduction_days || 0,
          r.sunday_deduction_days || 0,
          r.training_deduction_days || 0,
          null, // Net Present Days formula
          null, // Month Salary formula
          r.monthly_incentive || 0,
          r.total_aki || 0,
          r.aki_payout || 0,
          null, // Gross formula
          0,    // OT (manual)
          0,    // Pending (manual)
          r.advance_deduction || 0,
          null, // Net Payable formula
          r.compensatory_work_days || 0,
          r.compensated_holiday_days || 0,
          r.required_sunday_worked_days || 0,
          Math.round(((r.idle_seconds || 0) / 3600) * 100) / 100,
          ...dailyArr,
          r.total_late_minutes || 0
        ];
        wsData.push(row);
        const met = (r.target || 0) > 0 && (r.achieved || 0) >= r.target;
        rowStyles.push(met ? { fill: { fgColor: { rgb: 'C6EFCE' } }, font: { color: { rgb: '006100' } } } : null);
        const isActive = r.status === 'ACTIVE';
        const isAbscond = r.status === 'ABSCONDED' || r.status === 'ABSCOND';
        const isFro = r.department === 'FRO';
        const isMgmt = ['Digital', 'Admin', 'NGO Admin', 'Event Manager', 'Housekeeping'].includes(r.department);
        const isHr = ['HR', 'HR-Recruiter'].includes(r.department);

        if (isActive && isFro) { activeFroCount++; accAny(froSums, r); }
        else if (isActive && isMgmt) { mgmtCount++; accAny(mgmtSums, r); }
        else if (isActive && isHr) { hrCount++; accAny(hrSums, r); }
        else if (isAbscond) { abscondCount++; accAny(abscondSums, r); }
        else if (r.status === 'CATEGORY') { accAny(catSumsByLabel[r.name] || makeSums(), r); }
      }

      // Build a totals row from JS-accumulated sums (exact literal values).
      // All subtotals AND the Grand Total use this, so the exported numbers are
      // final regardless of Excel formula recalculation.
      const buildTotalRow = (label, sum) => {
        const balance = sum.target > 0 ? sum.target - sum.achieved : null;
        const netPres = sum.gross_present_days + sum.half_days - sum.late_deduction_days - sum.sunday_deduction_days - sum.training_deduction_days;
        const gross = sum.month_salary + sum.monthly_incentive + sum.aki_payout;
        const row = [label];
        for (let c = 1; c < TOTAL_COLS; c++) {
          if (c === COL.SALARY) row.push(sum.salary);
          else if (c === COL.TARGET) row.push(sum.target);
          else if (c === COL.TOTAL_ACH) row.push(sum.achieved);
          else if (c === COL.BSCT_ACH) row.push(sum.bsct);
          else if (c === COL.AFLF_ACH) row.push(sum.aflf);
          else if (c === COL.MANN_ACH) row.push(sum.mann);
          else if (c === COL.BALANCE) row.push(balance);
          else if (c === COL.ACH_PCT) row.push(null);
          else if (c === COL.PRES_DAYS) row.push(sum.gross_present_days);
          else if (c === COL.ABSENT_DAYS) row.push(sum.absent_days);
          else if (c === COL.HALF_DAYS) row.push(sum.half_days);
          else if (c === COL.LATE_DED) row.push(sum.late_deduction_days);
          else if (c === COL.SUN_DED) row.push(sum.sunday_deduction_days);
          else if (c === COL.TRAIN_DED) row.push(sum.training_deduction_days);
          else if (c === COL.NET_PRES) row.push(netPres);
          else if (c === COL.MONTH_SAL) row.push(sum.month_salary);
          else if (c === COL.INCENT_10) row.push(sum.monthly_incentive);
          else if (c === COL.TOTAL_AKI) row.push(sum.total_aki);
          else if (c === COL.AKI) row.push(sum.aki_payout);
          else if (c === COL.GROSS) row.push(gross);
          else if (c === COL.OT) row.push(0);
          else if (c === COL.PENDING) row.push(0);
          else if (c === COL.ADVANCE) row.push(sum.advance_deduction);
          else if (c === COL.NET_PAY) row.push(sum.net_payable);
          else if (c === COL.COMP_SUN) row.push(sum.compensatory_work_days);
          else if (c === COL.COMP_HOLIDAY) row.push(sum.compensated_holiday_days);
          else if (c === COL.REQUIRED_SUN) row.push(sum.required_sunday_worked_days);
          else if (c === COL.IDLE_HRS) row.push(Math.round(sum.idle_hours * 100) / 100);
          else if (c === COL.TOTAL_LATE) row.push(sum.total_late_minutes);
          else if (c >= COL.FIRST_DAY_COL && c < COL.TOTAL_LATE) row.push(sum.daily[c - COL.FIRST_DAY_COL + 1] || 0);
          else row.push(null);
        }
        wsData.push(row);
      };

      // Subtotals for each section (only when the section has rows)
      if (activeFroCount > 0) buildTotalRow('Active FRO Total', froSums);
      if (mgmtCount > 0) buildTotalRow('Management Total', mgmtSums);
      if (hrCount > 0) buildTotalRow('HR Total', hrSums);
      if (abscondCount > 0) buildTotalRow('Absconded Total', abscondSums);
      // A separate total line per category (Pg / Library / Suspense)
      for (const label of CATEGORY_ORDER) {
        if (catSumsByLabel[label]) {
          buildTotalRow(`${label} Total`, catSumsByLabel[label]);
        }
      }
      buildTotalRow('Grand Total', grandSums);

      // Apply formulas for data rows
      for (let i = 1; i < 1 + rows.length; i++) {
        const row = i + 1; // 1-indexed
        const colLetter = (c) => XLSX.utils.encode_col(c);
        // Balance = Target - Total Achieved (blank for target-less rows like
        // category / Anjana FRO / Priyank Shah so they don't show negatives)
        if ((rows[i - 1]?.target || 0) > 0) {
          wsData[i][COL.BALANCE] = { f: `${colLetter(COL.TARGET)}${row}-${colLetter(COL.TOTAL_ACH)}${row}` };
        } else {
          wsData[i][COL.BALANCE] = null;
        }
        // Achieved % = Total Achieved / Target * 100
        wsData[i][COL.ACH_PCT] = { f: `IF(${colLetter(COL.TARGET)}${row}>0,${colLetter(COL.TOTAL_ACH)}${row}/${colLetter(COL.TARGET)}${row}*100,0)` };
        // Net Present Days = Present + half-day credit - deductions.
        // Absent Days is displayed separately and is not deducted twice.
        wsData[i][COL.NET_PRES] = { f: `${colLetter(COL.PRES_DAYS)}${row}+${colLetter(COL.HALF_DAYS)}${row}-${colLetter(COL.LATE_DED)}${row}-${colLetter(COL.SUN_DED)}${row}-${colLetter(COL.TRAIN_DED)}${row}` };
        // Month Salary = Salary / DaysInMonth * Net Present Days
        wsData[i][COL.MONTH_SAL] = { f: `${colLetter(COL.SALARY)}${row}/${daysInMonth}*${colLetter(COL.NET_PRES)}${row}` };
        // Gross = Month Salary + 10% Incentive + AKI
        wsData[i][COL.GROSS] = { f: `${colLetter(COL.MONTH_SAL)}${row}+${colLetter(COL.INCENT_10)}${row}+${colLetter(COL.AKI)}${row}` };
        // Net Payable = max(0, Gross + OT + Pending - Advance)
        wsData[i][COL.NET_PAY] = { f: `MAX(0,${colLetter(COL.GROSS)}${row}+${colLetter(COL.OT)}${row}+${colLetter(COL.PENDING)}${row}-${colLetter(COL.ADVANCE)}${row})` };
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Apply achievement-progress colour gradient to each data row
      for (let i = 0; i < rowStyles.length; i++) {
        if (!rowStyles[i]) continue;
        const excelRow = i + 2;
        for (let c = 0; c < TOTAL_COLS; c++) {
          const addr = `${XLSX.utils.encode_col(c)}${excelRow}`;
          if (ws[addr]) ws[addr].s = rowStyles[i];
        }
      }

      // Column widths
      const colWidths = [
        { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 18 },
        { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 12 },
        { wch: 12 },
        { wch: 18 }, { wch: 14 }, { wch: 14 },
        { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
        { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 24 },
        { wch: 22 },
        { wch: 22 }, { wch: 26 },
        { wch: 22 }, { wch: 20 },
        { wch: 18 }, { wch: 18 }, { wch: 20 },
        { wch: 12 },
        { wch: 14 }, // Idle Time (Hrs)
        ...Array.from({ length: daysInMonth }, () => ({ wch: 10 })),
        { wch: 14 } // Total Late Minutes
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, monthName);
      const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `${monthName} ${year} Salary File.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);

      setShowPagarModal(false);
    } catch (e) { alert(e.message); }
  };

  const handleOffboard = (e, worker) => {
    e.stopPropagation();
    if (onOffboard) onOffboard(worker);
  };

  const handleToggleTest = async (e, worker) => {
    e.stopPropagation();
    try {
      await updateWorker(worker.id, { is_test: !worker.is_test });
      reload();
    } catch (err) { console.error('Error:', err.message); alert('Could not update test status: ' + (err && err.message ? err.message : 'unknown error')); }
  };

  const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return str || '';
    return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  };

  const handleExportAll = async () => {
    try {
      const list = await api('/workers', { _prefix: 'ucs' });
      if (!list || list.length === 0) { alert('No workers to export'); return; }
      const full = await Promise.all(list.map(w => api('/workers/' + w.id, { _prefix: 'ucs' }).catch((err) => { console.error('Error:', err.message); })));
      const data = full.filter(Boolean);

      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let allocByWorker = {};
      let peopleByWorker = {};
      try {
        const rep = await api('/ngo-allocations/report/ngo-salary?month=' + month, { _prefix: 'ucs' });
        for (const r of (rep && rep.rows) || []) {
          if (!allocByWorker[r.worker_id]) allocByWorker[r.worker_id] = [];
          allocByWorker[r.worker_id].push(r);
        }
      } catch (e) { console.error('Error:', e.message); }
      try {
        await Promise.all(data.map(async w => {
          try {
            peopleByWorker[w.id] = await api('/ngo-allocations/workers/' + w.id + '/people', { _prefix: 'ucs' });
          } catch (e) { /* ignore per-worker people fetch errors */ }
        }));
      } catch (e) { console.error('Error:', e.message); }

      const famKeys = ['name', 'relationship', 'occupation', 'phone'];

      const eduNorm = (e) => ({ degree: toTitleCase(e.degree), institution: toTitleCase(e.institution), university: toTitleCase(e.university), year_of_passing: e.year_of_passing || e.year, percentage: e.percentage });
      const famNorm = (f) => ({ name: toTitleCase(f.name), relationship: toTitleCase(f.relationship), occupation: toTitleCase(f.occupation), phone: f.phone });
      const orgNorm = (o) => ({ name: toTitleCase(o.name || o.organization_name), role: toTitleCase(o.role || o.designation), from_year: o.from_year || o.fromYear, to_year: o.to_year || o.toYear, salary: o.salary });

      const eduHeader = { degree: 'Degree', institution: 'Institution', university: 'University', year_of_passing: 'Year of Passing', percentage: 'Percentage' };
      const famHeader = { name: 'Name', relationship: 'Relationship', occupation: 'Occupation', phone: 'Phone' };
      const orgHeader = { name: 'Name', role: 'Role', from_year: 'From Year', to_year: 'To Year', salary: 'Salary' };

      const maxFam = Math.max(...data.map(w => (w.family || w.family_details || []).length));

      const rows = data.map(w => {
        const eduArr = w.education || w.education_details || [];
        const firstEdu = eduArr.length > 0 ? eduNorm(eduArr[0]) : {};
        const fam = (w.family || w.family_details || []).map(famNorm);
        const orgArr = w.previous_organizations || [];
        const firstOrg = orgArr.length > 0 ? orgNorm(orgArr[0]) : {};

        const corrParts = [
          toTitleCase(w.correspondence?.address || w.address),
          toTitleCase(w.correspondence?.city || w.city),
          toTitleCase(w.correspondence?.state || w.state),
          w.correspondence?.pincode || w.pincode,
        ].filter(Boolean);

        const row = {
          Name: toTitleCase(w.name),
          Email: w.email,
          'Login ID': w.login_id,
          Department: deptLabel(w.department),
          NGO: clientOf(w),
          'NGO Allocation %': (peopleByWorker[w.id] || []).map(p => `${p.ngos?.name || ''}: ${parseFloat(p.allocation_percentage || 0)}%`).join('; '),
          'Total Salary (₹)': w.salary,
          'NGO Salary Amount (₹)': (allocByWorker[w.id] || []).map(a => `${a.ngo_name}: ${parseFloat(a.allocation_amount || 0).toLocaleString('en-IN')}`).join('; '),
          'Salary Month': (allocByWorker[w.id] || [])[0]?.salary_month || month,
          'Payment Status': (allocByWorker[w.id] || []).map(a => `${a.ngo_name}: ${a.payment_status}`).join('; ') || 'unpaid',
          Gender: toTitleCase(w.gender),
          DOB: w.dob,
          Phone: w.phone,
          'Alternate Phone': w.alternate_phone,
          Address: toTitleCase(w.address),
          City: toTitleCase(w.city),
          State: toTitleCase(w.state),
          Pincode: w.pincode,
          'Father/Husband Name': toTitleCase(w.father_husband_name),
          'Marital Status': toTitleCase(w.marital_status),
          'PAN Number': w.pan_number,
          'Aadhar Number': w.aadhar_number,
          'Account Holder Name': toTitleCase(w.account_holder_name),
          'Bank Name': toTitleCase(w.bank_name),
          'IFSC Code': w.ifsc_code,
          'Account Number': w.account_number,
          Correspondence: corrParts.join(', '),
          Salary: w.salary,
        };

        for (const field of Object.keys(eduHeader)) row[eduHeader[field]] = firstEdu[field] || '';
        for (let i = 0; i < maxFam; i++) {
          const f = fam[i] || {};
          row[`Family/Ref Entry ${i + 1}`] = i + 1;
          for (const field of famKeys) row[`Family/Ref Entry ${i + 1} ${famHeader[field]}`] = f[field] || '';
        }
        for (const field of Object.keys(orgHeader)) row[`Previous Org ${orgHeader[field]}`] = firstOrg[field] || '';

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Workers');
      const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `workers-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-head">
          <h3 style={{ width:'100%' }}>{showAddForm ? 'Add a volunteer' : 'Volunteers by NGO'}</h3>
          <div style={{ display:'flex', alignItems:'center', gap:'8px 16px', flexWrap:'wrap', width:'100%' }}>
            {showAddForm && <span className="sub" style={{ fontWeight:600 }}>Volunteers by NGO</span>}
            <div style={{ display:'flex', height:12, borderRadius:6, overflow:'hidden', background:'var(--line)', width:180 }}>
              {CLIENTS.map(c => clientCounts[c] > 0 ? (
                <div key={c} style={{ width: clientPct(c) + '%', background: CLIENT_COLORS[c], minWidth: 2 }}
                  title={`${c}: ${clientCounts[c]} (${clientPct(c)}%)`} />
              ) : null)}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0 14px', fontSize:12 }}>
              {CLIENTS.map(c => (
                <span key={c} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background: CLIENT_COLORS[c] }} />
                  {c}: <strong>{clientCounts[c]}</strong> ({clientPct(c)}%)
                </span>
              ))}
            </div>
            {clientTotal === 0 && <span style={{ fontSize:12, color:'var(--ink-soft)' }}>No volunteers yet.</span>}
          </div>
        </div>
        {showAddForm && (
        <div className="card-pad">
          <div className="form-row" style={{ flexDirection:'row', flexWrap:'wrap' }}>
            <label className="field" style={{ flex:2 }}>Full name
              <input value={name} onChange={e=>{ setName(e.target.value); setNameErr(/\d/.test(e.target.value) ? 'Invalid name' : ''); }} placeholder="Jane Doe"
                onKeyDown={e=>e.key==='Enter'&&submit()} />
              {nameErr && <span style={{ color:'var(--danger)', fontSize:12, marginTop:2, display:'block' }}>{nameErr}</span>}
            </label>
            <label className="field">Team
              <Dropdown value={dept} onChange={e=>{ setDept(e.target.value); setSelectedNgos([]); }} options={DEPTS.map(d => ({ value: d, label: deptLabel(d) }))} />
            </label>
            <label className="field">Client
              <Dropdown value={client} onChange={e=>setClient(e.target.value)} options={CLIENTS} />
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'var(--ink)', cursor:'pointer', alignSelf:'flex-end', paddingBottom:10 }}>
              <input type="checkbox" checked={isTest} onChange={e=>setIsTest(e.target.checked)} />
              Test member
            </label>
          </div>
          {dept === 'NGO Admin' && ngos.length > 0 && (
            <div className="form-row" style={{ marginTop:8 }}>
              <label className="field">Assign NGOs
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                  {ngos.map(n => {
                    const active = selectedNgos.includes(n.id);
                    return (
                      <span key={n.id} onClick={() => setSelectedNgos(prev =>
                        prev.includes(n.id) ? prev.filter(id => id !== n.id) : [...prev, n.id]
                      )} style={{
                        padding:'4px 12px', borderRadius:20, fontSize:13, cursor:'pointer',
                        border:'1px solid var(--line)',
                        background: active ? '#5B6B4E' : 'var(--paper)',
                        color: active ? '#fff' : 'var(--ink)',
                        fontWeight: active ? 600 : 400,
                        userSelect:'none', transition:'all .15s',
                      }}>{n.name}</span>
                    );
                  })}
                </div>
                {selectedNgos.length === 0 && <span style={{ fontSize:12, color:'var(--ink-soft)', marginTop:4, display:'block' }}>Select at least one NGO</span>}
              </label>
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
            <button className="btn btn-primary" onClick={submit}><Plus width={16}/> Add volunteer</button>
          </div>
          {err && <div style={{ color:'var(--danger)', fontSize:13, marginTop:8 }}>{err}</div>}
          {created && (
            <div style={{ background:'#e8f5e9', padding:'10px 14px', borderRadius:8, marginTop:8, fontSize:13, lineHeight:1.7 }}>
              <strong>{created.name}</strong> added<br/>
              Login ID: <code style={{ background:'#c8e6c9', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{created.login_id}</code><br/>
              Password: <code style={{ background:'#c8e6c9', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{created.generated_password}</code>
            </div>
          )}
        </div>
        )}
      </div>

      {salaryMode && (
        <>
          <style>{`
            @keyframes tfSpin { to { transform: rotate(360deg); } }
            .tf-tile { cursor: pointer; transition: box-shadow .15s ease, border-color .15s ease, transform .15s ease; }
            .tf-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,.08); }
            .tf-select { appearance: none; -webkit-appearance: none; padding: 7px 28px 7px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; font-weight: 600; font-family: inherit; color: var(--ink); cursor: pointer; outline: none; background: #fff url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center; }
            .tf-select:hover { border-color: #9ca3af; }
            .tf-select:focus { border-color: var(--sage); box-shadow: 0 0 0 3px var(--sage-soft); }
            .target-input { -moz-appearance: textfield; }
            .target-input::-webkit-outer-spin-button, .target-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .target-input:focus { border-color: var(--sage); box-shadow: 0 0 0 3px var(--sage-soft); outline: none; }
            .status-filter { width: 150px; }
            .org-filter { width: 160px; }
            .role-filter { width: 175px; }
            .status-filter .dropdown-trigger { padding: 8px 12px; font-size: 13.5px; }
            .org-filter .dropdown-trigger, .role-filter .dropdown-trigger { padding: 8px 12px; font-size: 13.5px; }
            .status-filter .dropdown-menu { max-height: none; overflow: visible; }
            .org-filter .dropdown-menu, .role-filter .dropdown-menu { min-width: 240px; }
            .status-filter .dropdown-item { padding: 11px 14px; font-size: 14px; }
            .wf-table thead th { background: var(--sand); }
          `}</style>

          {teamMsg && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>{teamMsg}</div>
          )}
          {teamErr && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{teamErr}</div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:12, marginBottom: needsTargetCount > 0 || unassignedFroNames.length > 0 ? 14 : 0 }}>
          {needsTargetCount > 0 && (
            <div style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--line)', background:'var(--sand)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:700, fontSize:13, color:'var(--ink)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color:'var(--ink-soft)', flexShrink:0 }}>
                  <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>
                  <path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
                </svg>
                <span>{needsTargetCount} FRO{needsTargetCount === 1 ? '' : 's'} still {needsTargetCount === 1 ? 'has' : 'have'} no target · {fmtMonthShort(istMonthKey())}</span>
              </div>
              <div style={{ marginTop:3, fontSize:12, color:'var(--ink-soft)' }}>
                Set one so their incentive and leaderboard rank calculate.
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:9 }}>
                {needsTargetNames.map(n => (
                  <span key={n} style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:6, background:'var(--paper)', border:'1px solid var(--line)', color:'var(--ink)' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
          {unassignedFroNames.length > 0 && (
            <div style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--line)', background:'var(--sage-soft)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:700, fontSize:13, color:'var(--ink)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--ink-soft)', flexShrink:0 }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>{unassignedFroNames.length} FRO{unassignedFroNames.length === 1 ? '' : 's'} {unassignedFroNames.length === 1 ? 'is' : 'are'} not in any team</span>
              </div>
              <div style={{ marginTop:3, fontSize:12, color:'var(--ink-soft)' }}>
                Assign a team with the dropdown below.
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:9 }}>
                {unassignedFroNames.map(n => (
                  <span key={n} style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:6, background:'var(--paper)', border:'1px solid var(--line)', color:'var(--ink)' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
          </div>

          {teamOverview.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '4px 0', marginBottom: 14 }}>
              {teamOverview.map(t => {
                const st = teamTs(t.label);
                const pct = activeFros.length ? Math.round((t.count / activeFros.length) * 100) : 0;
                const active = teamFilter === t.key;
                return (
                  <div key={t.key} className="stat-card tf-tile" onClick={() => setTeamFilter(active ? '' : t.key)}
                    title="Click to filter the table below"
                    style={{ width: 200, maxWidth: '100%', boxSizing: 'border-box', border: active ? '2px solid var(--sage)' : undefined }}>
                    <div className="stat-icon" style={{ background: st.bg, color: st.fg }}>
                      {t.label === 'No Team' ? '—' : t.label.slice(-1)}
                    </div>
                    <div className="stat-info">
                      <div className="stat-lbl" style={{ fontSize: 12 }}>{t.label}</div>
                      <div className="stat-num" style={{ fontSize: 20 }}>{t.count}</div>
                      <div className="stat-sub">{pct}% of active FROs</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="card" ref={tableRef}>
        <div className="card-head"><h3>{title}</h3>
          <div className="search-input-wrap">
            {/* Download Targets + Export Excel moved to the top strip (see
                onActionsReady above); Salary File and Compensations go there
                too in salary mode and stay here for HR. */}
            {showNgoSalary && <button className="btn btn-primary btn-sm" onClick={() => setShowNgoModal(true)} title="Manage NGO allocations, reports and payments">NGO & Salary</button>}
            {showPagarExport && !salaryMode && <button className="btn btn-primary btn-sm" onClick={handlePagarExport} title="Download Salary File (July format)">Salary File</button>}
            {showPagarExport && !salaryMode && <button className="btn btn-outline btn-sm" onClick={() => {
              const currentMonth = new Date().toISOString().slice(0, 7);
              setCompensationMonth(pagarMonth || currentMonth);
              setShowCompensationModal(true);
            }} title="Manage compensatory Sundays and holidays">Compensations</button>}
            {showPayExports && <button className="btn btn-outline btn-sm" onClick={handleExportAll} title="Export all worker data to Excel">Export All</button>}
            {!salaryMode && <span className="sub">{filtered.length} total</span>}
            <Dropdown className="org-filter" value={entityFilter} onChange={e=>setEntityFilter(e.target.value)} options={['All', ...CLIENTS]} renderValue={clipValue('All')} />
            <Dropdown className="role-filter" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}
              options={[{value:'',label:'All members'}, ...roles.map(r => ({value:r, label:deptLabel(r)}))]} renderValue={clipValue('All members')} />
            <Dropdown className="status-filter" value={statusFilter} onChange={e=>{ setStatusFilter(e.target.value); save({ statusFilter: e.target.value }); }}
              renderValue={clipValue('Active')}
              options={[
                {value:'active', label:'Active'},
                {value:'absconded', label:'Absconded'},
                {value:'offboarded', label:'Offboarded'},
                {value:'all', label:'All'},
              ]} />
            {!salaryMode && (
            <button className={`btn btn-sm ${showTest ? 'btn-primary' : 'btn-outline'}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}
              onClick={()=>{ const v = !showTest; setShowTest(v); save({ showTest: v }); }}
              title={showTest ? 'Hide test member accounts' : 'Show test member accounts (they stay excluded from stats)'}>
              <Flask width={14}/> {showTest ? 'Hide test' : 'Show test'}
            </button>
            )}
            <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by name, email, or team…"
              style={{ marginTop:0, maxWidth:200 }} />
          </div>
        </div>
        {/* The hidden/visible salary status bar is HR-only; in salary mode the
            Unlock/Hide control lives on the page's top strip instead. */}
        {!salaryMode && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          marginBottom: 12, padding: '8px 14px', borderRadius: 8,
          background: isSalaryUnlocked ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${isSalaryUnlocked ? '#bbf7d0' : '#fef08a'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: isSalaryUnlocked ? '#166534' : '#92400e' }}>
              {isSalaryUnlocked ? 'Salary visible' : 'Salaries hidden (XXX)'}
            </span>
            <span style={{ fontSize: 11, color: isSalaryUnlocked ? '#15803d' : '#b45309' }}>
              {isSalaryUnlocked ? 'Entering the access code anywhere unlocks salary for this session.' : 'Enter your access code to view salary figures.'}
            </span>
          </div>
          {isSalaryUnlocked ? (
            <button className="btn btn-sm btn-outline" onClick={lockSalary} style={{ fontSize: 11, padding: '4px 12px', background: '#fff' }}>
              🔒 Hide Salary
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => promptUnlock()} style={{ fontSize: 11, padding: '5px 14px', background: 'var(--sage)', color: '#fff', border: 'none', fontWeight: 600 }}>
              🔓 Unlock Salary
            </button>
          )}
        </div>
        )}
        <table className="wf-table">
          <thead><tr><th>Name</th>{salaryMode && <th style={{ width:92 }}>Status</th>}<th>NGO</th>
            {!salaryMode && <><th>Emp ID</th><th>Joined</th></>}
            {salaryMode && <><th>Team</th><th>Target</th><th>Source</th></>}
            <th>Salary</th><th>Documents</th>{!salaryMode && <th>Status</th>}<th></th></tr></thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} aria-hidden="true">
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="sk" style={{ width:36, height:36, borderRadius:'50%', flexShrink:0 }} />
                        <div>
                          <div className="sk" style={{ width:120, height:14, marginBottom:6, borderRadius:4 }} />
                          <div className="sk" style={{ width:70, height:11, borderRadius:4 }} />
                        </div>
                      </div>
                    </td>
                    {salaryMode && <td><div className="sk" style={{ width:56, height:18, borderRadius:4 }} /></td>}
                    <td><div className="sk" style={{ width:52, height:18, borderRadius:10 }} /></td>
                  {!salaryMode && (
                    <>
                      <td><div className="sk" style={{ width:80, height:12, borderRadius:4 }} /></td>
                      <td><div className="sk" style={{ width:60, height:12, borderRadius:4 }} /></td>
                    </>
                  )}
                  {salaryMode && (
                    <>
                      <td><div className="sk" style={{ width:70, height:18, borderRadius:4 }} /></td>
                      <td><div className="sk" style={{ width:80, height:24, borderRadius:6 }} /></td>
                      <td><div className="sk" style={{ width:74, height:18, borderRadius:10 }} /></td>
                    </>
                  )}
                  <td><div className="sk" style={{ width:52, height:18, borderRadius:10 }} /></td>
                  <td><div className="sk" style={{ width:60, height:18, borderRadius:10 }} /></td>
                  <td style={{ textAlign:'right' }}><div className="sk" style={{ width:28, height:28, borderRadius:'50%', marginLeft:'auto' }} /></td>
                </tr>
              ))
            ) : (
              <>
                {visibleRows.map(w => {
                  const sw = salaryMap[w.id];
                  const paid = sw?.current_salary_paid;
                  const currentMonth = new Date().toISOString().slice(0, 7);
                  const salaryFromMonth = sw?.current_salary_from?.slice(0, 7);
                  const isCurrent = salaryFromMonth && salaryFromMonth <= currentMonth;
                  const empId = w.employee_id || empIdMap[w.id];
                  const statusLabel = w.employment_status === 'absconded' ? 'Absconded' : w.employment_status === 'offboarded' ? 'Offboarded' : 'Active';
                  return (
                    <tr key={w.id} className="clickable-row" onClick={() => { if (onSelect) onSelect(w); }}
                      style={{ cursor:'pointer' }}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <WhoWithPhoto name={w.name} role={deptLabel(w.department) || 'Team Member'} photo_url={w.photo_url} />
                          {isComplete(workerDetails[w.id] || w) && <Check size={16} style={{ color:'var(--sage)', flexShrink:0 }} title="All details filled" />}
                          {w.is_test && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:800, letterSpacing:'.5px', background:'#fef3c7', color:'#92400e', border:'1px solid #fcd34d', flexShrink:0 }}>TEST</span>}
                        </div>
                      </td>
                      {salaryMode && (
                        <td>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, fontWeight:600, display:'inline-block',
                            background: statusLabel === 'Absconded' ? '#fff3e0' : statusLabel === 'Offboarded' ? '#fce4ec' : '#e8f5e9',
                            color: statusLabel === 'Absconded' ? '#e65100' : statusLabel === 'Offboarded' ? '#c62828' : '#2e7d32' }}>
                            {statusLabel}
                          </span>
                        </td>
                      )}
                      <td>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, fontWeight:600, display:'inline-block', background:'#eef1f5', color:'#374151' }}>{clientOf(w)}</span>
                      </td>
                      {!salaryMode && (
                        <>
                          <td style={{ color:'var(--ink-soft)', fontWeight:500 }}>{empId ? empId.replace(/\D/g, '') : '—'}</td>
                          <td style={{ color:'var(--ink-soft)' }}>{new Date(w.created_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</td>
                        </>
                      )}
                      {salaryMode && (
                        <td onClick={e => e.stopPropagation()}>
                          {(w.department || '').trim().toLowerCase() === 'fro' ? (
                            <select
                              className="tf-select"
                              value={w.team || ''}
                              onChange={e => setWorkerTeam(w, e.target.value)}
                              title={`Assign team for ${w.name}`}
                              style={{ maxWidth:140 }}>
                              <option value="">No Team</option>
                              {teams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : <span style={{ color:'var(--ink-soft)', fontSize:12 }}>—</span>}
                        </td>
                      )}
                      {salaryMode && (
                        <td onClick={e => e.stopPropagation()}>
                          {(w.department || '').trim().toLowerCase() === 'fro' ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                              <span style={{ fontSize:12, fontWeight:600, color:'#6b7280' }}>₹</span>
                              <input
                                type="number" min="0" step="100"
                                className="target-input"
                                value={targetDrafts[w.id] !== undefined ? targetDrafts[w.id] : (targetMap[w.id]?.target ?? '')}
                                onChange={e => setTargetDrafts(d => ({ ...d, [w.id]: e.target.value }))}
                                onBlur={() => saveTarget(w)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') { setTargetDrafts(d => ({ ...d, [w.id]: String(targetMap[w.id]?.target ?? '') })); e.currentTarget.blur(); }
                                }}
                                placeholder="—"
                                title={`Collection target for ${istMonthKey()}${targetMap[w.id]?.target_source ? ' · ' + String(targetMap[w.id].target_source).replace(/_/g, ' ') : ''} — press Enter to save`}
                                style={{ width:92, padding:'5px 8px', fontSize:13, fontWeight:600, fontVariantNumeric:'tabular-nums', border:'1px solid var(--line)', borderRadius:6, background:'#fff', color:'var(--ink)', fontFamily:'inherit' }}
                              />
                              {targetSaving[w.id] && (
                                <span style={{ width:12, height:12, border:'2px solid var(--line)', borderTopColor:'var(--sage)', borderRadius:'50%', animation:'tfSpin .7s linear infinite', display:'inline-block', flexShrink:0 }} />
                              )}
                            </span>
                          ) : <span style={{ color:'var(--ink-soft)', fontSize:12 }}>—</span>}
                        </td>
                      )}
                      {salaryMode && (
                        <td onClick={e => e.stopPropagation()}>
                          {(w.department || '').trim().toLowerCase() === 'fro' && targetMap[w.id] ? (() => {
                            const src = targetMap[w.id];
                            const st = TARGET_SOURCE_STYLE[src.target_source] || TARGET_SOURCE_STYLE.not_set;
                            return (
                              <span title={targetSourceLabel(src)}
                                style={{ background: st.bg, color: st.color, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }}>
                                {targetSourceLabel(src)}
                              </span>
                            );
                          })() : <span style={{ color:'var(--ink-soft)', fontSize:12 }}>—</span>}
                        </td>
                      )}
                      <td>
                        {sw?.current_salary ? (
                          <span style={{ fontWeight:600 }}>
                            {formatSalary(sw.current_salary)}
                            {paid && <span className="pill pill-green" style={{ marginLeft:6, fontSize:10 }}>Paid</span>}
                          </span>
                        ) : <span style={{ color:'var(--ink-soft)', fontSize:12 }}>—</span>}
                      </td>
                      <td>
                        {w.documents_submitted ? (() => {
                          // Parsed and joined so the chip shows real names, never
                          // the raw JSON array string stored in the column.
                          const labels = joinDocumentLabels(
                            parseDocumentsValue(w.documents_value, w.documents_other).selected,
                            w.documents_other) || 'Yes';
                          return (
                          <span
                            title={`Documents submitted: ${labels}`}
                            style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:'50%', background:'#1a8d3a', flexShrink:0 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ display:'block' }}>
                                <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <span style={{ fontSize:11, color:'var(--ink-soft)', maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{labels}</span>
                          </span>
                          );
                        })() : (
                          <span title="Documents not submitted" style={{ fontSize:11, padding:'2px 8px', borderRadius:4, fontWeight:600, display:'inline-block', background:'#fce4ec', color:'#c62828' }}>
                            Missing
                          </span>
                        )}
                      </td>
                      {!salaryMode && (
                      <td>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, fontWeight:600, display:'inline-block',
                          background: w.employment_status === 'absconded' ? '#fff3e0' : w.employment_status === 'offboarded' ? '#fce4ec' : '#e8f5e9',
                          color: w.employment_status === 'absconded' ? '#e65100' : w.employment_status === 'offboarded' ? '#c62828' : '#2e7d32' }}>
                          {w.employment_status === 'absconded' ? 'Absconded' : w.employment_status === 'offboarded' ? 'Offboarded' : 'Active'}
                        </span>
                      </td>
                      )}
                      <td style={{ textAlign:'right' }}>
                        {!salaryMode && (
                          <button className="btn btn-icon" onClick={(e)=>handleToggleTest(e, w)} aria-label="Toggle test member"
                            title={w.is_test ? 'Unmark as test member' : 'Mark as test member (excluded from dashboard stats)'}
                            style={{ color: w.is_test ? '#b45309' : '#9ca3af' }}><Flask width={16}/></button>
                        )}
                        {!salaryMode && (
                          <button className="btn btn-icon" onClick={(e)=>handleOffboard(e, w)} aria-label="Offboard volunteer" style={{ color:'#dc2626' }}><Trash width={16}/></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={salaryMode ? 9 : 7}><div className="empty">No volunteers found.</div></td></tr>}
              </>
            )}
          </tbody>
        </table>
        {visibleCount < filtered.length && (
          <div style={{ display:'flex', justifyContent:'center', marginTop:14, marginBottom:6 }}>
            <button className="btn btn-outline" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              style={{ gap:10, padding:'9px 24px', borderRadius:8, fontWeight:600, fontSize:13, border:'1px solid var(--line)', boxShadow:'0 1px 3px rgba(16,24,40,.06)' }}>
              Load more <span style={{ fontSize:11, color:'var(--ink-soft)', fontWeight:700 }}>({filtered.length - visibleCount} more)</span>
            </button>
          </div>
        )}
      </div>
      {showNgoModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNgoModal(false); }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(1040px, calc(100vw - 40px))',
            maxHeight: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            borderRadius: 14,
            boxShadow: '0 12px 48px rgba(0,0,0,.15)',
            border: '1px solid var(--line)',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid var(--line)',
              flexShrink: 0
            }}>
              <h4 style={{ margin: 0, fontSize: 15 }}>NGO &amp; Salary</h4>
              <button onClick={() => setShowNgoModal(false)} style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: 'rgba(0,0,0,.08)', color: '#666', fontSize: 18,
                cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1
              }}>×</button>
            </div>
            {/* The page body scrolls inside the modal; NgoSalary renders its own
                nested modals (add/edit NGO) which paint over this one. */}
            <div style={{ padding: 16, overflow: 'auto', minHeight: 0 }}>
              <NgoSalary />
            </div>
          </div>
        </div>
      )}
     {showAttExportModal && (
       <div className="modal-overlay" onClick={() => setShowAttExportModal(false)}>
         <div onClick={e => e.stopPropagation()} style={{
           width: 360,
           background: '#ffffff',
           borderRadius: 14,
           boxShadow: '0 12px 48px rgba(0,0,0,.15)',
           border: '1px solid var(--line)',
           maxHeight: 'calc(100vh - 40px)',
           overflow: 'hidden'
         }}>
           <div style={{
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'space-between',
             padding: '14px 18px',
             borderBottom: '1px solid var(--line)'
           }}>
             <h4 style={{ margin: 0, fontSize: 15 }}>Export Attendance</h4>
             <button onClick={() => setShowAttExportModal(false)} style={{
               width: 28, height: 28, borderRadius: '50%', border: 'none',
               background: 'rgba(0,0,0,.08)', color: '#666', fontSize: 18,
               cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1
             }}>×</button>
           </div>
           <div style={{ padding: 20 }}>
             <p style={{ marginBottom: 16, color: 'var(--ink-soft)' }}>Select which month's attendance sheet to export (defaults to the current month):</p>
             <input type="month" className="input" value={attExportMonth} max={istMonthKey()}
               onChange={e => setAttExportMonth(e.target.value)}
               style={{ width: '100%', padding: '10px 12px', marginBottom: 16, fontSize: 14 }} />
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
               <button className="btn btn-outline" onClick={() => setShowAttExportModal(false)}>Cancel</button>
               <button className="btn btn-primary" onClick={() => { doAttExport(); }}>Download</button>
             </div>
           </div>
         </div>
       </div>
     )}
     {showPagarModal && (
      <div className="modal-overlay" onClick={() => setShowPagarModal(false)}>
        <div onClick={e => e.stopPropagation()} style={{ 
          width: 360, 
          background: '#ffffff', 
          borderRadius: 14, 
          boxShadow: '0 12px 48px rgba(0,0,0,.15)',
          border: '1px solid var(--line)',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'hidden'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '14px 18px', 
            borderBottom: '1px solid var(--line)' 
          }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Download Salary File</h4>
            <button onClick={() => setShowPagarModal(false)} style={{ 
              width: 28, height: 28, borderRadius: '50%', border: 'none', 
              background: 'rgba(0,0,0,.08)', color: '#666', fontSize: 18, 
              cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1 
            }}>×</button>
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ marginBottom: 16, color: 'var(--ink-soft)' }}>Select month for the Salary File export:</p>
            <input type="month" className="input" value={pagarMonth} onChange={e => setPagarMonth(e.target.value)} style={{ width: '100%', padding: '10px 12px', marginBottom: 16, fontSize: 14 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowPagarModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { doPagarExport(pagarMonth); }}>Download</button>
            </div>
          </div>
        </div>
       </div>
     )}
     {showCompensationModal && (
       <div className="modal-overlay" onClick={() => setShowCompensationModal(false)}>
         <div onClick={e => e.stopPropagation()} style={{
           width: 540,
           maxWidth: 'calc(100vw - 32px)',
           background: '#ffffff',
           borderRadius: 14,
           boxShadow: '0 12px 48px rgba(0,0,0,.15)',
           border: '1px solid var(--line)',
           maxHeight: 'calc(100vh - 40px)',
           overflow: 'auto'
         }}>
           <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderBottom:'1px solid var(--line)' }}>
             <h4 style={{ margin: 0, fontSize: 15 }}>Salary Compensations</h4>
             <button onClick={() => setShowCompensationModal(false)} style={{ width:28, height:28, borderRadius:'50%', border:'none', background:'rgba(0,0,0,.08)', color:'#666', fontSize:18, cursor:'pointer' }}>×</button>
           </div>
           <div style={{ padding: 20 }}>
              <p style={{ margin:'0 0 14px', color:'var(--ink-soft)', fontSize:13 }}>
                Link a worked Sunday to a holiday. The linked Sunday replaces the holiday. For months before Oct 2026 it also does not satisfy the separate required Sunday; from Oct 2026 every eligible Sunday is paid anyway, so that quota no longer applies.
              </p>
             <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
               <label className="field">Salary month
                 <input type="month" className="input" value={compensationMonth} onChange={e => setCompensationMonth(e.target.value)} />
               </label>
               <label className="field">Name
                 <input className="input" value={compensationName} onChange={e => setCompensationName(e.target.value)} placeholder="e.g. Rashabandhan" />
               </label>
               <label className="field">Compensatory work Sunday
                 <input type="date" className="input" value={compensationWorkDate} onChange={e => setCompensationWorkDate(e.target.value)} />
               </label>
               <label className="field">Holiday date
                 <input type="date" className="input" value={compensationHolidayDate} onChange={e => setCompensationHolidayDate(e.target.value)} />
               </label>
             </div>
             <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
               <button className="btn btn-primary" disabled={compensationSaving} onClick={saveCompensation}>
                 {compensationSaving ? 'Saving…' : 'Add Compensation'}
               </button>
             </div>
             <div style={{ marginTop:20, borderTop:'1px solid var(--line)', paddingTop:14 }}>
               <strong style={{ fontSize:13 }}>Saved mappings</strong>
               {salaryCompensations.length === 0 ? (
                 <div style={{ color:'var(--ink-soft)', fontSize:12, marginTop:8 }}>No compensation mappings.</div>
               ) : salaryCompensations.map(entry => (
                 <div key={`${entry.workDate}-${entry.holidayDate}`} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--line)', fontSize:12 }}>
                   <div>
                     <strong>{entry.name || 'Compensatory holiday'}</strong>
                     <div style={{ color:'var(--ink-soft)', marginTop:2 }}>{entry.workDate} → {entry.holidayDate} · {entry.month || entry.workDate?.slice(0, 7)}</div>
                   </div>
                   {entry.workDate === '2026-08-23' && entry.holidayDate === '2026-08-28' ? (
                     <span style={{ color:'var(--ink-soft)', fontSize:11 }}>Default</span>
                   ) : (
                     <button className="btn btn-outline btn-sm" onClick={() => removeCompensation(entry)}>Remove</button>
                   )}
                 </div>
               ))}
             </div>
           </div>
         </div>
       </div>
     )}
    </>
  );
}
