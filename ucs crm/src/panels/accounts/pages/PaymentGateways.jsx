import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../api/auth';

function SkeletonTableRows({ rows, cols }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }, (_, j) => (
        <td key={j}>
          <div style={{ height: 12, width: j < 2 ? 160 : 80, borderRadius: 4, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }}>&nbsp;</div>
        </td>
      ))}
    </tr>
  ));
}

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

export default function PaymentGateways() {
  const [log, setLog] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterGateway, setFilterGateway] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterGateway) params.set('gateway', filterGateway);
      const [logRes, statusRes] = await Promise.allSettled([
        apiGet('/webhooks/log?' + params.toString()),
        apiGet('/webhooks/status'),
      ]);
      if (logRes.status === 'fulfilled') setLog(logRes.value || []);
      if (statusRes.status === 'fulfilled') setCounts(statusRes.value.counts || {});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterGateway]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await apiPost('/webhooks/razorpay/sync');
      alert(result.message || 'Sync completed');
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setSyncing(false); }
  };

  const razorpayCount = (counts['razorpay_processed'] || 0) + (counts['razorpay_received'] || 0);
  const paytmCount = (counts['paytm_processed'] || 0) + (counts['paytm_received'] || 0);
  const razorpayFailed = counts['razorpay_failed'] || 0;
  const paytmFailed = counts['paytm_failed'] || 0;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ gridColumn: '1 / -1', border: '2px solid #5B6B4E', background: 'linear-gradient(135deg, #5B6B4E08 0%, #5B6B4E18 100%)', padding: '18px 22px' }}>
          <div className="stat-icon" style={{ background: '#5B6B4E20', color: '#5B6B4E', width: 48, height: 48, borderRadius: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num" style={{ fontSize: 22, fontWeight: 800, color: '#5B6B4E' }}>Payment Gateways</div>
            <div className="stat-lbl" style={{ fontSize: 13, fontWeight: 600, color: '#5B6B4E', opacity: 0.7 }}>
              Auto-import Razorpay & Paytm payments into Bank Audit
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#0d948818', color: '#0d9488' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{razorpayCount}</div>
            <div className="stat-lbl">Razorpay Payments</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#2563eb18', color: '#2563eb' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{paytmCount}</div>
            <div className="stat-lbl">Paytm Payments</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dc262618', color: '#dc2626' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{razorpayFailed + paytmFailed}</div>
            <div className="stat-lbl">Failed</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Webhook Log</span>
          <select value={filterGateway} onChange={e => setFilterGateway(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--line)', marginLeft: 8 }}>
            <option value="">All Gateways</option>
            <option value="razorpay">Razorpay</option>
            <option value="paytm">Paytm</option>
          </select>
          <button className="btn btn-sm" onClick={() => loadData()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg>
            Refresh
          </button>
          <button className="btn btn-sm" onClick={handleSync} disabled={syncing}
            style={{ marginLeft: 'auto', background: 'var(--sage)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {syncing ? 'Syncing...' : 'Sync Razorpay'}
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Gateway</th>
                <th>Event</th>
                <th>Amount</th>
                <th>Payment ID</th>
                <th>Order ID</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={5} cols={8} />
              ) : log.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No webhook events yet</td></tr>
              ) : (
                log.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '\u2014'}</td>
                    <td><span className="pill" style={{ background: e.gateway === 'razorpay' ? '#0d948818' : '#2563eb18', color: e.gateway === 'razorpay' ? '#0d9488' : '#2563eb', fontSize: 11 }}>{e.gateway}</span></td>
                    <td style={{ fontSize: 11 }}>{e.event_type || '\u2014'}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--sage)' }}>{e.amount ? currency(e.amount) : '\u2014'}</td>
                    <td style={{ fontSize: 11 }}>{e.payment_id || '\u2014'}</td>
                    <td style={{ fontSize: 11 }}>{e.order_id || '\u2014'}</td>
                    <td style={{ fontSize: 11 }}>{e.gateway_source || '\u2014'}</td>
                    <td>
                      <span className={`pill ${e.status === 'processed' ? 'pill-green' : e.status === 'failed' ? 'pill-red' : 'pill-gray'}`} style={{ fontSize: 11 }}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
