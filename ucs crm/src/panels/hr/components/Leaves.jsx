import { useEffect, useState } from 'react';
import { useHR } from '../store';
import { Pill } from './ui';
import { Check, X } from '../icons';
import { toast } from '../../../components/Toast';

export default function Leaves() {
  const { fetchLeaves, decideLeave } = useHR();
  const [leaves, setLeaves] = useState([]);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [remark, setRemark] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchLeaves().then(data => { if (!cancelled) setLeaves(data); }).catch((err) => { console.error('API error:', err.message); });
    return () => { cancelled = true; };
  }, []);

  const handleDecide = async (id, status) => {
    try {
      await decideLeave(id, status);
      const msg = status === 'Approved' ? 'approved' : status === 'Cancelled' ? 'cancelled' : 'rejected';
      toast(`Leave request ${msg}`, 'success');
      fetchLeaves().then(setLeaves).catch((err) => { console.error('API error:', err.message); });
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error');
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short' 
    });
  };

  const openLeaveDetail = (leave) => {
    console.log("Opening leave detail:", leave);
    setSelectedLeave(leave);
    setRemark('');
  };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Leave requests</h3>
          <span className="sub">
            {leaves.filter(l => l.status === 'pending').length} pending
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()} style={{ marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg>
            Reload
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Worker</th>
              <th>Type</th>
              <th>Days</th>
              <th>Starts</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l.id} onClick={() => openLeaveDetail(l)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>
                  {l.workers?.name || l.name || 'Unknown'}
                </td>
                <td>{l.type?.replace('_', ' ')}</td>
                <td>{l.days}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{fmtDate(l.leave_date || l.start_date)}</td>
                <td><Pill 
                  label={l.status === 'approved' ? 'Approved' : (l.status === 'rejected' && l.admin_remark === 'Cancelled') ? 'Cancelled' : l.status === 'rejected' ? 'Rejected' : 'Pending'} 
                  color={l.status === 'approved' ? 'green' : (l.status === 'rejected' && l.admin_remark === 'Cancelled') ? 'grey' : l.status === 'rejected' ? 'red' : 'yellow'} 
                /></td>
              </tr>
            ))}
            {!leaves.length && (
              <tr><td colSpan={5}><div className="empty">No leave requests.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==================== DETAIL MODAL ==================== */}
      {selectedLeave && (
        <div 
          onClick={() => setSelectedLeave(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, padding: '20px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              width: '100%',
              maxWidth: '420px',
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div style={{ 
              padding: '16px 20px 12px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <h2 style={{ 
                margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827',
                fontFamily: "'Inter', sans-serif"
              }}>
                Leave Review
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  background: selectedLeave.status === 'approved' ? '#DCFCE7' 
                    : (selectedLeave.status === 'rejected' && selectedLeave.admin_remark === 'Cancelled') ? '#F3F4F6'
                    : selectedLeave.status === 'rejected' ? '#FEE2E2' 
                    : '#FEF9C3',
                  color: selectedLeave.status === 'approved' ? '#16A34A' 
                    : (selectedLeave.status === 'rejected' && selectedLeave.admin_remark === 'Cancelled') ? '#6B7280'
                    : selectedLeave.status === 'rejected' ? '#EF4444' 
                    : '#CA8A04',
                  fontFamily: "'Inter', sans-serif"
                }}>
                  {selectedLeave.status === 'approved' ? 'Approved' 
                    : (selectedLeave.status === 'rejected' && selectedLeave.admin_remark === 'Cancelled') ? 'Cancelled'
                    : selectedLeave.status === 'rejected' ? 'Rejected' 
                    : 'Pending'}
                </span>
                <button 
                  onClick={() => setSelectedLeave(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '18px', color: '#6B7280', padding: '2px 6px',
                    lineHeight: 1, borderRadius: '6px'
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* ── Information Section ── */}
            <div style={{ padding: '0 20px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ 
                    fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Worker
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.workers?.name || selectedLeave.name || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Leave Type
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#111827', textTransform: 'capitalize',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.type?.replace('_', ' ') || 'Half Day'}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Total Days
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.days || 1}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Applied On
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {fmtDate(selectedLeave.created_at?.split('T')[0] || selectedLeave.leave_date || selectedLeave.start_date)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Time Details Card ── */}
            <div style={{ padding: '0 20px 10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{
                  background: '#F5F7FA', borderRadius: '10px', padding: '10px', textAlign: 'center'
                }}>
                  <div style={{ 
                    fontSize: '9px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Start Date
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#EF4444',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {fmtDate(selectedLeave.leave_date || selectedLeave.start_date)}
                  </div>
                </div>
                <div style={{
                  background: '#F5F7FA', borderRadius: '10px', padding: '10px', textAlign: 'center'
                }}>
                  <div style={{ 
                    fontSize: '9px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    End Date
                  </div>
                  <div style={{ 
                    fontSize: '14px', fontWeight: 700, color: '#16A34A',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {fmtDate(selectedLeave.end_date || selectedLeave.leave_date || selectedLeave.start_date)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Reason Section ── */}
            <div style={{ padding: '0 20px 8px' }}>
              <div style={{ 
                fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Reason
              </div>
              <div style={{
                background: '#F5F7FA', borderRadius: '8px', padding: '8px 12px',
                border: '1px solid #E5E7EB', fontSize: '12px', lineHeight: 1.4,
                color: selectedLeave.reason ? '#111827' : '#9CA3AF',
                fontFamily: "'Inter', sans-serif"
              }}>
                {selectedLeave.reason || 'No reason provided.'}
              </div>
            </div>

            {/* ── Remark Section ── */}
            <div style={{ padding: '0 20px 12px' }}>
              <div style={{ 
                fontSize: '10px', fontWeight: 600, color: '#6B7280', 
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Remark
              </div>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add a remark..."
                rows={2}
                style={{
                  width: '100%', background: '#FFFFFF', borderRadius: '8px', 
                  padding: '8px 12px', border: '1px solid #E5E7EB',
                  fontSize: '12px', lineHeight: 1.4, color: '#111827',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'Inter', sans-serif",
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; }}
              />
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                {selectedLeave.status === 'pending' && (
                  <>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                    await handleDecide(selectedLeave.id, 'Rejected');
                    setSelectedLeave(null);
                      }}
                      style={{
                        padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: '#EF4444', color: '#FFFFFF', border: 'none',
                        cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                      }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleDecide(selectedLeave.id, 'Approved');
                        setSelectedLeave(null);
                      }}
                      style={{
                        padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: '#16A34A', color: '#FFFFFF', border: 'none',
                        cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                      }}
                    >
                      Approve
                    </button>
                  </>
                )}
                {selectedLeave.status === 'approved' && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleDecide(selectedLeave.id, 'Cancelled');
                      setSelectedLeave(null);
                    }}
                    style={{
                      padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                      background: '#F97316', color: '#FFFFFF', border: 'none',
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                    }}
                  >
                    Cancel Approval
                  </button>
                )}
                {selectedLeave.status === 'rejected' && selectedLeave.admin_remark !== 'Cancelled' && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleDecide(selectedLeave.id, 'Approved');
                      setSelectedLeave(null);
                    }}
                    style={{
                      padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                      background: '#16A34A', color: '#FFFFFF', border: 'none',
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                    }}
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}