import { useState, useEffect } from 'react';
import { apiGet } from '../api/auth';

function fmtTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const STATUS_COLORS = {
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  'half-day': '#8b5cf6',
  leave: '#3b82f6',
};

function WorkerDetail({ worker, records, onBack }) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const filtered = records.filter(r => {
    if (r.worker_id !== worker.id) return false;
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    return true;
  });

  const stats = { present: 0, late: 0, absent: 0, 'half-day': 0, leave: 0 };
  filtered.forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>{'\u{2190}'}</button>
        <h2>{worker.name}</h2>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-pad">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="field" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              From
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ fontSize: 13, marginLeft: 6 }} />
            </label>
            <label className="field" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              To
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ fontSize: 13, marginLeft: 6 }} />
            </label>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} records</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(stats).map(([k, v]) => (
          <div key={k} style={{
            background: `${STATUS_COLORS[k]}12`, borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 80,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: STATUS_COLORS[k] }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{k}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-pad" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Punch In</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Punch Out</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Late (min)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #e5e7eb)', color: '#6b7280' }}>{r.date}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>{fmtTime(r.punch_in_time)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>{fmtTime(r.punch_out_time)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #e5e7eb)', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: `${STATUS_COLORS[r.status]}18`, color: STATUS_COLORS[r.status],
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #e5e7eb)', textAlign: 'right', color: r.late_minutes > 0 ? '#f59e0b' : '#d1d5db' }}>{r.late_minutes || 0}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>No records for this date range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NgoAttendance() {
  const [records, setRecords] = useState([]);
  const [froWorkers, setFroWorkers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [err, setErr] = useState('');
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(setAccessibleNgos).catch((err) => { console.error('Error:', err.message); });
  }, []);

  useEffect(() => {
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    apiGet(`/attendance/all${ngoParam}`).then(setRecords).catch(e => setErr(e.message));
    apiGet('/ngo-admin/fro-workers').then(setFroWorkers).catch((err) => { console.error('Error:', err.message); });
  }, [selectedNgoId]);

  const froIds = new Set(froWorkers.map(w => w.id));

  if (selectedWorker) {
    return (
      <WorkerDetail
        worker={selectedWorker}
        records={records.filter(r => froIds.has(r.worker_id))}
        onBack={() => setSelectedWorker(null)}
      />
    );
  }

  let filtered = records.filter(r => {
    return r.date === date && froIds.has(r.worker_id);
  });

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(r => (r.workers?.name || '').toLowerCase().includes(s));
  }

  return (
    <div>
      <div className="filter-bar">
        <span style={{fontSize:13, fontWeight:600, color:'var(--ink-soft)'}}>NGO:</span>
        <select value={selectedNgoId} onChange={e => setSelectedNgoId(e.target.value)}>
          <option value="all">All NGOs</option>
          {accessibleNgos.map(ngo => (
            <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
          ))}
        </select>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>FRO Attendance</h3></div>
        <div className="card-pad">
          {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#991b1b' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line, #e5e7eb)' }} />
            <input placeholder="Search worker…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line, #e5e7eb)', flex: 1, maxWidth: 240 }} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)', whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Worker</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Punch In</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Punch Out</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '2px solid var(--line, #e5e7eb)' }}>Late (min)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)', whiteSpace: 'nowrap', color: '#6b7280' }}>{r.date}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)', fontWeight: 500 }}>
                      <span
                        onClick={() => setSelectedWorker({ id: r.worker_id, name: r.workers?.name })}
                        style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2, color: 'var(--sage, #5B6B4E)' }}>
                        {r.workers?.name || 'Unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>{fmtTime(r.punch_in_time)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>{fmtTime(r.punch_out_time)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: STATUS_COLORS[r.status] ? `${STATUS_COLORS[r.status]}18` : '#f3f4f6',
                        color: STATUS_COLORS[r.status] || '#6b7280',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)', textAlign: 'right', color: r.late_minutes > 0 ? '#f59e0b' : '#d1d5db' }}>{r.late_minutes || 0}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>No FRO attendance records for this date</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}