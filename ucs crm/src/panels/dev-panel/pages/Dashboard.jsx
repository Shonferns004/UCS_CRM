import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnifiedDevTickets } from '../api/tickets';

const font = "'Hanken Grotesk', sans-serif";
const mono = "'JetBrains Mono', monospace";

const F = {
  headlineLg: { fontFamily: font, fontSize: 28, lineHeight: '36px', fontWeight: 500 },
  headlineMd: { fontFamily: font, fontSize: 22, lineHeight: '28px', fontWeight: 500 },
  bodySm: { fontFamily: font, fontSize: 14, lineHeight: '20px', fontWeight: 300 },
  bodyLg: { fontFamily: font, fontSize: 16, lineHeight: '24px', fontWeight: 400 },
  labelCaps: { fontFamily: font, fontSize: 12, lineHeight: '16px', letterSpacing: '0.08em', fontWeight: 500, textTransform: 'uppercase' },
  codeSm: { fontFamily: mono, fontSize: 13, lineHeight: '18px', fontWeight: 400 },
};

function computeStats(tickets) {
  const total = tickets.length;
  const by_status = {};
  const by_priority = {};
  const by_category = {};
  const by_source = { developer: 0, regular: 0 };
  let avgResponseSum = 0, avgResponseCount = 0;
  let avgResolutionSum = 0, avgResolutionCount = 0;
  const trend = {};

  tickets.forEach(t => {
    by_status[t.status] = (by_status[t.status] || 0) + 1;
    by_priority[t.priority] = (by_priority[t.priority] || 0) + 1;
    by_category[t.category] = (by_category[t.category] || 0) + 1;
    const src = t._source || 'regular';
    by_source[src] = (by_source[src] || 0) + 1;
    if (t.first_response_at && t.created_at) {
      avgResponseSum += (new Date(t.first_response_at) - new Date(t.created_at)) / 60000;
      avgResponseCount++;
    }
    if (t.resolved_at && t.created_at) {
      avgResolutionSum += (new Date(t.resolved_at) - new Date(t.created_at)) / 60000;
      avgResolutionCount++;
    }
    if (t.created_at) {
      const date = new Date(t.created_at).toISOString().slice(0, 10);
      trend[date] = (trend[date] || 0) + 1;
    }
  });

  return {
    total,
    open: by_status.open || 0,
    in_progress: by_status.in_progress || 0,
    under_review: by_status.under_review || 0,
    resolved: by_status.resolved || 0,
    closed: by_status.closed || 0,
    by_priority,
    by_category,
    by_source,
    avg_response_minutes: avgResponseCount ? Math.round(avgResponseSum / avgResponseCount) : 0,
    avg_resolution_minutes: avgResolutionCount ? Math.round(avgResolutionSum / avgResolutionCount) : 0,
    trend: Object.fromEntries(Object.entries(trend).sort().slice(-7)),
  };
}

const glass = { background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)' };

const KPI = [
  { label: 'Total Tickets', key: 'total', icon: 'confirmation_number', gradient: 'from-blue-100 to-indigo-100', iconColor: '#6366f1', borderGrad: 'from-blue-50 to-indigo-50', trend: '+12%', trendDir: 'up', trendLabel: 'vs last week' },
  { label: 'Open Issues', key: 'open', icon: 'error', gradient: 'from-rose-50 to-orange-50', iconColor: '#f43f5e', borderGrad: 'from-rose-50 to-orange-50', trend: '-4%', trendDir: 'down', trendLabel: 'vs last week' },
  { label: 'Resolved Today', key: 'resolved', icon: 'check_circle', gradient: 'from-emerald-50 to-teal-50', iconColor: '#10b981', borderGrad: 'from-emerald-50 to-teal-50', trend: '+8%', trendDir: 'up', trendLabel: 'vs yesterday' },
  { label: 'Avg Resolution', key: 'avg_resolution_minutes', icon: 'schedule', gradient: 'from-slate-100 to-gray-100', iconColor: '#64748b', borderGrad: 'from-slate-100 to-gray-100', trend: '-1.5h', trendDir: 'down', trendLabel: 'vs last month', isTime: true },
];

