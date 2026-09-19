import { useMemo } from 'react';
import { useSim } from './store';
import { effectiveStatus, dayLabel, dayClass, formatDate, pillForStatus } from './helpers';

export default function Expiring({ onView, onEdit, onReplace, tab = 'all' }) {
  const { cards, loading } = useSim();

  const enriched = useMemo(() => cards.map((c) => ({ ...c, _status: effectiveStatus(c) })), [cards]);

  const list = useMemo(() => {
    let l = enriched.filter((c) => c._status === 'Expiring Soon' || c._status === 'Expired');
    if (tab === '7') l = l.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 7);
    if (tab === '30') l = l.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 30);
    if (tab === 'expired') l = l.filter((c) => c._status === 'Expired');
    return l.sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));
  }, [enriched, tab]);

  if (loading && cards.length === 0) return <div className="empty-state"><div className="big">Loading...</div></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[
          ['all', 'All Expiring / Expired'],
          ['7', 'Within 7 Days'],
          ['30', 'Within 30 Days'],
          ['expired', 'Expired'],
        ].map(([t, label]) => (
          <button key={t} className={`sim-btn ${tab === t ? 'primary' : ''}`} onClick={() => { /* handled by nav */ }}>{label}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="sim-box empty-state">
          <div className="big">No Matching SIMs</div>
          <div className="small">No SIMs in this expiry range.</div>
        </div>
      ) : (
        <div className="card-block">
          <div className="table-wrap">
            <table className="sim-table">
              <thead>
                <tr><th>Mobile ID</th><th>Device</th><th>IMEI</th><th>Team</th><th>Expiry Date</th><th>Days Left</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.mobile_id}</td>
                    <td>{c.device_model}</td>
                    <td>{c.imei}</td>
                    <td>{c.team || '—'}</td>
                    <td>{formatDate(c.expiry_date)}</td>
                    <td className={`days-cell ${dayClass(c.days_left)}`}>{dayLabel(c.days_left)}</td>
                    <td><span className={`pill ${pillForStatus(c._status)}`}>{c._status}</span></td>
                    <td><div className="cell-actions">
                      <button className="mini-btn" onClick={() => onView(c)}>View</button>
                      <button className="mini-btn" onClick={() => onEdit(c)}>Edit</button>
                      <button className="mini-btn" onClick={() => onReplace(c)}>Replace</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
