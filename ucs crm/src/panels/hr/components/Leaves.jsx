import { useEffect, useState } from 'react';
import { useHR } from '../store';
import { Pill } from './ui';
import { Check, X } from '../icons';

export default function Leaves() {
  const { fetchLeaves, decideLeave } = useHR();
  const [leaves, setLeaves] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState(null);

  useEffect(() => { fetchLeaves().then(setLeaves).catch(() => {}); }, []);

  const handleDecide = async (id, status) => {
    try {
      await decideLeave(id, status);
      fetchLeaves().then(setLeaves).catch(() => {});
    } catch (e) {
      alert(e.message);
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  };

  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Leave requests</h3>
          <span className="sub">{leaves.filter(l=>l.status==='pending').length} pending</span></div>
        <table>
          <thead><tr><th>Worker</th><th>Type</th><th>Days</th><th>Starts</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight:500 }}>
                  <a href="#" className="worker-link" onClick={e => { e.preventDefault(); if (l.workers) setSelectedWorker(l.workers); }}>{l.workers?.name || 'Unknown'}</a>
                </td>
                <td>{l.type?.replace('_',' ')}</td>
                <td>{l.days}</td>
                <td style={{ color:'var(--ink-soft)' }}>{fmtDate(l.leave_date || l.start_date)}</td>
                <td><Pill status={l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Rejected' : 'Pending'} /></td>
                <td style={{ textAlign:'right' }}>
                  {l.status === 'pending' && (
                    <span style={{ display:'inline-flex', gap:6 }}>
                      <button className="btn btn-sm" onClick={()=>handleDecide(l.id,'Approved')}><Check width={14}/> Approve</button>
                      <button className="btn btn-sm" onClick={()=>handleDecide(l.id,'Rejected')}><X width={14}/></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!leaves.length && <tr><td colSpan={6}><div className="empty">No leave requests.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {selectedWorker && (
        <div className="modal-overlay" onClick={() => setSelectedWorker(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Worker Details</h3>
              <button className="btn btn-sm" onClick={() => setSelectedWorker(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="field"><span>Name</span><input type="text" value={selectedWorker.name || ''} disabled /></label>
              <label className="field"><span>Login ID</span><input type="text" value={selectedWorker.login_id || ''} disabled /></label>
              <label className="field"><span>Email</span><input type="text" value={selectedWorker.email || ''} disabled /></label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setSelectedWorker(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
