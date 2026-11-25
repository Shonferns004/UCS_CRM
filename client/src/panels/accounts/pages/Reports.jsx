import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { apiGet, apiPut, apiPost, apiGetBlob } from '../api/auth';
import useAccessCode from '../components/AccessGate';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

const compactMoney = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000000) return '\u20B9' + parseFloat((v / 10000000).toFixed(1)) + 'Cr';
  if (v >= 100000) return '\u20B9' + parseFloat((v / 100000).toFixed(1)) + 'L';
  if (v >= 1000) return '\u20B9' + parseFloat((v / 1000).toFixed(1)) + 'k';
  return '\u20B9' + Math.round(v).toLocaleString('en-IN');
};

const NGO_COLORS = { bsct: '#38bdf8', aflf: '#8b5cf6', mann: '#ec4899' };
const NGO_SHORT = { bsct: 'BSCT', aflf: 'AFLF', mann: 'MANN' };

const pad2 = (n) => String(n).padStart(2, '0');
const monthKeyOf = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const monthBounds = (ym) => {
  const [y, m] = String(ym || monthKeyOf()).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(last)}` };
};
const fiscalStartOf = (d = new Date()) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
const fiscalBounds = (startYear) => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });

const TEAM_STYLE = {
  UFS1: { bg: '#E7F3EC', fg: '#1f6f3f' },
  UFS2: { bg: '#EAF1FB', fg: '#2563eb' },
  UFS3: { bg: '#FDF2E3', fg: '#B45309' },
  UFS4: { bg: '#F3E8F8', fg: '#7C3AED' },
  'No Team': { bg: '#F3F4F6', fg: '#6b7280' },
};

const Sk = ({ w = '100%', h = 14, r = 6, mb = 0, style = {} }) => (
  <div className="sk" style={{ width: w, height: h, borderRadius: r, marginBottom: mb, ...style }} />
);

const TableSkeleton = ({ cols = 5, rows = 3 }) => (
  <div style={{ padding: 6 }}>
    {[...Array(rows)].map((_, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
        {[...Array(cols)].map((_, j) => (
          <Sk key={j} h={12} style={{ flex: 1, maxWidth: j === cols - 1 ? 90 : 'none' }} />
        ))}
      </div>
    ))}
  </div>
);

const StatCardSkeleton = () => (
  <div className="stat-card">
    <div className="stat-icon"><Sk w={20} h={20} r={6} /></div>
    <div className="stat-info" style={{ flex: 1 }}>
      <Sk h={22} mb={6} />
      <Sk w="60%" h={10} />
    </div>
  </div>
);

const TenorCrab = () => (
  <div className="no-print" style={{ position: 'absolute', left: 0, right: 0, bottom: 2, height: 55, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: 124, height: 55, animation: 'rpSweep 26s ease-in-out infinite' }}>
      <video
        src="https://media.tenor.com/ReQRC0WV_coAAAPo/minecraft-crab.mp4"
        poster="https://media.tenor.com/ReQRC0WV_coAAAAe/minecraft-crab.png"
        autoPlay
        loop
        muted
        playsInline
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          mixBlendMode: 'multiply', imageRendering: 'pixelated', opacity: .85
        }}
      />
    </div>
  </div>
);

const MonthlyTip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter(p => p.dataKey !== 'total');
  const total = payload.find(p => p.dataKey === 'total')?.value
    ?? rows.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,.10)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>{label}</div>
      {rows.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4b5563' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--ink)' }}>{currency(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, fontWeight: 700, color: 'var(--ink)' }}>Total {currency(total)}</div>
    </div>
  );
};

const inputStyle = { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontWeight: 600, background: '#fff', color: 'var(--ink)' };
const filterLabelStyle = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 };

const printStyle = `
  @media print {
    .no-print { display: none !important; }
    body { font-family: 'Inter', sans-serif; padding: 20px; color: #000; }
    .card { border: 1px solid #ccc; border-radius: 6px; margin-bottom: 16px; }
    .card-head { padding: 10px 14px; border-bottom: 1px solid #ddd; font-size: 14px; font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 6px 10px; border: 1px solid #999; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
  }
`;

const animStyle = `
  @keyframes rpFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .rp-card { animation: rpFadeUp .35s ease both; }
  .rp-tabs { animation: rpFadeUp .3s ease both; }
  @keyframes rpSweep {
    0%   { left: 0; }
    12%  { left: 0; }
    45%  { left: calc(100% - 124px); }
    55%  { left: calc(100% - 124px); }
    88%  { left: 0; }
    100% { left: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .rp-card, .rp-tabs, [style*="rpSweep"] { animation: none; } }
`;

export default function Reports() {
  const [month, setMonth] = useState(() => monthKeyOf());
  const [reportFrom, setReportFrom] = useState(() => monthBounds(monthKeyOf()).from);
  const [reportTo, setReportTo] = useState(() => monthBounds(monthKeyOf()).to);
  // One period filter row drives the whole report. 'month' keeps the backend's
  // exact monthly working-day/target maths; every other choice is a From-To
  // range (calendar year, financial year, or a custom range).
  const [activePeriod, setActivePeriod] = useState('month');
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());
  const [filterFy, setFilterFy] = useState(() => fiscalStartOf());
  const [data, setData] = useState(null);
  const [atc, setAtc] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyError, setMonthlyError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceTab, setSourceTab] = useState('All');
  const [viewTab, setViewTab] = useState('source');
  const [atcTab, setAtcTab] = useState('agent');
  const [downloadNgo, setDownloadNgo] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const access = useAccessCode();
  const [locked, setLocked] = useState(true);

  const handleUnlock = async () => {
    const ok = await access.open();
    if (ok) setLocked(false);
  };
  const handleLock = () => setLocked(true);
  const mask = (v) => (locked ? 'XXXX' : v);

  // monthly target editor state
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetForm, setTargetForm] = useState({ overall: '', perNgo: {}, byTeam: {}, modes: {}, resolved: [] });
  const [teams, setTeams] = useState([]);
  const [targetTotals, setTargetTotals] = useState({ target: 0, synced: 0 });
  const [savingTarget, setSavingTarget] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [syncPreviewFor, setSyncPreviewFor] = useState(null);
  const [syncingTeams, setSyncingTeams] = useState(false);

  const monthLabel = useCallback((m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '';
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, mm - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, []);

  const rangeLabel = useCallback((f, t) => {
    if (!f || !t) return '';
    const fmt = (d) => {
      const [y, mm, dd] = d.split('-').map(Number);
      return new Date(y, mm - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(f)} – ${fmt(t)}`;
  }, []);

  // Filter bar handlers. Month / Year / FY all write the same From-To pair, so
  // every card on the page reads one period and cannot disagree with another.
  const applyMonth = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return;
    const b = monthBounds(ym);
    setMonth(ym);
    setReportFrom(b.from);
    setReportTo(b.to);
    setActivePeriod('month');
  };
  const applyYear = (value) => {
    if (!value) { setActivePeriod('range'); return; }
    const y = Number(value);
    setFilterYear(y);
    setMonth(`${y}-01`);
    setReportFrom(`${y}-01-01`);
    setReportTo(`${y}-12-31`);
    setActivePeriod('year');
  };
  const applyFy = (value) => {
    if (!value) { setActivePeriod('range'); return; }
    const y = Number(value);
    const b = fiscalBounds(y);
    setFilterFy(y);
    setMonth(`${y}-04`);
    setReportFrom(b.from);
    setReportTo(b.to);
    setActivePeriod('fy');
  };
  const onFromChange = (value) => {
    if (!value) return;
    setReportFrom(value);
    if (reportTo && value > reportTo) setReportTo(value);
    setMonth(value.slice(0, 7));
    setActivePeriod('range');
  };
  const onToChange = (value) => {
    if (!value) return;
    setReportTo(value);
    if (reportFrom && value < reportFrom) setReportFrom(value);
    setMonth(value.slice(0, 7));
    setActivePeriod('range');
  };
  const periodLabel = activePeriod === 'month'
    ? monthLabel(month)
    : (activePeriod === 'year'
      ? `${filterYear} · ${rangeLabel(reportFrom, reportTo)}`
      : (activePeriod === 'fy'
        ? `FY ${filterFy}-${String(filterFy + 1).slice(2)} · ${rangeLabel(reportFrom, reportTo)}`
        : rangeLabel(reportFrom, reportTo)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = activePeriod === 'month'
        ? `month=${month}`
        : `from=${reportFrom}&to=${reportTo}`;
      const res = await apiGet('/accounts/report-data?' + q);
      setData(res);
      try {
        const atcRes = await apiGet('/accounts/report-agent-team?' + q);
        setAtc(atcRes);
      } catch (e) {
        setAtc(null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [activePeriod, month, reportFrom, reportTo]);

  useEffect(() => { load(); }, [activePeriod, month, reportFrom, reportTo]);

  // Monthly collection follows the same From-To window as the rest of the page.
  // A month selection is the month's bounds, a year is Jan-Dec, a financial year
  // is Apr-Mar, and a custom range is whatever the two date inputs say.
  useEffect(() => {
    if (!reportFrom || !reportTo) return;
    let cancelled = false;
    setMonthlyLoading(true);
    setMonthlyError(null);
    apiGet(`/accounts/report-monthly-collections?from=${reportFrom}&to=${reportTo}`)
      .then((res) => { if (!cancelled) setMonthly(res); })
      .catch((e) => { if (!cancelled) setMonthlyError(e.message || 'Failed to load monthly collection'); })
      .finally(() => { if (!cancelled) setMonthlyLoading(false); });
    return () => { cancelled = true; };
  }, [reportFrom, reportTo]);

  useEffect(() => {
    apiGet('/accounts/team-targets?month=' + month).then(d => {
      setTargetForm(f => ({ ...f, byTeam: d.byTeam || {}, modes: d.modes || {}, resolved: d.resolved || [] }));
      if (Array.isArray(d.teams)) setTeams(d.teams);
      if (d.totals) setTargetTotals(d.totals);
    }).catch(()=>{});
  }, [month]);

  // Open target form pre-filled from saved targets (or blank for even split)
  const openTargetForm = () => {
    const ngos = data?.ngos || [];
    const byNgo = data?.byNgoTargets || {};
    const perNgo = {};
    ngos.forEach(n => { perNgo[n.id] = byNgo[n.id] != null ? String(byNgo[n.id]) : ''; });
    setTargetForm(f => ({ overall: data?.overallTarget ? String(data.overallTarget) : f.overall, perNgo, byTeam: f.byTeam }));
    setShowTargetForm(true);
    setSavedToast(false);
    // Pick up any individual target HR changed since this page loaded, so the
    // AUTO rows do not open on yesterday's sum.
    refreshTeamTargets().catch(() => {});
  };

  // When overall typed in the form -> even split across NGOs. Team-wise targets
  // are deliberately NOT touched: they are the sum of the team's individual
  // targets (or a manual override), so spreading the NGO anchor over them would
  // silently desynchronise every AUTO team.
  const onOverallChange = (val) => {
    const ngos = data?.ngos || [];
    const overall = Number(val) || 0;
    const perNgo = {};
    if (ngos.length > 0 && overall > 0) {
      const share = Math.floor(overall / ngos.length);
      let rem = overall - share * ngos.length;
      ngos.forEach((n, i) => {
        perNgo[n.id] = String(share + (i === ngos.length - 1 ? rem : 0));
      });
    } else {
      ngos.forEach(n => { perNgo[n.id] = ''; });
    }
    setTargetForm(f=>({ ...f, overall: val, perNgo }));
  };

  // When an individual NGO target is edited -> keep the overall as the anchor;
  // any shortfall vs the per-NGO sum is surfaced as a distribution recommendation.
  const onNgoTargetChange = (slug, val) => {
    const perNgo = { ...targetForm.perNgo, [slug]: val };
    setTargetForm({ ...targetForm, perNgo });
  };

  // Distribute the unallocated shortfall across all NGOs (a bit here and there)
  const distributeShortfall = () => {
    const ngos = data?.ngos || [];
    if (ngos.length === 0) return;
    const overall = Number(targetForm.overall) || 0;
    const allocated = ngos.reduce((s, n) => s + (Number(targetForm.perNgo[n.id]) || 0), 0);
    let short = overall - allocated;
    if (short <= 0) return;
    const perNgo = { ...targetForm.perNgo };
    const share = Math.floor(short / ngos.length);
    let rem = short - share * ngos.length;
    ngos.forEach((n, i) => {
      const cur = Number(perNgo[n.id]) || 0;
      perNgo[n.id] = String(cur + share + (i === ngos.length - 1 ? rem : 0));
    });
    setTargetForm({ ...targetForm, perNgo });
  };

  const rebalanceEvenly = () => {
    const ngos = data?.ngos || [];
    const overall = Number(targetForm.overall) || 0;
    const perNgo = {};
    if (ngos.length > 0 && overall > 0) {
      const share = Math.floor(overall / ngos.length);
      const rem = overall - share * ngos.length;
      ngos.forEach((n, i) => { perNgo[n.id] = String(share + (i === ngos.length - 1 ? rem : 0)); });
    }
    setTargetForm(f=>({ ...f, perNgo }));
  };

  // Re-read the team plan (modes + live member sums) without touching the rest of
  // the editor's state. Used after a sync so the table reflects the new values.
  const refreshTeamTargets = async (forMonth) => {
    const d = await apiGet('/accounts/team-targets?month=' + (forMonth || month));
    setTargetForm(f => ({ ...f, byTeam: d.byTeam || {}, modes: d.modes || {}, resolved: d.resolved || [] }));
    if (Array.isArray(d.teams)) setTeams(d.teams);
    if (d.totals) setTargetTotals(d.totals);
    return d;
  };

  const syncAllTeams = async () => {
    setSyncingTeams(true);
    try {
      const d = await apiPost('/accounts/team-targets/sync', { month });
      setTargetForm(f => ({ ...f, byTeam: d.byTeam || {}, modes: d.modes || {}, resolved: d.resolved || [] }));
      if (d.totals) setTargetTotals(d.totals);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to sync team targets');
    } finally {
      setSyncingTeams(false);
    }
  };

  // Flip one team between AUTO (live members' sum) and MANUAL (editable number).
  const setTeamMode = (team, mode) => {
    setTargetForm(f => {
      const byTeam = { ...f.byTeam };
      if (mode === 'auto') {
        const row = (f.resolved || []).find(r => r.team === team);
        byTeam[team] = row ? String(row.synced) : (byTeam[team] || '');
      }
      return { ...f, byTeam, modes: { ...f.modes, [team]: mode } };
    });
  };

  const useSyncedValue = (team) => {
    setTargetForm(f => {
      const row = (f.resolved || []).find(r => r.team === team);
      return { ...f, byTeam: { ...f.byTeam, [team]: row ? String(row.synced) : '' } };
    });
  };

  const saveTarget = async () => {
    const ngos = data?.ngos || [];
    const byNgo = {};
    const sum = ngos.reduce((s, n) => { const v = Number(targetForm.perNgo[n.id]) || 0; byNgo[n.id] = v; return s + v; }, 0);
    const overall = (Number(targetForm.overall) || 0) > 0 ? Number(targetForm.overall) : sum;
    // Build from the resolved plan, not the roster alone: the plan also carries
    // unrostered teams (a workers.team value missing from the roster). Dropping
    // them here would silently delete a lane the editor just showed.
    const resolvedRows = targetForm.resolved || [];
    const teamNames = resolvedRows.length > 0
      ? resolvedRows.map(r => r.team)
      : (teams.length > 0 ? teams : []);
    const byTeam = {};
    teamNames.forEach((t) => {
      const row = resolvedRows.find(r => r.team === t);
      const mode = targetForm.modes?.[t] || row?.mode || 'auto';
      // AUTO teams always save the live members' sum; MANUAL saves the typed
      // number. The backend applies the same rule, this just keeps the payload
      // honest.
      byTeam[t] = mode === 'auto'
        ? (Number(row?.synced) || 0)
        : (Number(targetForm.byTeam?.[t]) || 0);
    });
    setSavingTarget(true);
    try {
      await Promise.all([
        apiPut('/accounts/report-targets', { month, overall, byNgo }),
        apiPut('/accounts/team-targets', { month, byTeam, modes: targetForm.modes || {} }),
      ]);
      setSavedToast(true);
      setShowTargetForm(false);
      await Promise.all([load(), refreshTeamTargets()]);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      setError(e.message || 'Failed to save target');
    } finally {
      setSavingTarget(false);
    }
  };

  // effective per-NGO targets = saved (from backend rows) unless editing
  const ngos = data?.ngos || [];
  const sourceTabs = (data?.sourceTabs && data.sourceTabs.length > 0) ? data.sourceTabs : ngos;
  const sourceOrder = data?.sourceOrder || [];
  const rows = data?.rows || [];
  const workDays = data?.workDays || null;

  // Monthly target form derived state (allocation vs the overall anchor)
  const overallAnchor = Number(targetForm.overall) || 0;
  const perNgoSum = ngos.reduce((s, n) => s + (Number(targetForm.perNgo[n.id]) || 0), 0);
  const shortfall = Math.max(0, overallAnchor - perNgoSum);
  const excess = Math.max(0, perNgoSum - overallAnchor);

  // target lookup: saved per-ngo (byNgoTargets) merged over rows
  const savedTargets = {};
  rows.forEach(r => { savedTargets[r.id] = r.monthlyTarget; });

  // grand totals
  const grandBySource = {};
  sourceOrder.forEach(s => {
    grandBySource[s] = ngos.reduce((sum, n) => sum + ((data?.byNgo?.[n.id]?.sources?.[s]) || 0), 0);
  });
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandSourceTotal = rows.reduce((s, r) => s + (r.sourceTotal || 0), 0);
  const grandReceiptCount = rows.reduce((s, r) => s + (r.receiptCount || 0), 0);
  const totalTargets = rows.reduce((s, r) => s + (r.monthlyTarget > 0 ? r.monthlyTarget : 0), 0);
  const grandDiff = grandTotal - totalTargets;
  const totalAvgPerDay = workDays && workDays.workingDaysLeft > 0 ? Math.max(0, totalTargets - grandTotal) / workDays.workingDaysLeft : null;

  // Agent / Team collection (from /report-agent-team)
  const atcAgents = atc?.agents || [];
  const atcTeams = atc?.teams || [];
  const atcSlugs = atc?.ngos && atc.ngos.length > 0 ? atc.ngos.map(n => n.id) : (ngos.map(n => String(n.id).toLowerCase()).filter(id => ['bsct', 'aflf', 'mann'].includes(id)));
  const atcLabel = { bsct: 'BSCT', aflf: 'AFLF', mann: 'MANN' };
  const sumByNgo = (arr, n) => arr.reduce((s, a) => s + (a.byNgo?.[n] || 0), 0);

  // Monthly collection (months covered by the selected From-To period)
  const monthlyNgos = monthly?.ngos || [];
  const monthlyMonths = monthly?.months || [];
  const monthlyTeams = monthly?.teams || [];
  const monthlyAgents = monthly?.agents || [];
  const monthlyChartData = useMemo(() => {
    const ngoData = monthly?.monthlyNgo || {};
    const monthList = monthly?.months || [];
    return monthList.map((m, i) => {
      const point = { month: m.label, total: monthly?.monthlyTotal?.[i] || 0 };
      for (const n of monthly?.ngos || []) point[n.id] = ngoData[n.id]?.[i] || 0;
      return point;
    });
  }, [monthly]);
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years = [];
    for (let y = now; y >= now - 10; y--) years.push(y);
    return years;
  }, []);
  const fyOptions = useMemo(() => {
    const current = fiscalStartOf();
    const years = [];
    for (let y = current; y >= current - 10; y--) years.push(y);
    return years;
  }, []);
  const sumMonths = (arr) => (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);

  // export CSV
  const exportCsv = async () => {
    if (locked) { const ok = await access.open(); if (!ok) return; setLocked(false); }
    const header = ['NGO', 'Receipts', 'Collection Total', ...sourceOrder.map(s => `Source: ${s}`), 'Source Total', 'Monthly Target', 'Diff (Total - Monthly)', 'Working Days Left', 'Avg / Day'];
    const body = rows.map(r => [
      r.name, r.receiptCount || 0, r.total,
      ...sourceOrder.map(s => (data?.byNgo?.[r.id]?.sources?.[s]) || 0),
      r.sourceTotal || 0,
      r.monthlyTarget > 0 ? r.monthlyTarget : '',
      r.monthlyTarget > 0 ? round2((r.total || 0) - r.monthlyTarget) : '',
      r.workingDaysLeft > 0 ? r.workingDaysLeft : '',
      r.monthlyTarget > 0 && r.workingDaysLeft > 0 ? round2(r.avgPerDay) : '',
    ]);
    const all = [header, ...body];
    all.push([], ['Total', grandReceiptCount, grandTotal, ...sourceOrder.map(() => ''), grandTotal, totalTargets, round2(grandDiff), workDays ? workDays.workingDaysLeft : '', totalAvgPerDay !== null ? round2(totalAvgPerDay) : '']);
    if (atc) {
      all.push([], ['Agent-wise Collection', ...atcSlugs.map(s => atcLabel[s] || s), 'Total', 'Receipts']);
      atcAgents.forEach(a => all.push([a.name, ...atcSlugs.map(s => a.byNgo?.[s] || 0), a.total, a.count]));
      if (atcTeams.length > 0) {
        all.push([], ['Team-wise Collection', 'Members', ...atcSlugs.map(s => atcLabel[s] || s), 'Total', 'Receipts']);
        all.push(['Grand Total', atcTeams.reduce((s, t) => s + t.members, 0), ...atcSlugs.map(s => sumByNgo(atcTeams, s)), atcTeams.reduce((s, t) => s + t.total, 0), atcTeams.reduce((s, t) => s + t.count, 0)]);
        atcTeams.forEach(t => all.push([t.team, t.members, ...atcSlugs.map(s => t.byNgo?.[s] || 0), t.total, t.count]));
      }
    }
    const csv = '\uFEFF' + all.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-report-${activePeriod === 'month' ? month : `${reportFrom}_${reportTo}`}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // One-click station-wise workbook. Sends the same period that is on screen,
  // so the download cannot describe a different range than the report.
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const q = new URLSearchParams();
      q.set('from', reportFrom);
      q.set('to', reportTo);
      q.set('ngo', downloadNgo);
      const blob = await apiGetBlob('/accounts/station-collection.xlsx?' + q.toString());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `station-collection-${downloadNgo}-${reportFrom}_${reportTo}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Could not download the Excel file');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => { window.print(); };

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{printStyle}</style>
      <style>{animStyle}</style>

      {/* Header + Toolbar */}
      <div className="no-print rp-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Collection Report</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
            {periodLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Excel</span>
            <select value={downloadNgo} onChange={e => setDownloadNgo(e.target.value)} style={inputStyle} aria-label="NGO for Excel download">
              <option value="all">All NGOs</option>
              <option value="bsct">BSCT</option>
              <option value="aflf">AFLF</option>
              <option value="mann">MANN</option>
            </select>
          </div>
          <button className="btn" onClick={downloadExcel} disabled={downloading}
            title="Download station-wise collection with Count and Range"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
          <button className="btn" onClick={() => load()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
          {locked ? (
            <button className="btn" onClick={handleUnlock} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fcd34d', color: '#92400e', background: '#fffbeb' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
              Unlock values
            </button>
          ) : (
            <button className="btn" onClick={handleLock} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', color: '#4b5563' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Lock values
            </button>
          )}
          <button className="btn btn-primary" onClick={openTargetForm} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Monthly Target
          </button>
        </div>
      </div>

      {/* Report period — one filter row for the summary, source, team, monthly
          and agent tables. Month/Year/FY write the same From-To pair, so the
          page can never show two different periods at once. */}
      <div className="no-print rp-card" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '12px 14px', marginBottom: 18, border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }}>
        <div>
          <div style={filterLabelStyle}>From</div>
          <input type="date" value={reportFrom} style={inputStyle} onChange={e => onFromChange(e.target.value)} />
        </div>
        <div>
          <div style={filterLabelStyle}>To</div>
          <input type="date" value={reportTo} style={inputStyle} onChange={e => onToChange(e.target.value)} />
        </div>
        <div>
          <div style={filterLabelStyle}>Month</div>
          <input type="month" value={reportFrom.slice(0, 7)} style={inputStyle} onChange={e => applyMonth(e.target.value)} />
        </div>
        <div>
          <div style={filterLabelStyle}>Calendar Year</div>
          <select value={activePeriod === 'year' ? filterYear : ''} style={inputStyle}
            onChange={e => applyYear(e.target.value)} aria-label="Calendar year (January to December)">
            <option value="">Select year</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <div style={filterLabelStyle}>Financial Year</div>
          <select value={activePeriod === 'fy' ? filterFy : ''} style={inputStyle}
            onChange={e => applyFy(e.target.value)} aria-label="Financial year (April to March)">
            <option value="">Select financial year</option>
            {fyOptions.map(y => <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)} (Apr–Mar)</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 150 }}>
          <div style={filterLabelStyle}>Showing</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{periodLabel}</div>
        </div>
      </div>

      {savedToast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>Target saved successfully.</div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{error}</div>
      )}

      {/* Monthly Target editor */}
      {showTargetForm && (
        <div className="card rp-card" style={{ marginBottom: 16, padding: 16, border: '2px solid var(--sage)' }}>
          <div className="card-head" style={{ padding: 0, border: 0, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Monthly Target — {monthLabel(month)}</h3>
            <button className="btn btn-sm" onClick={() => setShowTargetForm(false)}>Cancel</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Overall Target (kept as-is)</div>
              <input type="number" value={targetForm.overall} onChange={e => onOverallChange(e.target.value)}
                placeholder="e.g. 900000" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, fontWeight: 600 }} />
            </div>
            <button className="btn btn-sm" onClick={rebalanceEvenly} title="Redistribute overall evenly across NGOs">Re-balance Evenly</button>
            {shortfall > 0 && (
              <button className="btn btn-sm" onClick={distributeShortfall} title="Spread the unallocated amount across all NGOs"
                style={{ background: 'var(--sage)', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Apply Recommendation
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {ngos.map(n => (
              <div key={n.id} style={{ minWidth: 180 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{n.name}</div>
                <input type="number" value={targetForm.perNgo[n.id] || ''}
                  onChange={e => onNgoTargetChange(n.id, e.target.value)}
                  placeholder="0" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, width: '100%' }} />
              </div>
            ))}
          </div>
          {/* Team-wise targets: AUTO teams take the sum of their members' individual
              targets; MANUAL teams keep a typed override and show the drift. */}
          {(() => {
            const rows = (targetForm.resolved && targetForm.resolved.length)
              ? targetForm.resolved
              : (teams || []).map(t => ({
                  team: t, mode: targetForm.modes?.[t] || 'auto',
                  synced: Number(targetForm.byTeam?.[t]) || 0, member_count: 0, members: [],
                }));
            if (rows.length === 0) return null;
            const memberTotal = rows.reduce((s, r) => s + (Number(r.member_count) || 0), 0);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Team-wise Targets</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                    {memberTotal} individual target{memberTotal === 1 ? '' : 's'} summed
                    {Number(targetTotals.synced) > 0 ? ` · ${currency(targetTotals.synced)} synced` : ''}
                  </span>
                  <button className="btn btn-sm" onClick={syncAllTeams} disabled={syncingTeams}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                    {syncingTeams ? 'Syncing...' : 'Sync from individual targets'}
                  </button>
                </div>
                <div className="table-wrap" style={{ marginBottom: 14, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                        <th style={{ padding: '8px 12px' }}>Team</th>
                        <th style={{ padding: '8px 12px' }}>Members</th>
                        <th style={{ padding: '8px 12px' }}>Individual Sum</th>
                        <th style={{ padding: '8px 12px' }}>Team Target</th>
                        <th style={{ padding: '8px 12px' }}>Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const mode = targetForm.modes?.[row.team] || row.mode || 'auto';
                        const isAuto = mode === 'auto';
                        const synced = Number(row.synced) || 0;
                        const value = isAuto ? String(synced) : (targetForm.byTeam?.[row.team] ?? '');
                        const drift = (Number(value) || 0) - synced;
                        return (
                          <tr key={row.team} style={{ borderTop: '1px solid var(--line)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                              {row.team}
                              {row.unrostered && (
                                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#B45309', background: '#FDF2E3', padding: '2px 6px', borderRadius: 999 }}>NOT IN ROSTER</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {row.member_count > 0 ? (
                                <button onClick={() => setSyncPreviewFor(row)}
                                  style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: 0 }}>
                                  {row.member_count} ▸
                                </button>
                              ) : <span style={{ color: 'var(--ink-soft)' }}>0</span>}
                            </td>
                            <td style={{ padding: '8px 12px' }}>{synced > 0 ? currency(synced) : '\u2014'}</td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              <input type="number" value={value} readOnly={isAuto}
                                onChange={e => setTargetForm(f => ({ ...f, byTeam: { ...f.byTeam, [row.team]: e.target.value } }))}
                                placeholder="0"
                                style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, width: 130, fontWeight: 600, background: isAuto ? '#f3f4f6' : '#fff', color: 'var(--ink)' }} />
                              {!isAuto && drift !== 0 && (
                                <button onClick={() => useSyncedValue(row.team)} title="Use the individual sum"
                                  style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '3px 6px', cursor: 'pointer' }}>
                                  {drift > 0 ? '+' : ''}{currency(drift)} {drift > 0 ? 'over' : 'under'}
                                </button>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <button onClick={() => setTeamMode(row.team, isAuto ? 'manual' : 'auto')}
                                title={isAuto ? 'Switch to a manual target' : 'Switch back to the members sum'}
                                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, cursor: 'pointer', border: '1px solid ' + (isAuto ? '#86EFAC' : 'var(--line)'), background: isAuto ? '#B9EFCE' : '#fff', color: isAuto ? '#1B7A3D' : '#4b5563' }}>
                                {isAuto ? '\u25CF Auto' : '\u25CB Manual'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {/* Allocation status + recommendation */}
          {overallAnchor > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, background: shortfall > 0 || excess > 0 ? '#FEF3C7' : '#B9EFCE', color: shortfall > 0 || excess > 0 ? '#92400E' : '#1B7A3D', border: shortfall > 0 || excess > 0 ? '1px solid #FDE68A' : '1px solid #86EFAC' }}>
              {shortfall > 0 ? (
                <>
                  Allocated {currency(perNgoSum)} of {currency(overallAnchor)} · <strong>{currency(shortfall)} left</strong> to distribute.
                  <div style={{ fontWeight: 500, fontSize: 12, marginTop: 6, background: 'rgba(255,255,255,.6)', padding: '6px 8px', borderRadius: 6 }}>
                    Recommendation: add <strong>{currency(Math.floor(shortfall / Math.max(ngos.length, 1)))}</strong> to each NGO (≈ +{currency(Math.floor(shortfall / Math.max(ngos.length, 1)))} here &amp; there) so the total reaches {currency(overallAnchor)}. <button onClick={distributeShortfall} style={{ background: '#92400E', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 6 }}>Apply</button>
                  </div>
                </>
              ) : excess > 0 ? (
                <>Allocated <strong>{currency(perNgoSum)}</strong> is <strong>{currency(excess)}</strong> more than the overall target {currency(overallAnchor)}. Lower a share or raise the overall.</>
              ) : (
                <>Allocated {currency(perNgoSum)} = overall target {currency(overallAnchor)} — fully distributed.</>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button className="btn btn-primary" onClick={saveTarget} disabled={savingTarget}>
              {savingTarget ? 'Saving...' : 'Save Target'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>AUTO teams save the members' sum; MANUAL teams save the number you type.</span>
          </div>

          {/* Sync preview modal */}
          {syncPreviewFor && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div className="card" style={{ width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 0 }}>
                <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Sync Preview — {syncPreviewFor.team} · {monthLabel(month)}</h3>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{syncPreviewFor.member_count || 0} members · {currency(syncPreviewFor.synced || 0)}</span>
                  </div>
                  <button className="btn btn-sm" onClick={() => setSyncPreviewFor(null)} style={{ marginLeft: 'auto' }}>Close</button>
                </div>
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                        <th style={{ padding: '8px 14px' }}>Member</th>
                        <th style={{ padding: '8px 14px' }}>Target</th>
                        <th style={{ padding: '8px 14px' }}>Source</th>
                        <th style={{ padding: '8px 14px' }}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(syncPreviewFor.members || []).map((m, i) => (
                        <tr key={m.id || i} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '8px 14px', fontWeight: 600 }}>{m.name}{m.login_id ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-soft)' }}>{m.login_id}</span> : null}</td>
                          <td style={{ padding: '8px 14px', fontWeight: 600 }}>{currency(m.target || 0)}</td>
                          <td style={{ padding: '8px 14px', textTransform: 'capitalize' }}>{String(m.source || '').replace('_', ' ')}</td>
                          <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ink-soft)' }}>
                            {m.source === 'auto' ? `${m.months_employed != null ? m.months_employed : ''} mo${m.months_employed === 1 ? '' : 's'} employed` : (m.source_month ? `from ${m.source_month.slice(0,7)}` : '')}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--sage)', fontWeight: 700, background: '#F6F8F7' }}>
                        <td style={{ padding: '8px 14px' }}>Total</td>
                        <td style={{ padding: '8px 14px' }}>{currency(syncPreviewFor.synced || 0)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Team target will become this sum when in AUTO mode.</span>
                  <button className="btn btn-primary btn-sm" onClick={() => { setTeamMode(syncPreviewFor.team, 'auto'); setSyncPreviewFor(null); }} style={{ marginLeft: 'auto' }}>Apply to this team</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary stat cards */}
      {loading ? (
        <div className="stats-grid" style={{ marginBottom: 20 }}><div style={{ gridColumn: '1 / -1', width: '100%' }}><StatCardSkeleton /></div></div>
      ) : (
        <div className="rp-card" style={{ marginBottom: 20 }}>
          <div className="stat-card" style={{ width: '100%', boxSizing: 'border-box', background: '#2563eb', border: 'none', position: 'relative', overflow: 'hidden', minHeight: 80, paddingBottom: 48 }}>
            <div className="stat-icon" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', position: 'relative' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 0 0 0-8H6"/></svg>
            </div>
            <div className="stat-info" style={{ color: '#fff', position: 'relative' }}>
              <div className="stat-num" style={{ color: '#fff' }}>{mask(currency(grandTotal))} <span style={{ fontSize: 13, fontWeight: 500, opacity: .85 }}>collected</span></div>
              <div className="stat-lbl" style={{ color: 'rgba(255,255,255,.9)' }}>{mask(grandReceiptCount.toLocaleString('en-IN'))} receipts · {periodLabel}</div>
            </div>
            <TenorCrab />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
            {rows.map((r, i) => (
              <div className="stat-card" key={r.id} style={{ width: 280, maxWidth: '100%', boxSizing: 'border-box' }}>
                <div className="stat-icon" style={{ background: i % 2 ? '#E7F3EC' : '#EAF1FB', color: i % 2 ? '#1f6f3f' : '#2563eb' }}>
                  {['BSCT', 'MANN', 'AFLF'].includes(r.id) ? r.id.slice(0, 2) : r.name.slice(0, 1)}
                </div>
                <div className="stat-info">
                  <div className="stat-lbl" style={{ fontSize: 12 }}>{r.name}</div>
                  <div className="stat-num" style={{ fontSize: 20 }}>{mask(currency(r.total))}</div>
                  <div className="stat-sub">
                    {r.monthlyTarget > 0
                      ? <><span style={{ color: r.diff >= 0 ? '#1B7A3D' : '#B3392B', fontWeight: 700 }}>{mask((round2(r.diff) >= 0 ? '+' : '') + currency(round2(r.diff)))}</span> avg/day vs &nbsp;{mask(currency(r.monthlyTarget))} target</>
                      : '—'
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <>
          <div className="card rp-card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3 style={{ margin: 0, fontSize: 14 }}>NGO-wise Target vs Collection</h3></div>
            <TableSkeleton cols={8} rows={4} />
          </div>
          <div className="card rp-card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3 style={{ margin: 0, fontSize: 14 }}>Collection by Payment Source (NGO-wise)</h3></div>
            <TableSkeleton cols={5} rows={5} />
          </div>
        </>
      ) : (
        <>
          {/* Target & daily-average summary */}
          <div className="card rp-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
            <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14 }}>NGO-wise Target vs Collection</h3>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>vs monthly target · {activePeriod === 'month' ? 'monthly' : 'range'}</span>
              </div>
              {workDays && (
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 'auto' }}>
                  <b style={{ color: 'var(--ink)' }}>Calendar Days:</b>&nbsp;{workDays.calendarDays}&nbsp;·&nbsp;<b style={{ color: 'var(--ink)' }}>Sundays:</b>&nbsp;{workDays.sundays}&nbsp;·&nbsp;<b style={{ color: 'var(--ink)' }}>Working Sundays:</b>&nbsp;{workDays.workingSundays}&nbsp;·&nbsp;<b style={{ color: 'var(--ink)' }}>Holidays:</b>&nbsp;{workDays.holidays}&nbsp;·&nbsp;<b style={{ color: 'var(--ink)' }}>Working Days Left:</b>&nbsp;{workDays.workingDaysLeft}
                </span>
              )}
            </div>
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                    <th style={{ padding: '9px 12px' }}>NGO</th>
                    <th style={{ padding: '9px 12px' }}>Receipts</th>
                    <th style={{ padding: '9px 12px' }}>Monthly Target</th>
                    <th style={{ padding: '9px 12px' }}>Total Collected</th>
                    <th style={{ padding: '9px 12px' }}>Diff</th>
                    <th style={{ padding: '9px 12px' }}>Working Days Left</th>
                    <th style={{ padding: '9px 12px' }}>Avg / Day</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const hasTarget = r.monthlyTarget > 0;
                    const diffTotal = hasTarget ? round2((r.total || 0) - r.monthlyTarget) : null;
                    const diffColor = diffTotal !== null ? (diffTotal >= 0 ? '#1B7A3D' : '#B3392B') : null;
                    const canAvg = hasTarget && r.workingDaysLeft > 0;
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--line)', background: r.id === sourceTab ? '#F3FBF6' : 'transparent' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: '9px 12px' }}>{mask((r.receiptCount || 0).toLocaleString('en-IN'))}</td>
                        <td style={{ padding: '9px 12px' }}>{hasTarget ? mask(currency(r.monthlyTarget)) : '—'}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(r.total))}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: diffColor }}>{diffTotal !== null ? mask((diffTotal >= 0 ? '+' : '') + currency(diffTotal)) : '—'}</td>
                        <td style={{ padding: '9px 12px' }}>{r.workingDaysLeft > 0 ? mask(r.workingDaysLeft) : '—'}</td>
                        <td style={{ padding: '9px 12px' }}>{canAvg ? mask(currency(round2(r.avgPerDay))) : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--sage)', fontWeight: 700, background: '#F6F8F7' }}>
                    <td style={{ padding: '9px 12px' }}>Total</td>
                    <td style={{ padding: '9px 12px' }}>{mask(grandReceiptCount.toLocaleString('en-IN'))}</td>
                    <td style={{ padding: '9px 12px' }}>{mask(currency(totalTargets))}</td>
                    <td style={{ padding: '9px 12px' }}>{mask(currency(grandTotal))}</td>
                    <td style={{ padding: '9px 12px', color: grandDiff >= 0 ? '#1B7A3D' : '#B3392B' }}>{mask((grandDiff >= 0 ? '+' : '') + currency(grandDiff))}</td>
                    <td style={{ padding: '9px 12px' }}>{workDays ? mask(workDays.workingDaysLeft) : '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{totalAvgPerDay !== null ? mask(currency(round2(totalAvgPerDay))) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Source / Team-wise tabs */}
          <div className="no-print rp-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, gap: 4 }}>
              <button
                onClick={() => setViewTab('source')}
                style={{
                  padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: viewTab === 'source' ? '#fff' : 'transparent', color: viewTab === 'source' ? '#1f6f3f' : '#6b7280',
                  boxShadow: viewTab === 'source' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
                }}
              >Collection by Payment Source</button>
              <button
                onClick={() => setViewTab('team')}
                style={{
                  padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: viewTab === 'team' ? '#fff' : 'transparent', color: viewTab === 'team' ? '#1f6f3f' : '#6b7280',
                  boxShadow: viewTab === 'team' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
                }}
              >Team-wise Collection</button>
            </div>
          </div>

          {viewTab === 'source' && (
            <div className="card rp-card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Collection by Payment Source (NGO-wise)</h3>
                <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ id: 'All', name: 'All' }, ...sourceTabs].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSourceTab(t.id)}
                      style={{
                        padding: '5px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--line)', background: sourceTab === t.id ? 'var(--sage)' : '#fff',
                        color: sourceTab === t.id ? '#fff' : '#374151'
                      }}
                    >{t.name}</button>
                  ))}
                </div>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                      <th style={{ padding: '9px 12px' }}>Source</th>
                      {(sourceTab === 'All' ? sourceTabs : sourceTabs.filter(n => n.id === sourceTab)).map(n => <th key={n.id} style={{ padding: '9px 12px' }}>{n.name}</th>)}
                      {sourceTab === 'All' && <th style={{ padding: '9px 12px' }}>Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sourceOrder.map(src => (
                      <tr key={src} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '9px 12px' }}><span className="pill pill-gray">{src}</span></td>
                        {(sourceTab === 'All' ? sourceTabs : sourceTabs.filter(n => n.id === sourceTab)).map(n => (
                          <td key={n.id} style={{ padding: '9px 12px' }}>{mask(currency(data?.byNgo?.[n.id]?.sources?.[src] || 0))}</td>
                        ))}
                        {sourceTab === 'All' && <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(grandBySource[src]))}</td>}
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>Source Total (receipts)</td>
                      {(sourceTab === 'All' ? sourceTabs : sourceTabs.filter(n => n.id === sourceTab)).map(n => (
                        <td key={n.id} style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency((rows.find(r => r.id === n.id)?.sourceTotal) || 0))}</td>
                      ))}
                      {sourceTab === 'All' && <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(grandSourceTotal))}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewTab === 'team' && (
            <div className="card rp-card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Team-wise Collection</h3>
                <div className="no-print" style={{ display: 'inline-flex', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, gap: 4 }}>
                  <button
                    onClick={() => setAtcTab('agent')}
                    style={{
                      padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: atcTab === 'agent' ? '#fff' : 'transparent', color: atcTab === 'agent' ? '#1f6f3f' : '#6b7280',
                      boxShadow: atcTab === 'agent' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
                    }}
                  >Agent-wise (FRO)</button>
                  <button
                    onClick={() => setAtcTab('team')}
                    style={{
                      padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: atcTab === 'team' ? '#fff' : 'transparent', color: atcTab === 'team' ? '#1f6f3f' : '#6b7280',
                      boxShadow: atcTab === 'team' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
                    }}
                  >Team-wise</button>
                </div>
              </div>

              {!atc ? (
                <div className="empty" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
                  Agent / team collection unavailable. The report needs the <code>workers.team</code> column and the <code>/accounts/report-agent-team</code> endpoint.
                </div>
              ) : (
                <>
                  {/* Team stat cards */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                    {atcTeams.map(t => {
                      const st = TEAM_STYLE[t.team] || TEAM_STYLE['No Team'];
                      return (
                        <div key={t.team} className="stat-card" style={{ width: 200, maxWidth: '100%', boxSizing: 'border-box' }}>
                          <div className="stat-icon" style={{ background: st.bg, color: st.fg }}>{t.team === 'No Team' ? '—' : t.team.slice(-1)}</div>
                          <div className="stat-info">
                            <div className="stat-lbl" style={{ fontSize: 12 }}>{t.team}</div>
                            <div className="stat-num" style={{ fontSize: 18 }}>{mask(currency(t.total))}</div>
                            <div className="stat-sub">{mask(t.members)} members · {mask(t.count.toLocaleString('en-IN'))} receipts</div>
                            <div className="stat-sub" style={{ color: '#1f6f3f', fontWeight: 700 }}>Today: {mask(currency(t.todayTotal || 0))} · {mask((t.todayCount || 0).toLocaleString('en-IN'))} rcts</div>
                          </div>
                        </div>
                      );
                    })}
                    {atcTeams.length === 0 && <div className="empty" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No teams yet — assign FRO workers to UFS1–UFS4 in HR &gt; Workers.</div>}
                  </div>

                  <div className="table-wrap" style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                          <th style={{ padding: '9px 12px' }}>#</th>
                          <th style={{ padding: '9px 12px' }}>{atcTab === 'agent' ? 'Agent' : 'Team'}</th>
                          {atcTab === 'agent' && <th style={{ padding: '9px 12px' }}>Team</th>}
                          {atcTab === 'team' && <th style={{ padding: '9px 12px' }}>Members</th>}
                          {atcSlugs.map(s => <th key={s} style={{ padding: '9px 12px' }}>{atcLabel[s] || String(s).toUpperCase()}</th>)}
                          <th style={{ padding: '9px 12px', color: '#1f6f3f' }}>Today</th>
                          <th style={{ padding: '9px 12px' }}>Total</th>
                          <th style={{ padding: '9px 12px' }}>Receipts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atcTab === 'agent' ? (
                          <>
                            {atcAgents.map((a, i) => (
                              <tr key={a.id || a.category || 'unassigned'} style={{ borderTop: '1px solid var(--line)', background: a.id == null ? '#F9FAFB' : 'transparent' }}>
                                <td style={{ padding: '9px 12px', color: '#6b7280' }}>{i + 1}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                                  {a.name}
                                  {a.id == null && !a.category && <span style={{ color: '#9ca3af', fontWeight: 400 }}> · unattributed receipts</span>}
                                  {a.category && <span style={{ color: '#9ca3af', fontWeight: 400 }}> · category</span>}
                                </td>
                                <td style={{ padding: '9px 12px' }}>
                                  {a.team ? <span className="pill" style={{ background: (TEAM_STYLE[a.team] || TEAM_STYLE['No Team']).bg, color: (TEAM_STYLE[a.team] || TEAM_STYLE['No Team']).fg, fontWeight: 600 }}>{a.team}</span> : <span style={{ color: '#9ca3af' }}>—</span>}
                                </td>
                                {atcSlugs.map(s => <td key={s} style={{ padding: '9px 12px' }}>{mask(currency(a.byNgo?.[s] || 0))}</td>)}
                                <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1f6f3f' }}>{mask(currency(a.todayTotal || 0))}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(a.total))}</td>
                                <td style={{ padding: '9px 12px' }}>{mask((a.count || 0).toLocaleString('en-IN'))}</td>
                              </tr>
                            ))}
                            {atcAgents.length > 0 && (
                              <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7' }}>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>Total</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{atcAgents.length} agents</td>
                                <td style={{ padding: '9px 12px' }}></td>
                                {atcSlugs.map(s => <td key={s} style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(sumByNgo(atcAgents, s)))}</td>)}
                                <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1f6f3f' }}>{mask(currency(atcAgents.reduce((s, a) => s + (a.todayTotal || 0), 0)))}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(atcAgents.reduce((s, a) => s + a.total, 0)))}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(atcAgents.reduce((s, a) => s + (a.count || 0), 0).toLocaleString('en-IN'))}</td>
                              </tr>
                            )}
                          </>
                        ) : (
                          <>
                            {atcTeams.map((t, i) => {
                              const st = TEAM_STYLE[t.team] || TEAM_STYLE['No Team'];
                              return (
                                <tr key={t.team} style={{ borderTop: '1px solid var(--line)', background: t.team === 'No Team' ? '#F9FAFB' : 'transparent' }}>
                                  <td style={{ padding: '9px 12px', color: '#6b7280' }}>{i + 1}</td>
                                  <td style={{ padding: '9px 12px', fontWeight: 600 }}><span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 700 }}>{t.team}</span></td>
                                  <td style={{ padding: '9px 12px' }}>{mask(t.members)}</td>
                                  {atcSlugs.map(s => <td key={s} style={{ padding: '9px 12px' }}>{mask(currency(t.byNgo?.[s] || 0))}</td>)}
                                  <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1f6f3f' }}>{mask(currency(t.todayTotal || 0))}</td>
                                  <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(t.total))}</td>
                                  <td style={{ padding: '9px 12px' }}>{mask((t.count || 0).toLocaleString('en-IN'))}</td>
                                </tr>
                              );
                            })}
                            {atcTeams.length > 0 && (
                              <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7' }}>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>Total</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{atcTeams.reduce((s, t) => s + t.members, 0)} members</td>
                                <td style={{ padding: '9px 12px' }}></td>
                                {atcSlugs.map(s => <td key={s} style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(sumByNgo(atcTeams, s)))}</td>)}
                                <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1f6f3f' }}>{mask(currency(atcTeams.reduce((s, t) => s + (t.todayTotal || 0), 0)))}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(currency(atcTeams.reduce((s, t) => s + t.total, 0)))}</td>
                                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{mask(atcTeams.reduce((s, t) => s + (t.count || 0), 0).toLocaleString('en-IN'))}</td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Monthly collection — one column per month covered by the period
              filter at the top of the page (Jan-Dec for a year, Apr-Mar for a
              financial year, or the months inside a custom From-To range). */}
          <div className="card rp-card" style={{ marginBottom: 16 }}>
            <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Monthly Collection</h3>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Month-by-month totals · NGO-wise, team-wise and agent-wise</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 10px' }}>
                {periodLabel}
              </span>
            </div>
            {monthly?.truncated && (
              <div style={{ margin: '10px 14px 0', padding: '8px 10px', borderRadius: 8, background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600 }}>
                Showing the first 36 months of this range. Choose a shorter From-To range to see every month.
              </div>
            )}

            {monthlyLoading ? (
              <TableSkeleton cols={6} rows={5} />
            ) : monthlyError ? (
              <div className="empty" style={{ padding: 32, textAlign: 'center', color: '#B3392B', fontSize: 13 }}>{monthlyError}</div>
            ) : monthly ? (
              <>
                {/* Graph: three NGO series, one group per month */}
                <div style={{ position: 'relative', padding: '10px 14px 0' }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthlyChartData} margin={{ top: 12, right: 8, left: 4, bottom: 0 }} barCategoryGap="26%" barGap={3}>
                      <CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 5" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} dy={6} />
                      <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 10.5, fill: '#94a3b8' }} tickFormatter={compactMoney} />
                      <Tooltip cursor={{ fill: 'rgba(37,99,235,0.05)' }} content={<MonthlyTip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                      {monthlyNgos.map(n => (
                        <Bar key={n.id} dataKey={n.id} name={NGO_SHORT[n.id] || n.name}
                          fill={NGO_COLORS[n.id] || '#2563eb'} radius={[4, 4, 0, 0]} maxBarSize={22} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  {locked && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>Unlock values to view the monthly chart</span>
                      <button className="btn btn-sm" onClick={handleUnlock}>Unlock values</button>
                    </div>
                  )}
                </div>

                {/* Number chart: Month | BSCT | AFLF | MANN | Total */}
                <div style={{ padding: '14px 14px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>NGO-wise Monthly Collection</div>
                  <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                          <th style={{ padding: '9px 12px' }}>Month</th>
                          {monthlyNgos.map(n => <th key={n.id} style={{ padding: '9px 12px' }}>{NGO_SHORT[n.id] || n.name}</th>)}
                          <th style={{ padding: '9px 12px' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyMonths.map((m, i) => {
                          const monthTotal = monthly.monthlyTotal?.[i] || 0;
                          const isCurrent = m.key === monthKeyOf();
                          return (
                            <tr key={m.key} style={{ borderTop: '1px solid var(--line)', background: isCurrent ? '#F3FBF6' : 'transparent' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                {m.label}
                                {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#1f6f3f', background: '#D9F2E3', padding: '2px 6px', borderRadius: 999 }}>This month</span>}
                              </td>
                              {monthlyNgos.map(n => <td key={n.id} style={{ padding: '8px 12px' }}>{mask(currency(monthly.monthlyNgo?.[n.id]?.[i] || 0))}</td>)}
                              <td style={{ padding: '8px 12px', fontWeight: 700 }}>{mask(currency(monthTotal))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7', fontWeight: 700 }}>
                          <td style={{ padding: '8px 12px' }}>Total</td>
                          {monthlyNgos.map(n => <td key={n.id} style={{ padding: '8px 12px' }}>{mask(currency(sumMonths(monthly.monthlyNgo?.[n.id])))}</td>)}
                          <td style={{ padding: '8px 12px' }}>{mask(currency(sumMonths(monthly.monthlyTotal)))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Team-wise months */}
                <div style={{ padding: '14px 14px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Team-wise Monthly Collection</div>
                  {monthlyTeams.length === 0 ? (
                    <div className="empty" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>No team collection for this period.</div>
                  ) : (
                    <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                            <th style={{ padding: '9px 12px' }}>Month</th>
                            {monthlyTeams.map(t => <th key={t.team} style={{ padding: '9px 12px' }}>{t.team}{t.members > 0 ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · {t.members}</span> : null}</th>)}
                            <th style={{ padding: '9px 12px' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyMonths.map((m, i) => {
                            const monthTotal = monthlyTeams.reduce((s, t) => s + (t.months?.[i] || 0), 0);
                            return (
                              <tr key={m.key} style={{ borderTop: '1px solid var(--line)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.label}</td>
                                {monthlyTeams.map(t => <td key={t.team} style={{ padding: '8px 12px' }}>{mask(currency(t.months?.[i] || 0))}</td>)}
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{mask(currency(monthTotal))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7', fontWeight: 700 }}>
                            <td style={{ padding: '8px 12px' }}>Total</td>
                            {monthlyTeams.map(t => <td key={t.team} style={{ padding: '8px 12px' }}>{mask(currency(t.total))}</td>)}
                            <td style={{ padding: '8px 12px' }}>{mask(currency(monthlyTeams.reduce((s, t) => s + (t.total || 0), 0)))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Agent-wise months: agents as rows, months as columns, so the
                    table stays scrollable instead of growing a column per agent. */}
                <div style={{ padding: '14px 14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Agent-wise Monthly Collection</div>
                  {monthlyAgents.length === 0 ? (
                    <div className="empty" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>No agent collection for this period.</div>
                  ) : (
                    <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 980 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                            <th style={{ padding: '9px 12px' }}>#</th>
                            <th style={{ padding: '9px 12px', minWidth: 170 }}>Agent</th>
                            <th style={{ padding: '9px 12px' }}>Team</th>
                            {monthlyMonths.map(m => <th key={m.key} style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{m.label}</th>)}
                            <th style={{ padding: '9px 12px' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyAgents.map((a, i) => {
                            const st = TEAM_STYLE[a.team] || TEAM_STYLE['No Team'];
                            return (
                              <tr key={a.id || a.category || 'no-agent'} style={{ borderTop: '1px solid var(--line)', background: !a.id && !a.category ? '#F9FAFB' : 'transparent' }}>
                                <td style={{ padding: '8px 12px', color: '#6b7280' }}>{i + 1}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                  {a.name}
                                  {a.category && <span style={{ color: '#9ca3af', fontWeight: 400 }}> · category</span>}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {a.team ? <span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 600 }}>{a.team}</span> : <span style={{ color: '#9ca3af' }}>—</span>}
                                </td>
                                {monthlyMonths.map((m, mi) => <td key={m.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{mask(currency(a.months?.[mi] || 0))}</td>)}
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{mask(currency(a.total))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid var(--sage)', background: '#F6F8F7', fontWeight: 700 }}>
                            <td style={{ padding: '8px 12px' }}>Total</td>
                            <td style={{ padding: '8px 12px' }}>{monthlyAgents.length} agents</td>
                            <td style={{ padding: '8px 12px' }}></td>
                            {monthlyMonths.map((m, mi) => <td key={m.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{mask(currency(monthlyAgents.reduce((s, a) => s + (a.months?.[mi] || 0), 0)))}</td>)}
                            <td style={{ padding: '8px 12px' }}>{mask(currency(monthly.grandTotal || 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
            <button className="btn" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </button>
          </div>
        </>
      )}

      {access.modal}
    </div>
  );
}
