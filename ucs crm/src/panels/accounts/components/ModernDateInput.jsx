import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';

export function ModernDateInput({ value, onChange, max, placeholder = 'Pick a date...', style, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);

  const sel = value ? new Date(value + 'T00:00:00') : undefined;
  const maxStr = max ? `${max.getFullYear()}-${String(max.getMonth()+1).padStart(2,'0')}-${String(max.getDate()).padStart(2,'0')}` : null;

  const updatePos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const calH = 360;
    const below = window.innerHeight - r.bottom;
    const top = below > calH ? r.bottom + 6 : Math.max(6, r.top - calH - 6);
    setPos({ top, left: Math.min(Math.max(6, r.left), window.innerWidth - 340) });
  }, []);

  const openPicker = () => {
    if (disabled) return;
    updatePos();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (inputRef.current && inputRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('[data-mdp]')) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value ? format(new Date(value + 'T00:00:00'), 'dd MMM yyyy') : ''}
        placeholder={placeholder}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb',
          fontSize: 13, background: disabled ? '#f3f4f6' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none', boxSizing: 'border-box',
          color: value ? '#111827' : '#9ca3af', opacity: disabled ? 0.7 : 1, ...style,
        }}
      />
      {open && pos && createPortal(
        <div data-mdp onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 44px rgba(0,0,0,.18)', padding: 12 }}>
          <DayPicker
            mode="single"
            selected={sel}
            onSelect={(d) => {
              onChange(d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
              setOpen(false);
            }}
            disabled={maxStr ? (d) => { const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return ds > maxStr; } : undefined}
            defaultMonth={sel || new Date()}
            captionLayout="dropdown"
            showOutsideDays
            style={{ '--rdp-accent-color': '#5B6B4E', '--rdp-accent-background-color': '#e8f0e4', '--rdp-day-button-border-radius': '8px', '--rdp-day_button-height': '36px', '--rdp-day_button-width': '36px', '--rdp-day-height': '38px', '--rdp-day-width': '38px', fontSize: 13 }}
          />
        </div>,
        document.getElementById('root'),
      )}
    </>
  );
}
