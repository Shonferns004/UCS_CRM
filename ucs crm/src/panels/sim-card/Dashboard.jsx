import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSim } from './store';
import { Icon } from './components';
import { effectiveStatus, dayLabel, dayClass, formatDate, pillForStatus } from './helpers';

function cardStyle(iconName, tint) {
  return {
    background: tint.bg, color: tint.color,
  };
}

const TINTS = {
  total: { bg: '#eff6ff', color: '#2563eb' },
  active: { bg: '#f0fdf4', color: '#16a34a' },
  expiring: { bg: '#fffbeb', color: '#d97706' },
  expired: { bg: '#fef2f2', color: '#dc2626' },
  replaced: { bg: '#f0f9ff', color: '#0284c7' },
};

export default function Dashboard({ onAdd, onView, onEdit, onReplace }) {
  const { cards, loading } = useSim();

  const data = useMemo(() => {
    const enriched = cards.map((c) => ({ ...c, _status: effectiveStatus(c) }));
    const total = enriched.length;
    const active = enriched.filter((c) => c._status === 'Active').length;
    const expiring = enriched.filter((c) => c._status === 'Expiring Soon').length;
    const expired = enriched.filter((c) => c._status === 'Expired').length;
    const replaced = enriched.filter((c) => c._status === 'Replaced').length;

    const buckets = {
      expired: enriched.filter((c) => c._status === 'Expired').length,
      exp7: enriched.filter((c) => { const d = c.days_left; return c._status === 'Expiring Soon' && d !== null && d <= 7; }).length,
      exp30: enriched.filter((c) => { const d = c.days_left; return c._status === 'Expiring Soon' && d !== null && d > 7 && d <= 30; }).length,
      ok30: enriched.filter((c) => { const d = c.days_left; return d !== null && d > 30; }).length,
    };

    const urgent = enriched
      .filter((c) => c._status === 'Expiring Soon')
      .sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999))
      .slice(0, 8);

    return { enriched, total, active, expiring, expired, replaced, buckets, urgent };
  }, [cards]);

  if (loading && cards.length === 0) {
    return <div className="empty-state"><div className="big">Loading SIM data...</div></div>;
  }

  const bucketMax = Math.max(data.buckets.expired, data.buckets.exp7, data.buckets.exp30, data.buckets.ok30, 1);

  const summary = [
    { label: 'Total SIM Cards', val: data.total, sub: 'All registered SIMs', icon: 'simcard', tint: TINTS.total },
    { label: 'Active SIM Cards', val: data.active, sub: 'Expiry 30+ days away', icon: 'sim', tint: TINTS.active },
    { label: 'Expiring Soon', val: data.expiring, sub: 'Within 30 days', icon: 'clock', tint: TINTS.expiring },
    { label: 'Expired SIM Cards', val: data.expired, sub: 'Past expiry date', icon: 'inventory', tint: TINTS.expired },
    { label: 'Replaced SIM Cards', val: data.replaced, sub: 'Total replaced', icon: 'replace', tint: TINTS.replaced },
  ];

  const buckets = [
    { label: 'Expired', val: data.buckets.expired, color: '#dc2626' },
    { label: 'Expiring in 7 days', val: data.buckets.exp7, color: '#d97706' },
    { label: 'Expiring in 30 days', val: data.buckets.exp30, color: '#f59e0b' },
    { label: 'Active for 30+ days', val: data.buckets.ok30, color: '#16a34a' },
  ];

  return (
    <div>
      {data.total === 0 ? (
        <div className="sim-box empty-state" style={{ marginTop: 24 }}>
          <div className="big">No SIM Cards Found</div>
          <div className="small">Manage all company SIM cards from one place.</div>
          <button className="sim-btn primary" onClick={onAdd}>+ Add SIM Card</button>
        </div>
      ) : (
        <>
          <div className="grid-4">
            {summary.map((s) => (
              <div className="sim-card" key={s.label}>
                <div className="ic" style={{ background: s.tint.bg, color: s.tint.color }}>
                  <Icon name={s.icon} size={18} />
                </div>
                <div className="title">{s.label}</div>
                <div className="num">{s.val}</div>
                <div className="sub">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="card-block">
            <div className="tb"><h3>Expiry Overview</h3><span className="ln">Based on auto-expiry dates</span></div>
            <div className="stats-row">
              {buckets.map((b) => (
                <div className="stat-g" key={b.label}>
                  <div className="lab">{b.label}</div>
                  <div className="bar"><span className="fill" style={{ width: `${(b.val / bucketMax) * 100}%`, background: b.color }} /></div>
                  <div className="val">{b.val} SIMs</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-block">
            <div className="tb"><h3>SIMs Expiring Soon</h3><Link to="/sim/dashboard/expiring" className="sim-btn ghost" style={{ fontSize: 12, textDecoration: 'none' }}>View all →</Link></div>
            {data.urgent.length === 0 ? (
              <div className="empty-state"><div className="big">No urgent expiries</div><div className="small">All SIMs have more than 30 days remaining.</div></div>
            ) : (
              <div className="table-wrap">
                <table className="sim-table">
                  <thead>
                    <tr><th>Mobile ID</th><th>Device</th><th>IMEI</th><th>Team</th><th>Expiry Date</th><th>Days Left</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {data.urgent.map((c) => (
                      <tr key={c.id}>
                        <td>{c.mobile_id}</td>
                        <td>{c.device_model}</td>
                        <td>{c.imei}</td>
                        <td>{c.team || '—'}</td>
                        <td>{formatDate(c.expiry_date)}</td>
                        <td className={`days-cell ${dayClass(c.days_left)}`}>{dayLabel(c.days_left)}</td>
                        <td><span className={`pill ${pillForStatus(c._status)}`}>{c._status}</span></td>
                        <td>
                          <div className="cell-actions">
                            <button className="mini-btn" onClick={() => onView(c)}>View</button>
                            <button className="mini-btn" onClick={() => onEdit(c)}>Edit</button>
                            <button className="mini-btn" onClick={() => onReplace(c)}>Replace</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
