import { useMemo, useState } from 'react';
import { useRec, CANDIDATE_STAGES, STAGE_TO_STATUS, INTERVIEW_ROUNDS, INTERVIEW_MODES, RECOMMENDATIONS, REMINDER_OPTIONS, INTERVIEW_STATUS_COLOR } from '../store';
import { Who, Dropdown } from './ui';
import { Cal, X, Pencil, Eye, Check } from '../icons';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'iv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (str, n) => {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (str) => {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDay = (str) => {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
};
const fmtTime = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const overlaps = (a1, a2, b1, b2) => toMin(a1) < toMin(b2) && toMin(b1) < toMin(a2);

const sectionOf = (iv) => {
  if (iv.status === 'Completed') return 'completed';
  if (iv.status === 'Cancelled' || iv.status === 'No Show') return 'cancelled';
  const today = todayStr();
  if (iv.date === today) return 'today';
  if (iv.date === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
};

const STATUS_ACTIVE = ['Scheduled', 'Confirmed', 'In Progress', 'Rescheduled'];

function Overlay({ children, onClose, width }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, padding: '20px'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', width: '100%', maxWidth: width || 640, maxHeight: '92vh', overflowY: 'auto',
        borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
      }}>
        {children}
      </div>
    </div>
  );
}

const StatusPill = ({ status }) => {
  const color = INTERVIEW_STATUS_COLOR[status] || '#888';
  return <span className="pill" style={{ background: color + '22', color }}><span className="d" style={{ background: color }} />{status}</span>;
};

