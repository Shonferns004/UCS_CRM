import { useState, useEffect } from 'react';
import { fetchLeadById, updateLead } from '../api/leads';
import { fetchLeadCallLogs, addCallLog } from '../api/callLogs';
import { DatePicker } from '../components/ui';
import { SkeletonProfile } from '../../../components/Skeleton';

const STATUS_STYLES = {
  hold: 'pill-yellow',
  scheduled: 'pill-blue',
  selected: 'pill-green',
  rejected: 'pill-red',
  joined: 'pill-purple',
};

const CALL_STATUSES = ['connected', 'not_reached', 'busy', 'switched_off', 'wrong_number'];
const CALL_TYPES = ['outgoing', 'incoming', 'missed'];

export default function LeadDetail({ leadId, onBack }) {
  const [lead, setLead] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Call log modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [logStatus, setLogStatus] = useState('connected');
  const [logType, setLogType] = useState('outgoing');
  const [logDuration, setLogDuration] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logFollowUp, setLogFollowUp] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  // Status update
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    Promise.all([
      fetchLeadById(leadId),
      fetchLeadCallLogs(leadId),
    ])
      .then(([l, logs]) => {
        setLead(l);
        setCallLogs(logs);
      })
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false));
  }, [leadId]);

  const handleStatusChange = async (newStatus) => {
    if (!lead || updating) return;
    setUpdating(true);
    try {
      const result = await updateLead(lead.id, { status: newStatus });
      setLead(result.lead);
    } catch (e) {
      alert(e.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddCallLog = async () => {
    setLogBusy(true);
    try {
      await addCallLog({
        lead_id: lead.id,
        status: logStatus,
        call_type: logType,
        duration_seconds: parseInt(logDuration) || 0,
        notes: logNotes || null,
        follow_up_date: logFollowUp || null,
      });
      const logs = await fetchLeadCallLogs(lead.id);
      setCallLogs(logs);
      setShowLogModal(false);
      setLogStatus('connected');
      setLogType('outgoing');
      setLogDuration('');
      setLogNotes('');
      setLogFollowUp('');
    } catch (e) {
      alert(e.message);
    } finally {
      setLogBusy(false);
    }
  };

  if (loading) return <SkeletonProfile />;
  if (!lead) return <div className="empty-state"><h3>Lead not found</h3></div>;

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h2>{lead.name}</h2>
        <span className={`pill ${STATUS_STYLES[lead.status] || 'pill-gray'}`} style={{ marginLeft:8 }}>
          {lead.status || 'hold'}
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Lead info */}
        <div className="card">
          <div className="card-head"><h3>Lead Info</h3></div>
          <div className="card-pad">
            <table style={{ fontSize:13 }}>
              <tbody>
                <tr><td style={{ color:'var(--ink-soft)', width:100, border:'none' }}>Name</td><td style={{ fontWeight:500, border:'none' }}>{lead.name}</td></tr>
                <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>Phone</td><td style={{ border:'none' }}>{lead.phone || '\u2014'}</td></tr>
                <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>Email</td><td style={{ border:'none' }}>{lead.email || '\u2014'}</td></tr>
                <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>Age</td><td style={{ border:'none' }}>{lead.age ?? '\u2014'}</td></tr>
                <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>Source</td><td style={{ border:'none' }}>{lead.source || 'Walk-in'}</td></tr>
                <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>Created</td><td style={{ border:'none' }}>{new Date(lead.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</td></tr>
                {lead.dob && <tr><td style={{ color:'var(--ink-soft)', border:'none' }}>DOB</td><td style={{ border:'none' }}>{lead.dob}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="card">
          <div className="card-head"><h3>Actions</h3></div>
          <div className="card-pad">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowLogModal(true)}>
                Log a Call
              </button>
              <div>
                <label className="field" style={{ fontSize:12 }}>Update Status
                  <select value={lead.status || 'hold'}
                    onChange={e => handleStatusChange(e.target.value)}
                    disabled={updating}
                    style={{ padding:'7px 10px', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', fontSize:13, fontFamily:'inherit' }}>
                    <option value="hold">Hold</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="selected">Selected</option>
                    <option value="rejected">Rejected</option>
                    <option value="joined">Joined</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-head"><h3>Notes</h3></div>
          <div className="card-pad" style={{ fontSize:13, color:'var(--ink-soft)', whiteSpace:'pre-wrap' }}>
            {lead.notes}
          </div>
        </div>
      )}

      {/* Call Logs Timeline */}
      <div className="card">
        <div className="card-head"><h3>Call History ({callLogs.length})</h3></div>
        <div className="card-pad">
          {callLogs.length === 0 ? (
            <div className="empty-state" style={{ padding:20 }}>
              <p>No calls logged yet.</p>
            </div>
          ) : (
            <div className="timeline">
              {callLogs.map(log => (
                <div key={log.id} className="timeline-item">
                  <div className="time">
                    {new Date(log.call_time).toLocaleString('en-GB', {
                      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit',
                    })}
                    {log.duration_seconds > 0 && ` · ${log.duration_seconds}s`}
                  </div>
                  <div className="label">
                    <span className={`pill ${log.status === 'connected' ? 'pill-green' : 'pill-red'}`} style={{ fontSize:10, marginRight:6 }}>
                      {log.status}
                    </span>
                    <span className="pill pill-gray" style={{ fontSize:10 }}>{log.call_type}</span>
                  </div>
                  {log.notes && <div className="desc">{log.notes}</div>}
                  {log.follow_up_date && (
                    <div className="desc" style={{ color:'#92400e' }}>
                      Follow-up: {new Date(log.follow_up_date + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Call Log Modal */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Log a Call</h3>
              <button className="btn btn-sm" onClick={() => setShowLogModal(false)} style={{ background:'none', border:'1px solid var(--line)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <label className="field">Status
                  <select value={logStatus} onChange={e => setLogStatus(e.target.value)}>
                    {CALL_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="field">Type
                  <select value={logType} onChange={e => setLogType(e.target.value)}>
                    {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row" style={{ marginTop:10 }}>
                <label className="field">Duration (seconds)
                  <input type="number" min="0" value={logDuration} onChange={e => setLogDuration(e.target.value)} placeholder="e.g. 120" />
                </label>
                <label className="field">Follow-up Date
                  <DatePicker value={logFollowUp} onChange={e => setLogFollowUp(e.target.value)} />
                </label>
              </div>
              <label className="field" style={{ marginTop:10 }}>Notes
                <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)}
                  placeholder="Call outcome, customer response…"
                  style={{ padding:'8px 10px', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', fontSize:13, fontFamily:'inherit', minHeight:70, resize:'vertical', outline:'none' }} />
              </label>
              <div className="modal-actions">
                <button className="btn btn-sm" onClick={() => setShowLogModal(false)}
                  style={{ background:'transparent', border:'1px solid var(--line)' }}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddCallLog} disabled={logBusy}>
                  {logBusy ? 'Saving…' : 'Save Call Log'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
