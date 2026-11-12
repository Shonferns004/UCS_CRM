import { useState } from 'react';

// ─── Clock-based date + time picker ──────────────────────────────────────────
// Shared by the temporary-access modal and the lead-loan modal so both grant
// windows are picked the same way: a date field, an analog clock face for the
// hour/minute and an explicit AM/PM select. `value` is a local datetime string
// in the `YYYY-MM-DDTHH:mm` shape that <input type="datetime-local"> uses.

const inputStyle = {
  width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 6, fontFamily: 'inherit', background: '#fff',
};

export function splitLocal(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(v || ''));
  if (!m) return { date: '', hour12: 12, minute: 0, period: 'AM' };
  const hh = Number(m[2]);
  return {
    date: m[1],
    hour12: hh % 12 === 0 ? 12 : hh % 12,
    minute: Number(m[3]),
    period: hh >= 12 ? 'PM' : 'AM',
  };
}

export function joinLocal({ date, hour12, minute, period }) {
  if (!date) return '';
  let hh = Number(hour12) % 12;
  if (period === 'PM') hh += 12;
  return `${date}T${String(hh).padStart(2, '0')}:${String(Number(minute) || 0).padStart(2, '0')}`;
}

export default function Time12Control({ label, value, onChange, compact = false }) {
  const p = splitLocal(value);
  const set = (patch) => onChange(joinLocal({ ...p, ...patch }));
  const [mode, setMode] = useState('hour');

  const R = compact ? 80 : 68;
  const CX = compact ? 88 : 80;
  const CY = compact ? 88 : 80;
  const clockPx = compact ? 176 : 160;
  const clockMax = compact ? 186 : 160;
  const handleClockClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // The SVG scales to the card width, so map CSS pixels back into viewBox
    // units before computing the angle — otherwise the hands land wrong.
    const scale = rect.width ? clockPx / rect.width : 1;
    const x = (e.clientX - rect.left) * scale - CX;
    const y = (e.clientY - rect.top) * scale - CY;
    const angle = ((Math.atan2(y, x) * (180 / Math.PI)) + 90 + 360) % 360;
    if (mode === 'hour') {
      let h = Math.round(angle / 30); if (h === 0) h = 12;
      set({ hour12: h }); setMode('minute');
    } else {
      let m = Math.round(angle / 6); if (m === 60) m = 0;
      set({ minute: m });
    }
  };

  const hourAngle = ((p.hour12 % 12) * 30 - 90) * (Math.PI / 180);
  const hx = CX + R * 0.52 * Math.cos(hourAngle);
  const hy = CY + R * 0.52 * Math.sin(hourAngle);
  const minuteAngle = (p.minute * 6 - 90) * (Math.PI / 180);
  const mx = CX + R * 0.74 * Math.cos(minuteAngle);
  const my = CY + R * 0.74 * Math.sin(minuteAngle);

  const hourNumbers = Array.from({ length: 12 }, (_, i) => {
    const num = i === 0 ? 12 : i;
    const a = (i * 30 - 90) * (Math.PI / 180);
    return { num, x: CX + R * 0.78 * Math.cos(a), y: CY + R * 0.78 * Math.sin(a) };
  });

  const modeBtn = (active) => ({
    padding: '4px 10px', border: 'none', borderRadius: 5, fontFamily: 'inherit',
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : '#475569',
  });

  return (
    <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, background: '#fff', padding: compact ? 10 : 12, display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {String(p.hour12).padStart(2, '0')}:{String(p.minute).padStart(2, '0')} {p.period}
        </span>
      </div>

      <input type="date" style={{ ...inputStyle, padding: '6px 8px' }} value={p.date} onChange={e => set({ date: e.target.value })} />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg viewBox={`0 0 ${clockPx} ${clockPx}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', maxWidth: clockMax, height: 'auto', aspectRatio: '1 / 1', cursor: 'pointer', borderRadius: '50%', background: '#f8fafc', border: '1px solid #eef2f7' }}
          onClick={handleClockClick}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e5e7eb" strokeWidth={1} />
          <circle cx={CX} cy={CY} r={compact ? 4 : 3} fill="#2563eb" />
          {hourNumbers.map(({ num, x, y }) => (
            <text key={num} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={compact ? 13 : 11}
              fontWeight={p.hour12 === num ? 700 : 400} fill={p.hour12 === num ? '#2563eb' : '#374151'}>
              {num}
            </text>
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 - 90) * (Math.PI / 180);
            return <circle key={i} cx={CX + R * 0.93 * Math.cos(a)} cy={CY + R * 0.93 * Math.sin(a)} r={compact ? 1.8 : 1.4} fill="#d1d5db" />;
          })}
          <line x1={CX} y1={CY} x2={hx} y2={hy} stroke="#2563eb" strokeWidth={compact ? 4 : 3} strokeLinecap="round" opacity={mode === 'hour' ? 1 : 0.25} />
          <line x1={CX} y1={CY} x2={mx} y2={my} stroke="#2563eb" strokeWidth={compact ? 2.6 : 2} strokeLinecap="round" opacity={mode === 'minute' ? 1 : 0.25} />
        </svg>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'inline-flex', padding: 2, borderRadius: 7, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
          <button type="button" onClick={() => setMode('hour')} style={modeBtn(mode === 'hour')}>Hour</button>
          <button type="button" onClick={() => setMode('minute')} style={modeBtn(mode === 'minute')}>Min</button>
        </div>
        <select value={p.period} onChange={e => set({ period: e.target.value })}
          style={{ ...inputStyle, width: 72, padding: '5px 7px', fontWeight: 700, fontSize: 11 }} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div style={{ fontSize: 10, color: 'var(--ink-soft)', textAlign: 'center' }}>
        {mode === 'hour' ? (compact ? 'Tap a number for the hour' : 'Tap a number to set the hour') : (compact ? 'Tap the face for minutes' : 'Tap the clock face to set minutes')}
      </div>
    </div>
  );
}