function formatMinutes(m) {
  if (!m) return '—';
  if (m < 60) return Math.round(m) + 'm';
  if (m < 1440) return (m / 60).toFixed(1) + 'h';
  return (m / 1440).toFixed(1) + 'd';
}

const MOCK_STATS = {
  total: 1284,
  open: 342,
  in_progress: 154,
  under_review: 86,
  resolved: 256,
  closed: 446,
  by_priority: { low: 89, medium: 156, high: 67, critical: 30 },
  by_category: { bug: 142, feature_request: 89, infrastructure: 56, ui_issue: 55 },
  by_source: { developer: 612, regular: 672 },
  avg_response_minutes: 42,
  avg_resolution_minutes: 252,
  trend: {
    '2026-08-13': 85, '2026-08-14': 92, '2026-08-15': 78,
    '2026-08-16': 110, '2026-08-17': 95, '2026-08-18': 120, '2026-08-19': 105,
  },
};

function DonutChart({ stats }) {
  const total = (stats.in_progress || 0) + (stats.under_review || 0) + (stats.resolved || 0) + (stats.closed || 0) || 1;
  const segments = [
    { label: 'In Progress', pct: ((stats.in_progress || 0) / total * 100), color: '#818cf8' },
    { label: 'Under Review', pct: ((stats.under_review || 0) / total * 100), color: '#fcd34d' },
    { label: 'Resolved', pct: ((stats.resolved || 0) / total * 100), color: '#34d399' },
    { label: 'Blocked', pct: ((stats.open || 0) / total * 100), color: '#f87171' },
  ];
  let cum = 0;
  const grad = segments.map(s => { const start = cum; cum += s.pct; return `${s.color} ${start}% ${cum}%`; }).join(', ');

  return (
    <div className="dp-glass-card" style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 380 }}>
      <h3 style={{ ...F.headlineMd, color: '#191c1e', marginBottom: 4 }}>Status Distribution</h3>
      <p style={{ ...F.bodySm, color: '#6b7280', marginBottom: 24 }}>Current active tickets</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 144, height: 144, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${grad})` }}>
          <div style={{ width: 96, height: 96, background: '#f4f7fc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)' }}>
            <span style={{ ...F.headlineLg, fontSize: 24, color: '#191c1e' }}>{stats.total || 0}</span>
            <span style={{ ...F.labelCaps, fontSize: 10, color: '#6b7280', marginTop: 2, letterSpacing: '0.08em' }}>Total</span>
          </div>
        </div>
        <div style={{ width: '100%', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {segments.map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.3)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                <span style={{ ...F.bodySm, fontSize: 13, color: '#374151', fontWeight: 500 }}>{s.label}</span>
              </div>
              <span style={{ ...F.codeSm, fontSize: 12, color: '#4b5563', fontWeight: 500 }}>{Math.round(s.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendChart({ trend }) {
  const entries = Object.entries(trend || {});
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="dp-glass-card" style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 380 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ ...F.headlineMd, color: '#191c1e' }}>Ticket Trends</h3>
          <p style={{ ...F.bodySm, color: '#6b7280' }}>Last 7 days</p>
        </div>
        <div style={{ display: 'flex', gap: 16, ...F.labelCaps }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(90deg,#818cf8,#3b82f6)' }} />
            <span style={{ color: '#4b5563' }}>New</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(90deg,#34d399,#10b981)' }} />
            <span style={{ color: '#4b5563' }}>Resolved</span>
          </div>
        </div>
      </div>
      <div className="dp-chart-grid" style={{ flex: 1, position: 'relative', borderRadius: 12, border: '1px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'flex-end', paddingTop: 16, paddingLeft: 8, paddingRight: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.3)' }}>
        <div style={{ position: 'absolute', left: 16, top: 16, bottom: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...F.codeSm, color: '#94a3b8', paddingBottom: 8, zIndex: 10, fontWeight: 300 }}>
          <span>150</span><span>100</span><span>50</span><span>0</span>
        </div>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.05))' }} preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M 0,80 Q 15,75 30,85 T 60,60 T 85,70 T 100,50" fill="none" stroke="url(#gGreen)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          <path d="M 0,80 Q 15,75 30,85 T 60,60 T 85,70 T 100,50 L 100,100 L 0,100 Z" fill="url(#gGreenFill)" opacity="0.2" />
          <path d="M 0,70 Q 20,50 40,65 T 70,30 T 90,40 T 100,20" fill="none" stroke="url(#gBlue)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          <path d="M 0,70 Q 20,50 40,65 T 70,30 T 90,40 T 100,20 L 100,100 L 0,100 Z" fill="url(#gBlueFill)" opacity="0.2" />
          <defs>
            <linearGradient id="gBlue" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
            <linearGradient id="gGreen" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" /></linearGradient>
            <linearGradient id="gBlueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity="0.6" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient>
            <linearGradient id="gGreenFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity="0.6" /><stop offset="100%" stopColor="#10b981" stopOpacity="0" /></linearGradient>
          </defs>
        </svg>
        <div style={{ position: 'absolute', bottom: 8, left: 48, right: 24, display: 'flex', justifyContent: 'space-between', ...F.codeSm, color: '#94a3b8', zIndex: 10, fontWeight: 300 }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
        </div>
      </div>
    </div>
  );
}

const ACTIVITIES = [
  { name: 'Sarah Chen', initials: null, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0g40u8AO4cUj0XuuBroIeh43tdOE9OC6hxD1TxIrmCUwPicTloYPabUgMsOaDkQylU_hifSM-kGVJLAPRJQD9bNHa91Z4WM2OJtj-EL4ncXD7ip0IBnbH4SeCA0MWK0B92_ed5mzWyOTufE4gO7F3rxuhX8BCYBBGH6JWZGLmjOfYjCflGnC94LBE_rffPOnWQrE3Ojqrn-5rWbZxvNqv_wQTrLYsvqLqsLVeS48_iaRiOlMdmGCvcQ', action: 'updated status of', ticket: 'ISSUE-4092', ticketColor: '#10b981', ticketLabel: 'Resolved', quote: '"Fixed the database connection pooling issue causing timeouts."', time: '10m ago' },
  { name: 'Marcus Johnson', initials: 'MJ', img: null, gradient: 'from-indigo-100 to-purple-100', action: 'assigned', ticket: 'BUG-312', ticketColor: null, ticketLabel: null, quote: '"Please look into this UI glitch on the login screen."', time: '45m ago' },
  { name: 'System', initials: null, img: null, isSystem: true, action: 'automatically created', ticket: 'ALERT-992', ticketColor: null, ticketLabel: null, quote: 'High memory usage detected on Web Server 04.', time: '2h ago' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(MOCK_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tickets = await getUnifiedDevTickets();
        if (!cancelled && tickets?.length) setStats(computeStats(tickets));
        else if (!cancelled) setStats(MOCK_STATS);
      } catch {
        if (!cancelled) setStats(MOCK_STATS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', ...F.bodySm }}>Loading dashboard...</div>;

  return (
    <div style={{ fontFamily: font, minHeight: '100vh', background: 'linear-gradient(135deg, #e0e7ff 0%, #f8fafc 50%, #dbeafe 100%)', padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ ...F.headlineLg, color: '#191c1e', marginBottom: 4, fontWeight: 300 }}>Dashboard Overview</h2>
            <p style={{ ...F.bodySm, color: '#6b7280' }}>Monitor key metrics, ticket volume, and recent activity across the platform.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
          {KPI.map(k => (
            <div key={k.key} className="dp-glass-card" style={{ borderRadius: 16, padding: 20, transition: 'box-shadow .3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <p style={{ ...F.labelCaps, color: '#6b7280', marginBottom: 4 }}>{k.label}</p>
                  <h3 style={{ ...F.headlineLg, color: '#191c1e', fontSize: 28 }}>{k.isTime ? formatMinutes(stats[k.key]) : (stats[k.key] || 0).toLocaleString()}</h3>
                </div>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, var(--tw-gradient-from, #f1f5f9), var(--tw-gradient-to, #e2e8f0))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.iconColor, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{k.icon}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...F.labelCaps, color: '#6b7280', marginTop: 4 }}>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{k.trendDir === 'up' ? 'arrow_upward' : 'arrow_downward'}</span>
                  {k.trend}
                </span>
                <span style={{ fontWeight: 300 }}>{k.trendLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <TrendChart trend={stats.trend} />
          <DonutChart stats={stats} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div className="dp-glass-card" style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', height: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ ...F.headlineMd, color: '#191c1e' }}>Recent Activity</h3>
              <button style={{ ...F.bodySm, color: '#6366f1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: font }}>View All</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 8 }}>
              {ACTIVITIES.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: 12, background: 'rgba(255,255,255,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.5)', transition: 'background .2s' }}>
                  {a.img ? (
                    <img src={a.img} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  ) : a.isSystem ? (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>smart_toy</span>
                    </div>
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #e0e7ff, #ede9fe)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', border: '1px solid rgba(99,102,241,0.1)', ...F.bodySm, fontSize: 13 }}>
                      {a.initials}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={{ ...F.bodySm, color: '#374151', fontSize: 13 }}>
                        <span style={{ fontWeight: 500, color: '#1f2937' }}>{a.name}</span> {a.action}{' '}
                        <span style={{ color: '#6366f1', fontFamily: mono, fontWeight: 500, fontSize: 12 }}>{a.ticket}</span>
                        {a.ticketLabel && <> to <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#059669', fontSize: 10, ...F.labelCaps, textTransform: 'uppercase', border: '1px solid rgba(16,185,129,0.15)' }}>{a.ticketLabel}</span></>}
                      </p>
                      <span style={{ ...F.labelCaps, fontSize: 10, color: '#94a3b8', flexShrink: 0, marginTop: 2 }}>{a.time}</span>
                    </div>
                    <p style={{ ...F.bodySm, color: '#6b7280', marginTop: 2, fontStyle: 'italic', fontSize: 13 }}>{a.quote}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dp-glass-card" style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, rgba(254,226,226,0.6) 0%, rgba(255,255,255,0.4) 100%)', border: '1px solid rgba(254,202,202,0.5)', height: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#f43f5e' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>warning</span>
              <h3 style={{ ...F.headlineMd, color: '#191c1e' }}>Action Required</h3>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid rgba(254,202,202,0.6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ ...F.codeSm, fontWeight: 500, color: '#1f2937' }}>SLA Breach Warning</span>
                  <span style={{ padding: '2px 6px', background: '#fee2e2', color: '#b91c1c', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', borderRadius: 4, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #fecaca' }}>High</span>
                </div>
                <p style={{ ...F.bodySm, color: '#4b5563', marginBottom: 8, fontSize: 13 }}>Ticket <span style={{ color: '#6366f1', fontWeight: 500 }}>ISSUE-4088</span> is 30 mins away from SLA breach.</p>
                <button style={{ fontSize: 13, color: '#6366f1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: font, padding: 0 }}>Review Ticket</button>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ ...F.codeSm, fontWeight: 500, color: '#1f2937' }}>Unassigned High Priority</span>
                </div>
                <p style={{ ...F.bodySm, color: '#4b5563', marginBottom: 8, fontSize: 13 }}>3 critical bugs are currently unassigned.</p>
                <button style={{ fontSize: 13, color: '#6366f1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: font, padding: 0 }}>View Unassigned</button>
              </div>
            </div>
            <button style={{ width: '100%', marginTop: 16, background: 'rgba(255,255,255,0.6)', color: '#374151', border: '1px solid #e2e8f0', padding: '8px 0', borderRadius: 12, cursor: 'pointer', ...F.bodySm, fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontFamily: font, transition: 'background .2s' }}>Dismiss All</button>
          </div>
        </div>
      </div>
    </div>
  );
}
