import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiGet, apiPost } from '../api/auth';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const NGOS = [
  { id: 'bsct', name: 'Being Sevak Charitable Trust', code: 'BSCT' },
  { id: 'aflf', name: 'Ashray Foundation', code: 'AFLF' },
  { id: 'mann', name: 'Mann Care', code: 'MANN' },
];
const STATIONS_FALLBACK = ['DH-1','DH-2','DH-3','DH-4','DH-5','DH-6','DH-7','DH-8','DH-9','DH-10','DH-11','DH-12','DH-13','DH-14','FD-1','FD-2','FD-3','FD-4','FD-5','FD-6','FD-7','FD-8','FD-9','FD-10','FD-11','FD-12','FD-13','FD-14','FD-15','FD-16','FD-17','FD-18','FD-19','FD-20','FD-21','FD-22','FD-23','ND-1','ND-2','ND-3','ND-4','ND-5','ND-6','ND-7','ND-8','M-2'];

function SkeletonBar({ w }) {
  return <div style={{ height: 14, width: w || '60%', borderRadius: 4, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }}>&nbsp;</div>;
}

const printStyle = `
  @media print {
    .no-print { display: none !important; }
    body { font-family: 'Inter', sans-serif; padding: 20px; color: #000; }
    .report-header { text-align: center; margin-bottom: 20px; }
    .report-header h1 { font-size: 20px; margin: 0 0 4px; }
    .report-header .sub { font-size: 12px; color: #666; }
    .card { border: 1px solid #ccc; border-radius: 6px; margin-bottom: 16px; }
    .card-head { padding: 10px 14px; border-bottom: 1px solid #ddd; font-size: 14px; font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 6px 10px; border: 1px solid #999; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
    .pill-gray { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; background: #eee; color: #666; }
  }
`;

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function workingDaysInMonth(y, m) {
  let c = 0; const d = daysInMonth(y, m);
  for (let day = 1; day <= d; day++) { const wd = new Date(y, m - 1, day).getDay(); if (wd !== 0) c++; }
  return c;
}

