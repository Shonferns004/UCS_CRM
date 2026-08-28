import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../api/auth';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

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

export default function Reports() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // monthly target editor state
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetForm, setTargetForm] = useState({ overall: '', perNgo: {} });
  const [savingTarget, setSavingTarget] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const monthLabel = useCallback((m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '';
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, mm - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, []);

  const load = useCallback(async (m) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet('/accounts/report-data?month=' + (m || month));
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(month); }, [month]);

  // Open target form pre-filled from saved targets (or blank for even split)
  const openTargetForm = () => {
    const ngos = data?.ngos || [];
    const byNgo = data?.byNgoTargets || {};
    const perNgo = {};
    ngos.forEach(n => { perNgo[n.id] = byNgo[n.id] != null ? String(byNgo[n.id]) : ''; });
    setTargetForm({ overall: data?.overallTarget ? String(data.overallTarget) : '', perNgo });
    setShowTargetForm(true);
    setSavedToast(false);
  };

  // When overall typed in the form -> even split across NGOs
  const onOverallChange = (val) => {
    const ngos = data?.ngos || [];
    const overall = Number(val) || 0;
    const perNgo = {};
    if (ngos.length > 0 && overall > 0) {
      const share = Math.floor(overall / ngos.length);
      let rem = overall - share * ngos.length;
      ngos.forEach((n, i) => {
        // give the remainder to the last NGO so the sum matches exactly
        perNgo[n.id] = String(share + (i === ngos.length - 1 ? rem : 0));
      });
    } else {
      ngos.forEach(n => { perNgo[n.id] = ''; });
    }
    setTargetForm({ overall: val, perNgo });
  };

  // When an individual NGO target is edited -> recompute overall = sum
  const onNgoTargetChange = (slug, val) => {
    const perNgo = { ...targetForm.perNgo, [slug]: val };
    const overall = Object.values(perNgo).reduce((s, v) => s + (Number(v) || 0), 0);
    setTargetForm({ overall: overall ? String(overall) : '', perNgo });
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
    setTargetForm({ overall: targetForm.overall, perNgo });
  };

  const saveTarget = async () => {
    const ngos = data?.ngos || [];
    const byNgo = {};
    let overall = 0;
    ngos.forEach(n => {
      const v = Number(targetForm.perNgo[n.id]) || 0;
      byNgo[n.id] = v;
      overall += v;
    });
    setSavingTarget(true);
    try {
      await apiPut('/accounts/report-targets', { month, overall, byNgo });
      setSavedToast(true);
      setShowTargetForm(false);
      await load(month);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      setError(e.message || 'Failed to save target');
    } finally {
      setSavingTarget(false);
    }
  };

  // effective per-NGO targets = saved (from backend rows) unless editing
  const ngos = data?.ngos || [];
  const sourceOrder = data?.sourceOrder || [];
  const rows = data?.rows || [];

  // target lookup: saved per-ngo (byNgoTargets) merged over rows
  const savedTargets = {};
  rows.forEach(r => { savedTargets[r.id] = r.monthlyTarget; });

  // grand totals
  const grandBySource = {};
  sourceOrder.forEach(s => {
    grandBySource[s] = ngos.reduce((sum, n) => sum + ((data?.byNgo?.[n.id]?.sources?.[s]) || 0), 0);
  });
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandSuspense = rows.reduce((s, r) => s + r.suspense, 0);

  // export CSV
  const exportCsv = () => {
    const header = ['NGO', ...sourceOrder, 'Total', 'Suspense', 'Monthly Target', 'Working Days', 'Daily Target', 'Avg/Day', 'Diff'];
    const body = rows.map(r => [
      r.name,
      ...sourceOrder.map(s => (data?.byNgo?.[r.id]?.sources?.[s]) || 0),
      r.total, r.suspense, r.monthlyTarget, r.workingDaysSoFar,
      round2(r.targetDaily), round2(r.actualAvg), round2(r.diff),
    ]);
    const all = [header, ...body];
    const csv = '\uFEFF' + all.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-report-${month}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => { window.print(); };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <style>{printStyle}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }} />
          <button className="btn btn-sm" onClick={() => load(month)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>
        <button className="btn btn-primary" onClick={openTargetForm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Monthly Target
        </button>
      </div>

      {savedToast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>Target saved successfully.</div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{error}</div>
      )}

      {/* Monthly Target editor */}
      {showTargetForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16, border: '2px solid var(--sage)' }}>
          <div className="card-head" style={{ padding: 0, border: 0, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Monthly Target — {monthLabel(month)}</h3>
            <button className="btn btn-sm" onClick={() => setShowTargetForm(false)}>Cancel</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Overall Target (auto even-split)</div>
              <input type="number" value={targetForm.overall} onChange={e => onOverallChange(e.target.value)}
                placeholder="e.g. 900000" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, fontWeight: 600 }} />
            </div>
            <button className="btn btn-sm" onClick={rebalanceEvenly} title="Redistribute overall evenly across NGOs">Re-balance Evenly</button>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={saveTarget} disabled={savingTarget}>
              {savingTarget ? 'Saving...' : 'Save Target'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Editing one NGO overrides its equal share; overall = sum of all NGOs.</span>
          </div>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Collection Report — {monthLabel(month)}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{loading ? 'Loading...' : `${currency(grandTotal)} collected`}</div>
        </div>
        {rows.map(r => (
          <div className="stat-card" key={r.id}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.name} · {currency(r.total)}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{currency(r.monthlyTarget)}<span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500 }}> target</span></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="empty" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>Loading report…</div>
      ) : (
        <>
          {/* Target & daily-average summary */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3 style={{ margin: 0, fontSize: 14 }}>NGO-wise Target vs Collection</h3></div>
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', fontSize: 12 }}>
                    <th style={{ padding: '8px 12px' }}>NGO</th>
                    <th style={{ padding: '8px 12px' }}>Monthly Target</th>
                    <th style={{ padding: '8px 12px' }}>Total Collected</th>
                    <th style={{ padding: '8px 12px' }}>Working Days</th>
                    <th style={{ padding: '8px 12px' }}>Daily Target</th>
                    <th style={{ padding: '8px 12px' }}>Avg/Day</th>
                    <th style={{ padding: '8px 12px' }}>Diff</th>
                    <th style={{ padding: '8px 12px' }}>Suspense</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const diffColor = r.diff >= 0 ? '#1B7A3D' : '#B3392B';
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: '8px 12px' }}>{currency(r.monthlyTarget)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{currency(r.total)}</td>
                        <td style={{ padding: '8px 12px' }}>{r.workingDaysSoFar}</td>
                        <td style={{ padding: '8px 12px' }}>{currency(round2(r.targetDaily))}</td>
                        <td style={{ padding: '8px 12px' }}>{currency(round2(r.actualAvg))}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: diffColor }}>{round2(r.diff) >= 0 ? '+' : ''}{currency(round2(r.diff))}</td>
                        <td style={{ padding: '8px 12px', color: '#dc2626' }}>{currency(r.suspense)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Source-wise collection per NGO */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3 style={{ margin: 0, fontSize: 14 }}>Collection by Source (NGO-wise)</h3></div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', fontSize: 12 }}>
                    <th style={{ padding: '8px 12px' }}>Source</th>
                    {ngos.map(n => <th key={n.id} style={{ padding: '8px 12px' }}>{n.name}</th>)}
                    <th style={{ padding: '8px 12px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceOrder.map(src => (
                    <tr key={src} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px' }}><span className="pill pill-gray">{src}</span></td>
                      {ngos.map(n => (
                        <td key={n.id} style={{ padding: '8px 12px' }}>{currency(data?.byNgo?.[n.id]?.sources?.[src] || 0)}</td>
                      ))}
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{currency(grandBySource[src])}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--sage)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>Total</td>
                    {ngos.map(n => (
                      <td key={n.id} style={{ padding: '8px 12px', fontWeight: 700 }}>{currency(data?.byNgo?.[n.id]?.total ?? rows.find(r => r.id === n.id)?.total ?? 0)}</td>
                    ))}
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{currency(grandTotal)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px' }}><span className="pill pill-gray" style={{ color: '#dc2626' }}>Suspense</span></td>
                    {rows.map(r => (
                      <td key={r.id} style={{ padding: '8px 12px', color: '#dc2626' }}>{currency(r.suspense)}</td>
                    ))}
                    <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 700 }}>{currency(grandSuspense)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
    </div>
  );
}
