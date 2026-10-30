import { useState, useEffect } from 'react';
import WhatsAppMessageList from './WhatsAppMessageList';

export default function ConversationViewer({ phone, accountId, onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId ? String(accountId) : 'all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/whatsapp/accounts').then(d => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const qs = selectedAccountId && selectedAccountId !== 'all' ? `?accountId=${selectedAccountId}` : '';
        const d = await apiGet(`/whatsapp/conversations/${phone}${qs}`);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setData({ error: e.message || 'Failed' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, selectedAccountId]);

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: '95%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Chat — {phone}</h3>
          <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} style={{ marginLeft: 'auto', height: 30, fontSize: 12, border: '1px solid #cbd0dc', borderRadius: 6 }}>
            <option value="all">All NGOs</option>
            {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        </div>
        <div className="modal-body" style={{ padding: 12, overflowY: 'auto', flex: 1, background: '#efeae2' }}>
          {loading && <p>Loading...</p>}
          {!loading && data?.error && <p style={{ color: '#dc2626' }}>{data.error}</p>}
          {!loading && !data?.error && (data?.messages?.length ? <WhatsAppMessageList messages={data.messages} loading={false} error={null} /> : <p style={{ textAlign: 'center', color: '#6b7280' }}>No messages yet.</p>)}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
          <button className="wa-btn wa-btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}