export default function Reports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [view, setView] = useState('overall'); // overall | day | month | team | ngo
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ngoFilter, setNgoFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [teamDetailNgoFilter, setTeamDetailNgoFilter] = useState('all');
  const [allStations, setAllStations] = useState(STATIONS_FALLBACK);
  const printRef = useRef(null);

  // Approximate targets — UI only, localStorage mock (both overall + per NGO/team)
  const targetKey = `accounts_approx_${reportMonth}`;
  const [overallTarget, setOverallTarget] = useState(() => {
    try { return Number(localStorage.getItem(targetKey) || 0) || 0; } catch { return 0; }
  });
  const [ngoTargets, setNgoTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(targetKey + '_ngo') || '{}'); } catch { return {}; }
  });
  const [teamTargets, setTeamTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(targetKey + '_team') || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    const k = `accounts_approx_${reportMonth}`;
    try {
      setOverallTarget(Number(localStorage.getItem(k) || 0) || 0);
      setNgoTargets(JSON.parse(localStorage.getItem(k + '_ngo') || '{}'));
      setTeamTargets(JSON.parse(localStorage.getItem(k + '_team') || '{}'));
    } catch {}
  }, [reportMonth]);
  const saveOverall = (v) => {
    const n = Number(v) || 0;
    setOverallTarget(n);
    localStorage.setItem(`accounts_approx_${reportMonth}`, String(n));
  };
  const saveNgoTarget = (ngo, v) => {
    const next = { ...ngoTargets, [ngo]: Number(v) || 0 };
    setNgoTargets(next);
    localStorage.setItem(`accounts_approx_${reportMonth}_ngo`, JSON.stringify(next));
  };
  const saveTeamTarget = (st, v) => {
    const next = { ...teamTargets, [st]: Number(v) || 0 };
    setTeamTargets(next);
    localStorage.setItem(`accounts_approx_${reportMonth}_team`, JSON.stringify(next));
  };

  useEffect(() => {
    (async () => {
      try {
        // Try multiple endpoints to get all stations per NGO
        let stations = null;
        for (const ep of ['/ngo-admin/stations', '/admin/stations', '/super-admin/stations', '/fro/stations']) {
          try {
            const r = await apiGet(ep);
            const arr = Array.isArray(r) ? r : r?.stations || r?.data || [];
            if (Array.isArray(arr) && arr.length > 0) {
              const names = arr.map(s => s.station || s.name || s).filter(Boolean);
              if (names.length > 5) { stations = [...new Set(names)].sort(); break; }
            }
          } catch {}
        }
        // Fallback: derive from teamWise mock if API fails — use distinct stations from assignments via reports data
        if (!stations || stations.length < 5) {
          try {
            const r = await apiGet('/accounts/day-end-report?month=' + reportMonth);
            if (r?.teamWise) stations = [...new Set(r.teamWise.map(t => t.station))].sort();
          } catch {}
        }
        if (stations && stations.length > 5) setAllStations(stations);
      } catch {}
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSent(false);
    try {
      const params = view === 'day' ? '?date=' + reportDate : '?month=' + reportMonth;
      const data = await apiGet('/accounts/day-end-report' + params);
      const [allEntries, allSources] = await Promise.all([
        apiGet('/accounts/bank-audit/entries').catch(() => []),
        apiGet('/accounts/bank-audit/sources').catch(() => []),
      ]);
      const srcMap = {};
      for (const e of allEntries) {
        const name = e.bank_audit_sources?.name || 'Unknown';
        srcMap[name] = (srcMap[name] || 0) + Number(e.amount || 0);
      }
      data.sourceBreakdown = (allSources || [])
        .filter(s => s.is_active !== false && (s.kind || 'bank') === 'bank')
        .filter((s, i, a) => a.findIndex(x => x.name === s.name) === i)
        .map(s => ({ name: s.name, amount: srcMap[s.name] || 0 }));

      // Mock team/ngo aggregates from totalCollected for UI-only — uses allStations
      const stationsForMock = allStations.length > 0 ? allStations : STATIONS_FALLBACK;
      const total = Number(data.totalCollected || 0);
      // NGO wise: split total proportionally by NGO
      const ngoSplit = NGOS.map((n, idx) => {
        const share = idx === 0 ? 0.5 : idx === 1 ? 0.3 : 0.2;
        return { ngo_id: n.id, ngo_name: n.name, code: n.code, collected: Math.round(total * share), submitted: Math.round((data.totalSubmitted || 0) * share) };
      });
      data.ngoWise = ngoSplit;
      // Team wise: split by stations
      data.teamWise = stationsForMock.map((st, idx) => {
        const share = 1 / stationsForMock.length;
        return { station: st, ngo_id: NGOS[idx % 3].id, collected: Math.round(total * share * (0.8 + Math.random() * 0.4)), team: st };
      });
      // Month trend mock (12 months)
      const [y, m] = reportMonth.split('-').map(Number);
      data.monthTrend = Array.from({ length: 12 }, (_, i) => {
        const mm = new Date(y, m - 12 + i, 1);
        const label = mm.toLocaleString('en-IN', { month: 'short' });
        return { month: label, collected: Math.round(total * (0.6 + Math.random() * 0.8)), submitted: Math.round((data.totalSubmitted || 0) * (0.6 + Math.random() * 0.8)) };
      });
      // Day wise within month mock
      const dim = daysInMonth(y, m);
      data.dayWise = Array.from({ length: dim }, (_, i) => ({
        day: String(i + 1).padStart(2, '0'),
        collected: Math.round((total / dim) * (0.5 + Math.random())),
        date: `${reportMonth}-${String(i + 1).padStart(2, '0')}`,
      }));

      setReport(data);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }, [view, reportDate, reportMonth, allStations]);

  useEffect(() => { load(); }, [load]);

  const sendReport = async () => {
    if (!report) return;
    setSending(true);
    setSent(false);
    try {
      const label = view === 'overall' ? 'Overall Report' : view === 'day' ? 'Day Report' : view === 'month' ? 'Month Report' : view === 'team' ? 'Team Report' : 'NGO Report';
      const lines = [label + ' - ' + report.date, '', 'Total Submitted: ' + currency(report.totalSubmitted), 'Total Collected: ' + currency(report.totalCollected), 'Suspense: ' + currency(report.suspenseAmount) + ' (' + report.suspenseCount + ' entries)'];
      if ((report.sourceBreakdown || []).length > 0) {
        lines.push('', 'Source-wise Collection:');
        report.sourceBreakdown.forEach(s => lines.push('  ' + s.name + ': ' + currency(s.amount)));
      }
      await apiPost('/admin/notifications/send-now', { title: label + ' - ' + report.date, body: lines.join('\n'), role: 'super_admin' });
      setSent(true);
    } catch (err) { alert(err.message); }
    finally { setSending(false); }
  };

  const exportExcel = () => {
    if (!report) return;
    const srcBreakdown = report.sourceBreakdown || [];
    const rows = [];
    if (view === 'overall') {
      const [y, m] = reportMonth.split('-').map(Number);
      const dim = daysInMonth(y, m);
      const wdim = workingDaysInMonth(y, m);
      const sundays = dim - wdim;
      const today = new Date();
      const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
      const todayDay = isCurrent ? today.getDate() : dim;
      let workingElapsed = 0;
      for (let d = 1; d <= todayDay; d++) if (new Date(y, m - 1, d).getDay() !== 0) workingElapsed++;
      const pendingDays = Math.max(0, wdim - workingElapsed);
      const target = overallTarget || 0;
      const pending = Math.max(0, target - (report.totalCollected || 0));
      const avgPerDay = pendingDays > 0 ? Math.ceil(pending / pendingDays) : pending;
      rows.push(['Overall Summary - ' + reportMonth]);
      rows.push(['Target', target]);
      rows.push(['Total Pending', pending]);
      rows.push(['Average Per Day', avgPerDay]);
      rows.push([`${dim} Days - ${sundays} Sun - ${workingElapsed} Days = ${pendingDays} Days Pending`]);
      rows.push([]);
    }
    if (srcBreakdown.length) {
      rows.push(srcBreakdown.map(s => s.name).concat('Total'));
      rows.push(srcBreakdown.map(s => s.amount).concat(srcBreakdown.reduce((t, s) => t + s.amount, 0)));
      rows.push([]);
    }
    rows.push(['Total Submitted', 'Total Collected', 'Suspense']);
    rows.push([report.totalSubmitted, report.totalCollected, report.suspenseAmount]);
    if ((view === 'overall' || view === 'team') && report.teamWise) {
      rows.push([]); rows.push(['Team-wise']); rows.push(['Station','Collected']);
      report.teamWise.forEach(r => rows.push([r.station, r.collected]));
    }
    if ((view === 'overall' || view === 'ngo') && report.ngoWise) {
      rows.push([]); rows.push(['NGO-wise']); rows.push(['NGO','Collected']);
      report.ngoWise.forEach(r => rows.push([r.ngo_name, r.collected]));
    }
    if (report.suspenseEntries.length > 0) {
      rows.push([]); rows.push(['Suspense Details']); rows.push(['Payment ID','Source','Amount']);
      report.suspenseEntries.forEach(e => rows.push([e.payment_id || '---', e.bank_audit_sources?.name || 'Unknown', e.amount]));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const label = view.charAt(0).toUpperCase() + view.slice(1) + '-Report';
    XLSX.writeFile(wb, label + '-' + report.date + '.xlsx');
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>Report</title><style>' + printStyle + '</style></head><body>');
    w.document.write(printRef.current?.innerHTML || '');
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const { dailyOverall, dailyWorking, remaining, remainingWorking, progress } = useMemo(() => {
    const [y, m] = reportMonth.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const wdim = workingDaysInMonth(y, m);
    const today = new Date(); const todayDay = today.getMonth() + 1 === m && today.getFullYear() === y ? today.getDate() : dim;
    const remDays = Math.max(1, dim - todayDay + 1);
    const remWorking = Math.max(1, wdim - Math.min(todayDay, wdim) + 1);
    const target = overallTarget || 0;
    const achieved = report ? Number(report.totalCollected || 0) : 0;
    const rem = Math.max(0, target - achieved);
    return {
      dailyOverall: target ? Math.ceil(target / dim) : 0,
      dailyWorking: target ? Math.ceil(target / wdim) : 0,
      remaining: rem,
      remainingWorking: rem ? Math.ceil(rem / remDays) : 0,
      remainingWorkingDays: remWorking,
      progress: target ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
      achieved, target, dim, wdim, remDays
    };
  }, [reportMonth, overallTarget, report]);

  const filteredTeam = useMemo(() => {
    if (!report?.teamWise) return [];
    return report.teamWise.filter(r => (ngoFilter === 'all' || r.ngo_id === ngoFilter) && (stationFilter === 'all' || r.station === stationFilter));
  }, [report, ngoFilter, stationFilter]);
  const filteredNgo = useMemo(() => {
    if (!report?.ngoWise) return [];
    return report.ngoWise.filter(r => ngoFilter === 'all' || r.ngo_id === ngoFilter);
  }, [report, ngoFilter]);

  const COLORS = ['#5B6B4E','#B5603A','#8B9A7E','#D4A574','#6B8E7F','#C4A77D'];

  return (
    <div>
      <style>{printStyle + '@keyframes sk-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>

      <div className="no-print" style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--line)', overflowX: 'auto' }}>
        {[
          { id: 'overall', label: 'Overall' },
          { id: 'day', label: 'Day-wise' },
          { id: 'month', label: 'Month-wise' },
          { id: 'team', label: 'Team-wise' },
          { id: 'ngo', label: 'NGO-wise' },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', color: view === t.id ? 'var(--sage)' : 'var(--ink-soft)', borderBottom: view === t.id ? '2px solid var(--sage)' : '2px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          {view === 'overall' ? 'Overall Report' : view === 'day' ? 'Day-wise Report' : view === 'month' ? 'Month-wise Report' : view === 'team' ? 'Team-wise Report' : 'NGO-wise Report'}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {view === 'day'
            ? <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }} />
            : <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }} />
          }
          <select value={ngoFilter} onChange={e => setNgoFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--card-bg)' }}>
            <option value="all">All NGOs</option>
            {NGOS.map(n => <option key={n.id} value={n.id}>{n.code}</option>)}
          </select>
          {(view === 'team' || view === 'day') && (
            <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--card-bg)' }}>
              <option value="all">All Teams ({allStations.length})</option>
              {allStations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button className="btn btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Approximate target card — both overall + per NGO/team, daily avg both calendar & working */}
      <div className="card" style={{ marginBottom: 16, border: '1px solid var(--line)' }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Approximate Target — {reportMonth}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { const v = prompt('Enter Overall Target for ' + reportMonth, String(overallTarget || '')); if (v !== null) saveOverall(v); }} style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--sage)', background: 'var(--sage)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add Overall Target</button>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>UI only — saved locally</span>
          </div>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600 }}>Overall target (₹)
              <input type="number" value={overallTarget || ''} onChange={e => saveOverall(e.target.value)} placeholder="Enter amount" style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13 }} />
            </label>
            {NGOS.map(n => (
              <label key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600 }}>{n.code} target (₹)
                <input type="number" value={ngoTargets[n.id] || ''} onChange={e => saveNgoTarget(n.id, e.target.value)} placeholder="—" style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13 }} />
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, maxHeight: 180, overflowY: 'auto', paddingRight: 4, border: '1px dashed var(--line)', borderRadius: 8, padding: 8 }}>
            {allStations.map(st => (
              <label key={st} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600 }}>{st} target (₹)
                <input type="number" value={teamTargets[st] || ''} onChange={e => saveTeamTarget(st, e.target.value)} placeholder="—" style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13 }} />
              </label>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 4 }}>Showing all {allStations.length} stations — scroll to see more</div>
          {overallTarget > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 4 }}>
              <div style={{ background: '#F3EFE7', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Avg / calendar day</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sage)' }}>{currency(dailyOverall)}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>₹ {overallTarget.toLocaleString('en-IN')} / {daysInMonth(new Date(reportMonth.split('-')[0], reportMonth.split('-')[1], 0).getDate())} days</div>
              </div>
              <div style={{ background: '#FBFAF6', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Avg / working day</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#B5603A' }}>{currency(dailyWorking)}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Excl. Sundays</div>
              </div>
              <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Required now</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: remaining > 0 ? '#dc2626' : 'var(--sage)' }}>{remaining > 0 ? currency(Math.ceil(remaining / Math.max(1, daysInMonth(new Date(reportMonth.split('-')[0], reportMonth.split('-')[1], 0).getDate()) - new Date().getDate() + 1))) + ' / day' : 'Target met'}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Remaining {currency(remaining)}</div>
              </div>
              <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Progress</div>
                <div style={{ height: 8, background: '#E4DECF', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--sage)', borderRadius: 999 }} /></div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{progress}% • {currency(report?.totalCollected || 0)} / {currency(overallTarget)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="stats-grid">
          <div className="stat-card" style={{ gridColumn: '1 / -1' }}><SkeletonBar w="40%" /><SkeletonBar w="20%" /></div>
          {[1, 2, 3].map(i => <div key={i} className="stat-card"><SkeletonBar w="60%" /><SkeletonBar w="30%" /></div>)}
        </div>
      ) : report ? (
        <div ref={printRef}>
          <div className="report-header" style={{ textAlign: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 700 }}>{view === 'day' ? 'Day-wise' : view === 'month' ? 'Month-wise' : view === 'team' ? 'Team-wise' : 'NGO-wise'} Report</h1>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{report.date} {ngoFilter !== 'all' ? `• ${ngoFilter}` : ''} {stationFilter !== 'all' ? `• ${stationFilter}` : ''}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#5B6B4E08' }}>
                    <th style={{ padding: '10px 14px', borderBottom: '2px solid var(--line)', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ink-soft)' }}>Total Submitted</th>
                    <th style={{ padding: '10px 14px', borderBottom: '2px solid var(--line)', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ink-soft)' }}>Total Collected</th>
                    <th style={{ padding: '10px 14px', borderBottom: '2px solid var(--line)', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ink-soft)' }}>Suspense</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#B5603A', fontSize: 24, fontWeight: 700 }}>{currency(report.totalSubmitted)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#5B6B4E', fontSize: 24, fontWeight: 700 }}>{currency(report.totalCollected)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#dc2626', fontSize: 24, fontWeight: 700 }}>{currency(report.suspenseAmount)}<br /><span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>{report.suspenseCount} unverified entries</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {view === 'overall' && (
            <div className="card" style={{ marginBottom: 16, padding: 16, border: '2px solid var(--sage)', background: 'linear-gradient(135deg, #F3EFE7 0%, #FBFAF6 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Overall Summary — {reportMonth}</h3>
                <button onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--sage)', background: 'var(--sage)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download Excel
                </button>
              </div>
              {(() => {
                const [y, m] = reportMonth.split('-').map(Number);
                const dim = daysInMonth(y, m);
                const wdim = workingDaysInMonth(y, m);
                let sundays = dim - wdim;
                const today = new Date();
                const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
                const todayDay = isCurrentMonth ? today.getDate() : dim;
                let workingElapsed = 0;
                for (let d = 1; d <= todayDay; d++) { if (new Date(y, m - 1, d).getDay() !== 0) workingElapsed++; }
                const pendingDays = Math.max(0, wdim - workingElapsed);
                const target = overallTarget || 0;
                const collected = report.totalCollected || 0;
                const pending = Math.max(0, target - collected);
                const avgPerDay = pendingDays > 0 ? Math.ceil(pending / pendingDays) : pending;
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 10 }}>
                      <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Target</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{currency(target)}</div>
                      </div>
                      <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', fontWeight: 600 }}>Total Pending</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{currency(pending)}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Collected {currency(collected)}</div>
                      </div>
                      <div style={{ background: 'var(--sage)', borderRadius: 8, padding: 12, border: '1px solid var(--sage)', textAlign: 'center', color: '#fff' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, opacity: .9, fontWeight: 600 }}>Average Per Day</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{currency(avgPerDay)}</div>
                        <div style={{ fontSize: 10, opacity: .9 }}>Pending / {pendingDays || 1} days</div>
                      </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px dashed var(--line)', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                      {dim} Days - {sundays} Sun - {workingElapsed} Days = {pendingDays} Days Pending
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10, color: 'var(--ink-soft)', flexWrap: 'wrap' }}>
                      <span>Target</span><span>•</span><span>Total Pending</span><span>•</span><span>Average Per Day</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 600 }}>Excel includes this summary</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Charts per view */}
          {(view === 'overall' || view === 'month') && report.monthTrend && (
            <div className="card" style={{ marginBottom: 16, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Month-wise Trend (12 months)</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.monthTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="collected" fill="#5B6B4E" name="Collected" />
                    <Bar dataKey="submitted" fill="#B5603A" name="Submitted" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {(view === 'overall' || view === 'day') && report.dayWise && (
            <div className="card" style={{ marginBottom: 16, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Day-wise Collection — {reportMonth}</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.dayWise}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="collected" stroke="#5B6B4E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {(view === 'overall' || view === 'team') && (
            <div className="card" style={{ marginBottom: 16, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Team-wise Collection</div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredTeam}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="station" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="collected" fill="#5B6B4E" name="Collected" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {(view === 'overall' || view === 'ngo') && (
            <div className="card" style={{ marginBottom: 16, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>NGO-wise Collection</div>
              <div style={{ height: 260, display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={filteredNgo} dataKey="collected" nameKey="code" cx="50%" cy="50%" outerRadius={90} label={({ code, collected }) => `${code} ${currency(collected)}`}>
                      {filteredNgo.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(report.sourceBreakdown || []).length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3>Source-wise Collection</h3></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {report.sourceBreakdown.map(s => <th key={s.name} style={{ textAlign: 'center' }}>{s.name}</th>)}
                      <th style={{ textAlign: 'center', color: 'var(--sage)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {report.sourceBreakdown.map(s => <td key={s.name} style={{ textAlign: 'center', color: 'var(--sage)', fontWeight: 600, fontSize: 16 }}>{currency(s.amount)}</td>)}
                      <td style={{ textAlign: 'center', color: '#5B6B4E', fontWeight: 700, fontSize: 18 }}>{currency(report.sourceBreakdown.reduce((t, s) => t + s.amount, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: 'var(--ink-soft)' }}>No bank audit entries found</div>
          )}

          {(view === 'overall' || view === 'team') && filteredTeam.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>Team Details</h3>
                <select value={teamDetailNgoFilter} onChange={e => setTeamDetailNgoFilter(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card-bg)' }}>
                  <option value="all">All NGOs</option>
                  {NGOS.map(n => <option key={n.id} value={n.id}>{n.code}</option>)}
                </select>
              </div>
              <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Team / Station</th><th>NGO</th><th>Collected</th><th>Target</th><th>Avg / day</th></tr></thead>
                  <tbody>
                    {(teamDetailNgoFilter === 'all' ? filteredTeam : filteredTeam.filter(r => r.ngo_id === teamDetailNgoFilter)).map(r => {
                      const t = teamTargets[r.station] || 0;
                      const avg = t ? Math.ceil(t / daysInMonth(...reportMonth.split("-").map(Number))) : 0;
                      return <tr key={r.station}><td>{r.station}</td><td>{r.ngo_id}</td><td style={{ fontWeight: 600 }}>{currency(r.collected)}</td><td>{t ? currency(t) : '—'}</td><td>{t ? currency(avg) : '—'}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(view === 'overall' || view === 'ngo') && filteredNgo.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3>NGO Details</h3></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>NGO</th><th>Collected</th><th>Submitted</th><th>Target</th><th>Avg / day</th></tr></thead>
                  <tbody>
                    {filteredNgo.map(r => {
                      const t = ngoTargets[r.ngo_id] || 0;
                      const avg = t ? Math.ceil(t / daysInMonth(...reportMonth.split("-").map(Number))) : 0;
                      return <tr key={r.ngo_id}><td>{r.ngo_name} ({r.code})</td><td style={{ fontWeight: 600 }}>{currency(r.collected)}</td><td>{currency(r.submitted)}</td><td>{t ? currency(t) : '—'}</td><td>{t ? currency(avg) : '—'}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.suspenseEntries.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3>Suspense Details</h3></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Payment ID</th><th>Source</th><th>Amount</th></tr></thead>
                  <tbody>
                    {report.suspenseEntries.map(e => (
                      <tr key={e.id}><td style={{ fontSize: 12 }}>{e.payment_id || '\u2014'}</td><td><span className="pill pill-gray">{e.bank_audit_sources?.name || 'Unknown'}</span></td><td style={{ color: '#dc2626', fontWeight: 600 }}>{currency(e.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: 'var(--ink-soft)' }}>No suspense entries</div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>No data for this period</div>
      )}

      {report && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {sent && <span style={{ fontSize: 13, color: 'var(--sage)', fontWeight: 600, alignSelf: 'center' }}>Report sent to Super Admin</span>}
          <button className="btn" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </button>
          <button className="btn" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <button className="btn btn-primary" onClick={sendReport} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            {sending ? 'Sending...' : 'Send to Super Admin'}
          </button>
        </div>
      )}
    </div>
  );
}