function Row({ iv, onView, onEdit, onComplete, onCancel }) {
  const active = STATUS_ACTIVE.includes(iv.status);
  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={{ padding: '8px 12px', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{fmtDate(iv.date)}</div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtDay(iv.date)}</div></td>
      <td style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtTime(iv.startTime)}–{fmtTime(iv.endTime)}</td>
      <td style={{ padding: '8px 12px' }}><Who name={iv.candidateName} role={iv.jobRole} /></td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{iv.jobRole || '—'}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{iv.round || '—'}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{iv.interviewer || '—'}</td>
      <td style={{ padding: '8px 12px' }}>
        <span className="pill" style={{ background: '#ECE7DA', color: 'var(--ink-soft)', fontSize: 11, padding: '2px 8px' }}>
          {iv.mode || '—'}{iv.mode === 'Online' && iv.link ? ' · link' : ''}{iv.mode === 'Offline' && iv.location ? ' · place' : ''}
        </span>
      </td>
      <td style={{ padding: '8px 12px' }}><StatusPill status={iv.status} /></td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-icon btn-sm" title="View" onClick={() => onView(iv)}><Eye width={14} /></button>
          <button type="button" className="btn btn-icon btn-sm" title="Edit / Reschedule" onClick={() => onEdit(iv)}><Pencil width={14} /></button>
          {active && (
            <>
              <button type="button" className="btn btn-icon btn-sm" title="Mark completed" onClick={() => onComplete(iv)}><Check width={14} /></button>
              <button type="button" className="btn btn-icon btn-sm" title="Cancel interview" onClick={() => onCancel(iv)}><X width={14} /></button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export const ivToForm = (iv) => ({
  id: iv.id,
  candidateId: iv.candidateId,
  jobRole: iv.jobRole && iv.jobRole !== '—' ? iv.jobRole : '',
  round: iv.round || '',
  interviewer: iv.interviewer || '',
  date: iv.date || '',
  startTime: iv.startTime || '',
  endTime: iv.endTime || '',
  mode: iv.mode || 'Online',
  link: iv.link || '',
  location: iv.location || '',
  notes: iv.notes || '',
  reminder: iv.reminder || 'none',
});

const emptyForm = () => ({ id: undefined, candidateId: '', stage: '', jobRole: '', round: '', interviewer: '', date: '', startTime: '', endTime: '', mode: 'Online', link: '', location: '', notes: '', reminder: 'none' });

export function ScheduleForm({ title, editing, initial, candidates, candidateOptions, jobOptions, interviews, saving, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const [customJob, setCustomJob] = useState('');
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };
  const errBox = (k) => errors[k] ? <div style={{ color: '#B5603A', fontSize: 11, marginTop: 3 }}>{errors[k]}</div> : null;

  const validate = () => {
    const e = {};
    if (!f.candidateId) e.candidateId = 'Select a candidate';
    const role = f.jobRole === 'Other' ? customJob.trim() : f.jobRole;
    if (!role) e.jobRole = 'Select a position';
    if (!f.round) e.round = 'Select a round';
    if (!f.interviewer.trim()) e.interviewer = 'Interviewer is required';
    if (!f.date) e.date = 'Interview date is required';
    if (!f.startTime) e.startTime = 'Start time is required';
    if (!f.endTime) e.endTime = 'End time is required';
    if (f.startTime && f.endTime && toMin(f.endTime) <= toMin(f.startTime)) e.endTime = 'End time must be after start time';
    if (f.mode === 'Offline' && !f.location.trim()) e.location = 'Location is required for offline interviews';
    if (!e.interviewer && !e.date && !e.startTime && !e.endTime) {
      const conflict = interviews.find(iv =>
        iv.id !== f.id &&
        String(iv.interviewer).trim().toLowerCase() === String(f.interviewer).trim().toLowerCase() &&
        iv.date === f.date &&
        !['Completed', 'Cancelled', 'No Show'].includes(iv.status) &&
        overlaps(iv.startTime, iv.endTime, f.startTime, f.endTime)
      );
      if (conflict) e.interviewer = 'Selected interviewer already has an interview scheduled during this time.';
    }
    return e;
  };

  const submit = (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const role = f.jobRole === 'Other' ? customJob.trim() : f.jobRole;
    onSave({ ...f, jobRole: role, stage: currentStage, interviewer: f.interviewer.trim(), link: f.link.trim(), location: f.location.trim(), notes: f.notes.trim() });
  };

  const selCandidate = candidates.find(c => c.id === f.candidateId);
  const currentStage = f.stage || (selCandidate ? selCandidate.stage : '');

  return (
    <Overlay onClose={onClose} width={700}>
      <div className="card-head" style={{ padding: '16px 20px', position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderBottom: '1px solid var(--line)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <button type="button" className="btn btn-icon" onClick={onClose}><X width={16} /></button>
      </div>
      <form className="card-pad" onSubmit={submit} style={{ padding: '16px 20px' }}>
        <div className="form-row lead-sched" style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(4,minmax(0,1fr))', alignItems:'flex-start' }}>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Stage</span>
            <Dropdown value={currentStage} onChange={e => set('stage', e.target.value)} options={[{ value: '', label: 'No change' }, ...CANDIDATE_STAGES.map(s => ({ value: s, label: s }))]} placeholder="Select stage" />
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Position *</span>
            <Dropdown value={f.jobRole} onChange={e => set('jobRole', e.target.value)} options={jobOptions} customTrigger="Other" customValue={customJob} onCustomChange={setCustomJob} placeholder="Select position" />
            {errBox('jobRole')}
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Round *</span>
            <Dropdown value={f.round} onChange={e => set('round', e.target.value)} options={INTERVIEW_ROUNDS.map(r => ({ value: r, label: r }))} placeholder="Select round" />
            {errBox('round')}
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Interviewer *</span>
            <input value={f.interviewer} onChange={e => set('interviewer', e.target.value)} placeholder="Interviewer name" style={{ height: 42 }} />
            {errBox('interviewer')}
          </label>
        </div>
        <div className="form-row lead-sched" style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(4,minmax(0,1fr))', alignItems:'flex-start', marginTop:12 }}>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Date *</span>
            <input type="date" value={f.date} onChange={e => set('date', e.target.value)} style={{ height: 42 }} />
            {errBox('date')}
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Start time *</span>
            <input type="time" value={f.startTime} onChange={e => set('startTime', e.target.value)} style={{ height: 42 }} />
            {errBox('startTime')}
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>End time *</span>
            <input type="time" value={f.endTime} onChange={e => set('endTime', e.target.value)} style={{ height: 42 }} />
            {errBox('endTime')}
          </label>
          <label className="field">
            <span style={{ fontSize: 12, marginBottom: 4 }}>Mode *</span>
            <Dropdown value={f.mode} onChange={e => set('mode', e.target.value)} options={INTERVIEW_MODES.map(m => ({ value: m, label: m }))} />
          </label>
        </div>
        {f.mode === 'Offline' && (
          <div className="form-row" style={{ marginTop: 12, gap: 16 }}>
            <label className="field" style={{ flex: 1 }}>
              <span style={{ fontSize: 12, marginBottom: 4 }}>Location *</span>
              <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Office address / venue" style={{ height: 42 }} />
              {errBox('location')}
            </label>
          </div>
        )}
        <div className="form-row" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, alignItems:'flex-start', marginTop:12 }}>
          <label className="field" style={{ gridColumn:'1 / -1' }}>
            <span style={{ fontSize: 12, marginBottom: 4 }}>Reminder</span>
            <Dropdown value={f.reminder} onChange={e => set('reminder', e.target.value)} options={REMINDER_OPTIONS} />
          </label>
        </div>
        <div className="form-row" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, alignItems:'flex-start', marginTop:12 }}>
          <label className="field" style={{ gridColumn:'1 / -1' }}>
            <span style={{ fontSize: 12, marginBottom: 4 }}>Notes</span>
            <textarea rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Preparation notes, instructions…" style={{ minHeight: 80, resize: 'vertical' }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save changes' : 'Submit')}</button>
        </div>
      </form>
    </Overlay>
  );
}

export function DetailView({ iv, onEdit, onConfirm, onNoShow, onComplete, onCancel, onClose }) {
  const active = STATUS_ACTIVE.includes(iv.status);
  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', minWidth: 110, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{value || '—'}</div>
    </div>
  );
  const reminderLabel = ({ '24h': '24 hours before', '1h': '1 hour before', 'none': 'No reminder' })[iv.reminder];
  return (
    <Overlay onClose={onClose} width={560}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{iv.candidateName}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{iv.jobRole || ''}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><StatusPill status={iv.status} /></div>
        <button type="button" className="btn btn-icon" onClick={onClose}><X width={16} /></button>
      </div>
      <div style={{ padding: '16px 22px' }}>
        {row('Round', iv.round)}
        {row('Interviewer', iv.interviewer)}
        {row('Date', iv.date ? `${fmtDate(iv.date)} (${fmtDay(iv.date)})` : '—')}
        {row('Time', `${fmtTime(iv.startTime)} – ${fmtTime(iv.endTime)}`)}
        {row('Mode', iv.mode)}
        {iv.mode === 'Online' && row('Meeting link', iv.link)}
        {iv.mode === 'Offline' && row('Location', iv.location)}
        {row('Reminder', reminderLabel || '—')}
        {iv.notes && row('Notes', iv.notes)}
        {row('Created by', iv.createdBy)}
        {iv.createdAt && row('Created', new Date(iv.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}
        {iv.cancelReason && row('Cancel reason', iv.cancelReason)}
        {iv.status === 'Completed' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Interview feedback</h4>
            {row('Result', iv.result)}
            {row('Recommendation', iv.recommendation)}
            {iv.feedback && row('Feedback', iv.feedback)}
            {iv.strengths && row('Strengths', iv.strengths)}
            {iv.weaknesses && row('Weaknesses', iv.weaknesses)}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={onEdit}><Pencil width={13} style={{ verticalAlign: -2, marginRight: 4 }} />Edit / Reschedule</button>
        {['Scheduled', 'Rescheduled'].includes(iv.status) && (
          <button type="button" className="btn btn-sm" onClick={onConfirm}>Mark confirmed</button>
        )}
        {active && (
          <>
            <button type="button" className="btn btn-sm" onClick={onComplete}><Check width={13} style={{ verticalAlign: -2, marginRight: 4 }} />Mark completed</button>
            <button type="button" className="btn btn-sm" onClick={onNoShow}>Mark no show</button>
          </>
        )}
        {active && (
          <button type="button" className="btn btn-sm btn-danger" onClick={onCancel}><X width={13} style={{ verticalAlign: -2, marginRight: 4 }} />Cancel</button>
        )}
      </div>
    </Overlay>
  );
}

export function CompleteForm({ iv, saving, onSave, onClose }) {
  const [f, setF] = useState({ result: '', rating: 0, feedback: '', strengths: '', weaknesses: '', recommendation: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };
  const submit = (ev) => {
    ev.preventDefault();
    const er = {};
    if (!f.recommendation) er.recommendation = 'Select a recommendation';
    setErrors(er);
    if (Object.keys(er).length) return;
    onSave(f);
  };
  return (
    <Overlay onClose={onClose} width={560}>
      <div className="card-head" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
        <h3 style={{ margin: 0 }}>Mark interview completed</h3>
        <button type="button" className="btn btn-icon" onClick={onClose}><X width={16} /></button>
      </div>
      <form className="card-pad" onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <Who name={iv.candidateName} role={iv.jobRole} />
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fmtDate(iv.date)} · {fmtTime(iv.startTime)}–{fmtTime(iv.endTime)}</div>
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: 1 }}>
            <span>Result</span>
            <input value={f.result} onChange={e => set('result', e.target.value)} placeholder="e.g. Cleared, Round cleared…" />
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Recommendation *</span>
            <Dropdown value={f.recommendation} onChange={e => set('recommendation', e.target.value)} options={RECOMMENDATIONS.map(r => ({ value: r, label: r }))} placeholder="Select recommendation" />
            {errors.recommendation && <div style={{ color: '#B5603A', fontSize: 11, marginTop: 3 }}>{errors.recommendation}</div>}
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Feedback</span>
            <textarea rows={3} value={f.feedback} onChange={e => set('feedback', e.target.value)} placeholder="Overall feedback…" />
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Strengths</span>
            <textarea rows={2} value={f.strengths} onChange={e => set('strengths', e.target.value)} placeholder="Candidate strengths…" />
          </label>
          <label className="field">
            <span>Weaknesses</span>
            <textarea rows={2} value={f.weaknesses} onChange={e => set('weaknesses', e.target.value)} placeholder="Areas to improve…" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save feedback'}</button>
        </div>
      </form>
    </Overlay>
  );
}

export function CancelForm({ iv, saving, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const submit = (ev) => { ev.preventDefault(); onSave(reason.trim()); };
  return (
    <Overlay onClose={onClose} width={420}>
      <div className="card-head">
        <h3 style={{ margin: 0 }}>Cancel interview</h3>
        <button type="button" className="btn btn-icon" onClick={onClose}><X width={16} /></button>
      </div>
      <form className="card-pad" onSubmit={submit}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          Cancel the interview with <strong style={{ color: 'var(--ink)' }}>{iv.candidateName}</strong> on {fmtDate(iv.date)} at {fmtTime(iv.startTime)}?
          It will be kept on the candidate record as Cancelled.
        </p>
        <label className="field">
          <span>Reason (optional)</span>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Candidate unavailable, interviewer sick…" />
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn" onClick={onClose}>Keep interview</button>
          <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? 'Cancelling…' : 'Cancel interview'}</button>
        </div>
      </form>
    </Overlay>
  );
}

export default function Interviews() {
  const { candidates, interviews, saveInterview, updateCandidateStatus, user } = useRec();

  const [detail, setDetail] = useState(null);
  const [complete, setComplete] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState('schedule');
  const [formInitial, setFormInitial] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const candidateOptions = useMemo(() => candidates.map(c => ({ value: c.id, label: c.name + (c.role && c.role !== '—' ? ' · ' + c.role : '') })), [candidates]);
  const jobOptions = useMemo(() => [...new Set(candidates.map(c => c.role).filter(r => r && r !== '—'))].sort(), [candidates]);

  const getCandidateLatestInterview = (candidateId) => {
    const candInterviews = interviews.filter(iv => iv.candidateId === candidateId);
    if (candInterviews.length === 0) return null;
    return candInterviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  };

  const getCandidateUpcomingInterview = (candidateId) => {
    const candInterviews = interviews.filter(iv => iv.candidateId === candidateId && ['today', 'tomorrow', 'upcoming'].includes(sectionOf(iv)));
    if (candInterviews.length === 0) return null;
    return candInterviews.sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime))[0];
  };

  const notify = (ok, text) => {
    setMsg(ok ? text : '');
    setErr(ok ? '' : text);
    setTimeout(() => { setMsg(''); setErr(''); }, 3500);
  };

  const handleFormSave = async (dataRaw) => {
    const { stage: nextStage, ...data } = dataRaw;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      let iv;
      if (editing) {
        const prev = formInitial;
        const timesChanged = prev.date !== data.date || prev.startTime !== data.startTime || prev.endTime !== data.endTime || prev.interviewer !== data.interviewer;
        iv = {
          ...data,
          status: timesChanged && !['Completed', 'Cancelled', 'No Show'].includes(prev.status) ? 'Rescheduled' : prev.status,
          result: prev.result, rating: prev.rating, feedback: prev.feedback, strengths: prev.strengths, weaknesses: prev.weaknesses, recommendation: prev.recommendation, cancelReason: prev.cancelReason,
          createdBy: prev.createdBy, createdAt: prev.createdAt, updatedAt: nowIso,
        };
      } else {
        iv = {
          ...data,
          id: uid(),
          status: 'Scheduled',
          result: '', rating: 0, feedback: '', strengths: '', weaknesses: '', recommendation: '', cancelReason: '',
          createdBy: (user && (user.name || user.email)) || 'Recruiter',
          createdAt: nowIso, updatedAt: nowIso,
        };
      }
      await saveInterview(iv);
      const cand = candidates.find(c => c.id === data.candidateId);
      if (!editing) {
        const st = cand && cand.status;
        if (!['selected', 'offer_released', 'offer_accepted', 'onboarding', 'joined', 'rejected'].includes(st)) {
          await updateCandidateStatus(data.candidateId, 'scheduled');
        }
      }
      if (nextStage && cand && cand.stage !== nextStage) {
        await updateCandidateStatus(data.candidateId, STAGE_TO_STATUS[nextStage] || cand.status);
      }
      setShowFormModal(false);
      setFormInitial(null);
      notify(true, editing ? 'Interview updated.' : 'Interview scheduled.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to save interview');
    } finally { setBusy(false); }
  };

  const handleComplete = async (fb) => {
    if (!complete) return;
    setBusy(true);
    try {
      const iv = { ...complete, ...fb, status: 'Completed', updatedAt: new Date().toISOString() };
      await saveInterview(iv);
      const st = fb.recommendation === 'Reject' ? 'rejected'
        : fb.recommendation === 'Select' ? 'selected'
        : fb.recommendation === 'On Hold' ? 'on_hold'
        : 'interviewed';
      await updateCandidateStatus(iv.candidateId, st);
      setComplete(null);
      notify(true, 'Interview marked completed.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to update interview');
    } finally { setBusy(false); }
  };

  const handleCancel = async (reason) => {
    if (!cancel) return;
    setBusy(true);
    try {
      const iv = { ...cancel, status: 'Cancelled', cancelReason: reason, updatedAt: new Date().toISOString() };
      await saveInterview(iv);
      setCancel(null);
      notify(true, 'Interview cancelled.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to cancel interview');
    } finally { setBusy(false); }
  };

  const handleSetStatus = async (iv, status) => {
    setBusy(true);
    try {
      await saveInterview({ ...iv, status, updatedAt: new Date().toISOString() });
      setDetail(null);
      notify(true, 'Interview marked ' + status.toLowerCase() + '.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to update interview');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head" style={{ padding: '10px 16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Cal width={16} style={{ color: 'var(--sage)', verticalAlign: -2 }} />Candidates</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>{candidates.length} candidates</span>
        </div>
        {(candidates.length === 0) ? (
          <div className="empty" style={{ padding: '20px 16px' }}>No candidates found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Candidate</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Phone</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Source</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Position</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Next Interview</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => {
                  const upcomingIv = getCandidateUpcomingInterview(c.id);
                  const latestIv = getCandidateLatestInterview(c.id);
                  const displayIv = upcomingIv || latestIv;
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{c.email || '—'}</div>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{c.source || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span className="pill" style={{ background: '#ECE7DA', color: 'var(--ink-soft)', fontSize: 11, padding: '2px 8px' }}>
                          {c.stage || c.status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>{c.role || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        {displayIv ? (
                          <>
                            <div style={{ fontWeight: 500 }}>{displayIv.date ? fmtDate(displayIv.date) : 'Not scheduled'}</div>
                            {displayIv.startTime && displayIv.endTime && (
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtTime(displayIv.startTime)}–{fmtTime(displayIv.endTime)} · {displayIv.round || ''}</div>
                            )}
                            {displayIv.interviewer && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{displayIv.interviewer}</div>}
                          </>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>Not scheduled</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-icon btn-sm" title="Schedule / Edit Interview" onClick={() => {
                            const initial = {
                              candidateId: c.id,
                              jobRole: c.role || '',
                              round: '',
                              interviewer: '',
                              date: '',
                              startTime: '',
                              endTime: '',
                              mode: 'Online',
                              link: '',
                              location: '',
                              notes: '',
                              reminder: 'none',
                            };
                            setFormInitial(initial);
                            setFormMode('schedule');
                            setShowFormModal(true);
                          }}><Pencil width={14} /></button>
                          {displayIv && (
                            <button type="button" className="btn btn-icon btn-sm" title="View Interview" onClick={() => setDetail(displayIv)}><Eye width={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFormModal && (
        <ScheduleForm title={formMode === 'edit' ? 'Edit interview' : 'Schedule interview'}
          editing={formMode === 'edit'} initial={formInitial} candidates={candidates}
          candidateOptions={candidateOptions} jobOptions={jobOptions} interviews={interviews} saving={busy}
          onSave={(data) => handleFormSave(data, formMode === 'edit')} onClose={() => setShowFormModal(false)} />
      )}

      {detail && (
        <DetailView iv={detail}
          onEdit={() => { const iv = detail; setDetail(null); setFormInitial(ivToForm(iv)); setFormMode('edit'); setShowFormModal(true); }}
          onConfirm={() => handleSetStatus(detail, 'Confirmed')}
          onNoShow={() => handleSetStatus(detail, 'No Show')}
          onComplete={() => { const iv = detail; setDetail(null); setComplete(iv); }}
          onCancel={() => { const iv = detail; setDetail(null); setCancel(iv); }}
          onClose={() => setDetail(null)} />
      )}
      {complete && <CompleteForm iv={complete} saving={busy} onSave={handleComplete} onClose={() => setComplete(null)} />}
      {cancel && <CancelForm iv={cancel} saving={busy} onSave={handleCancel} onClose={() => setCancel(null)} />}

      {msg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1200, display: 'flex', alignItems: 'center', gap: 10, color: '#166534' }}>
          <Check width={15} /><span>{msg}</span>
          <button type="button" className="btn btn-sm" onClick={() => setMsg('')} style={{ padding: '2px 6px', lineHeight: 1, color: '#166534' }}><X width={12} /></button>
        </div>
      )}
      {err && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1200, display: 'flex', alignItems: 'center', gap: 10, color: '#B5603A' }}>
          <span>{err}</span>
          <button type="button" className="btn btn-sm" onClick={() => setErr('')} style={{ padding: '2px 6px', lineHeight: 1, color: '#B5603A' }}><X width={12} /></button>
        </div>
      )}
    </>
  );
}
