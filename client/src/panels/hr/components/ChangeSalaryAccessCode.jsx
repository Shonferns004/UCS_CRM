import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../store';

const codeset = (v) => String(v || '').replace(/\D/g, '').slice(0, 4);

export default function ChangeSalaryAccessCode() {
  const [set, setSet] = useState(null); // null = loading
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet('/salary/access-code/status')
      .then(d => { if (!cancelled) setSet(!!(d && d.set)); })
      .catch(() => { if (!cancelled) setSet(false); });
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => { setCurrent(''); setNext(''); setConfirm(''); setError(''); };

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    if (!set) {
      if (next.length !== 4) { setError('Enter a 4-digit code.'); return; }
      if (next !== confirm) { setError('Codes do not match.'); return; }
    } else {
      if (current.length !== 4 || next.length !== 4) { setError('Enter the 4-digit codes.'); return; }
      if (next !== confirm) { setError('New codes do not match.'); return; }
    }
    setBusy(true);
    try {
      if (!set) {
        const res = await apiPost('/salary/access-code', { code: next });
        if (res && res.ok) { setSet(true); setSuccess('Access code created.'); resetForm(); }
        else setError('Could not create the code.');
      } else {
        const res = await apiPost('/salary/access-code/change', { currentCode: current, newCode: next });
        if (res && res.ok) setSuccess('Access code changed.');
        else setError((res && res.message) || 'Could not change the code.');
      }
    } catch (e) {
      if (/already set/i.test((e && e.message) || '')) { setSet(true); setError('A code is already set. Use the change form.'); }
      else setError((e && e.message) || 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
  const input = { width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box', fontSize: 15, textAlign: 'center', letterSpacing: 8, border: error ? '1px solid #ef4444' : '1px solid #d1d9e4', outline: 'none' };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 4px', lineHeight: 1.5 }}>
        Your access code unlocks confidential salary information. It is unique to your account.
      </p>
      {set == null ? (
        <div style={{ fontSize: 13, color: '#9ca3af', padding: '16px 0' }}>Checking…</div>
      ) : set ? (
        <>
          <p style={{ fontSize: 12.5, color: '#15803d', fontWeight: 600, margin: '4px 0 14px' }}>✓ An access code is set for your account.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Current code</label>
            <input type="password" inputMode="numeric" value={current} onChange={e => { setCurrent(codeset(e.target.value)); setSuccess(''); }} style={input} placeholder="••••" />
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: '#b45309', fontWeight: 600, margin: '4px 0 14px' }}>No access code yet. Create a 4-digit code.</p>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={label}>{set ? 'New code' : 'Create code'}</label>
        <input type="password" inputMode="numeric" value={next} onChange={e => { setNext(codeset(e.target.value)); setSuccess(''); }} style={input} placeholder="••••" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Confirm code</label>
        <input type="password" inputMode="numeric" value={confirm} onChange={e => { setConfirm(codeset(e.target.value)); setSuccess(''); }} style={input} placeholder="••••"
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} />
      </div>

      {success && <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: 8, marginBottom: 14 }}>{success}</div>}
      {error && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 500, marginBottom: 10 }}>{error}</div>}

      <button onClick={handleSubmit} disabled={busy} style={{
        width: '100%', padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
        background: '#2563eb', color: '#fff', border: 'none', opacity: busy ? 0.6 : 1, boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
      }}>{busy ? 'Saving…' : (set ? 'Change Access Code' : 'Create & Save')}</button>
    </div>
  );
}
