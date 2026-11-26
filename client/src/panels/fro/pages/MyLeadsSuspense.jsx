import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import MyDonors from './MyDonors';
import FroSuspense from './Suspense';
import CallTimer from '../components/CallTimer';
import { getMyPerformance } from '../api/donors';
import { formatDuration } from '../../../utils/formatDuration';
import { idleColorFor } from '../../../utils/warnTone';

function Metric({ label, value, valueColor, className, style: extraStyle, labelColor }) {
  return (
    <div className={`metric-cell${className ? ' ' + className : ''}`} style={extraStyle}>
      <span className="metric-label" style={labelColor ? { color: labelColor } : undefined}>{label}</span>
      <strong className="metric-value" style={valueColor ? { color: valueColor } : undefined}>{value}</strong>
    </div>
  );
}

function IdleMetric({ value, idleSeconds }) {
  const s = Number(idleSeconds) || 0;
  const idleStyle = idleColorFor(s);
  const show = s > 3600;
  return (
    <Metric
      label="Idle"
      labelColor={show ? idleStyle.color : undefined}
      value={value}
      valueColor={show ? idleStyle.color : undefined}
      className={show ? 'idle-danger' : ''}
      style={show ? { background: idleStyle.bg, boxShadow: `inset 0 0 0 1px ${idleStyle.border}` } : undefined}
    />
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

  // Whose figures these are. Under "work as" the tiles paint the person at the
  // keyboard (Priya covering Riya shows Priya's numbers), while the lead queue
  // and suspense stay with the account being worked.
  const figuresOwner = data?.worker?.name || '';

  return (
    <div className="perf-tiles" title={figuresOwner ? `Your figures: ${figuresOwner}` : undefined}>
      <Metric label="Calls" value={(data?.today_calls ?? 0).toString()} />
      {/* Idle today, including a period still running. The timer in the top
          bar is what produces it, so this is the FRO's own answer to "how
          much of my day was actually productive". */}
      <IdleMetric value={formatDuration(data?.idle_seconds)} idleSeconds={data?.idle_seconds} />
      <Metric label="Worked" value={`${formatDuration(data?.worked_seconds)} / 8h`} />
      <Metric label="Collection" value={`₹${Number(data?.today_collected ?? 0).toLocaleString('en-IN')}`} valueColor="#16a34a" />
    </div>
  );
}

export default function MyLeadsSuspense() {
  const isMobile = useIsMobile();
  const shellRef = useRef(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const handleDetailStateChange = useCallback((open) => setDetailOpen(!!open), []);

  // No padding and no gap: this view is meant to run edge to edge, touching the
  // header above and the sidebar/window edges at the sides. The host's padding is
  // zeroed in index.css via .panel-fro .content-body:has(.my-leads-shell).
  //
  // The right column now carries the compact 2×2 performance tiles above
  // Suspense, so the leads pane gets the full height on the left and the
  // leads/suspense split stays a single hairline between the two panes.
  return (
    <div ref={shellRef} className="my-leads-shell" style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', padding: 0, boxSizing: 'border-box', minHeight: 0 }}>
      <div className="my-leads-bottom" style={{ flex: '1 1 0', minHeight: isMobile ? 680 : 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 0, minWidth: 0 }}>
        <div className="my-leads-pane" style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          background: '#fff',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MyDonors
              embedded
              portalEl={shellRef.current}
              onDetailStateChange={handleDetailStateChange}
              unclaimedOnly={unclaimedOnly}
              onToggleUnclaimed={() => setUnclaimedOnly(v => !v)}
            />
          </div>
        </div>

        <div className="my-leads-pane fro-leads-side" style={{
          minWidth: 0, minHeight: 0,
          position: 'relative',
          gap: 12,
          display: 'flex', flexDirection: 'column',
        }}>
          {!detailOpen && (
            <div className="fro-side-metrics">
              <div className="perf-timer">
                <CallTimer />
              </div>
              <PersonalPerformance />
            </div>
          )}
          <div className="fro-suspense-section">
            <FroSuspense unclaimedOnly={unclaimedOnly} />
          </div>
        </div>
      </div>

<style>{`
        .my-leads-shell { container-type: inline-size; container-name: my-leads; }
        .my-leads-shell > div { min-width: 0; }
        .fro-side-metrics {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
        }
        .perf-tiles {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .perf-tiles .metric-cell {
          min-width: 0;
          min-height: 84px;
          padding: 13px 15px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          background: #fff;
          border: 1px solid #e8edf5;
          border-radius: 12px;
          box-shadow: none;
          transform-origin: center;
          transition: transform 170ms cubic-bezier(.22, 1, .36, 1), border-color 170ms ease;
        }
        .perf-tiles .metric-label {
          display: block;
          min-width: 0;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #8b98a9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .perf-tiles .metric-value {
          font-size: 21px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -.025em;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .perf-tiles .metric-cell:hover {
          transform: scale(1.015);
          border-color: #d7e0ec;
        }
        .perf-timer {
          display: flex;
          align-items: center;
          margin: 0 0 8px;
          padding: 8px 12px;
          background: #fff;
          border: 1px solid #e8edf5;
          border-radius: 12px;
        }
        /* CallTimer renders null when no call is up, which leaves this wrapper
           genuinely empty; keep the tiles tight to the top in that case. */
        .perf-timer:empty { display: none; }
        /* Idle tile turns red + heartbeats once idle crosses 1 hour. */
        .metric-cell.idle-danger {
          background: #fecaca;
          position: relative;
          animation: idle-heartbeat 1.1s ease-in-out infinite;
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
