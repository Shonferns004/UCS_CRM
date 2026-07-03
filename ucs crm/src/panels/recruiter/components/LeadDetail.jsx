import { useState } from 'react';
import { useRec, LEAD_STATUSES, NOT_CONNECTED_OPTIONS } from '../store';
import { Dropdown } from './ui';
import { Plus, ArrowLeft } from '../icons';

const calcAge = (dob) => {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / 31557600000);
};

const statusPill = (s) => {
  const m = { rejected:'pill-danger', selected:'pill-green', hold:'pill-gold', scheduled:'pill-clay', joined:'pill-gray' };
  return <span className={`pill ${m[s] || 'pill-gray'}`}>{s}</span>;
};

export default function LeadDetail({ lead, onBack }) {
  const { user, updateLead } = useRec();
  const myId = user?.id;
  const isOwner = myId && lead.created_by === myId;
  const [noteText, setNoteText] = useState('');

  const initConnected = (s) => {
    if (s === 'followed_up') return 'follow_up';
    if (s === 'call_back') return 'call_back';
    if (s === 'scheduled') return 'schedule';
    if (s === 'not_interested') return 'not_interested';
    return '';
  };
  const initNotConnected = (s) => {
    if (['ringing','unreachable','busy','switched_off','wrong_number','invalid','rejected'].includes(s)) return s;
    return '';
  };
  const [connectedOption, setConnectedOption] = useState(initConnected(lead.status));
  const [notConnectedOption, setNotConnectedOption] = useState(initNotConnected(lead.status));
  const [followUpDateTime, setFollowUpDateTime] = useState(lead.follow_up_date || '');
  const [callBackTime, setCallBackTime] = useState(lead.call_back_time || '');
  const [scheduledDate, setScheduledDate] = useState(lead.scheduled_date || '');
  const connectionDirty = connectedOption !== initConnected(lead.status) || notConnectedOption !== initNotConnected(lead.status) || followUpDateTime !== (lead.follow_up_date || '') || callBackTime !== (lead.call_back_time || '') || scheduledDate !== (lead.scheduled_date || '');

  const saveConnection = async () => {
    const finalStatus = connectedOption === 'follow_up' && followUpDateTime ? 'followed_up' : connectedOption === 'call_back' && callBackTime ? 'call_back' : connectedOption === 'schedule' && scheduledDate ? 'scheduled' : connectedOption === 'not_interested' ? 'not_interested' : notConnectedOption || lead.status;
    const payload = { status: finalStatus };
    if (finalStatus === 'followed_up' && followUpDateTime) payload.follow_up_date = followUpDateTime;
    if (finalStatus === 'call_back' && callBackTime) payload.call_back_time = callBackTime;
    if (finalStatus === 'scheduled' && scheduledDate) payload.scheduled_date = scheduledDate;
    await updateLead(lead.id, payload);
  };

  const [editScheduledDate, setEditScheduledDate] = useState(lead.scheduled_date || '');

  let notes = [];
  try { notes = JSON.parse(lead.notes || '[]'); } catch { notes = lead.notes ? [{ text: lead.notes }] : []; }

  const addNote = async () => {
    if (!noteText.trim()) return;
    const n = { text: noteText.trim(), date: new Date().toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}), by: user?.name || 'Unknown' };
    await updateLead(lead.id, { notes: JSON.stringify([...notes, n]) });
    setNoteText('');
  };

  const updateScheduledDate = async () => {
    await updateLead(lead.id, { scheduled_date: editScheduledDate || null });
  };

  const age = lead.dob ? calcAge(lead.dob) : lead.age;
  const formatDT = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  };

  return (
    <div className="card">
      <div className="card-head">
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft width={14}/> Back</button>
        <span className="sub">Lead details</span>
      </div>
      <div className="card-pad">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div><strong>Name</strong><p>{lead.name}</p></div>
          <div><strong>Phone</strong><p>{lead.phone || '—'}</p></div>
          <div><strong>DOB</strong><p>{lead.dob ? new Date(lead.dob).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}{age ? ` (Age: ${age})` : ''}</p></div>
          <div><strong>Source</strong><p>{lead.source}</p></div>
          <div><strong>Created by</strong><p>{lead.created_by_name || '—'}</p></div>
          <div><strong>Status</strong>
            <p style={{marginTop:4}}>{statusPill(lead.status)}</p>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="card" style={{margin:'12px 22px',border:'1.5px solid var(--line)',borderRadius:'var(--radius)'}}>
          <div className="card-head"><h4 style={{fontSize:13,fontWeight:600,margin:0}}>CONNECTION STATUS</h4></div>
          <div className="card-pad">
            <div style={{display:'flex',gap:16}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--ink)',marginBottom:4}}>CONNECTED <span style={{color:'var(--danger)'}}>*</span></div>
                <Dropdown menuInset value={connectedOption} onChange={e=>{setConnectedOption(e.target.value);setFollowUpDateTime('');setCallBackTime('');setScheduledDate('')}} options={[{value:'',label:'Select'},{value:'follow_up',label:'Follow Up'},{value:'call_back',label:'Call Back'},{value:'schedule',label:'Schedule'},{value:'not_interested',label:'Not Interested'}]} style={{width:'100%'}} />
                {connectedOption === 'follow_up' && (
                  <div style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:6}}>
                    <span style={{fontSize:13,fontWeight:500,color:'var(--ink)'}}>Follow Up</span>
                    <input type="datetime-local" value={followUpDateTime} onChange={e=>setFollowUpDateTime(e.target.value)} style={{width:'auto'}} />
                  </div>
                )}
                {connectedOption === 'call_back' && (
                  <div style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:6}}>
                    <span style={{fontSize:13,fontWeight:500,color:'var(--ink)'}}>Call Back</span>
                    <input type="time" value={callBackTime} onChange={e=>setCallBackTime(e.target.value)} style={{width:'auto'}} />
                  </div>
                )}
                {connectedOption === 'schedule' && (
                  <div style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:6}}>
                    <span style={{fontSize:13,fontWeight:500,color:'var(--ink)'}}>Schedule</span>
                    <input type="datetime-local" value={scheduledDate} onChange={e=>setScheduledDate(e.target.value)} style={{width:'auto'}} />
                  </div>
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--ink)',marginBottom:4}}>NOT CONNECTED <span style={{color:'var(--danger)'}}>*</span></div>
                <Dropdown menuInset value={notConnectedOption} onChange={e=>setNotConnectedOption(e.target.value)} options={[{value:'',label:'Select'},...NOT_CONNECTED_OPTIONS]} style={{width:'100%'}} />
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveConnection} disabled={!connectionDirty}><Plus width={14}/> Update</button>
            </div>
          </div>
        </div>
      )}

      {lead.status === 'scheduled' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,padding:'16px 22px'}}>
          <div><strong>Interview date</strong>
            <p style={{marginTop:4}}>
              {isOwner ? (
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="date" value={editScheduledDate} onChange={e=>setEditScheduledDate(e.target.value)}
                    style={{flex:1,border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,background:'transparent',color:'var(--ink)',outline:'none'}} />
                  <button className="btn btn-sm" onClick={updateScheduledDate}>Save</button>
                </div>
              ) : (
                lead.scheduled_date ? new Date(lead.scheduled_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'
              )}
            </p>
          </div>
          <div><strong>Scheduled by</strong><p>{lead.scheduled_by_name || '—'}</p></div>
          <div><strong>Scheduled at</strong><p style={{color:'var(--ink-soft)'}}>{formatDT(lead.scheduled_at)}</p></div>
        </div>
      )}

      <div className="card-head" style={{borderTop:'1px solid var(--line)'}}><h3>Notes</h3></div>
      <div className="card-pad">
        {notes.length === 0 ? (
          <div className="empty">No notes.</div>
        ) : (
          notes.map((n,i) => (
            <div key={i} style={{padding:'10px 0',borderBottom:i<notes.length-1?'1px solid var(--line)':'none',fontSize:13}}>
              <div>{n.text || n}</div>
              <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:3}}>{(n.by || '—')} · {(n.date || '—')}</div>
            </div>
          ))
        )}
        {isOwner && (
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <input value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder="Add a note…" style={{flex:1}}
              onKeyDown={e=>e.key==='Enter'&&addNote()} />
            <button className="btn btn-sm" onClick={addNote}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}
