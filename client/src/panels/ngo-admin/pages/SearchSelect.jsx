import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SearchSelect({ options = [], value, onChange, placeholder = 'Select…', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => String(o).toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8,
          background: disabled ? 'var(--bg)' : '#fff', textAlign: 'left', fontFamily: 'inherit',
          fontSize: 13, color: value ? 'var(--ink)' : 'var(--ink-soft)', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || placeholder}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: .6 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 80,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 10px 26px rgba(16,24,40,.16)', overflow: 'hidden',
        }}>
          <div style={{ padding: 6, borderBottom: '1px solid var(--line)' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search station…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>No match</div>
            ) : filtered.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange?.(o); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                  border: 'none', background: o === value ? 'var(--bg)' : '#fff', color: 'var(--ink)',
                  fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = o === value ? 'var(--bg)' : '#fff'; }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
