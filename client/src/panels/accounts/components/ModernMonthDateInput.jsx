import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';

const isDay = v => !!v && v.length === 10;
const isMonth = v => !!v && v.length === 7;

export function ModernMonthDateInput({ value, onChange, max, placeholder = 'Pick month or date...', style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [month, setMonth] = useState(() => {
    if (isMonth(value)) return new Date(value + '-01T00:00:00');
    if (isDay(value)) return new Date(value + 'T00:00:00');
    return new Date();
  });
  const inputRef = useRef(null);

  const sel = isDay(value) ? new Date(value + 'T00:00:00') : undefined;

  const updatePos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const calH = 380;
    const below = window.innerHeight - r.bottom;
    const top = below > calH ? r.bottom + 6 : Math.max(6, r.top - calH - 6);
    setPos({ top, left: Math.min(Math.max(6, r.left), window.innerWidth - 340) });
  }, []);

  const openPicker = () => {
    setMonth(isMonth(value) ? new Date(value + '-01T00:00:00') : isDay(value) ? new Date(value + 'T00:00:00') : new Date());
    updatePos();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (inputRef.current && inputRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('[data-mmi]')) return;
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

  const commitMonth = () => {
    onChange(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  const display = isDay(value)
    ? format(new Date(value + 'T00:00:00'), 'dd MMM yyyy')
    : isMonth(value)
      ? format(new Date(value + '-01T00:00:00'), 'MMM yyyy')
      : '';

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={display}
        placeholder={placeholder}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb',
          fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none', boxSizing: 'border-box',
          color: value ? '#111827' : '#9ca3af', ...style,
        }}
      />
      {open && pos && createPortal(
        <div data-mmi onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 44px rgba(0,0,0,.18)', padding: 12 }}>
          <DayPicker
            mode="single"
            selected={sel}
            onSelect={(d) => {
              if (d) onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              setOpen(false);
            }}
            month={month}
            onMonthChange={setMonth}
            captionLayout="dropdown"
            showOutsideDays
            endMonth={max ? new Date(max.getFullYear(), max.getMonth(), 1) : undefined}
            style={{ '--rdp-accent-color': '#5B6B4E', '--rdp-accent-background-color': '#e8f0e4', '--rdp-day-button-border-radius': '8px', '--rdp-day_button-height': '36px', '--rdp-day_button-width': '36px', '--rdp-day-height': '38px', '--rdp-day-width': '38px', fontSize: 13 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <button onClick={commitMonth}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 7, background: '#f9fafb', color: '#374151', cursor: 'pointer' }}>
              Whole Month
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              {value && (
                <button onClick={() => { onChange(''); setOpen(false); }}
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)}
                style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 7, background: 'var(--sage)', color: '#fff', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('root'),
      )}
    </>
  );
}
