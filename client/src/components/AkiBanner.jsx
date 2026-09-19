import { useMemo } from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const fmt = (n) => (n === Infinity ? '∞' : Number(n).toLocaleString('en-IN'));

const IcChip = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 21h10v-1H7zM8 3v18h8V3zM10 7h4" />
  </svg>
);

// Decorative "sticker" bag of coins (SVG, no external image needed)
export const CoinsBag = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.12))' }}>
    <path d="M28 58 C28 30 60 22 60 22 C60 22 92 30 92 58 L92 88 C92 96 86 100 78 100 L42 100 C34 100 28 96 28 88 Z" fill="#c9a227" stroke="#8a6f1f" strokeWidth="3" />
    <rect x="50" y="18" width="20" height="10" rx="3" fill="#e3b93f" stroke="#8a6f1f" strokeWidth="2" />
    <circle cx="32" cy="98" r="8" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    <circle cx="24" cy="92" r="7" fill="#ffd166" stroke="#b8860b" strokeWidth="2" />
    <circle cx="40" cy="94" r="7" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    <circle cx="16" cy="86" r="6" fill="#ffd166" stroke="#b8860b" strokeWidth="2" />
    <circle cx="48" cy="90" r="6" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    <text x="30" y="102" fontSize="9" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="23" y="95" fontSize="8" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="39" y="97" fontSize="8" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="16" y="89" fontSize="7" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <path d="M86 18 L89 26 L97 29 L89 32 L86 40 L83 32 L75 29 L83 26 Z" fill="#ffd166" stroke="#c9a227" strokeWidth="1" />
  </svg>
);

export default function AkiBanner({ slabs, compact = false }) {
  const data = useMemo(() => {
    const now = new Date();
    const todayDayName = DAY_NAMES[now.getDay()];
    const todayRanges = (slabs && slabs[todayDayName]) || [];
    let totalSlabs = 0;
    let topIncentive = 0;
    for (const d of DAY_NAMES) {
      const list = slabs && slabs[d] ? slabs[d] : [];
      totalSlabs += list.length;
      for (const r of list) topIncentive = Math.max(topIncentive, Number(r.incentive) || 0);
    }
    const sorted = [...todayRanges].sort((a, b) => b.incentive - a.incentive);
    const top = sorted[0];
    return {
      todayDayName,
      todayRanges,
      totalSlabs,
      topIncentive,
      topRangeMin: top ? top.min : 0,
    };
  }, [slabs]);

  const { todayDayName, todayRanges, totalSlabs, topIncentive, topRangeMin } = data;
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  const coinSize = compact ? 64 : 88;

  return (
    <div style={{ border: '2px solid #5B6B4E', borderRadius: 14, background: 'linear-gradient(135deg, #EAF1FB 0%, #E7F3EC 55%, #FDF2E3 100%)', padding: compact ? '16px 18px' : '20px 24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: '#5B6B4E', color: '#fff', width: compact ? 40 : 46, height: compact ? 40 : 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IcChip />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: compact ? 18 : 20, fontWeight: 800, color: 'var(--ink)' }}>Aaj Ka Incentive (AKI)</h1>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, fontWeight: 600 }}>📅 Date : {todayLabel}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {['BSCT', 'AFLF', 'MANN'].map(n => (
                <span key={n} style={{ background: '#fff', color: '#5B6B4E', fontWeight: 700, padding: '3px 10px', fontSize: 12, borderRadius: 20, border: '1px solid #5B6B4E33' }}>{n}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <CoinsBag size={coinSize} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: '#5B6B4E', color: '#fff', fontWeight: 700, padding: '6px 14px', fontSize: 13, borderRadius: 20 }}>{todayDayName} slabs</span>
              <span style={{ background: '#fff', color: 'var(--ink)', fontWeight: 700, padding: '6px 14px', fontSize: 13, borderRadius: 20 }}>{totalSlabs} total slabs</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Top incentive ₹{topIncentive.toLocaleString('en-IN')} at ₹{topRangeMin.toLocaleString('en-IN')}+</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 18, borderTop: '1px dashed #5B6B4E44', paddingTop: 16 }}>
        {['BSCT', 'AFLF', 'MANN'].map(n => (
          <div key={n}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#5B6B4E', marginBottom: 6 }}>{n} · {todayDayName} Ranges</div>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #5B6B4E22' }}>
              {todayRanges.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>No slabs set</div>
              ) : todayRanges.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 10px', background: i % 2 ? '#ffffff88' : '#5B6B4E0c', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink)' }}>₹{fmt(r.min)}{r.max === Infinity ? '+' : `–${fmt(r.max)}`}</span>
                  <span style={{ fontWeight: 800, color: '#B45309', whiteSpace: 'nowrap' }}>₹{Number(r.incentive).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, textAlign: 'center', fontStyle: 'italic', fontSize: 13, color: '#5B6B4E', fontWeight: 600, borderTop: '1px dashed #5B6B4E44', paddingTop: 12 }}>
        ✨ “Har roz jeeto, har roz badho — aaj ka collection aaj hi kamaao!” ✨
      </div>
    </div>
  );
}
