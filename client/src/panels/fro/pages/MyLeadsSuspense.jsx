import { useEffect, useRef, useState } from 'react';
import { Trophy, Clock, Timer, PhoneOutgoing, Activity, ArrowUp, ArrowDown } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import MyDonors from './MyDonors';
import FroSuspense from './Suspense';
import { getMyPerformance } from '../api/donors';

function SectionTitle({ label, pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 34, borderBottom: '1px solid var(--line)', background: '#fbfcfb', flexShrink: 0 }}>
      <span style={{ width: 4, height: 12, borderRadius: 2, background: 'var(--sage)', display: 'inline-block' }} />
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ink-soft)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: 'var(--line)' }}>{pct}</span>
    </div>
  );
}

function formatIdle(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Arrow({ good }) {
  return (
    <span className="metric-arrow" aria-label={good ? 'Above target' : 'Below target'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: good ? '#dcfce7' : '#fee2e2' }}>
      {good ? <ArrowUp size={16} strokeWidth={3} color="#16a34a" /> : <ArrowDown size={16} strokeWidth={3} color="#dc2626" />}
    </span>
  );
}

function Metric({ label, value, good, accent, icon }) {
  return (
    <div className="metric-cell" style={{ minWidth: 0, flex: '1 1 0', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: accent || '#94a3b8', display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: '#0f172a', fontSize: 17, lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
        {good != null && <Arrow good={good} />}
      </span>
    </div>
  );
}

function PersonalPerformance() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => getMyPerformance()
      .then(next => { if (!cancelled) setData(next); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const levelHigh = data?.level === 'high';
  const callTarget = 17;

return (
        <div style={{ display: 'flex', flexWrap: 'nowrap', width: '100%', height: '100%' }}>
          <Metric label="Rank" value={data?.rank ? `#${data.rank}` : '—'} accent="#7c3aed" icon={<Trophy size={16} />} />
          <Metric label="Idle" value={formatIdle(data?.idle_seconds)} accent="#d97706" icon={<Clock size={16} />} />
          <Metric label="Worked" value={`${formatIdle(data?.worked_seconds)} / 8h`} good={(data?.worked_seconds ?? 0) >= 8 * 3600} accent="#0891b2" icon={<Timer size={16} />} />
          <Metric label="Calls" value={(data?.today_calls ?? 0).toString()} good={(data?.today_calls ?? 0) >= callTarget} accent="#2563eb" icon={<PhoneOutgoing size={16} />} />
<Metric label="Performance" value={`${data?.performance ?? 0}%`} good={levelHigh} accent={levelHigh ? '#16a34a' : '#dc2626'} icon={<Activity size={16} />} />
        </div>
  );
}

export default function MyLeadsSuspense() {
  const isMobile = useIsMobile();
  const isCompact = useIsMobile(480);
  const shellRef = useRef(null);

const gap = isCompact ? 8 : isMobile ? 10 : 12;
  const pad = isCompact ? 6 : isMobile ? 8 : 12;
  const stripH = isCompact ? 98 : isMobile ? 86 : 68;

  return (
    <div ref={shellRef} className="my-leads-shell" style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', gap, padding: pad, boxSizing: 'border-box', minHeight: 0 }}>
<div className="perf-strip" style={{
        flex: `0 0 ${stripH}px`,
        height: stripH,
        minWidth: 0,
        position: 'relative',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e6eaf2',
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        overflow: 'hidden',
        display: 'flex',
      }}>
        <PersonalPerformance />
      </div>

      <div className="my-leads-bottom" style={{ flex: '1 1 0', minHeight: isMobile ? 680 : 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap, minWidth: 0 }}>
        <div style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--line)',
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <SectionTitle label="My Leads" pct="60%" />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MyDonors embedded portalEl={shellRef.current} />
          </div>
        </div>

        <div style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          background: '#f8fafc',
          border: '1px solid var(--line)',
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <SectionTitle label="Suspense" pct="40%" />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <FroSuspense />
          </div>
        </div>
      </div>

<style>{`
        .my-leads-shell { container-type: inline-size; container-name: my-leads; }
        .my-leads-shell > div { min-width: 0; }
        .perf-strip .metric-cell + .metric-cell { border-left: 1px solid #eef2f7; }
        .metric-arrow { animation: arrow-bob 1.8s ease-in-out infinite; }
        @keyframes arrow-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        @container my-leads (max-width: 900px) {
          .my-leads-shell { overflow-y: auto; }
          .my-leads-bottom { grid-template-columns: 1fr !important; min-height: 680px; }
        }
        @container my-leads (max-width: 520px) {
          .my-leads-shell { gap: 8px !important; padding: 6px !important; }
          .my-leads-shell > div { border-radius: 8px; }
        }
      `}</style>
    </div>
  );
}
