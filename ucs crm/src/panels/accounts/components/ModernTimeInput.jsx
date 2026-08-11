import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function toHm(v) {
  if (!v || !v.includes(':')) return null;
  const [h, m] = v.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h: h % 24, m: m % 60 };
}
const pad = n => String(n).padStart(2, '0');
const fmt12 = (hh, mm) => {
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${pad(mm)} ${ap}`;
};

function parseInput(str) {
  if (!str) return '';
  const s = str.trim();
  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const h = Number(m[1]);
    if (h > 23 || Number(m[2]) > 59) return null;
    return `${pad(h)}:${pad(Number(m[2]))}`;
  }
  m = s.match(/^(\d{1,2}):(\d{1,2})\s*(am|pm)$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = m[3].toLowerCase();
    if (h < 1 || h > 12 || Number(m[2]) > 59) return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(Number(m[2]))}`;
  }
  return null;
}

function SpinnerColumn({ label, display, onUp, onDown }) {
  const arrowStyle = {
    width: 44, height: 28, border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb',
    cursor: 'pointer', fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <button onClick={onUp} style={arrowStyle}>▲</button>
      <div style={{
        width: 70, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, color: '#111827', border: '1.5px solid #e5e7eb', borderRadius: 9,
        background: '#fff', fontVariantNumeric: 'tabular-nums',
      }}>{display}</div>
      <button onClick={onDown} style={arrowStyle}>▼</button>
    </div>
  );
}

function ClockIcon({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Pick time"
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0,
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>
  );
}

export function ModernTimeInput({ value, onChange, placeholder = 'Pick a time...', style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [text, setText] = useState(value || '');
  const [modalText, setModalText] = useState(value || '');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const hm = toHm(value);
  const now = new Date();
  const h = hm ? hm.h : now.getHours();
  const m = hm ? hm.m : now.getMinutes();
  const h12 = h % 12 || 12;
  const isPM = h >= 12;

  useEffect(() => {
    if (!focused) setText(value || '');
  }, [value, focused]);

  useEffect(() => {
    if (open) setModalText(value || '');
  }, [open, value]);

  const set = useCallback((hh, mm) => {
    const next = `${pad(((hh % 24) + 24) % 24)}:${pad(((mm % 60) + 60) % 60)}`;
    onChange(next);
    setText(next);
  }, [onChange]);

  const updatePos = useCallback(() => {
    const calH = 340;
    const calW = 280;
    setPos({
      top: Math.max(8, (window.innerHeight - calH) / 2),
      left: Math.max(8, (window.innerWidth - calW) / 2),
    });
  }, []);

  const openPicker = () => {
    updatePos();
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

  const commitText = () => {
    const parsed = parseInput(text);
    if (parsed !== null) {
      onChange(parsed);
      setText(parsed);
    } else {
      setText(value || '');
    }
  };

  const toggleAmpm = () => {
    const hh = isPM ? (h - 12 + 24) % 24 : (h + 12) % 24;
    set(hh, m);
  };

  return (
    <>
      <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', ...style }}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder={placeholder}
          onMouseDown={(e) => {
            if (e.target.closest('[data-mti-open]')) return;
            if (!open) openPicker();
          }}
          onFocus={() => { setFocused(true); setText(value || ''); }}
          onBlur={() => { setFocused(false); commitText(); }}
          onChange={e => { setText(e.target.value); if (open) setOpen(false); }}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          style={{
            width: '100%', padding: '9px 34px 9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb',
            fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums',
            color: value ? '#111827' : '#9ca3af',
          }}
        />
        <div data-mti-open style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
          <ClockIcon onClick={() => (open ? setOpen(false) : openPicker())} />
        </div>
      </div>
      {open && pos && createPortal(
        <div data-mtp onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 44px rgba(0,0,0,.18)', padding: 14, width: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Select time</span>
            <span style={{ fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{fmt12(h, m)}</span>
          </div>
          <input
            type="text"
            value={modalText}
            placeholder="Type time (e.g. 14:30 or 2:30 PM)"
            onChange={e => {
              const v = e.target.value;
              setModalText(v);
              const parsed = parseInput(v);
              if (parsed !== null) onChange(parsed);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const parsed = parseInput(modalText);
                if (parsed !== null) setOpen(false);
                else setModalText(value || '');
              }
            }}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb',
              fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums',
              color: '#111827', marginBottom: 12, textAlign: 'center',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
            <SpinnerColumn
              label="Hour"
              display={h12}
              onUp={() => set(h + 1, m)}
              onDown={() => set(h - 1, m)}
            />
            <span style={{ fontSize: 22, fontWeight: 700, color: '#d1d5db', marginTop: 18 }}>:</span>
            <SpinnerColumn
              label="Minutes"
              display={pad(m)}
              onUp={() => set(h, m + 1)}
              onDown={() => set(h, m - 1)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18 }}>
              {['AM', 'PM'].map(p => {
                const active = p === (isPM ? 'PM' : 'AM');
                return (
                  <button key={p} onClick={toggleAmpm}
                    style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 7, cursor: 'pointer', background: active ? 'var(--sage)' : '#f3f4f6', color: active ? '#fff' : '#6b7280' }}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
            {value && (
              <button onClick={() => { onChange(''); setText(''); setOpen(false); }}
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
