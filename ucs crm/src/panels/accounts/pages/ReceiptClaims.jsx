import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPut } from '../api/auth';
import Toast from '../components/Toast';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: color + '18', color }}>{icon}</div>
    <div className="stat-info">
      <div className="stat-num">{value}</div>
      <div className="stat-lbl">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  </div>
);

const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014';
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

export default function ReceiptClaims() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [toast, setToast] = useState({ msg: '', type: 'success', vis: false });

  const [verifyTarget, setVerifyTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const url = statusFilter ? `/accounts/receipt-claims?status=${statusFilter}` : '/accounts/receipt-claims';
    apiGet(url)
      .then(setItems)
      .catch(err => { console.error('ReceiptClaims error:', err); setToast({ msg: err.message || 'Failed to load claims', type: 'error', vis: true }); })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(load, [load]);

  const stats = useMemo(() => {
    const pending = items.filter(i => i.status === 'pending');
    const pendingAmount = pending.reduce((s, i) => s + Number(i.receipt?.amount || 0), 0);
    const totalAmount = items.reduce((s, i) => s + Number(i.receipt?.amount || 0), 0);
    return { pending, pendingAmount, totalAmount };
  }, [items]);

  const openVerify = (claim) => {
    setVerifyTarget(claim);
    setSearchQ('');
    setSearchResults([]);
    setSelectedDonor(null);
  };

  const searchDonors = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await apiGet(`/accounts/donors?search=${encodeURIComponent(searchQ.trim())}`);
      setSearchResults((res?.data || []).slice(0, 20));
    } catch (err) { console.error('Donor search error:', err); }
    finally { setSearching(false); }
  };

  const doVerify = async () => {
    if (!verifyTarget) return;
    setActionBusy(true);
    try {
      await apiPut(`/accounts/receipt-claims/${verifyTarget.id}/verify`, selectedDonor ? { donor_id: selectedDonor.id } : {});
      setToast({ msg: 'Claim verified, donor linked, and FRO credited', type: 'success', vis: true });
      setVerifyTarget(null);
      load();
    } catch (err) { setToast({ msg: err.message || 'Verification failed', type: 'error', vis: true }); }
    finally { setActionBusy(false); }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    setActionBusy(true);
    try {
      await apiPut(`/accounts/receipt-claims/${rejectTarget.id}/reject`, { notes: rejectNotes.trim() || null });
      setToast({ msg: 'Claim rejected', type: 'success', vis: true });
      setRejectTarget(null);
      setRejectNotes('');
      load();
    } catch (err) { setToast({ msg: err.message || 'Rejection failed', type: 'error', vis: true }); }
    finally { setActionBusy(false); }
  };

  const statusPill = (status) => {
    if (status === 'pending') return <span className="pill pill-yellow">Pending</span>;
    if (status === 'verified') return <span className="pill pill-green">Verified</span>;
    return <span className="pill pill-red">Rejected</span>;
  };

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={'\u23F3'} label="Pending" value={stats.pending.length} sub={`${currency(stats.pendingAmount)} awaiting review`} color="#e67e22" />
        <StatCard icon={'\u2714\uFE0F'} label="Verified" value={items.filter(i => i.status === 'verified').length} color="#16a34a" />
        <StatCard icon={'\u{1F4B0}'} label="Total Amount" value={currency(stats.totalAmount)} sub={`Across ${items.length} claims`} color="#5B6B4E" />
      </div>

      <div className="card">
        <div className="filter-bar">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="pending">Pending ({items.filter(i => i.status === 'pending').length})</option>
            <option value="verified">Verified ({items.filter(i => i.status === 'verified').length})</option>
            <option value="rejected">Rejected ({items.filter(i => i.status === 'rejected').length})</option>
            <option value="">All ({items.length})</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Donor Name</th>
                <th>Amount</th>
                <th>Receipt Date</th>
                <th>Claimant</th>
                <th>Claimed At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No claims found</td></tr>
              ) : (
                items.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontSize: 12 }}>#{item.receipt?.receipt_no || item.receipt_id}</td>
                    <td><strong>{item.receipt?.donor_name || '\u2014'}</strong></td>
                    <td><strong style={{ color: 'var(--sage)' }}>{currency(item.receipt?.amount)}</strong></td>
                    <td style={{ fontSize: 12 }}>{fmtDay(item.receipt?.receipt_date)}</td>
                    <td style={{ fontSize: 12 }}>{item.claimant?.name || '\u2014'}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(item.claimed_at)}</td>
                    <td>{statusPill(item.status)}</td>
                    <td>
                      {item.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => openVerify(item)}>Verify</button>
                          <button className="btn btn-sm" onClick={() => { setRejectTarget(item); setRejectNotes(''); }}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {verifyTarget && (
        <div className="modal-overlay" onClick={() => { if (!actionBusy) setVerifyTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
            <div className="modal-head">
              <h3>Verify Claim</h3>
              <button className="btn btn-sm" onClick={() => setVerifyTarget(null)} disabled={actionBusy}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{verifyTarget.receipt?.donor_name || 'Unknown donor'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                      Receipt #{verifyTarget.receipt?.receipt_no || verifyTarget.receipt_id} · {fmtDay(verifyTarget.receipt?.receipt_date)}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sage)', whiteSpace: 'nowrap' }}>{currency(verifyTarget.receipt?.amount)}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
                  Claimed by <strong>{verifyTarget.claimant?.name || '\u2014'}</strong> on {fmtDate(verifyTarget.claimed_at)}
                  {verifyTarget.receipt?.project_id ? ` · NGO: ${verifyTarget.receipt.project_id.toUpperCase()}` : ''}
                </div>
                {verifyTarget.notes && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <em>"{verifyTarget.notes}"</em>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Link to donor (optional)</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchDonors(); }}
                  placeholder="Search donor by name or mobile..."
                  style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}
                />
                <button className="btn btn-sm" onClick={searchDonors} disabled={searching || !searchQ.trim()}>
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {searchResults.map(d => (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDonor(d)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                        background: selectedDonor?.id === d.id ? 'rgba(90,107,78,.1)' : '#fff',
                        borderBottom: '1px solid var(--line)',
                      }}>
                      <span style={{ fontWeight: 700 }}>{d.name}</span>
                      {d.mobile_number ? <span style={{ color: 'var(--ink-soft)' }}> · {d.mobile_number}</span> : null}
                      <span style={{ color: 'var(--ink-soft)', float: 'right' }}>{currency(d.total_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>
                {selectedDonor
                  ? `Will link to: ${selectedDonor.name}`
                  : 'No donor picked — will auto-match by mobile, else create a donor profile from the receipt.'}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setVerifyTarget(null)} disabled={actionBusy}>Cancel</button>
                <button className="btn btn-primary" onClick={doVerify} disabled={actionBusy}>
                  {actionBusy ? 'Verifying...' : 'Verify & Credit FRO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="modal-overlay" onClick={() => { if (!actionBusy) setRejectTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
            <div className="modal-head">
              <h3>Reject Claim</h3>
              <button className="btn btn-sm" onClick={() => setRejectTarget(null)} disabled={actionBusy}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
                Reject claim for <strong>{currency(rejectTarget.receipt?.amount)}</strong> ({rejectTarget.receipt?.donor_name || 'unknown donor'}) by {rejectTarget.claimant?.name || 'FRO'}.
              </div>
              <label className="field" style={{ marginBottom: 12 }}>
                Reason (optional)
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Receipt already credited, wrong NGO..."
                  style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>
              <div className="modal-actions">
                <button className="btn" onClick={() => setRejectTarget(null)} disabled={actionBusy}>Cancel</button>
                <button className="btn" style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff' }} onClick={doReject} disabled={actionBusy}>
                  {actionBusy ? 'Rejecting...' : 'Reject Claim'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.msg} type={toast.type} visible={toast.vis} onClose={() => setToast(p => ({ ...p, vis: false }))} />
    </div>
  );
}
