import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevTicketStats } from '../api/tickets';

const PRIORITY_COLORS = { low: '#6b7280', medium: '#d97706', high: '#ea580c', critical: '#dc2626' };
const PRIORITY_BG = { low: '#f3f4f6', medium: '#fefce8', high: '#fff7ed', critical: '#fef2f2' };
const PANEL_LABELS = { fro: 'FRO', accounts: 'Accounts', ngo_admin: 'NGO Admin' };
const PANEL_COLORS = { fro: '#16a34a', accounts: '#2563eb', ngo_admin: '#7c3aed' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDevTicketStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 12 }}>Loading dashboard...</div>;
  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 12 }}>Failed to load stats</div>;

  const formatMinutes = (m) => {
    if (!m) return '—';
    if (m < 60) return `${Math.round(m)}m`;
    if (m < 1440) return `${(m / 60).toFixed(1)}h`;
    return `${(m / 1440).toFixed(1)}d`;
  };

  const trendEntries = Object.entries(stats.trend || {});
  const maxTrend = Math.max(...trendEntries.map(([, v]) => v), 1);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: stats.total, color: '#6366f1', bg: '#eef2ff' },
          { label: 'Open', value: stats.open, color: '#d97706', bg: '#fefce8' },
          { label: 'In Progress', value: stats.in_progress, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Resolved', value: stats.resolved, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Closed', value: stats.closed, color: '#6b7280', bg: '#f9fafb' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>By Priority</div>
          {Object.entries(stats.by_priority || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[k], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, textTransform: 'capitalize' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>7-Day Trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, paddingTop: 8 }}>
            {trendEntries.map(([date, count]) => (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-soft)' }}>{count || ''}</span>
                <div style={{ width: '100%', height: `${Math.max((count / maxTrend) * 80, 4)}px`, borderRadius: 4, background: 'linear-gradient(180deg, #6366f1, #818cf8)', transition: 'height .3s' }} />
                <span style={{ fontSize: 8, color: 'var(--ink-soft)' }}>{date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>By Source</div>
          {Object.entries(stats.by_panel || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PANEL_COLORS[k] || '#6b7280', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11 }}>{PANEL_LABELS[k] || k}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 4 }}>Avg First Response</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1' }}>{formatMinutes(stats.avg_response_minutes)}</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 4 }}>Avg Resolution</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1' }}>{formatMinutes(stats.avg_resolution_minutes)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>By Category</div>
          {Object.entries(stats.by_category || {}).filter(([, v]) => v > 0).map(([k, v]) => {
            const pct = Math.round((v / stats.total) * 100) || 0;
            return (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: '#6366f1', transition: 'width .3s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => navigate('/dev-panel/tickets')} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1' }}>{stats.open + stats.in_progress}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Active Tickets</div>
            </button>
            <button onClick={() => navigate('/dev-panel/unassigned')} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>{stats.open}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Needs Assignment</div>
            </button>
            <button onClick={() => navigate('/dev-panel/tickets?status=open&priority=critical')} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{stats.by_priority?.critical || 0}</div>
              <div style={{ fontSize: 10, color: '#991b1b' }}>Critical Issues</div>
            </button>
            <button onClick={() => navigate('/dev-panel/my-tickets')} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{stats.resolved + stats.closed}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Resolved</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
