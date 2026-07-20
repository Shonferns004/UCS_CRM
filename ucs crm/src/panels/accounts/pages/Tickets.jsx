import { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost } from '../api/auth';

const DEPARTMENTS = ['accounts', 'developers', 'hr'];
const CATEGORIES = [
  { value: 'suspense', label: 'Suspense' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS = {
  open: { bg: '#fefce8', color: '#a16207' },
  in_progress: { bg: '#eff6ff', color: '#1d4ed8' },
  resolved: { bg: '#f0fdf4', color: '#16a34a' },
  closed: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function AccountsTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showDetail, setShowDetail] = useState(null);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [resolution, setResolution] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (deptFilter) params.set('department', deptFilter);
      const qs = params.toString();
      const data = await apiGet(`/tickets${qs ? '?' + qs : ''}`);
      setTickets(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, deptFilter]);

  const openDetail = async (ticket) => {
    try {
      const data = await apiGet(`/tickets/${ticket.id}`);
      setShowDetail(data);
      setReplies(data.replies || []);
      setReplyText('');
      setResolution(data.resolution || '');
    } catch (err) { alert(err.message); }
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!showDetail) return;
    try {
      await apiPut(`/tickets/${showDetail.id}`, {
        status: newStatus,
        resolution: newStatus === 'resolved' || newStatus === 'closed' ? resolution : undefined,
      });
      const data = await apiGet(`/tickets/${showDetail.id}`);
      setShowDetail(data);
      setReplies(data.replies || []);
      setResolution(data.resolution || '');
      load();
    } catch (err) { alert(err.message); }
  };

  const handleReply = async () => {
    if (!replyText || !showDetail) return;
    setSendingReply(true);
    try {
      await apiPost(`/tickets/${showDetail.id}/reply`, { message: replyText });
      setReplyText('');
      const data = await apiGet(`/tickets/${showDetail.id}`);
      setReplies(data.replies || []);
    } catch (err) { alert(err.message); }
    finally { setSendingReply(false); }
  };

  const totalCount = tickets.length;
  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: totalCount, color: '#6b7280' },
          { label: 'Open', value: openCount, color: '#a16207' },
          { label: 'In Progress', value: inProgressCount, color: '#1d4ed8' },
          { label: 'Resolved', value: resolvedCount, color: '#16a34a' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="filter-bar">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d} style={{ textTransform: 'capitalize' }}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Raised By</th>
                <th>Department</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No tickets found</td></tr>
              ) : (
                tickets.map(t => (
                  <tr key={t.id}>
                    <td><strong style={{ fontSize: 13 }}>{t.subject}</strong></td>
                    <td style={{ fontSize: 12 }}>{t.workers?.name || 'Unknown'}</td>
                    <td><span className="pill" style={{ textTransform: 'capitalize', fontSize: 11 }}>{t.department}</span></td>
                    <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{CATEGORIES.find(c => c.value === t.category)?.label || t.category}</td>
                    <td>
                      <span className={`pill ${t.priority === 'high' ? 'pill-red' : t.priority === 'medium' ? 'pill-yellow' : 'pill-gray'}`} style={{ textTransform: 'capitalize', fontSize: 11 }}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      <span className="pill" style={{ background: STATUS_COLORS[t.status]?.bg || '#f3f4f6', color: STATUS_COLORS[t.status]?.color || '#6b7280', textTransform: 'capitalize', fontSize: 11 }}>
                        {t.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 11 }}>{new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openDetail(t)} style={{ fontSize: 11, padding: '2px 8px' }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head" style={{ flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{showDetail.subject}</h3>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <span className="pill" style={{ background: STATUS_COLORS[showDetail.status]?.bg || '#f3f4f6', color: STATUS_COLORS[showDetail.status]?.color || '#6b7280', textTransform: 'capitalize', fontSize: 10 }}>
                    {showDetail.status?.replace('_', ' ')}
                  </span>
                  <span className="pill" style={{ textTransform: 'capitalize', fontSize: 10 }}>{showDetail.department}</span>
                  <span className="pill" style={{ fontSize: 10 }}>{CATEGORIES.find(c => c.value === showDetail.category)?.label || showDetail.category}</span>
                  <span className={`pill ${showDetail.priority === 'high' ? 'pill-red' : showDetail.priority === 'medium' ? 'pill-yellow' : 'pill-gray'}`} style={{ textTransform: 'capitalize', fontSize: 10 }}>
                    {showDetail.priority}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Raised by <strong>{showDetail.workers?.name || 'Unknown'}</strong> &middot; {new Date(showDetail.created_at).toLocaleString('en-IN')}
                </div>
              </div>
              <button className="btn btn-sm btn-icon" onClick={() => setShowDetail(null)} style={{ padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              {showDetail.description && (
                <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {showDetail.description}
                </div>
              )}
              {showDetail.reference_id && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14 }}>
                  Reference: <strong>{showDetail.reference_id}</strong>
                </div>
              )}

              {(showDetail.status === 'open' || showDetail.status === 'in_progress') && (
                <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Update Status & Resolution</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <textarea
                      value={resolution}
                      onChange={e => setResolution(e.target.value)}
                      placeholder="Add resolution notes..."
                      rows={2}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {showDetail.status === 'open' && (
                      <button className="btn btn-sm" onClick={() => handleStatusUpdate('in_progress')}
                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        Mark In Progress
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => handleStatusUpdate('resolved')}
                      style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                      Resolve
                    </button>
                    <button className="btn btn-sm" onClick={() => handleStatusUpdate('closed')}
                      style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                      Close
                    </button>
                  </div>
                </div>
              )}

              {showDetail.resolution && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13 }}>
                  <strong style={{ color: '#16a34a', fontSize: 12 }}>Resolution:</strong>
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{showDetail.resolution}</div>
                  {showDetail.users && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-soft)' }}>
                      Resolved by {showDetail.users.name || showDetail.users.login_id || 'Unknown'}
                    </div>
                  )}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Conversation</div>
                {replies.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: 20 }}>No replies yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {replies.map(r => (
                      <div key={r.id} style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>
                          {r.sender_type === 'user' ? 'Accounts' : 'FRO'} &middot; {new Date(r.created_at).toLocaleString('en-IN')}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(showDetail.status === 'open' || showDetail.status === 'in_progress') && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Add Reply</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      rows={2}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <button className="btn btn-sm btn-primary" onClick={handleReply} disabled={sendingReply || !replyText} style={{ alignSelf: 'flex-end' }}>
                      {sendingReply ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
