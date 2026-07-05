import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPut } from '../api/auth';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

export default function RejectedLeads() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const intervalRef = useRef(null);

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    apiGet('/ngo-admin/rejected-leads')
      .then(d => setTickets(d || []))
      .catch(() => {})
      .finally(() => { if (showLoading) setLoading(false); });
  };

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(false), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const ack = async (id) => {
    try {
      await apiPut(`/ngo-admin/rejected-leads/${id}/acknowledge`);
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'acknowledged' } : t));
    } catch (err) { alert(err.message); }
  };

  const pending = tickets.filter(t => t.status === 'pending_review');
  const acknowledged = tickets.filter(t => t.status === 'acknowledged');
  const displayed = tab === 'pending' ? pending : acknowledged;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dc262618', color: '#dc2626' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{pending.length}</div>
            <div className="stat-lbl">Pending Review</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#16a34a18', color: '#16a34a' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{acknowledged.length}</div>
            <div className="stat-lbl">Acknowledged</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#5B6B4E18', color: '#5B6B4E' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{currency(tickets.reduce((s, t) => s + Number(t.amount || 0), 0))}</div>
            <div className="stat-lbl">Total Amount</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--line)' }}>
        <button onClick={() => setTab('pending')}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', color: tab === 'pending' ? 'var(--sage)' : 'var(--ink-soft)', borderBottom: tab === 'pending' ? '2px solid var(--sage)' : '2px solid transparent', marginBottom: -2 }}>
          Pending ({pending.length})
        </button>
        <button onClick={() => setTab('acknowledged')}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', color: tab === 'acknowledged' ? 'var(--sage)' : 'var(--ink-soft)', borderBottom: tab === 'acknowledged' ? '2px solid var(--sage)' : '2px solid transparent', marginBottom: -2 }}>
          Acknowledged ({acknowledged.length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: 20, border: '1px solid var(--line)' }}>
              <div style={{ height: 14, width: '40%', borderRadius: 4, marginBottom: 8, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
              <div style={{ height: 12, width: '60%', borderRadius: 4, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 13 }}>
          {tab === 'pending' ? 'No pending rejected leads' : 'No acknowledged leads'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {displayed.map(t => (
            <div key={t.id} style={{
              background: 'var(--card-bg)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px 18px',
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow)',
              opacity: t.status === 'acknowledged' ? 0.6 : 1,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: t.status === 'pending_review' ? '#dc262618' : '#16a34a18',
                color: t.status === 'pending_review' ? '#dc2626' : '#16a34a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.status === 'pending_review' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{t.donor_name}</strong>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sage)' }}>{currency(t.amount)}</span>
                  <span className="pill pill-gray" style={{ fontSize: 10 }}>{t.fro_name}</span>
                  {t.status === 'pending_review' ? (
                    <span className="pill pill-red" style={{ fontSize: 10 }}>Pending</span>
                  ) : (
                    <span className="pill pill-green" style={{ fontSize: 10 }}>Reviewed</span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {t.rejection_reason}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'}
                  </span>
                  {t.status === 'pending_review' && (
                    <button className="btn btn-sm btn-primary" onClick={() => ack(t.id)} style={{ fontSize: 11, padding: '4px 12px' }}>
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
