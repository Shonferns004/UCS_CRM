import { useState, useEffect } from 'react';
import { getMyHistory } from '../api/donors';
import { SkeletonTable } from '../../../components/Skeleton';

const ACTION_LABELS = {
  disposition: 'Disposition', call: 'Call', visit: 'Visit',
  message: 'Message', follow_up: 'Follow Up', donation: 'Donation', note: 'Note',
};

function getActionColor(action) {
  switch (action) {
    case 'disposition': return '#5B6B4E';
    case 'call': return '#4338ca';
    case 'visit': return '#0891b2';
    case 'donation': return '#16a34a';
    case 'note': return '#6b7280';
    default: return '#6b7280';
  }
}

export default function History() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getMyHistory().then(data => setLogs(Array.isArray(data) ? data : [])).catch(() => setLogs([])).finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? logs.filter(l => (l.donor_name || '').toLowerCase().includes(search.toLowerCase()) || (l.donor_mobile || '').includes(search))
    : logs;

  if (loading) return <SkeletonTable rows={10} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by donor name or mobile..."
          style={{ flex:1, maxWidth:320, padding:'7px 10px', border:'1px solid var(--line)', borderRadius:6, fontSize:12, fontFamily:'inherit', outline:'none' }} />
        <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{filtered.length} log{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, fontSize:12, color:'var(--ink-soft)' }}>No activity yet.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--line)' }}>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Donor</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Mobile</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Action</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Detail</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Notes</th>
                <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Amount</th>
                <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} style={{ borderBottom:'1px solid var(--line)' }}>
                  <td style={{ padding:'8px 10px', fontWeight:600 }}>{l.donor_name || '—'}</td>
                  <td style={{ padding:'8px 10px', color:'var(--ink-soft)' }}>{l.donor_mobile || '—'}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:4, fontSize:10, fontWeight:600, color:'#fff', background:getActionColor(l.action) }}>
                      {ACTION_LABELS[l.action] || l.action}
                    </span>
                  </td>
                  <td style={{ padding:'8px 10px', textTransform:'capitalize' }}>
                    {l.disposition_detail ? l.disposition_detail.replace(/_/g, ' ') : '—'}
                  </td>
                  <td style={{ padding:'8px 10px', color:'var(--ink-soft)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {l.notes || '—'}
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, color:l.amount_collected != null ? 'var(--sage)' : 'inherit' }}>
                    {l.amount_collected != null ? `₹${Number(l.amount_collected).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:'var(--ink-soft)', fontSize:11 }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
