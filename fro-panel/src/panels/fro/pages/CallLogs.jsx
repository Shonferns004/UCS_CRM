import { useState, useEffect } from 'react';
import { fetchCallLogs } from '../api/callLogs';
import { DatePicker } from '../components/ui';
import { SkeletonTable } from '../../../components/Skeleton';

const STATUS_STYLES = {
  connected: 'pill-green',
  not_reached: 'pill-yellow',
  busy: 'pill-red',
  switched_off: 'pill-gray',
  wrong_number: 'pill-red',
};

export default function CallLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = () => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    fetchCallLogs(params)
      .then(setLogs)
      .catch((err) => { console.error('API error:', err.message); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFilter = () => { load(); };

  if (loading) return <SkeletonTable rows={6} />;

  return (
    <div className="bento-grid" style={{flex:1}}>
      <div className="bento-col-12">
        <div className="bento-card">
          <div className="bento-card-h"><h3>Call Logs</h3></div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ border:'1px solid var(--md-outline-variant)', borderRadius:8, padding:'4px 8px', fontSize:10, fontFamily:'inherit', outline:'none' }}>
              <option value="">All statuses</option>
              <option value="connected">Connected</option>
              <option value="not_reached">Not Reached</option>
              <option value="busy">Busy</option>
              <option value="switched_off">Switched Off</option>
              <option value="wrong_number">Wrong Number</option>
            </select>
            <DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From" />
            <DatePicker value={toDate} onChange={e => setToDate(e.target.value)} placeholder="To" />
            <button onClick={handleFilter}
              style={{ padding:'4px 10px', border:'none', borderRadius:8, background:'var(--md-primary)', color:'#fff', fontSize:10, fontWeight:600, fontFamily:'inherit', cursor:'pointer' }}>Filter</button>
            <span style={{ fontSize:10, color:'var(--md-outline)' }}>{logs.length} log{logs.length !== 1 ? 's' : ''}</span>
          </div>

          {logs.length === 0 ? (
            <div style={{ textAlign:'center', padding:30, color:'var(--md-outline)' }}>
              <div style={{ fontSize:28, marginBottom:6, opacity:.3 }}>📞</div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>No call logs</div>
              <div style={{ fontSize:10 }}>Calls you log will appear here.</div>
            </div>
          ) : (
            <div style={{ overflowX:'auto', margin:'-4px 0' }}>
              <table className="bento-table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Lead</th>
                    <th>Phone</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Follow-up</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace:'nowrap', fontSize:10 }}>
                        {new Date(log.call_time).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td style={{ fontWeight:500, fontSize:11 }}>{log.leads?.name || '—'}</td>
                      <td style={{ fontSize:10 }}>{log.leads?.phone || '—'}</td>
                      <td><span className="bento-pill bento-pill-gray" style={{fontSize:8}}>{log.call_type}</span></td>
                      <td>
                        <span className={`bento-pill ${STATUS_STYLES[log.status] || 'bento-pill-gray'}`} style={{fontSize:8}}>
                          {log.status ? log.status.replace(/_/g, ' ') : '—'}
                        </span>
                      </td>
                      <td style={{ fontSize:10 }}>{log.duration_seconds > 0 ? `${log.duration_seconds}s` : '—'}</td>
                      <td style={{ fontSize:10 }}>
                        {log.follow_up_date
                          ? new Date(log.follow_up_date + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' })
                          : '—'}
                      </td>
                      <td style={{ maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--md-outline)', fontSize:10 }}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
