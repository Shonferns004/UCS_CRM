import { useState, useRef, useCallback } from 'react';
import { apiGet, apiPost } from '../api/auth';

// Shared 4-digit access-code gate used by the Receipts download buttons and the
// locked Reports page. open() shows a modal and resolves true only when a valid
// code is entered (or created the first time). The code is stored/verified on
// the server, so the secret never reaches the frontend bundle.
export default function useAccessCode() {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState('enter'); // 'enter' | 'create'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolverRef = useRef(null);

  const finish = useCallback((result) => {
    setShow(false);
    setCode('');
    setError('');
    setBusy(false);
    if (resolverRef.current) { resolverRef.current(result); resolverRef.current = null; }
  }, []);

  const open = useCallback(() => new Promise((resolve) => {
    resolverRef.current = resolve;
    setCode('');
    setError('');
    setBusy(false);
    apiGet('/accounts/access-code/status')
      .then((res) => {
        setMode(res && res.set ? 'enter' : 'create');
        setShow(true);
      })
      .catch(() => { setMode('enter'); setShow(true); });
  }), []);

  const submit = useCallback(async () => {
    if (code.length !== 4) { setError('Enter the 4-digit code.'); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'create') {
        const res = await apiPost('/accounts/access-code', { code });
        if (res && res.ok) return finish(true);
        setError((res && res.message) || 'Could not set the code.');
      } else {
        const res = await apiPost('/accounts/access-code/verify', { code });
        if (res && res.ok) return finish(true);
        setError((res && (res.message || 'Incorrect code.')) || 'Incorrect code.');
      }
    } catch (e) {
      const msg = (e && e.message) || 'Request failed.';
      if (/already set/i.test(msg)) { setMode('enter'); setError('A code already exists. Enter it instead.'); }
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }, [code, mode, finish]);

  const modal = show ? (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ maxWidth: 380, width: '90%' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            {mode === 'create' ? 'Create Access Code' : 'Enter Access Code'}
          </h3>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            {mode === 'create'
              ? 'No access code exists yet. Create a 4-digit code so only finance can download and unlock the report.'
              : 'Enter the 4-digit access code to continue.'}
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="••••"
            style={{ width: '100%', padding: '12px 14px', fontSize: 22, textAlign: 'center', letterSpacing: 12, borderRadius: 8, boxSizing: 'border-box', border: error ? '1px solid #dc2626' : '1px solid var(--line)' }}
          />
          {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-sm" onClick={() => finish(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
              {busy ? 'Checking...' : (mode === 'create' ? 'Create & Continue' : 'Unlock')}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return { open, modal };
}
