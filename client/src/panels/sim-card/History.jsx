import { useEffect, useState } from 'react';
import { fetchReplacements } from './api';
import { toast } from '../../components/Toast';
import { formatDate } from './helpers';

export default function History() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReplacements()
      .then((d) => setReps(Array.isArray(d) ? d : []))
      .catch((e) => { toast(e.message || 'Failed to load history', 'error'); setReps([]); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="card-block">
        <div className="tb"><h3>Replacement History</h3><span className="ln">Newest records first</span></div>
        {loading ? (
          <div className="empty-state"><div className="big">Loading...</div></div>
        ) : reps.length === 0 ? (
          <div className="empty-state"><div className="big">No replacement history</div><div className="small">Replaced SIMs will appear here.</div></div>
        ) : (
          <div className="table-wrap">
            <table className="sim-table">
              <thead>
                <tr><th>Replacement Date</th><th>Mobile ID</th><th>Old SIM</th><th>New SIM</th><th>Device</th><th>New Expiry</th><th>Reason</th><th>Changed By</th></tr>
              </thead>
              <tbody>
                {reps.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.replacement_date)}</td>
                    <td style={{ fontWeight: 600 }}>{r.mobile_id || '—'}</td>
                    <td>{r.old_sim || '—'}</td>
                    <td style={{ color: 'var(--sim-blue-dark)', fontWeight: 600 }}>{r.new_sim}</td>
                    <td>{r.device || '—'}</td>
                    <td>{formatDate(r.new_expiry_date)}</td>
                    <td>{r.reason || '—'}</td>
                    <td>{r.changed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
