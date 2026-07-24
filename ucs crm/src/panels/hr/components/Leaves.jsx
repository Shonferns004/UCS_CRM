import { useEffect, useState } from 'react';
import { useHR } from '../store';
import { Pill } from './ui';
import { Check, X } from '../icons';

export default function Leaves() {
  const { fetchLeaves, decideLeave } = useHR();
  const [leaves, setLeaves] = useState([]);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [remark, setRemark] = useState('');

  useEffect(() => {
    fetchLeaves().then(setLeaves).catch(console.error);
  }, []);

  const handleDecide = async (id, status) => {
    try {
      await decideLeave(id, status);
      const updated = await fetchLeaves();
      setLeaves(updated);
      setSelectedLeave(null);
    } catch (e) {
      alert(e.message || 'Something went wrong');
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
        </div>

        <table>
          <thead>
            <tr>
              <th>Worker</th>
              <th>Type</th>
              <th>Days</th>
              <th>Starts</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>
                  <a 
                    href="#" 
                    className="worker-link" 
                    onClick={(e) => { e.preventDefault(); openLeaveDetail(l); }}
                    style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary)' }}
                  >
                    {l.workers?.name || l.name || 'Unknown'}
                  </a>
                </td>
                <td>{l.type?.replace('_', ' ')}</td>
                <td>{l.days}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{fmtDate(l.leave_date || l.start_date)}</td>
                <td><Pill 
                  label={l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Rejected' : 'Pending'} 
                  color={l.status === 'approved' ? 'green' : l.status === 'rejected' ? 'red' : 'yellow'} 
                /></td>
                <td style={{ textAlign: 'right' }}>
                  {l.status === 'pending' && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => handleDecide(l.id, 'Approved')}>
                        <Check width={14} /> Approve
                      </button>
                      <button className="btn btn-sm" onClick={() => handleDecide(l.id, 'Rejected')}>
                        <X width={14} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!leaves.length && (
              <tr><td colSpan={6}><div className="empty">No leave requests.</div></td></tr>
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
              maxWidth: '680px',
              borderRadius: '20px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.06)',
              overflow: 'hidden'
            }}
          >
            {/* ── Header ── */}
            <div style={{ 
              padding: '28px 32px 24px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <h2 style={{ 
                margin: 0, fontSize: '24px', fontWeight: 700, color: '#111827',
                fontFamily: "'Inter', sans-serif"
              }}>
                Leave Review
              </h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                background: selectedLeave.status === 'approved' ? '#DCFCE7' 
                  : selectedLeave.status === 'rejected' ? '#FEE2E2' 
                  : '#FEF9C3',
                color: selectedLeave.status === 'approved' ? '#16A34A' 
                  : selectedLeave.status === 'rejected' ? '#EF4444' 
                  : '#CA8A04',
                fontFamily: "'Inter', sans-serif"
              }}>
                {selectedLeave.status === 'approved' ? 'Approved' 
                  : selectedLeave.status === 'rejected' ? 'Rejected' 
                  : 'Pending'}
              </span>
            </div>

            {/* ── Information Section ── */}
            <div style={{ padding: '0 32px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <div style={{ 
                    fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Worker
                  </div>
                  <div style={{ 
                    fontSize: '20px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.workers?.name || selectedLeave.name || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Leave Type
                  </div>
                  <div style={{ 
                    fontSize: '20px', fontWeight: 700, color: '#111827', textTransform: 'capitalize',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.type?.replace('_', ' ') || 'Half Day'}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Total Days
                  </div>
                  <div style={{ 
                    fontSize: '20px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {selectedLeave.days || 1}
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Applied On
                  </div>
                  <div style={{ 
                    fontSize: '20px', fontWeight: 700, color: '#111827',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    {fmtDate(selectedLeave.created_at?.split('T')[0] || selectedLeave.leave_date || selectedLeave.start_date)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Time Details Card ── */}
            <div style={{ padding: '0 32px 24px' }}>
              <div style={{
                background: '#F5F7FA', borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ 
                  fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px',
                  fontFamily: "'Inter', sans-serif"
                }}>
                  Time Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{
                    background: '#FFFFFF', borderRadius: '12px', 
                    border: '1px solid #E5E7EB', padding: '20px', textAlign: 'center'
                  }}>
                    <div style={{ 
                      fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      Start Date
                    </div>
                    <div style={{ 
                      fontSize: '20px', fontWeight: 700, color: '#EF4444',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      {fmtDate(selectedLeave.leave_date || selectedLeave.start_date)}
                    </div>
                  </div>
                  <div style={{
                    background: '#FFFFFF', borderRadius: '12px', 
                    border: '1px solid #E5E7EB', padding: '20px', textAlign: 'center'
                  }}>
                    <div style={{ 
                      fontSize: '11px', fontWeight: 600, color: '#6B7280', 
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      End Date
                    </div>
                    <div style={{ 
                      fontSize: '20px', fontWeight: 700, color: '#16A34A',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      {fmtDate(selectedLeave.end_date || selectedLeave.leave_date || selectedLeave.start_date)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Reason Section ── */}
            <div style={{ padding: '0 32px 20px' }}>
              <div style={{ 
                fontSize: '12px', fontWeight: 600, color: '#6B7280', 
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Reason
              </div>
              <div style={{
                background: '#F5F7FA', borderRadius: '12px', padding: '14px 18px',
                border: '1px solid #E5E7EB', fontSize: '15px', lineHeight: 1.6,
                color: selectedLeave.reason ? '#111827' : '#9CA3AF',
                fontFamily: "'Inter', sans-serif"
              }}>
                {selectedLeave.reason || 'No reason provided.'}
              </div>
            </div>

            {/* ── Remark Section ── */}
            <div style={{ padding: '0 32px 24px' }}>
              <div style={{ 
                fontSize: '12px', fontWeight: 600, color: '#6B7280', 
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Remark
              </div>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add a remark..."
                rows={3}
                style={{
                  width: '100%', background: '#FFFFFF', borderRadius: '12px', 
                  padding: '14px 18px', border: '1px solid #E5E7EB',
                  fontSize: '15px', lineHeight: 1.6, color: '#111827',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'Inter', sans-serif",
                  transition: 'border-color 200ms ease',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; }}
              />
            </div>

            {/* ── Footer ── */}
            <div style={{ 
              padding: '20px 32px', 
              borderTop: '1px solid #E5E7EB',
              display: 'flex', 
              gap: '10px', 
              justifyContent: 'flex-end'
            }}>
              {selectedLeave.status === 'pending' ? (
                <>
                  <button 
                    onClick={() => setSelectedLeave(null)}
                    style={{
                      padding: '10px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                      background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                      transition: 'all 200ms ease'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#F5F7FA'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleDecide(selectedLeave.id, 'Approved')}
                    style={{
                      padding: '10px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                      background: '#16A34A', color: '#FFFFFF', border: 'none',
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                      transition: 'all 200ms ease'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#15803D'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#16A34A'; }}
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleDecide(selectedLeave.id, 'Rejected')}
                    style={{
                      padding: '10px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                      background: '#EF4444', color: '#FFFFFF', border: 'none',
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                      transition: 'all 200ms ease'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#DC2626'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#EF4444'; }}
                  >
                    Reject
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setSelectedLeave(null)}
                  style={{
                    padding: '10px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                    background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                    cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                    transition: 'all 200ms ease'
                  }}
                  onMouseEnter={(e) => { e.target.style.background = '#F5F7FA'; }}
                  onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}