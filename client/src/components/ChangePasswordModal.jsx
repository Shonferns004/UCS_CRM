import { useState } from 'react';
import { api } from '../api/auth';

export default function ChangePasswordModal({ open, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm(''); setError(''); setSuccess(false); setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(false);
    if (!current || !next) { setError('Fill in all fields.'); return; }
    if (next.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
        _prefix: 'ucs',
      });
      setSuccess(true);
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => { if (open) close(); }, 1200);
    } catch (err) {
      setError(err.message || 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const inputStyle = {
    width: '100%', padding: '11px 13px', borderRadius: 10, boxSizing: 'border-box',
    border: error && !success ? '1px solid #ef4444' : '1px solid #d1d9e4',
    fontSize: 14, outline: 'none', background: success ? '#f8fafc' : '#fff',
  };
  const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'acgCpFade .18s ease',
      }}
    >
      <div style={{
        background: '#fff', width: 400, maxWidth: '100%', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        animation: 'acgCpPop .2s ease',
      }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #eef1f5' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#F0FDF4', boxShadow: 'inset 0 0 0 1px rgba(22,163,74,0.2)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 7a4 4 0 0 0-8 0v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a4 4 0 0 0-1.5-3.1" />
              <line x1="12" y1="14" x2="12" y2="17" />
            </svg>
          </div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Change Password</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Enter your current password, then choose a new one.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Current password</label>
              <input type="password" autoFocus value={current} onChange={e => setCurrent(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>New password</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
            </div>

            {success && (
              <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: 8 }}>
                Password changed successfully.
              </div>
            )}
            {error && !success && (
              <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 500 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" onClick={close} style={{
                cursor: 'pointer', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#ffffff', color: '#475569', border: '1px solid #d1d9e4',
              }}>Cancel</button>
              <button type="submit" disabled={busy || success} style={{
                cursor: busy ? 'default' : 'pointer', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#16a34a', color: '#ffffff', border: 'none',
                opacity: (busy || success) ? 0.55 : 1, boxShadow: '0 4px 14px rgba(22,163,74,0.35)',
              }}>{busy ? 'Updating…' : 'Change Password'}</button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes acgCpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes acgCpPop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
