import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../api/auth';

export default function WhatsAppSettings() {
  const [status, setStatus] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);

  async function checkStatus() {
    try {
      const data = await apiGet('/whatsapp/status');
      setStatus(data);
    } catch (err) { setStatus({ success: false, message: err.message }); }
  }

  useEffect(() => { checkStatus(); }, []);

  const handleTest = async () => {
    if (!testPhone) { alert('Enter a phone number'); return; }
    setSending(true);
    try {
      const data = await apiPost('/whatsapp/test', { to: testPhone });
      alert('Test message sent! ' + (data.data?.messages?.[0]?.id || ''));
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSending(false); }
  };

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ gridColumn: '1 / -1', border: '2px solid #25D366', background: 'linear-gradient(135deg, #25D36608 0%, #25D36618 100%)', padding: '18px 22px' }}>
          <div className="stat-icon" style={{ background: '#25D36620', color: '#25D366', width: 48, height: 48, borderRadius: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num" style={{ fontSize: 22, fontWeight: 800, color: '#075e54' }}>WhatsApp API</div>
            <div className="stat-lbl" style={{ fontSize: 13, fontWeight: 600, color: '#075e54', opacity: 0.7 }}>
              Send receipts directly to donors via WhatsApp
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: status ? 10 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Connection Status:</span>
            {status === null ? (
              <span className="pill pill-gray" style={{ fontSize: 11 }}>Checking...</span>
            ) : status.success ? (
              <span className="pill" style={{ background: '#25D36620', color: '#25D366', fontSize: 11 }}>Connected</span>
            ) : (
              <span className="pill pill-red" style={{ fontSize: 11 }}>Disconnected</span>
            )}
            <button className="btn btn-sm" onClick={checkStatus} style={{ fontSize: 11, padding: '2px 8px' }}>Refresh</button>
          </div>
          {status && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{status.message}</div>
          )}
        </div>

        <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Send Test Message</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Phone Number (with country code)</span>
              <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                placeholder="e.g. 917506419340"
                style={{ marginTop: 2, fontSize: 13, padding: '6px 8px' }} />
            </label>
            <button className="btn btn-sm" onClick={handleTest} disabled={sending}
              style={{ marginTop: 16, background: '#25D366', color: '#fff', border: 'none', padding: '7px 16px' }}>
              {sending ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
