import { useState, useEffect } from 'react';
import { api } from '../api/auth';
import TechnicalTickets from '../../../components/TechnicalTickets';

// A Super Admin instruction can go to every panel at once ('all' broadcast) or
// to any combination of individual panels. 'all' is the broadcast marker that
// listMyTickets and the popup poll both understand; a selected set of panels is
// written as one support_tickets row per panel so each lands in its own queue
// (and pops up there).
const PANEL_TARGETS = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'fro', label: 'FRO' },
  { value: 'hr', label: 'HR' },
  { value: 'event_head', label: 'Event Head' },
  { value: 'ngo_admin', label: 'NGO Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'developers', label: 'Developers' },
];

const PANEL_LABELS = Object.fromEntries(PANEL_TARGETS.map(p => [p.value, p.label]));

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const EMPTY_FORM = {
  allPanels: true,
  targets: [],
  subject: '',
  description: '',
  priority: 'medium',
  desk_number: '',
  ngo: '',
};

const apiPost = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });

export default function SupportTickets() {
  const [showSend, setShowSend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState([]);
  const [ngos, setNgos] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // NGO dropdown options come from the same existing /ngos endpoint the rest of
  // the Super Admin panel uses — no hard-coded list.
  useEffect(() => {
    let alive = true;
    api('/ngos')
      .then(list => { if (alive) setNgos(Array.isArray(list) ? list : []); })
      .catch(() => { /* dropdown still works with just the none option */ });
    return () => { alive = false; };
  }, []);

  const openSend = () => {
    setForm({ ...EMPTY_FORM });
    setError('');
    setShowSend(true);
  };

  const toggleAllPanels = (checked) => setForm(p => ({
    ...p,
    allPanels: checked,
    targets: checked ? [] : p.targets,
  }));

  const togglePanel = (value) => setForm(p => ({
    ...p,
    targets: p.targets.includes(value)
      ? p.targets.filter(v => v !== value)
      : [...p.targets, value],
  }));

  const recipientSummary = form.allPanels
    ? 'Broadcasts to every panel.'
    : form.targets.length
      ? `Sends a copy to: ${form.targets.map(v => PANEL_LABELS[v] || v).join(', ')}`
      : 'Pick one or more panels.';

  const handleSend = async () => {
    if (!form.subject.trim()) { setError('Subject is required'); return; }
    const departments = form.allPanels ? ['all'] : form.targets;
    if (!departments.length) { setError('Select at least one panel (or All Panels)'); return; }
    setError('');
    setSubmitting(true);
    try {
      // One ticket per target panel (or a single 'all' broadcast), all carrying
      // the same instruction so each queue receives it independently.
      let lastId = null;
      for (const dep of departments) {
        const created = await apiPost('/tickets', {
          department: dep,
          category: 'super_admin',
          subject: form.subject.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          desk_number: form.desk_number.trim() || null,
          ngo: form.ngo.trim() || null,
          raised_by_panel: 'super_admin',
        });
        lastId = created?.id || lastId;
      }
      const name = form.allPanels
        ? 'All Panels'
        : form.targets.map(v => PANEL_LABELS[v] || v).join(', ');
      setSent(prev => [{
        id: lastId || `t${Date.now()}`,
        subject: form.subject.trim(),
        target: name,
        created_at: new Date().toISOString(),
      }, ...prev]);
      setShowSend(false);
      alert(`Ticket sent to ${name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Support Tickets</h3>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
            Send instructions to a panel or all panels, and work the company-wide To Super Admin inbox below.
          </div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={openSend}>+ Send Ticket</button>
      </div>

      {sent.length > 0 && (
        <div className="card" style={{ margin: '14px 0', padding: 0 }}>
          <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
            Recently sent by you
          </div>
          {sent.slice(0, 5).map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#eef2ff', color: '#4338ca' }}>{t.target}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{new Date(t.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <TechnicalTickets panel="super_admin" toSuperAdmin canResolve canRaise={false} />

      {showSend && (
        <div className="modal-overlay" onClick={() => setShowSend(false)}>
          <div className="modal send-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="send-ticket-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 id="send-ticket-title" style={{ margin: 0 }}>Send Ticket</h3>
                <p className="st-sub">Send an instruction to one, several, or all panels.</p>
              </div>
              <button type="button" className="st-close" aria-label="Close" onClick={() => setShowSend(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="modal-body">
              {error && <div className="st-error">{error}</div>}

              <div className="modal-form-grid">
                <div className="field modal-form-full st-field">
                  <span className="st-label">Send to <span className="st-req">*</span></span>
                  <div className="st-recipients">
                    <label className={`st-option st-option-all${form.allPanels ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={form.allPanels} onChange={e => toggleAllPanels(e.target.checked)} />
                      <span className="st-option-label">All Panels</span>
                      <span className="st-option-sub">Every panel</span>
                    </label>
                    <div className="st-grid">
                      {PANEL_TARGETS.map(p => {
                        const on = !form.allPanels && form.targets.includes(p.value);
                        return (
                          <label key={p.value} className={`st-option${on ? ' is-on' : ''}${form.allPanels ? ' is-disabled' : ''}`}>
                            <input type="checkbox" disabled={form.allPanels}
                              checked={form.targets.includes(p.value)}
                              onChange={() => togglePanel(p.value)} />
                            <span className="st-option-label">{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="st-hint">{recipientSummary}</div>
                </div>

                <label className="field st-field">
                  <span className="st-label">Priority</span>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>

                <label className="field st-field">
                  <span className="st-label">Desk Number <span className="st-opt">(optional)</span></span>
                  <input value={form.desk_number} onChange={e => setForm(p => ({ ...p, desk_number: e.target.value }))} placeholder="Related desk, if any" />
                </label>

                <label className="field modal-form-full st-field">
                  <span className="st-label">NGO <span className="st-opt">(optional)</span></span>
                  <select value={form.ngo} onChange={e => setForm(p => ({ ...p, ngo: e.target.value }))}>
                    <option value="">— None —</option>
                    {ngos.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                  </select>
                </label>

                <label className="field modal-form-full st-field">
                  <span className="st-label">Subject <span className="st-req">*</span></span>
                  <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief title of the instruction" />
                </label>

                <label className="field modal-form-full st-field">
                  <span className="st-label">Description</span>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Details of what you need done..." rows={4} />
                </label>
              </div>
            </div>

            <div className="modal-foot">
              <button type="button" className="btn st-cancel" onClick={() => setShowSend(false)}>Cancel</button>
              <button type="button" className="btn btn-primary st-send" onClick={handleSend} disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
