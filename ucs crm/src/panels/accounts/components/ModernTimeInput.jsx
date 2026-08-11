import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function toHm(v) {
  if (!v || !v.includes(':')) return null;
  const [h, m] = v.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h: h % 24, m: m % 60 };
}
const pad = n => String(n).padStart(2, '0');
const CLOCK_C = 100;
const CLOCK_R = 86;

export function ModernTimeInput({ value, onChange, placeholder = 'Pick a time...', style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [phase, setPhase] = useState('hour');
  const inputRef = useRef(null);
  const svgRef = useRef(null);

  const hm = toHm(value);
  const now = new Date();
  const h = hm ? hm.h : now.getHours();
  const m = hm ? hm.m : now.getMinutes();
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  const isPM = h >= 12;

  const commit = useCallback((hh, mm) => {
    onChange(`${pad(hh)}:${pad(mm)}`);
  }, [onChange]);

  const updatePos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const calH = 400;
    const below = window.innerHeight - r.bottom;
    const top = below > calH ? r.bottom + 6 : Math.max(6, r.top - calH - 6);
    setPos({ top, left: Math.min(Math.max(6, r.left), window.innerWidth - 300) });
  }, []);

  const openPicker = () => {
    updatePos();
    setPhase('hour');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (inputRef.current && inputRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('[data-mtp]')) return;
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

  const handleClockClick = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 22) return;
    let deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    if (phase === 'hour') {
      const hh = Math.round(deg / 30) % 12 || 12;
      const h24 = isPM ? (hh % 12) + 12 : hh % 12;
      commit(h24, m);
      setPhase('minute');
    } else {
      const mm = Math.round(deg / 6) % 60;
      commit(h, mm);
    }
  };

  const ticks = phase === 'hour'
    ? Array.from({ length: 12 }, (_, i) => ({ deg: i * 30, major: true, label: i === 0 ? 12 : i }))
    : Array.from({ length: 60 }, (_, i) => ({ deg: i * 6, major: i % 5 === 0, label: i % 5 === 0 ? i : null }));

  const handDeg = phase === 'hour' ? ((h12 % 12) * 30) - 90 : m * 6 - 90;
  const handLen = phase === 'hour' ? 46 : 62;
  const handW = phase === 'hour' ? 4 : 2;

  const tick = (t) => {
    const rad = (t.deg - 90) * Math.PI / 180;
    const rOut = CLOCK_R - 2;
    const rIn = t.major ? CLOCK_R - 14 : CLOCK_R - 8;
    const x1 = CLOCK_C + rIn * Math.cos(rad);
    const y1 = CLOCK_C + rIn * Math.sin(rad);
    const x2 = CLOCK_C + rOut * Math.cos(rad);
    const y2 = CLOCK_C + rOut * Math.sin(rad);
    const lr = CLOCK_R - 26;
    const lx = CLOCK_C + lr * Math.cos(rad);
    const ly = CLOCK_C + lr * Math.sin(rad);
    return (
      <g key={t.deg}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.major ? '#5B6B4E' : '#c9d2c2'} strokeWidth={t.major ? 2 : 1} />
        {t.label != null && (
          <text x={lx} y={ly + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#374151" style={{ userSelect: 'none' }}>
            {t.label}
          </text>
        )}
      </g>
    );
  };

  const handX = CLOCK_C + handLen * Math.cos(handDeg * Math.PI / 180);
  const handY = CLOCK_C + handLen * Math.sin(handDeg * Math.PI / 180);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value ? `${pad(h)}:${pad(m)}` : ''}
        placeholder={placeholder}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb',
          fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none', boxSizing: 'border-box',
          color: value ? '#111827' : '#9ca3af', ...style,
        }}
      />
      {open && pos && createPortal(
        <div data-mtp onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 44px rgba(0,0,0,.18)', padding: 14, width: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
              {pad(h)}:{pad(m)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {['AM', 'PM'].map(p => (
                <button key={p} onClick={() => { const hh = p === 'PM' ? (h12 % 12) + 12 : h12 % 12; commit(hh, m); }}
                  style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, border: 'none', borderRadius: 5, cursor: 'pointer', background: ampm === p ? 'var(--sage)' : '#f3f4f6', color: ampm === p ? '#fff' : '#6b7280' }}>
                  {p}
                </button>
              ))}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'center' }}>
            {[['hour', 'Hour'], ['minute', 'Minute']].map(([k, label]) => (
              <button key={k} onClick={() => setPhase(k)}
                style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: phase === k ? 'var(--sage)' : '#f3f4f6', color: phase === k ? '#fff' : '#6b7280' }}>
                {label}
              </button>
            ))}
          </div>
          <svg ref={svgRef} width="200" height="200" viewBox="0 0 200 200" style={{ display: 'block', margin: '0 auto', cursor: 'pointer' }} onClick={handleClockClick}>
            <circle cx={CLOCK_C} cy={CLOCK_C} r={CLOCK_R} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1.5" />
            {ticks.map(tick)}
            <line x1={CLOCK_C} y1={CLOCK_C} x2={handX} y2={handY} stroke="#5B6B4E" strokeWidth={handW} strokeLinecap="round" />
            <circle cx={CLOCK_C} cy={CLOCK_C} r="5" fill="#5B6B4E" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
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
        </div>,
        document.getElementById('root'),
      )}
    </>
  );
}
