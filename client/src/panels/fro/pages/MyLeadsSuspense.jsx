import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Timer, PhoneOutgoing, Activity, ArrowUp, ArrowDown, Clock, Wallet } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import MyDonors from './MyDonors';
import FroSuspense from './Suspense';
import CallTimer from '../components/CallTimer';
import { getMyPerformance } from '../api/donors';
import { formatDuration } from '../../../utils/formatDuration';
import { idleColorFor } from '../../../utils/warnTone';

function SectionTitle({ label, pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 34, borderBottom: '1px solid var(--line)', background: '#fbfcfb', flexShrink: 0 }}>
      <span style={{ width: 4, height: 12, borderRadius: 2, background: 'var(--sage)', display: 'inline-block' }} />
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ink-soft)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: 'var(--line)' }}>{pct}</span>
    </div>
  );
}

function Arrow({ good }) {
  return (
    <span className="metric-arrow" aria-label={good ? 'Above target' : 'Below target'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: good ? '#dcfce7' : '#fee2e2' }}>
      {good ? <ArrowUp size={16} strokeWidth={3} color="#16a34a" /> : <ArrowDown size={16} strokeWidth={3} color="#dc2626" />}
    </span>
  );
}

function Metric({ label, value, good, accent, icon, valueColor, className, innerRef, style: extraStyle, labelColor }) {
  return (
    <div ref={innerRef} className={`metric-cell${className ? ' ' + className : ''}`} style={{ minWidth: 0, flex: '1 1 0', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, ...(extraStyle || {}) }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: accent || '#94a3b8', display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 12, color: labelColor || '#94a3b8', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: valueColor || '#0f172a', fontSize: 17, lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
        {good != null && <Arrow good={good} />}
      </span>
    </div>
  );
}

function IdleMetric({ value, idleSeconds, isIdle }) {
  const ref = useRef(null);
  const [rect, setRect] = useState(null);
  const s = Number(idleSeconds) || 0;
  const idleStyle = idleColorFor(s);
  const show = s > 3600;
  useEffect(() => {
    if (!show) { setRect(null); return; }
    const update = () => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(update);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, [show]);
  return (
    <>
      <Metric
        label="Idle"
        labelColor={show ? idleStyle.color : '#94a3b8'}
        value={value}
        good={!(isIdle)}
        accent={s > 0 ? idleStyle.color : '#64748b'}
        valueColor={show ? idleStyle.color : undefined}
        className={show ? 'idle-danger' : ''}
        icon={<Clock size={16} style={show ? { color: idleStyle.color } : undefined} />}
        innerRef={ref}
        style={show ? { background: idleStyle.bg, boxShadow: `inset 0 0 0 1px ${idleStyle.border}` } : undefined}
      />
      {show && rect && createPortal(
        <>
          <div style={{
            position: 'fixed',
            left: rect.left - 3,
            top: rect.top - 3,
            width: rect.width + 6,
            height: rect.height + 6,
            border: `2px solid ${idleStyle.color}cc`,
            borderRadius: 0,
            pointerEvents: 'none',
            zIndex: 99999,
            transformOrigin: 'center center',
            animation: 'idle-ripple 1.6s ease-out infinite',
          }} />
          <div style={{
            position: 'fixed',
            left: rect.left - 3,
            top: rect.top - 3,
            width: rect.width + 6,
            height: rect.height + 6,
            border: `2px solid ${idleStyle.color}cc`,
            borderRadius: 0,
            pointerEvents: 'none',
            zIndex: 99999,
            transformOrigin: 'center center',
            animation: 'idle-ripple 1.6s ease-out infinite',
            animationDelay: '.8s',
          }} />
        </>,
        document.body
      )}
    </>
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
    // Refetch as soon as a disposition is recorded. The server banks the idle
    // stretch the moment the save lands, so the strip should show that without
    // waiting out the remainder of the poll interval. Fired twice on purpose:
    // once at submit time for instant feedback, and again once the response has
    // come back, which is the point at which the banked total actually exists.
    // The 30s interval stays as a backstop for every other kind of change.
    const onSaved = () => load();
    window.addEventListener('ucs:fro-perf-refresh', onSaved);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('ucs:fro-perf-refresh', onSaved); };
  }, []);

  const levelHigh = data?.level === 'high';
  const callTarget = 17;
  // Whose figures these are. Under "work as" the strip paints the person at the
  // keyboard (Priya covering Riya shows Priya's numbers), while the lead queue
  // and donors below stay with the account being worked. The name is exposed as a
  // title rather than a badge, so the strip keeps its five-tile layout.
  const figuresOwner = data?.worker?.name || '';

return (
        <div style={{ display: 'flex', flexWrap: 'nowrap', width: '100%', height: '100%' }} title={figuresOwner ? `Your figures: ${figuresOwner}` : undefined}>
          <Metric label="Rank" value={data?.rank ? `#${data.rank}` : '—'} accent="#7c3aed" icon={<Trophy size={16} />} />
          <Metric label="Worked" value={`${formatDuration(data?.worked_seconds)} / 8h`} good={(data?.worked_seconds ?? 0) >= 8 * 3600} accent="#0891b2" icon={<Timer size={16} />} />
          <Metric label="Calls" value={(data?.today_calls ?? 0).toString()} good={(data?.today_calls ?? 0) >= callTarget} accent="#2563eb" icon={<PhoneOutgoing size={16} />} />
          {/* Idle today, including a period still running. The timer in the top
              bar is what produces it, so this is the FRO's own answer to "how
              much of my day was actually productive". */}
          <IdleMetric value={formatDuration(data?.idle_seconds)} idleSeconds={data?.idle_seconds} isIdle={data?.is_idle} />
<Metric label="Performance" value={`${data?.performance ?? 0}%`} good={levelHigh} accent={levelHigh ? '#16a34a' : '#dc2626'} icon={<Activity size={16} />} />
          <Metric label="Collections" value={`₹${Number(data?.today_collected ?? 0).toLocaleString('en-IN')}`} accent="#16a34a" valueColor="#16a34a" icon={<Wallet size={16} />} />
          {/* Live call timer, parked after Performance so it reads as the last
              tile rather than competing with the five metrics. It sizes to its
              content instead of flexing like a metric-cell, and CallTimer returns
              null when no call is up, so the strip is unchanged for the rest of
              the day - see .perf-timer:empty. */}
          <div className="perf-timer">
            <CallTimer />
          </div>
        </div>
  );
}

