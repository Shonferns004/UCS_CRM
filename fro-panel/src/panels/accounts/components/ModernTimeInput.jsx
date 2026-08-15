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
  const [text, setText] = useState(() => {
    const x = toHm(value);
    return value && x ? fmt12(x.h, x.m) : '';
  });
  const [modalText, setModalText] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const hm = toHm(value);
  const h = hm ? hm.h : 12;
  const m = hm ? hm.m : 0;

  useEffect(() => {
    if (!focused) setText(value ? fmt12(h, m) : '');
  }, [value, focused, h, m]);

  useEffect(() => {
    if (open) setModalText(value ? fmt12(h, m) : '');
  }, [open, value, h, m]);

  const updatePos = useCallback(() => {
    const calH = 220;
    const calW = 320;
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
      setText(fmt12(toHm(parsed).h, toHm(parsed).m));
    } else {
      setText(value ? fmt12(h, m) : '');
    }
  };

  const modalCommit = (close) => {
    const parsed = parseInput(modalText);
    if (parsed !== null) {
      onChange(parsed);
      if (close) setOpen(false);
    } else {
      setModalText(value ? fmt12(h, m) : '');
    }
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
          onFocus={() => { setFocused(true); setText(value ? fmt12(h, m) : ''); }}
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
        <div data-mtp onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 44px rgba(0,0,0,.18)', padding: 16, width: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Select time</span>
            <span style={{ fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{value ? fmt12(h, m) : ''}</span>
          </div>
          <input
            type="text"
            autoFocus
            value={modalText}
            placeholder="Type time e.g. 1:30 PM"
            onChange={e => setModalText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') modalCommit(true);
            }}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid var(--sage)',
              fontSize: 18, fontWeight: 700, background: '#fff', outline: 'none', boxSizing: 'border-box',
              fontVariantNumeric: 'tabular-nums', color: '#111827', textAlign: 'center',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
            {value && (
              <button onClick={() => { onChange(''); setModalText(''); }}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                Clear
              </button>
            )}
            <button onClick={() => modalCommit(true)}
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
