import { useState } from 'react';
import { apiPut } from '../api/auth.js';

// ─── Stack settings ──────────────────────────────────────────────────────────
// One global switch: are donor stacks available at all?
//
// OFF (default) → donors stay with the FRO they are assigned to; every stack
//                  control is hidden across the admin UI.
// ON            → the stack tab and row-menu item appear, and stacks can be
//                  created and assigned.
//
// Shared by the donor-stacks dialog and the station row's ⋮ menu, so the admin
// can turn the feature back on even while it is off (the stacks dialog itself
// is still reachable, but the row menu is the quick path).
function GearIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function StackSettingsModal({ ngoId, station, enabled, onChange, onClose }) {
  const [value, setValue] = useState(!!enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggle = async () => {
    if (saving || !station) return;
    const next = !value;
    setSaving(true);
    setError(null);
    try {
      const res = await apiPut('/ngo-admin/stack-settings', { enabled: next, ngo_id: ngoId, station });
      const saved = res?.enabled !== false;
      setValue(saved);
      onChange?.(saved);
    } catch (e) {
      setError(e?.message || 'Could not update stack settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => !saving && onClose?.()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002, padding: 20 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 430, maxWidth: '94vw', boxShadow: '0 24px 70px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 18px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <GearIcon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Settings</h3>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Stack assignments for {station || 'this station'} only.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
            style={{ border: 'none', background: 'transparent', fontSize: 19, lineHeight: 1, color: '#64748b', cursor: 'pointer', padding: 4 }}
          >✕</button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#f8fafc' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Enable stacks {station ? `for ${station}` : ''}</div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>
                {value
                  ? `Stacks are ON for ${station || 'this station'} only — admins can group its donors and assign each stack to an FRO.`
                  : `Stacks are OFF for ${station || 'this station'} — its donors stay with the FRO they are assigned to.`}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              aria-label="Enable stacks"
              onClick={toggle}
              disabled={saving}
              style={{ position: 'relative', width: 46, height: 26, borderRadius: 999, border: 'none', background: value ? '#16a34a' : '#cbd5e1', cursor: saving ? 'wait' : 'pointer', transition: 'background .15s', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s' }} />
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
          >{saving ? 'Saving…' : 'Done'}</button>
        </div>
      </div>
    </div>
  );
}