export default function MyLeadsSuspense() {
  const isMobile = useIsMobile();
  const isCompact = useIsMobile(480);
  const shellRef = useRef(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const handleDetailStateChange = useCallback((open) => setDetailOpen(!!open), []);

  // No padding and no gap: this view is meant to run edge to edge, touching the
  // header above and the sidebar/window edges at the sides. The host's padding is
  // zeroed in index.css via .panel-fro .content-body:has(.my-leads-shell).
  //
  // Because the three surfaces are flush, they cannot each keep their own border
  // and radius - adjacent ones would draw a 2px seam and two rounded corners would
  // meet in the middle. So the dividers are owned by the panes themselves: the
  // strip carries a bottom rule, and the leads/suspense split is a single line
  // between them rather than two facing borders.
  const stripH = isCompact ? 98 : isMobile ? 86 : 68;

  return (
    <div ref={shellRef} className="my-leads-shell" style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', padding: 0, boxSizing: 'border-box', minHeight: 0 }}>
      {!detailOpen && (
        <div className="perf-strip" style={{
          flex: `0 0 ${stripH}px`,
          height: stripH,
          minWidth: 0,
          position: 'relative',
          zIndex: 9999,
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          borderBottom: '1px solid #e6eaf2',
          overflow: 'visible',
          display: 'flex',
        }}>
          <PersonalPerformance />
        </div>
      )}

      <div className="my-leads-bottom" style={{ flex: '1 1 0', minHeight: isMobile ? 680 : 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 0, minWidth: 0 }}>
        <div className="my-leads-pane" style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          background: '#fff',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <SectionTitle label="My Leads" pct="60%" />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MyDonors embedded portalEl={shellRef.current} onDetailStateChange={handleDetailStateChange} />
          </div>
        </div>

        <div className="my-leads-pane" style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          background: '#f8fafc',
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
        /* The call timer is a pill, not a metric-cell, so it gets its own rule
           rather than the sibling border above. */
        .perf-timer { flex: 0 0 auto; display: flex; align-items: center; padding: 0 14px; border-left: 1px solid #eef2f7; }
        /* CallTimer renders null when no call is up, which leaves this wrapper
           genuinely empty. Without this it would sit at the end of the strip all
           day drawing a rule and reserving padding for a timer that isn't there. */
        .perf-timer:empty { display: none; }
        .metric-arrow { animation: arrow-bob 1.8s ease-in-out infinite; }
        @keyframes arrow-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        /* Idle tile turns red + ripples + heartbeat once idle crosses 1 hour. */
        .metric-cell.idle-danger {
          background: #fecaca;
          position: relative;
          overflow: visible;
          animation: idle-heartbeat 1.1s ease-in-out infinite;
          z-index: 9999;
        }
        /* Ripple is portaled to document.body so it can render above the sticky
           header; keep only the red tile + heartbeat here. */
        @keyframes idle-ripple {
          0% { transform: scale(1); opacity: .9; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes idle-heartbeat {
          0%, 100% { transform: scale(1); }
          15% { transform: scale(1.08); }
          30% { transform: scale(1); }
          45% { transform: scale(1.08); }
          70% { transform: scale(1); }
        }
        /* The leads/suspense divider is drawn by the second pane, not as two
           facing borders, so the seam is one hairline rather than 2px. Driven by
           the container query rather than an inline style because the grid
           stacks on CONTAINER width - isMobile() reports the VIEWPORT, so a wide
           window with a narrow content column would stack the panes while
           isMobile() said false and leave a stray vertical rule on the right of
           an empty edge. */
        .my-leads-pane + .my-leads-pane { border-left: 1px solid var(--line); }
        @container my-leads (max-width: 900px) {
          .my-leads-shell { overflow-y: auto; }
          .my-leads-bottom { grid-template-columns: 1fr !important; min-height: 680px; }
          /* Stacked, so the divider turns horizontal. */
          .my-leads-pane + .my-leads-pane { border-left: none; border-top: 1px solid var(--line); }
        }
      `}</style>
    </div>
  );
}
