import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

// ─── FroSelect ───────────────────────────────────────────────────────────────
// Shared FRO picker for the lead-loan modals. Same interaction as the
// station-management assignment picker: a trigger plus a searchable,
// height-capped list. A native <select> opened the OS list all the way down the
// screen, which is what the admin asked to avoid.

const triggerStyle = {
  width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 6, fontFamily: 'inherit', background: '#fff',
};

export default function FroSelect({ options = [], value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 280);
    }
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(w => String(w.id) === String(value));
  const filtered = options.filter(w => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return String(w.name || '').toLowerCase().includes(needle)
      || String(w.login_id || '').toLowerCase().includes(needle);
  });

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        style={{
          ...triggerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
          color: selected ? 'var(--ink)' : '#9ca3af', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : (placeholder || 'Select…')}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && !disabled && (
        <div style={{
          position: 'absolute', left: 0, right: 0, background: '#fff', borderRadius: 10,
          border: '1px solid var(--line, #e5e7eb)', boxShadow: '0 10px 28px rgba(15,23,42,.16)',
          zIndex: 300, overflow: 'hidden',
          ...(dropUp ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search FRO…"
              autoFocus
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent' }}
            />
          </div>
          <div style={{ maxHeight: 190, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <div
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ padding: '7px 11px', fontSize: 12, cursor: 'pointer', color: '#9ca3af', borderBottom: '1px solid var(--line, #e5e7eb)' }}
            >
              — Select an FRO —
            </div>
            {filtered.map(w => {
              const active = String(w.id) === String(value);
              return (
                <div
                  key={w.id}
                  onClick={() => { onChange(w.id); setOpen(false); }}
                  style={{
                    padding: '7px 11px', fontSize: 12.5, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    background: active ? '#eff6ff' : 'transparent',
                    color: active ? '#1d4ed8' : 'var(--ink)',
                    fontWeight: active ? 700 : 500,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = active ? '#eff6ff' : '#f3f4f6'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? '#eff6ff' : 'transparent'; }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  {active && <Check size={12} strokeWidth={3} />}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>No FROs match</div>
            )}
          </div>
          <div style={{ padding: '5px 10px', borderTop: '1px solid var(--line, #e5e7eb)', fontSize: 10, color: 'var(--ink-soft)', textAlign: 'right' }}>
            {filtered.length} of {options.length}
          </div>
        </div>
      )}
    </div>
  );
}
