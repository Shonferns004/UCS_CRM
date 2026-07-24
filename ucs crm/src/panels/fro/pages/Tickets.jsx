import { useState, useEffect, useRef } from 'react';
import { api } from '../../../api/auth';

const DEPARTMENTS = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'developers', label: 'Developers' },
  { value: 'hr', label: 'HR' },
];

const CATEGORIES = [
  { value: 'suspense', label: 'Suspense' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const STATUS_COLORS = {
  open: { bg: '#fefce8', color: '#a16207' },
  in_progress: { bg: '#eff6ff', color: '#1d4ed8' },
  resolved: { bg: '#f0fdf4', color: '#16a34a' },
  closed: { bg: '#f3f4f6', color: '#6b7280' },
};

const apiGet = (p) => api(p, { _prefix: 'ucs' });
const apiPost = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b), _prefix: 'ucs' });

export default function FroTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRaise, setShowRaise] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [form, setForm] = useState({
    department: 'accounts',
    category: 'suspense',
    subject: '',
    description: '',
    reference_id: '',
    priority: 'medium',
  });
  const [submitting, setSubmitting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/tickets/my');
      setTickets(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const data = await apiGet('/tickets/my');
        if (!cancelled) setTickets(data || []);
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const handleRaise = async () => {
    if (!form.subject) { alert('Subject is required'); return; }
    setSubmitting(true);
    try {
      await apiPost('/tickets', form);
      setShowRaise(false);
      setForm({ department: 'accounts', category: 'suspense', subject: '', description: '', reference_id: '', priority: 'medium' });
      load();
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const openDetail = async (ticket) => {
    try {
      const data = await apiGet(`/tickets/${ticket.id}`);
      setShowDetail(data);
      setReplies(data.replies || []);
      setReplyText('');
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

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>My Tickets</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowRaise(true)}>
          + Raise Ticket
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
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
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No tickets raised yet</td></tr>
              ) : (
                tickets.map(t => (
                  <tr key={t.id}>
                    <td><strong style={{ fontSize: 13 }}>{t.subject}</strong></td>
                    <td><span className="pill" style={{ textTransform: 'capitalize' }}>{t.department}</span></td>
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

      {showRaise && (
        <div className="modal-overlay" onClick={() => setShowRaise(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h3>Raise a Ticket</h3>
              <button className="btn btn-sm btn-icon" onClick={() => setShowRaise(false)} style={{ padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Department *
                  <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                    {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Category *
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Priority
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Reference ID (optional)
                  <input value={form.reference_id} onChange={e => setForm(p => ({ ...p, reference_id: e.target.value }))} placeholder="Payment/suspense ID" />
                </label>
              </div>
              <label className="field" style={{ marginBottom: 12 }}>
                Subject *
                <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief title of the issue" />
              </label>
              <label className="field" style={{ marginBottom: 12 }}>
                Description
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the issue in detail..." rows={4} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowRaise(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRaise} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head" style={{ flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{showDetail.subject}</h3>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span className="pill" style={{ background: STATUS_COLORS[showDetail.status]?.bg || '#f3f4f6', color: STATUS_COLORS[showDetail.status]?.color || '#6b7280', textTransform: 'capitalize', fontSize: 10 }}>
                    {showDetail.status?.replace('_', ' ')}
                  </span>
                  <span className="pill" style={{ textTransform: 'capitalize', fontSize: 10 }}>{showDetail.department}</span>
                  <span className="pill" style={{ textTransform: 'capitalize', fontSize: 10 }}>{CATEGORIES.find(c => c.value === showDetail.category)?.label || showDetail.category}</span>
                  <span className={`pill ${showDetail.priority === 'high' ? 'pill-red' : showDetail.priority === 'medium' ? 'pill-yellow' : 'pill-gray'}`} style={{ textTransform: 'capitalize', fontSize: 10 }}>
                    {showDetail.priority}
                  </span>
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
              {showDetail.resolution && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13 }}>
                  <strong style={{ color: '#16a34a', fontSize: 12 }}>Resolution:</strong>
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{showDetail.resolution}</div>
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
                          {r.sender_type === 'user' ? 'Accounts' : 'You'} &middot; {new Date(r.created_at).toLocaleString('en-IN')}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(showDetail.status === 'open' || showDetail.status === 'in_progress') && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
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
