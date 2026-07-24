import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPut } from '../api/auth';
import { toast } from '../../../components/Toast';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

export default function RejectedLeads() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(setAccessibleNgos).catch((err) => { console.error('Error:', err.message); });
  }, []);

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    apiGet(`/ngo-admin/rejected-leads${ngoParam}`)
      .then(d => setTickets(d || []))
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => { if (showLoading) setLoading(false); });
  };

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(false), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedNgoId]);

  const ack = async (id) => {
    try {
      await apiPut(`/ngo-admin/rejected-leads/${id}/acknowledge`);
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'acknowledged' } : t));
    } catch (err) { toast(err.message, 'error'); }
  };

  const pending = tickets.filter(t => t.status === 'pending_review');
  const acknowledged = tickets.filter(t => t.status === 'acknowledged');

  function CardList({ items, emptyText }) {
    if (items.length === 0) return <div style={{ textAlign:'center', padding:24, color:'var(--ink-soft)', fontSize:13 }}>{emptyText}</div>;
    return (
      <div style={{ display:'grid', gap:10 }}>
        {items.map(t => (
          <div key={t.id} style={{
            background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px',
            border: '1px solid var(--line)', boxShadow: 'var(--shadow)',
            opacity: t.status === 'acknowledged' ? 0.55 : 1,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
              <strong style={{ fontSize:14 }}>{t.donor_name}</strong>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--sage)' }}>{currency(t.amount)}</span>
              <span className="pill pill-gray" style={{ fontSize:10 }}>{t.fro_name}</span>
              {t.status === 'pending_review'
                ? <span className="pill pill-red" style={{ fontSize:10 }}>Pending</span>
                : <span className="pill pill-green" style={{ fontSize:10 }}>Reviewed</span>}
            </div>
            <div style={{ fontSize:12, color:'var(--ink-soft)', lineHeight:1.4, whiteSpace:'pre-wrap', marginBottom:8 }}>
              {t.rejection_reason}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
              <span style={{ fontSize:11, color:'var(--ink-soft)' }}>
                {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '\u2014'}
              </span>
              {t.status === 'pending_review' && (
                <button className="btn btn-sm btn-primary" onClick={() => ack(t.id)} style={{ fontSize:11, padding:'4px 12px' }}>
                  Acknowledge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
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
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:140, background:'var(--card-bg)', borderRadius:'var(--radius-sm)', padding:'14px 16px', border:'1px solid var(--line)', boxShadow:'var(--shadow)' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#dc2626', lineHeight:1.1 }}>{pending.length}</div>
          <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:4 }}>Pending Review</div>
        </div>
        <div style={{ flex:1, minWidth:140, background:'var(--card-bg)', borderRadius:'var(--radius-sm)', padding:'14px 16px', border:'1px solid var(--line)', boxShadow:'var(--shadow)' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#16a34a', lineHeight:1.1 }}>{acknowledged.length}</div>
          <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:4 }}>Acknowledged</div>
        </div>
        <div style={{ flex:1, minWidth:140, background:'var(--card-bg)', borderRadius:'var(--radius-sm)', padding:'14px 16px', border:'1px solid var(--line)', boxShadow:'var(--shadow)' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#5B6B4E', lineHeight:1.1 }}>{currency(tickets.reduce((s, t) => s + Number(t.amount || 0), 0))}</div>
          <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:4 }}>Total Amount</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'grid', gap:10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background:'var(--card-bg)', borderRadius:'var(--radius-sm)', padding:20, border:'1px solid var(--line)' }}>
              <div style={{ height:14, width:'40%', borderRadius:4, marginBottom:8, background:'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
              <div style={{ height:12, width:'60%', borderRadius:4, background:'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <h3 style={{ fontSize:14, fontWeight:700, margin:'0 0 10px' }}>Pending Review ({pending.length})</h3>
              <CardList items={pending} emptyText="No pending rejected leads" />
            </div>
          )}

          {acknowledged.length > 0 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:700, margin:'0 0 10px' }}>Acknowledged ({acknowledged.length})</h3>
              <CardList items={acknowledged} emptyText="No acknowledged leads" />
            </div>
          )}

          {tickets.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'var(--ink-soft)', fontSize:13 }}>No rejected leads yet</div>
          )}
        </>
      )}
    </div>
  );
}
