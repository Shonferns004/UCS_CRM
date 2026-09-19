import { useState } from 'react';
import { useRec } from '../store';
import { getCandidateProfile, parseNotes, buildCandidateNotes } from '../store';
import { ArrowLeft, Pencil, ArrowRight, Trash, Download, Eye, Check } from '../icons';
import usePasteImage from '../../../utils/usePasteImage';
import { Avatar } from './ui';

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateShort = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const STAGE_PILL = {
  'Selected': 'pill-green', 'Offer Released': 'pill-green', 'Offer Accepted': 'pill-green', 'Onboarding': 'pill-green',
  'Rejected': 'pill-danger', 'On Hold': 'pill-gold', 'Interview Scheduled': 'pill-clay',
};

function InfoGrid({ title, rows }) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '20px 0 12px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 18px' }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{k}</div>
            <div style={{ fontSize: 13, marginTop: 3 }}>{v || '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function CandidateDetail({ candidate, onBack, onEdit, onMoveStage, onDelete }) {
  const { user, updateLead } = useRec();
  const [noteText, setNoteText] = useState('');
  const [replacing, setReplacing] = useState(false);

  const p = candidate.profile || {};
  const notes = (candidate._raw ? parseNotes(candidate._raw) : []).filter(n => n && !n.__meta);
  const activities = candidate.activities || [];
  const interviews = candidate.interviews || [];
  const latestIv = interviews[interviews.length - 1];
  const selectionStatus = ['Selected', 'Offer Released', 'Offer Accepted', 'Onboarding'].includes(candidate.stage)
    ? 'Selected'
    : candidate.stage === 'Rejected' ? 'Rejected' : 'In Progress';

  const addNote = async () => {
    if (!noteText.trim()) return;
    const base = candidate._raw ? parseNotes(candidate._raw) : [];
    const n = { text: noteText.trim(), date: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), by: user?.name || 'Unknown' };
    try {
      await updateLead(candidate.id, { notes: JSON.stringify([...base, n]) });
      setNoteText('');
    } catch (err) { alert(err.message); }
  };

  const applyResumeFile = (f) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert('Resume must be under 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const profile = { ...getCandidateProfile(candidate._raw), resume: { name: f.name, data: reader.result } };
      const notesArr = buildCandidateNotes({ lead: candidate._raw, profile, activities, interviews });
      try { await updateLead(candidate.id, { notes: JSON.stringify(notesArr) }); } catch (err) { alert(err.message); }
    };
    reader.readAsDataURL(f);
  };

  const replaceResume = (e) => {
    applyResumeFile(e.target.files && e.target.files[0]);
    if (e.target) e.target.value = '';
  };

  const onResumePaste = usePasteImage(({ file }) => {
    if (file) applyResumeFile(file);
  });

  const downloadResume = () => {
    if (!p.resume) return;
    const a = document.createElement('a');
    a.href = p.resume.data;
    a.download = p.resume.name || 'resume';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm" onClick={onBack}><ArrowLeft width={14}/> Back</button>
          <span className="sub">Candidate details</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={onEdit}><Pencil width={13}/> Edit</button>
          <button className="btn btn-sm" onClick={() => onMoveStage(candidate)}><ArrowRight width={13}/> Move Stage</button>
          <button className="btn btn-sm" onClick={() => onDelete(candidate)} style={{ color: '#dc2626', borderColor: '#f3a6a6' }}><Trash width={13}/> Delete</button>
        </div>
      </div>

      <div className="card-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <Avatar name={candidate.name} size={44}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{candidate.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{candidate.role || '—'}</div>
          </div>
          <span className={`pill ${STAGE_PILL[candidate.stage] || 'pill-gray'}`}><span className="d" style={{ background: '#888' }}/>{candidate.stage}</span>
        </div>

        <InfoGrid title="Personal information" rows={[
          ['Name', candidate.name],
          ['Profile', candidate.role || '—'],
          ['Phone', candidate.phone],
          ['Email', candidate.email],
          ['Date of Birth', candidate.dob ? fmtDate(candidate.dob) : '—'],
          ['Gender', p.gender || '—'],
          ['Location', p.location || '—'],
          ['Address', p.address || '—'],
        ]}/>

        <InfoGrid title="Professional information" rows={[
          ['Applied Job', candidate.role || '—'],
          ['Department', p.department || '—'],
          ['Experience', p.experience || '—'],
          ['Current Company', p.currentCompany || '—'],
          ['Current Designation', p.currentDesignation || '—'],
          ['Current Salary', p.currentSalary || '—'],
          ['Expected Salary', p.expectedSalary || '—'],
          ['Notice Period', p.noticePeriod || '—'],
          ['Qualification', p.qualification || '—'],
        ]}/>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '20px 0 12px' }}>Skills</div>
        {candidate.skills.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>—</span>
        ) : (
          <div className="tags">{candidate.skills.slice(0, 10).map(s => <span className="tag" key={s} style={{ fontSize: 11, padding: '3px 9px', background: 'var(--sage-soft)', color: 'var(--sage)', borderRadius: 20 }}>{s}</span>)}</div>
        )}

        <InfoGrid title="Recruitment information" rows={[
          ['Candidate ID', p.candidateId || candidate.id],
          ['Recruiter', p.recruiter || candidate.createdByName || '—'],
          ['Source', candidate.source],
          ['Current Stage', candidate.stage],
          ['Application Date', p.applicationDate ? fmtDate(p.applicationDate) : (candidate.createdAt ? fmtDate(candidate.createdAt) : '—')],
          ['Last Contacted Date', p.lastContactedDate ? fmtDate(p.lastContactedDate) : '—'],
          ['Next Follow-up Date', p.nextFollowUpDate ? fmtDate(p.nextFollowUpDate) : '—'],
          ['Interview Status', latestIv ? latestIv.status : '—'],
          ['Interview Date', latestIv && latestIv.date ? fmtDate(latestIv.date) : '—'],
          ['Selection Status', selectionStatus],
        ]}/>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '20px 0 12px' }}>Resume</div>
        {p.resume ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Check width={14} style={{ color: 'var(--sage)' }}/><span style={{ fontSize: 13 }}>{p.resume.name}</span>
            <a className="btn btn-sm" href={p.resume.data} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Eye width={13}/> View</a>
            <button className="btn btn-sm" onClick={downloadResume}><Download width={13}/> Download</button>
            {replacing ? (
              <label className="btn btn-sm" style={{ cursor: 'pointer', color: 'var(--clay)', borderColor: 'var(--clay)' }} onPaste={onResumePaste} title="Upload or paste (Ctrl+V)">
                Choose file
                <input type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={replaceResume} />
              </label>
            ) : (
              <button className="btn btn-sm" onClick={() => setReplacing(true)} style={{ color: 'var(--clay)', borderColor: 'var(--clay)' }}>Replace</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No resume uploaded.</span>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }} onPaste={onResumePaste} title="Upload or paste (Ctrl+V)">
              Upload resume
              <input type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={replaceResume} />
            </label>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)', marginTop: 24, paddingTop: 18 }}>
          <div className="card-head" style={{ padding: '0 0 12px', borderBottom: 'none' }}><h3 style={{ fontSize: 14 }}>Notes</h3></div>
          {notes.length === 0 ? (
            <div className="empty" style={{ padding: '12px 0' }}>No notes.</div>
          ) : (
            notes.map((n, i) => (
              <div key={i} style={{ padding: '9px 0', borderBottom: i < notes.length - 1 ? '1px solid var(--line)' : 'none', fontSize: 13 }}>
                <div>{n.text || n}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>{(n.by || '—')} · {(n.date || '—')}</div>
              </div>
            ))
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note…" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addNote()} />
            <button className="btn btn-sm" onClick={addNote}>Add</button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Activity timeline</h3>
          </div>
          {activities.length === 0 ? (
            <div className="empty" style={{ padding: '12px 0' }}>No activity yet.</div>
          ) : (
            [...activities].reverse().map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span className="tdot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sage)', marginTop: 6, flexShrink: 0 }}/>
                <div style={{ fontSize: 13 }}>
                  <div>{a.desc || a.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{a.date ? new Date(a.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} · {a.by || '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
