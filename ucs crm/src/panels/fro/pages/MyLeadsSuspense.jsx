import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import MyDonors from './MyDonors';
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
  return <span aria-label={good ? 'Above target' : 'Below target'} style={{ color: good ? '#16a34a' : '#dc2626', fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{good ? '↑' : '↓'}</span>;
}

function Metric({ label, value, detail, good, accent }) {
  return (
    <div style={{ minWidth: 0, flex: '1 1 110px', padding: '8px 10px', borderLeft: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.45px', fontWeight: 800 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <strong style={{ color: accent || '#17233c', fontSize: 17, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
        {good != null && <Arrow good={good} />}
      </div>
      {detail && <div style={{ marginTop: 3, fontSize: 9, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>}
    </div>
  );
}

function PersonalPerformance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => getMyPerformance()
      .then(next => { if (!cancelled) { setData(next); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const levelHigh = data?.level === 'high';
  const calls = data?.calls || [];
  const currentHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
  const callTarget = 17;

  return (
    <div className="fro-my-leads-performance" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: '#f8fafc', overflowY: 'auto' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#17233c' }}>My Performance</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Today&apos;s connected pace and productivity</div>
          </div>
          {loading && <span style={{ fontSize: 10, color: '#64748b' }}>Loading…</span>}
          {error && <span style={{ fontSize: 10, color: '#dc2626' }}>Unable to refresh</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: '1px solid #eef2f6', padding: '2px 0' }}>
          <Metric label="Rank" value={data?.rank ? `#${data.rank}` : '—'} detail={data?.team_size ? `of ${data.team_size} FROs` : 'Team rank'} accent="#7c3aed" />
          <Metric label="Idle" value={formatIdle(data?.idle_seconds)} detail="Today" accent="#d97706" />
          <Metric label="Calls" value={data?.today_calls ?? 0} detail={`Target ${callTarget}/hr`} good={(data?.today_calls ?? 0) >= callTarget} accent="#2563eb" />
          <Metric label="Performance" value={`${data?.performance ?? 0}%`} detail={levelHigh ? 'High performance' : 'Low performance'} good={levelHigh} accent={levelHigh ? '#16a34a' : '#dc2626'} />
        </div>
      </div>

      <div className="fro-my-leads-panels" style={{ flex: 1, minHeight: 420, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <section style={{ minWidth: 0, minHeight: 0, background: '#fff', border: `1px solid ${levelHigh ? '#bbf7d0' : '#fecdd3'}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 15px', background: levelHigh ? '#f0fdf4' : '#fff5f5', borderBottom: `1px solid ${levelHigh ? '#dcfce7' : '#ffe4e6'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{levelHigh ? '↑' : '↓'}</span>
              <div>
                <h3 style={{ margin: 0, color: levelHigh ? '#166534' : '#be123c', fontSize: 16, fontWeight: 800 }}>{levelHigh ? 'High Performance' : 'Low Performance'}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: '#64748b' }}>{levelHigh ? 'You are meeting the connected target pace.' : 'You are below the connected target pace.'}</p>
              </div>
            </div>
          </div>
          <div style={{ padding: 15, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 8 }}>
              <div><div style={{ fontSize: 10, color: '#64748b' }}>Connected</div><strong style={{ fontSize: 30, color: levelHigh ? '#16a34a' : '#dc2626' }}>{data?.connected ?? 0}</strong></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: '#64748b' }}>Target by now</div><strong style={{ fontSize: 20, color: '#17233c' }}>{data?.target_pace ?? 0}</strong></div>
            </div>
            <div style={{ marginTop: 16, height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(Number(data?.performance || 0), 100)}%`, height: '100%', background: levelHigh ? '#16a34a' : '#ef4444', borderRadius: 999 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 10, color: '#64748b' }}><span>{data?.performance ?? 0}% of pace</span><span>{data?.elapsed_hours ?? 0}/12 hours</span></div>
          </div>
        </section>

        <section style={{ minWidth: 0, minHeight: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 15px', borderBottom: '1px solid #eef2f6' }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#17233c', fontWeight: 800 }}>Calls by Hour</h3>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#64748b' }}>Target: {callTarget} calls per hour</p>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 12px' }}>
            {calls.map(row => {
              const hour = Number(row.hour.slice(0, 2));
              const active = hour === currentHour;
              const good = row.calls >= callTarget;
              return <div key={row.hour} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px', borderBottom: '1px solid #f1f5f9', background: active ? '#f8fafc' : 'transparent' }}>
                <span style={{ width: 42, fontSize: 10, color: '#64748b', fontWeight: active ? 800 : 600 }}>{row.hour}</span>
                <div style={{ flex: 1, height: 7, background: '#eef2f6', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${Math.min((row.calls / callTarget) * 100, 100)}%`, height: '100%', background: good ? '#22c55e' : '#ef4444', borderRadius: 999 }} /></div>
                <strong style={{ minWidth: 22, textAlign: 'right', color: good ? '#16a34a' : '#dc2626', fontSize: 11 }}>{row.calls}</strong><Arrow good={good} />
              </div>;
            })}
          </div>
        </section>
      </div>
      <style>{`@media (max-width: 600px) { .fro-my-leads-panels { grid-template-columns: 1fr !important; min-height: 0 !important; } }`}</style>
    </div>
  );
}

export default function MyLeadsSuspense() {
  const isMobile = useIsMobile();
  const isCompact = useIsMobile(480);
  const shellRef = useRef(null);

  // On phones the split is stacked, so chrome (padding/gap) must shrink to
  // leave as much height as possible for the two scrollable lists.
  const gap = isCompact ? 8 : isMobile ? 10 : 12;
  const pad = isCompact ? 6 : isMobile ? 8 : 12;
  const leadFlex = isMobile ? '1 1 50%' : '1 1 0';
  const suspFlex = isMobile ? '1 1 50%' : '2 1 0';

return (
    <div ref={shellRef} className="my-leads-shell" style={{ height: '100%', position: 'relative', display: 'flex', gap, padding: pad, boxSizing: 'border-box', minHeight: 0 }}>
      <div style={{
        flex: leadFlex,
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
        flex: suspFlex,
        minWidth: 0, minHeight: 0,
        position: 'relative',
        background: '#f8fafc',
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <SectionTitle label="Performance" pct="60%" />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PersonalPerformance />
        </div>
      </div>

      <style>{`
        .my-leads-shell { container-type: inline-size; container-name: my-leads; }

        /* Base layout: two usable panes on wide screens. */
        .my-leads-shell > div { min-width: 0; }

        /* Use the available content width, not the browser viewport. This is
           important when DevTools, a split window, or a tablet layout reduces
           the FRO content area while the viewport itself remains wide. */
        @container my-leads (max-width: 900px) {
          .my-leads-shell {
            flex-direction: column !important;
            overflow-y: auto;
            align-items: stretch;
          }

          .my-leads-shell > div {
            flex: 1 1 360px !important;
            width: 100%;
            max-width: none;
          }
        }

        @container my-leads (max-width: 520px) {
          .my-leads-shell { gap: 8px !important; padding: 6px !important; }
          .my-leads-shell > div { flex-basis: 340px !important; border-radius: 8px; }
        }
      `}</style>
    </div>
  );
}
