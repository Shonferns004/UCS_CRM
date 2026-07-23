import { useState, useEffect, useRef } from 'react';
import { getRejectedLeads, getDonorDetail, addDonorLog, uploadPaymentScreenshot } from '../api/donors';
import { useRealtime } from '../../../hooks/useRealtime';
import { api } from '../../../api/auth';
import DispositionModal from '../components/DispositionModal';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

export default function RejectedLeads() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalDonor, setModalDonor] = useState(null);
  const [modalNotifId, setModalNotifId] = useState(null);
  const intervalRef = useRef(null);

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    getRejectedLeads()
      .then(d => setTickets(d || []))
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => { if (showLoading) setLoading(false); });
  };

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(false), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useRealtime('rejected_lead_tickets', {
    onInsert: () => load(false),
    onUpdate: () => load(false),
    enabled: true,
  });

  const handleClick = (t) => {
    if (!t.donor_id) return;
    setModalNotifId(t.id);
    setModalDonor({
      id: t.donor_id,
      ngo_id: t.ngo_id,
      assignment_id: null,
      donor_name: t.donor_name,
      donor_mobile: t.donor_mobile || '',
    });
  };

  const markRead = async (notifId) => {
    try { await api(`/notifications/${notifId}/read`, { method: 'PUT', _prefix: 'ucs' }); } catch (e) { console.error('Error:', e.message); }
  };

  const handlePopDone = async () => {
    if (modalNotifId) await markRead(modalNotifId);
    setModalNotifId(null);
    setModalDonor(null);
    load(false);
  };

  const pending = tickets.filter(t => t.status === 'pending_review');
  const resolved = tickets.filter(t => t.status === 'resolved' || t.status === 'acknowledged');

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dc262618', color: '#dc2626' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{pending.length}</div>
            <div className="stat-lbl">Pending Review</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#16a34a18', color: '#16a34a' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{resolved.length}</div>
            <div className="stat-lbl">Resolved</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#5B6B4E18', color: '#5B6B4E' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{currency(tickets.reduce((s, t) => s + Number(t.amount || 0), 0))}</div>
            <div className="stat-lbl">Total Amount</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Rejected Leads ({tickets.length})</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Donor</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No rejected leads</td></tr>
              ) : (
                tickets.map(t => (
                  <tr key={t.id} className="clickable-row"
                    onClick={() => t.status === 'pending_review' && handleClick(t)}
                    style={t.status !== 'pending_review' ? { opacity: 0.5 } : {}}>
                    <td><strong>{t.donor_name}</strong></td>
                    <td><strong style={{ color: 'var(--sage)' }}>{currency(t.amount)}</strong></td>
                    <td style={{ fontSize: 12, maxWidth: 250, whiteSpace: 'pre-wrap' }}>{t.rejection_reason}</td>
                    <td>
                      {t.status === 'pending_review' ? <span className="pill pill-red">Rejected</span> :
                       t.status === 'resolved' ? <span className="pill pill-green">Resolved</span> :
                       <span className="pill pill-gray">{t.status}</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalDonor && (
        <DispositionModal
          donorId={modalDonor.id}
          ngoId={modalDonor.ngo_id}
          donorName={modalDonor.donor_name}
          donorMobile={modalDonor.donor_mobile}
          scheduledAt={null}
          onClose={() => { setModalNotifId(null); setModalDonor(null); }}
          onDone={handlePopDone}
        />
      )}
    </div>
  );
}
