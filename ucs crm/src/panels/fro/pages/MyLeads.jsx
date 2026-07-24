import { useState, useEffect } from 'react';
import { fetchMyLeads, updateLead } from '../api/leads';
import { fetchLeadCallLogs, addCallLog } from '../api/callLogs';
import { DatePicker } from '../components/ui';
import { SkeletonProfile } from '../../../components/Skeleton';

const STATUS_STYLES = {
  hold: 'pill-yellow', scheduled: 'pill-blue', selected: 'pill-green',
  rejected: 'pill-red', joined: 'pill-purple',
};
const CALL_STATUSES = ['connected', 'not_reached', 'busy', 'switched_off', 'wrong_number'];
const CALL_TYPES = ['outgoing', 'incoming', 'missed'];

const initials = (name) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export default function MyLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [index, setIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logStatus, setLogStatus] = useState('connected');
  const [logType, setLogType] = useState('outgoing');
  const [logDuration, setLogDuration] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logFollowUp, setLogFollowUp] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchMyLeads().then(setLeads).catch((err) => { console.error('API error:', err.message); }).finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter(l => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  useEffect(() => { setIndex(0); }, [filtered.length]);

  const lead = filtered[index];

  useEffect(() => {
    if (!lead) return;
    fetchLeadCallLogs(lead.id).then(setCallLogs).catch((err) => { console.error('API error:', err.message); setCallLogs([]); });
  }, [lead?.id]);

  const handleStatusChange = async (newStatus) => {
    if (!lead || updating) return;
    setUpdating(true);
    try {
      const res = await updateLead(lead.id, { status: newStatus });
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: res.lead?.status || newStatus } : l));
    } catch (e) { alert(e.message); } finally { setUpdating(false); }
  };

  const handleAddCallLog = async () => {
    if (!lead) return;
    setLogBusy(true);
    try {
      await addCallLog({
        lead_id: lead.id, status: logStatus, call_type: logType,
        duration_seconds: parseInt(logDuration) || 0, notes: logNotes || null,
        follow_up_date: logFollowUp || null,
      });
      setCallLogs(await fetchLeadCallLogs(lead.id));
      setShowLogModal(false);
      setLogStatus('connected'); setLogType('outgoing'); setLogDuration(''); setLogNotes(''); setLogFollowUp('');
    } catch (e) { alert(e.message); } finally { setLogBusy(false); }
  };

  if (loading) return <SkeletonProfile />;

  const leadContent = () => {
    if (!lead) return null;
    return (
      <div className="bento-grid" style={{flex:1}}>
        {/* Filter row */}
        <div className="bento-col-12">
          <div className="bento-card">
            <div className="bento-card-h">
              <h3>My Leads <span style={{fontWeight:400, color:'var(--md-outline)', fontSize:10}}>({filtered.length})</span></h3>
              <div style={{display:'flex', gap:6, alignItems:'center'}}>
                <input placeholder="Search name, phone…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ border:'1px solid var(--md-outline-variant)', borderRadius:8, padding:'4px 8px', fontSize:10, fontFamily:'inherit', outline:'none', width:140 }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  style={{ border:'1px solid var(--md-outline-variant)', borderRadius:8, padding:'4px 8px', fontSize:10, fontFamily:'inherit', outline:'none' }}>
                  <option value="">All</option>
                  <option value="hold">Hold</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="selected">Selected</option>
                  <option value="rejected">Rejected</option>
                  <option value="joined">Joined</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Lead info */}
        <div className="bento-col-5">
          <div className="bento-card" style={{ alignItems:'center', textAlign:'center' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--md-primary-container)', color:'var(--md-on-primary-container)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, marginBottom:8 }}>
              {initials(lead.name)}
            </div>
            <div style={{ fontSize:16, fontWeight:600, lineHeight:1.2 }}>{lead.name}</div>
            <div style={{ fontSize:13, color:'var(--md-primary)', fontWeight:500, marginBottom:6 }}>{lead.phone || '—'}</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px', width:'100%', textAlign:'left', marginTop:6 }}>
              {[
                ['Email', lead.email], ['Source', lead.source || 'Walk-in'],
                ['Age', lead.age ?? '—'], ['Status', lead.status || 'hold'],
                ['Created', new Date(lead.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })],
                lead.dob && ['DOB', lead.dob],
              ].filter(Boolean).map(([l, v]) => (
                <div key={l}><div className="fro-label">{l}</div><div style={{fontSize:11,fontWeight:500}}>{v || '—'}</div></div>
              ))}
            </div>

            {lead.notes && (
              <div style={{ width:'100%', marginTop:8, fontSize:10, color:'var(--md-outline)', background:'var(--md-surface-low)', padding:'8px 10px', borderRadius:8, textAlign:'left' }}>
                <div style={{fontSize:9,fontWeight:600,marginBottom:2}}>Notes</div>
                {lead.notes}
              </div>
            )}
          </div>
        </div>

        {/* Actions + Call History */}
        <div className="bento-col-7">
          <div className="bento-card">
            <div className="bento-card-h"><h3>Actions</h3></div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
              <button onClick={() => setShowLogModal(true)}
                style={{ padding:'5px 12px', border:'none', borderRadius:8, background:'var(--md-primary)', color:'#fff', fontSize:10, fontWeight:600, fontFamily:'inherit', cursor:'pointer' }}>
                Log a Call
              </button>
              <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--md-outline)' }}>
                Update:
                <select value={lead.status || 'hold'} onChange={e => handleStatusChange(e.target.value)} disabled={updating}
                  style={{ border:'1px solid var(--md-outline-variant)', borderRadius:8, padding:'3px 6px', fontSize:10, fontFamily:'inherit', outline:'none', width:'auto' }}>
                  <option value="hold">Hold</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="selected">Selected</option>
                  <option value="rejected">Rejected</option>
                  <option value="joined">Joined</option>
                </select>
              </label>
            </div>
          </div>

          <div className="bento-card" style={{ marginTop:8 }}>
            <div className="bento-card-h"><h3>Call History ({callLogs.length})</h3></div>
            {callLogs.length === 0 ? (
              <div style={{ fontSize:10, color:'var(--md-outline)', padding:'6px 0' }}>No calls logged yet.</div>
            ) : (
              <div className="bento-tl">
                {callLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="bento-tl-item">
                    <div className={`bento-pill ${log.status === 'connected' ? 'bento-pill-green' : 'bento-pill-red'}`} style={{fontSize:8, padding:'1px 5px'}}>{log.status}</div>
                    <div className="t">{new Date(log.call_time).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                    <div className="i">
                      <span style={{color:'var(--md-outline)', fontSize:9}}>{log.call_type}{log.duration_seconds > 0 ? ` · ${log.duration_seconds}s` : ''}</span>
                      {log.notes && <div className="s">{log.notes}</div>}
                    </div>
                  </div>
                ))}
                {callLogs.length > 5 && <div style={{ fontSize:9, color:'var(--md-outline)', textAlign:'center', padding:2 }}>+{callLogs.length - 5} more</div>}
              </div>
            )}
          </div>

          <div className="bento-nav" style={{ marginTop:4 }}>
            <button disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← Prev</button>
            <span className="cnt">{index + 1} of {filtered.length}</span>
            <button disabled={index === filtered.length - 1} onClick={() => setIndex(i => i + 1)}>Next →</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bento-grid" style={{flex:1}}>
      {filtered.length === 0 ? (
        <div className="bento-col-12">
          <div className="bento-card" style={{ alignItems:'center', padding:40 }}>
            <div style={{ fontSize:32, marginBottom:8, opacity:.3 }}>📋</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>No leads found</div>
            <div style={{ fontSize:11, color:'var(--md-outline)' }}>Leads assigned to you will appear here.</div>
          </div>
        </div>
      ) : (
        <div className="bento-col-12">
          {leadContent()}
        </div>
      )}

      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Log a Call — {lead?.name}</h3>
              <button className="btn btn-sm" onClick={() => setShowLogModal(false)} style={{ background:'none', border:'1px solid var(--line)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <label className="field">Status
                  <select value={logStatus} onChange={e => setLogStatus(e.target.value)}>
                    {CALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label className="field">Type
                  <select value={logType} onChange={e => setLogType(e.target.value)}>
                    {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row" style={{ marginTop: 10 }}>
                <label className="field">Duration (seconds)
                  <input type="number" min="0" value={logDuration} onChange={e => setLogDuration(e.target.value)} placeholder="e.g. 120" />
                </label>
                <label className="field">Follow-up Date
                  <DatePicker value={logFollowUp} onChange={e => setLogFollowUp(e.target.value)} />
                </label>
              </div>
              <label className="field" style={{ marginTop: 10 }}>Notes
                <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="Call outcome, customer response…"
                  style={{ padding:'8px 10px', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', fontSize:13, fontFamily:'inherit', minHeight:60, resize:'vertical', outline:'none', width:'100%', boxSizing:'border-box' }} />
              </label>
              <div className="modal-actions">
                <button className="btn btn-sm" onClick={() => setShowLogModal(false)} style={{ background:'transparent', border:'1px solid var(--line)' }}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddCallLog} disabled={logBusy}>{logBusy ? 'Saving…' : 'Save Call Log'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
