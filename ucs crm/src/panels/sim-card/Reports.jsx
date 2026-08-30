import { useMemo } from 'react';
import { useSim } from './store';
import { effectiveStatus } from './helpers';
import { exportToCSV, exportToExcel } from './helpers';

export default function Reports({ cards }) {
  const { cards: ctxCards } = useSim();
  const list = cards || ctxCards;

  const data = useMemo(() => {
    const enriched = list.map((c) => ({ ...c, _status: effectiveStatus(c) }));
    const statusBreakdown = {};
    const teamBreakdown = {};
    enriched.forEach((c) => {
      statusBreakdown[c._status] = (statusBreakdown[c._status] || 0) + 1;
      const t = c.team || 'Unassigned';
      teamBreakdown[t] = (teamBreakdown[t] || 0) + 1;
    });
    const total = enriched.length;
    const expired = (statusBreakdown.Expired || 0);
    const expiring = (statusBreakdown['Expiring Soon'] || 0);
    return { enriched, statusBreakdown, teamBreakdown, total, expired, expiring };
  }, [list]);

  const statusColors = { Active: '#16a34a', 'Expiring Soon': '#d97706', Expired: '#dc2626', Replaced: '#0284c7', Inactive: '#6b7280' };

  return (
    <div>
      <div className="card-block">
        <div className="tb"><h3>SIM Reports</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sim-btn" onClick={() => exportToCSV(data.enriched)}>Export CSV</button>
            <button className="sim-btn" onClick={() => exportToExcel(data.enriched)}>Export Excel</button>
          </div>
        </div>

        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
          <div className="sim-box" style={{ boxShadow: 'none' }}>
            <div className="section-title" style={{ fontSize: 14, marginBottom: 14 }}>Status Breakdown</div>
            {Object.entries(data.statusBreakdown).map(([k, v]) => (
              <div key={k} className="stat-g" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>{k}</span><strong>{v}</strong>
                </div>
                <div className="bar"><span className="fill" style={{ width: `${(v / Math.max(data.total, 1)) * 100}%`, background: statusColors[k] || '#94a3b8' }} /></div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--sim-ink-soft)', marginTop: 6 }}>
              {data.total} total · {data.expired} expired · {data.expiring} expiring soon
            </div>
          </div>

          <div className="sim-box" style={{ boxShadow: 'none' }}>
            <div className="section-title" style={{ fontSize: 14, marginBottom: 14 }}>SIMs by Team</div>
            {Object.entries(data.teamBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="stat-g" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>{k}</span><strong>{v}</strong>
                </div>
                <div className="bar"><span className="fill" style={{ width: `${(v / Math.max(data.total, 1)) * 100}%`, background: '#2563eb' }} /></div>
              </div>
            ))}
            {Object.keys(data.teamBreakdown).length === 0 && <div style={{ color: 'var(--sim-ink-soft)', fontSize: 13 }}>No team data available.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
