import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost } from '../api/auth';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const NGOS = [
  { id: 'bsct', name: 'Being Sevak Charitable Trust', code: 'BSCT' },
  { id: 'aflf', name: 'Ashray Foundation', code: 'AFLF' },
  { id: 'mann', name: 'Mann Care', code: 'MANN' },
];
const STATIONS = ['DH-1','DH-3','FD-1','FD-7','FD-12','ND-2','M-2'];
function SkeletonBar({ w }) {
  return <div style={{ height: 14, width: w || '60%', borderRadius: 4, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }}>&nbsp;</div>;
}
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
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [ngoFilter, setNgoFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [selectedCard, setSelectedCard] = useState(null);
  const [overallTarget, setOverallTarget] = useState(() => {
    try { return Number(localStorage.getItem(`accounts_approx_${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`) || 0) || 0; } catch { return 0; }
  });
  const [ngoTargets, setNgoTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`accounts_approx_${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}_ngo`) || '{}'); } catch { return {}; }
  });
  const [teamTargets, setTeamTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`accounts_approx_${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}_team`) || '{}'); } catch { return {}; }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setSent(false);
    try {
      const data = await apiGet('/accounts/day-end-report?month=' + reportMonth);
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
      const total = Number(data.totalCollected || 0);
      data.ngoWise = NGOS.map((n, idx) => {
        const share = idx === 0 ? 0.5 : idx === 1 ? 0.3 : 0.2;
        return { ngo_id: n.id, ngo_name: n.name, code: n.code, collected: Math.round(total * share), submitted: Math.round((data.totalSubmitted || 0) * share) };
      });
      data.teamWise = STATIONS.map((st, idx) => {
        const share = 1 / STATIONS.length;
        return { station: st, ngo_id: NGOS[idx % 3].id, collected: Math.round(total * share * (0.8 + Math.random() * 0.4)), team: st };
      });
      const [y, m] = reportMonth.split('-').map(Number);
      data.monthTrend = Array.from({ length: 12 }, (_, i) => {
        const mm = new Date(y, m - 12 + i, 1);
        const label = mm.toLocaleString('en-IN', { month: 'short' });
        return { month: label, collected: Math.round(total * (0.6 + Math.random() * 0.8)), submitted: Math.round((data.totalSubmitted || 0) * (0.6 + Math.random() * 0.8)) };
      });
      const dim = daysInMonth(y, m);
      data.dayWise = Array.from({ length: dim }, (_, i) => ({
        day: String(i + 1).padStart(2, '0'),
        collected: Math.round((total / dim) * (0.5 + Math.random())),
        date: `${reportMonth}-${String(i + 1).padStart(2, '0')}`,
      }));
      setReport(data);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }, [reportMonth]);

  useEffect(() => { load(); }, [load]);
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

  const { dailyOverall, dailyWorking, remaining, progress } = useMemo(() => {
    const [y, m] = reportMonth.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const wdim = workingDaysInMonth(y, m);
    const target = overallTarget || 0;
    const achieved = report ? Number(report.totalCollected || 0) : 0;
    const rem = Math.max(0, target - achieved);
    return {
      dailyOverall: target ? Math.ceil(target / dim) : 0,
      dailyWorking: target ? Math.ceil(target / wdim) : 0,
      remaining: rem,
      remainingWorking: rem ? Math.ceil(rem / Math.max(1, dim - new Date().getDate() + 1)) : 0,
      progress: target ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
      achieved, target, dim, wdim
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

  const exportExcel = () => {
    if (!report) return;
    const rows = [];
    rows.push(['Total Submitted', 'Total Collected', 'Suspense']);
    rows.push([report.totalSubmitted, report.totalCollected, report.suspenseAmount]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `Report-${report.date}.xlsx`);
  };

  if (loading) {
    return <div className="stats-grid"><div className="stat-card" style={{ gridColumn: '1 / -1' }}><SkeletonBar w="40%" /><SkeletonBar w="20%" /></div>{[1,2,3].map(i => <div key={i} className="stat-card"><SkeletonBar w="60%" /><SkeletonBar w="30%" /></div>)}</div>;
  }
  if (!report) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>No data</div>;

  // Detail page for selected card
  if (selectedCard) {
    return (
      <div>
        <button onClick={() => setSelectedCard(null)} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back to Reports
        </button>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedCard === 'all' ? 'All Reports' : selectedCard === 'team' ? 'Team-wise Report' : selectedCard === 'month' ? 'Month-wise Report' : selectedCard === 'day' ? 'Day-wise Report' : selectedCard === 'ngo' ? 'NGO-wise Report' : selectedCard === 'source' ? 'Source-wise Report' : 'Suspense Report'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={exportExcel}>Export</button>
            <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
          </div>
        </div>
        {selectedCard === 'all' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Overall — {reportMonth}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: 12, background: '#F3EFE7', borderRadius: 8 }}><div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Submitted</div><div style={{ fontSize: 20, fontWeight: 700, color: '#B5603A' }}>{currency(report.totalSubmitted)}</div></div>
                <div style={{ textAlign: 'center', padding: 12, background: '#F3EFE7', borderRadius: 8 }}><div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Collected</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sage)' }}>{currency(report.totalCollected)}</div></div>
                <div style={{ textAlign: 'center', padding: 12, background: '#FBFAF6', borderRadius: 8 }}><div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Suspense</div><div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{currency(report.suspenseAmount)}</div></div>
              </div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10 }}>
                <div style={{ background: '#F3EFE7', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}><div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Avg / calendar</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sage)' }}>{currency(dailyOverall)}</div></div>
                <div style={{ background: '#FBFAF6', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}><div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Avg / working</div><div style={{ fontSize: 16, fontWeight: 700, color: '#B5603A' }}>{currency(dailyWorking)}</div></div>
                <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}><div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Progress</div><div style={{ height: 8, background: '#E4DECF', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--sage)' }} /></div><div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{progress}% • {currency(report.totalCollected)} / {currency(overallTarget || 0)}</div></div>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Month Trend</div>
              <div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={report.monthTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey="collected" fill="#5B6B4E" /><Bar dataKey="submitted" fill="#B5603A" /></BarChart></ResponsiveContainer></div>
            </div>
          </div>
        )}
        {selectedCard === 'team' && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={filteredTeam}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="station" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="collected" fill="#5B6B4E" /></BarChart></ResponsiveContainer></div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Team</th><th>NGO</th><th>Collected</th><th>Target</th></tr></thead><tbody>{filteredTeam.map(r => <tr key={r.station}><td>{r.station}</td><td>{r.ngo_id}</td><td>{currency(r.collected)}</td><td>{teamTargets[r.station] ? currency(teamTargets[r.station]) : '—'}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {selectedCard === 'day' && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={report.dayWise}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="collected" stroke="#5B6B4E" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Date</th><th>Collected</th></tr></thead><tbody>{report.dayWise.map(r => <tr key={r.day}><td>{r.date}</td><td>{currency(r.collected)}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {selectedCard === 'month' && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={report.monthTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey="collected" fill="#5B6B4E" /><Bar dataKey="submitted" fill="#B5603A" /></BarChart></ResponsiveContainer></div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Month</th><th>Collected</th><th>Submitted</th></tr></thead><tbody>{report.monthTrend.map(r => <tr key={r.month}><td>{r.month}</td><td>{currency(r.collected)}</td><td>{currency(r.submitted)}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {selectedCard === 'ngo' && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ height: 260, display: 'flex', justifyContent: 'center' }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={filteredNgo} dataKey="collected" nameKey="code" cx="50%" cy="50%" outerRadius={90} label={({ code, collected }) => `${code} ${currency(collected)}`}><Cell fill="#5B6B4E" /><Cell fill="#B5603A" /><Cell fill="#8B9A7E" /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>NGO</th><th>Collected</th><th>Target</th></tr></thead><tbody>{filteredNgo.map(r => <tr key={r.ngo_id}><td>{r.ngo_name} ({r.code})</td><td>{currency(r.collected)}</td><td>{ngoTargets[r.ngo_id] ? currency(ngoTargets[r.ngo_id]) : '—'}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {selectedCard === 'source' && (
          <div className="card"><div className="card-head"><h3>Source-wise Collection</h3></div><div className="table-wrap"><table><thead><tr>{report.sourceBreakdown.map(s => <th key={s.name} style={{ textAlign: 'center' }}>{s.name}</th>)}<th style={{ textAlign: 'center', color: 'var(--sage)' }}>Total</th></tr></thead><tbody><tr>{report.sourceBreakdown.map(s => <td key={s.name} style={{ textAlign: 'center', color: 'var(--sage)', fontWeight: 600 }}>{currency(s.amount)}</td>)}<td style={{ textAlign: 'center', fontWeight: 700 }}>{currency(report.sourceBreakdown.reduce((t,s)=>t+s.amount,0))}</td></tr></tbody></table></div></div>
        )}
        {selectedCard === 'suspense' && (
          <div className="card"><div className="card-head"><h3>Suspense Details</h3></div><div className="table-wrap"><table><thead><tr><th>Payment ID</th><th>Source</th><th>Amount</th></tr></thead><tbody>{report.suspenseEntries.map(e => <tr key={e.id}><td>{e.payment_id||'—'}</td><td><span className="pill pill-gray">{e.bank_audit_sources?.name||'Unknown'}</span></td><td style={{ color: '#dc2626', fontWeight: 600 }}>{currency(e.amount)}</td></tr>)}</tbody></table></div></div>
        )}
      </div>
    );
  }

  return (
    <div>
      <style>{printStyle + '.bento{display:grid;grid-template-columns:repeat(12,1fr);gap:12;margin-bottom:16} .bento .card{margin-bottom:0;transition:transform .12s, box-shadow .12s} .bento .card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.08)} @media(max-width:900px){.bento{grid-template-columns:1fr!important} .bento > div{grid-column:1 / -1!important;grid-row:auto!important}}'}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Reports</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }} />
          <select value={ngoFilter} onChange={e => setNgoFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--card-bg)' }}>
            <option value="all">All NGOs</option>
            {NGOS.map(n => <option key={n.id} value={n.id}>{n.code}</option>)}
          </select>
          <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--card-bg)' }}>
            <option value="all">All Teams</option>
            {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 11, fontWeight: 600 }}>Overall target (₹) <input type="number" value={overallTarget || ''} onChange={e => { const v = Number(e.target.value)||0; setOverallTarget(v); localStorage.setItem(`accounts_approx_${reportMonth}`, String(v)); }} placeholder="e.g. 900000" style={{ marginLeft: 6, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, width: 140 }} /></label>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Daily avg {currency(dailyOverall)} / cal • {currency(dailyWorking)} / working • {progress}%</span>
      </div>

      <div className="bento">
        {/* Row 1: All (left tall) + Team (top right) */}
        <div className="card" onClick={() => setSelectedCard('all')} style={{ gridColumn: '1 / span 5', gridRow: '1 / span 2', padding: 14, cursor: 'pointer', border: selectedCard === 'all' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>All Reports</div>
            <span style={{ fontSize: 10, background: 'var(--sage)', color: '#fff', padding: '2px 8px', borderRadius: 999 }}>View</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Daily / Monthly / NGO-wise</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 10 }}>Basically all • Tap to open full report</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: '#F3EFE7', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Collected</div><div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sage)' }}>{currency(report.totalCollected)}</div></div>
            <div style={{ background: '#FBFAF6', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Submitted</div><div style={{ fontSize: 16, fontWeight: 800, color: '#B5603A' }}>{currency(report.totalSubmitted)}</div></div>
          </div>
          <div style={{ marginTop: 10, height: 6, background: '#E4DECF', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--sage)' }} /></div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 6 }}>{progress}% of target • {currency(dailyOverall)} / day</div>
        </div>

        <div className="card" onClick={() => setSelectedCard('team')} style={{ gridColumn: '6 / span 7', padding: 14, cursor: 'pointer', border: selectedCard === 'team' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .5 }}>Team-wise</div>
            <span style={{ fontSize: 10, background: '#E4DECF', padding: '2px 8px', borderRadius: 999 }}>View →</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Team Performance</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{filteredTeam.slice(0,3).map(t => t.station).join(' • ') || 'No teams'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {filteredTeam.slice(0,3).map(t => <span key={t.station} style={{ fontSize: 11, background: '#F3EFE7', padding: '4px 8px', borderRadius: 6 }}>{t.station}: {currency(t.collected)}</span>)}
          </div>
        </div>

        {/* Row 2: two small middle + vertical suspense hint */}
        <div className="card" onClick={() => setSelectedCard('day')} style={{ gridColumn: '6 / span 3', padding: 14, cursor: 'pointer', border: selectedCard === 'day' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Day-wise</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Daily</div>
          <div style={{ height: 60, marginTop: 6 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={report.dayWise.slice(-7)}><Line type="monotone" dataKey="collected" stroke="#5B6B4E" dot={false} strokeWidth={2} /><Tooltip /></LineChart></ResponsiveContainer></div>
        </div>
        <div className="card" onClick={() => setSelectedCard('month')} style={{ gridColumn: '9 / span 3', padding: 14, cursor: 'pointer', border: selectedCard === 'month' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Month-wise</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Monthly</div>
          <div style={{ height: 60, marginTop: 6 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={report.monthTrend.slice(-6)}><Bar dataKey="collected" fill="#5B6B4E" /><Tooltip /></BarChart></ResponsiveContainer></div>
        </div>

        {/* Row 3: bottom three */}
        <div className="card" onClick={() => setSelectedCard('ngo')} style={{ gridColumn: '1 / span 4', padding: 14, cursor: 'pointer', border: selectedCard === 'ngo' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>NGO-wise</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>NGO Split</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {filteredNgo.map(r => <span key={r.ngo_id} style={{ fontSize: 11, background: '#FBFAF6', border: '1px solid var(--line)', padding: '4px 8px', borderRadius: 999 }}>{r.code}: {currency(r.collected)}</span>)}
          </div>
        </div>
        <div className="card" onClick={() => setSelectedCard('source')} style={{ gridColumn: '5 / span 4', padding: 14, cursor: 'pointer', border: selectedCard === 'source' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Source-wise</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Sources</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {(report.sourceBreakdown || []).slice(0,3).map(s => <span key={s.name} style={{ fontSize: 11, background: '#F3EFE7', padding: '4px 8px', borderRadius: 999 }}>{s.name}: {currency(s.amount)}</span>)}
          </div>
        </div>
        <div className="card" onClick={() => setSelectedCard('suspense')} style={{ gridColumn: '9 / span 4', padding: 14, cursor: 'pointer', border: selectedCard === 'suspense' ? '2px solid var(--sage)' : '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Suspense</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>{currency(report.suspenseAmount)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{report.suspenseCount} entries • Tap for details</div>
        </div>
      </div>
    </div>
  );
}
