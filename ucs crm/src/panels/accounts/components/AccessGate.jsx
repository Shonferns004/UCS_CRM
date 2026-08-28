import { useState, useRef, useCallback } from 'react';
import { apiGet, apiPost } from '../api/auth';
import { useAccessCodeStore } from '../../../context/accessCodeStore';

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
    if (result === true) useAccessCodeStore.getState().setUnlocked();
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
    <div
      onClick={e => { if (e.target === e.currentTarget) finish(false); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'acgFade .18s ease',
      }}
    >
      <div
        style={{
          background: '#ffffff', width: 400, maxWidth: '100%', borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
          animation: 'acgPop .2s ease',
        }}
      >
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #eef1f5' }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 12, marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: mode === 'create' ? '#EFF6FF' : '#F0FDF4',
              boxShadow: 'inset 0 0 0 1px ' + (mode === 'create' ? 'rgba(37,99,235,0.2)' : 'rgba(22,163,74,0.2)'),
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={mode === 'create' ? '#2563eb' : '#16a34a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              {mode === 'create'
                ? <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
            </svg>
          </div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
            {mode === 'create' ? 'Create Access Code' : 'Enter Access Code'}
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            {mode === 'create'
              ? 'No access code exists yet. Create a 4-digit code so only finance can download and unlock the report.'
              : 'Enter the 4-digit access code to continue.'}
          </p>
        </div>

        <div style={{ padding: 20 }}>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="••••"
            style={{
              width: '100%', padding: '14px', fontSize: 26, fontWeight: 600,
              textAlign: 'center', letterSpacing: 14, boxSizing: 'border-box',
              borderRadius: 12, outline: 'none', color: '#0f172a',
              border: error ? '1px solid #ef4444' : '1px solid #d1d9e4',
              background: error ? '#fef2f2' : '#f8fafc',
              transition: 'border-color .15s, box-shadow .15s',
              boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.12)' : (code.length === 4 ? '0 0 0 3px rgba(37,99,235,0.12)' : '0 0 0 3px transparent'),
            }}
          />
          {error && <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 10, fontWeight: 500 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={() => finish(false)}
              style={{
                cursor: 'pointer', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#ffffff', color: '#475569', border: '1px solid #d1d9e4',
              }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || code.length !== 4}
              style={{
                cursor: busy ? 'default' : 'pointer', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#2563eb', color: '#ffffff', border: 'none',
                opacity: (busy || code.length !== 4) ? 0.55 : 1,
                boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
              }}
            >
              {busy ? 'Checking…' : (mode === 'create' ? 'Create & Continue' : 'Unlock')}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes acgFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes acgPop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  ) : null;

  return { open, modal };
}
