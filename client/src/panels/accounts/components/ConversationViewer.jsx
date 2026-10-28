import { useState, useEffect } from 'react';
import { apiGet } from '../api/auth';

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
          {!loading && !data?.error && (data?.messages?.length ? data.messages.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: 12, background: m.direction === 'outbound' ? '#dcf8c6' : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                {m.direction === 'inbound' && m.project && <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 600 }}>{m.project.toUpperCase()}</div>}
                {m.message_type === 'image' && m.media_url && (
                  <img src={m.media_url} alt="image" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6, display: 'block' }} />
                )}
                {m.template_header && m.template_header.format === 'IMAGE' && m.template_header.example?.header_handle?.[0] && (
                  <img src={m.template_header.example.header_handle[0]} alt="header" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6, display: 'block' }} />
                )}
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body_text || (m.message_type === 'image' ? '' : `[${m.message_type}]`)}</div>
                {Array.isArray(m.template_buttons) && m.template_buttons.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {m.template_buttons.map((b, i) => (
                      <a key={i} href={b.url || '#'} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '6px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, color: '#0866FF', textDecoration: 'none', fontWeight: 600 }}>
                        {b.text || b.type}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <span>{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
                  {m.direction === 'outbound' && <span>{m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : m.status === 'failed' ? '✗' : '✓'}</span>}
                </div>
                {m.failure_reason && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{m.failure_reason}</div>}
              </div>
            </div>
          )) : <p style={{ textAlign: 'center', color: '#6b7280' }}>No messages yet.</p>)}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
          <button className="wa-btn wa-btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}