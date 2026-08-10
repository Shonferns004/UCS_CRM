import { useState, useRef, useEffect } from 'react';

const POPUP_HEIGHT = 260;

export function DispositionDropdown({ options, value, onChange, placeholder = '— Select —', tone }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({});
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onScrollOrResize = (e) => { if (e.target && ref.current && ref.current.contains(e.target)) return; setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const estimate = Math.min(options.length * 32 + 10, POPUP_HEIGHT);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < estimate && spaceAbove > spaceBelow;
      setStyle({
        left: rect.left,
        width: rect.width,
        top: openUp ? Math.max(8, rect.top - estimate - 4) : rect.bottom + 4,
        maxHeight: Math.min(estimate, Math.max(spaceBelow, spaceAbove) - 8),
      });
    }
    setOpen(!open);
  };

  const selected = options.find(o => o.id === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          width: '100%', boxSizing: 'border-box', padding: '6px 8px',
          border: `1px solid ${tone ? (tone === 'green' ? '#16a34a' : '#dc2626') : 'var(--line)'}`,
          borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
          cursor: 'pointer', userSelect: 'none', color: selected ? 'var(--ink)' : 'var(--ink-soft)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ink-soft)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          expand_more
        </span>
      </div>
      {open && (
        <div style={{ position: 'fixed', zIndex: 10000, ...style, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.14)', overflow: 'auto', padding: 4 }}>
          {options.map(opt => {
            const isSel = opt.id === value;
            return (
              <div key={opt.id}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                style={{
                  padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                  background: isSel ? '#f0fdf4' : 'transparent',
                  color: isSel ? '#166534' : 'var(--ink)',
                  fontWeight: isSel ? 700 : 500,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSel ? '#f0fdf4' : 'transparent'; }}>
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
