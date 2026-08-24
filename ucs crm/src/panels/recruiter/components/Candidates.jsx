import { useState, useEffect, useMemo } from 'react';
import { useRec } from '../store';
import { Search, Trash, X, Pencil, Eye } from '../icons';
import { Dropdown, Who } from './ui';
import { CANDIDATE_STAGES, CANDIDATE_SOURCES, STAGE_TO_STATUS, getCandidateProfile, buildCandidateNotes } from '../store';
import CandidateForm from './CandidateForm';
import CandidateDetail from './CandidateDetail';
import { ScheduleForm, DetailView, CompleteForm, CancelForm, ivToForm } from './Interviews';

const SkeletonRow = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}><div className="skeleton" style={{ height: 14, width: i === 0 ? 100 : 60 }}/></td>
    ))}
  </tr>
);

const INTERVIEW_ACTIVE = ['Scheduled', 'Confirmed', 'In Progress', 'Rescheduled'];

const fmtInterviewDate = (str) => {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtInterviewTime = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const getNextInterview = (c) => {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  return (c.interviews || [])
    .filter(iv => iv && iv.date && INTERVIEW_ACTIVE.includes(iv.status) && iv.date >= today)
    .sort((a, b) => ((a.date || '') + ' ' + (a.startTime || '')).localeCompare((b.date || '') + ' ' + (b.startTime || '')))[0] || null;
};

const getLatestInterview = (c) => {
  const arr = (c.interviews || []).filter(Boolean);
  if (arr.length === 0) return null;
  return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
};

const getInterviewOnDate = (c, date) => {
  return (c.interviews || [])
    .filter(iv => iv && iv.date === date)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))[0] || null;
};

export default function Candidates() {
  const { candidates, leadsLoading, user, updateLead, deleteLead, interviews, saveInterview, updateCandidateStatus } = useRec();
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [jobFilter, setJobFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [formMode, setFormMode] = useState('schedule');
  const [formInitial, setFormInitial] = useState(null);
  const [ivDetail, setIvDetail] = useState(null);
  const [ivComplete, setIvComplete] = useState(null);
  const [ivCancel, setIvCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastErr, setToastErr] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveStage, setMoveStage] = useState('');
  const [moving, setMoving] = useState(false);

  const findCandidate = (id) => candidates.find(c => c.id === id) || null;
  const current = view && view.id ? findCandidate(view.id) : null;

  useEffect(() => {
    if (view && view.id && !findCandidate(view.id)) setView(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates.filter(c => {
      if (s && !c.name.toLowerCase().includes(s) && !(c.phone || '').includes(s) && !(c.email || '').toLowerCase().includes(s)) return false;
      if (stageFilter !== 'All' && c.stage !== stageFilter) return false;
      if (sourceFilter !== 'All' && c.source !== sourceFilter) return false;
      if (jobFilter !== 'All' && c.role !== jobFilter) return false;
      if (dateFilter && !(c.interviews || []).some(iv => iv && iv.date === dateFilter)) return false;
      return true;
    });
  }, [candidates, q, stageFilter, sourceFilter, jobFilter, dateFilter]);

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, stageFilter, sourceFilter, jobFilter, dateFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const jobOptions = useMemo(() => {
    const roles = [...new Set(candidates.map(c => c.role).filter(Boolean))].sort();
    return [{ value: 'All', label: 'All positions' }, ...roles.map(r => ({ value: r, label: r }))];
  }, [candidates]);

  const jobRoleSuggestions = useMemo(() => jobOptions.slice(1).map(o => o.value), [jobOptions]);

  const ivCandidateOptions = useMemo(() => candidates.map(c => ({ value: c.id, label: c.name + (c.role && c.role !== '—' ? ' · ' + c.role : '') })), [candidates]);
  const ivJobOptions = useMemo(() => [...new Set(candidates.map(c => c.role).filter(r => r && r !== '—'))].sort(), [candidates]);

  const notify = (ok, text) => {
    if (ok) setToastMsg(text); else setToastErr(text);
    setTimeout(() => { setToastMsg(''); setToastErr(''); }, 3500);
  };

  const handleFormSave = async (dataRaw) => {
    const { stage: nextStage, ...data } = dataRaw;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      let iv;
      if (formMode === 'edit') {
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
          id: crypto.randomUUID ? crypto.randomUUID() : 'iv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          status: 'Scheduled',
          result: '', rating: 0, feedback: '', strengths: '', weaknesses: '', recommendation: '', cancelReason: '',
          createdBy: (user && (user.name || user.email)) || 'Recruiter',
          createdAt: nowIso, updatedAt: nowIso,
        };
      }
      await saveInterview(iv);
      const cand = candidates.find(c => c.id === data.candidateId);
      if (formMode !== 'edit') {
        const st = cand && cand.status;
        if (!['selected', 'offer_released', 'offer_accepted', 'onboarding', 'joined', 'rejected'].includes(st)) {
          await updateCandidateStatus(data.candidateId, 'scheduled');
        }
      }
      if (nextStage && cand && cand.stage !== nextStage) {
        await updateLead(data.candidateId, { status: STAGE_TO_STATUS[nextStage] || cand.status });
      }
      setFormInitial(null);
      notify(true, formMode === 'edit' ? 'Interview updated.' : 'Interview scheduled.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to save interview');
    } finally { setBusy(false); }
  };

  const handleIvComplete = async (fb) => {
    if (!ivComplete) return;
    setBusy(true);
    try {
      const iv = { ...ivComplete, ...fb, status: 'Completed', updatedAt: new Date().toISOString() };
      await saveInterview(iv);
      const st = fb.recommendation === 'Reject' ? 'rejected'
        : fb.recommendation === 'Select' ? 'selected'
        : fb.recommendation === 'On Hold' ? 'on_hold'
        : 'interviewed';
      await updateCandidateStatus(iv.candidateId, st);
      setIvComplete(null);
      notify(true, 'Interview marked completed.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to update interview');
    } finally { setBusy(false); }
  };

  const handleIvCancel = async (reason) => {
    if (!ivCancel) return;
    setBusy(true);
    try {
      const iv = { ...ivCancel, status: 'Cancelled', cancelReason: reason, updatedAt: new Date().toISOString() };
      await saveInterview(iv);
      setIvCancel(null);
      notify(true, 'Interview cancelled.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to cancel interview');
    } finally { setBusy(false); }
  };

  const handleSetStatus = async (iv, status) => {
    setBusy(true);
    try {
      await saveInterview({ ...iv, status, updatedAt: new Date().toISOString() });
      setIvDetail(null);
      notify(true, 'Interview marked ' + status.toLowerCase() + '.');
    } catch (e) {
      notify(false, (e && e.message) || 'Failed to update interview');
    } finally { setBusy(false); }
  };

  const handleUpdate = async (form) => {
    const existing = findCandidate(view.id);
    if (!existing) return;
    const profile = { ...form, customSource: undefined };
    const activities = [...existing.activities, { type: 'updated', desc: 'Candidate profile updated', date: new Date().toISOString(), by: user?.name || 'Unknown' }];
    const notesArr = buildCandidateNotes({ lead: existing._raw, profile, activities, interviews: existing.interviews });
    const payload = {
      name: form.name,
      phone: form.phone,
      dob: form.dob || null,
      source: form.source,
      status: STAGE_TO_STATUS[form.stage] || existing.status,
      notes: JSON.stringify(notesArr),
    };
    if (form.stage === 'Interview Scheduled' && form.applicationDate) payload.scheduled_date = form.applicationDate;
    try {
      await updateLead(existing.id, payload);
      setSuccessMsg('Candidate updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setView({ type: 'detail', id: existing.id });
    } catch (err) { alert(err.message); }
  };

  const handleMoveStage = async () => {
    if (!moveTarget || !moveStage) return;
    setMoving(true);
    try {
      const status = STAGE_TO_STATUS[moveStage] || moveTarget.status;
      const profile = getCandidateProfile(moveTarget._raw);
      const activities = [...moveTarget.activities, { type: 'stage_changed', desc: `Stage changed to ${moveStage}`, date: new Date().toISOString(), by: user?.name || 'Unknown' }];
      const notesArr = buildCandidateNotes({ lead: moveTarget._raw, profile, activities, interviews: moveTarget.interviews });
      const payload = { status, notes: JSON.stringify(notesArr) };
      if (moveStage === 'Interview Scheduled') {
        const iv = (moveTarget.interviews || []).find(i => i.status === 'Scheduled');
        if (iv && iv.date) payload.scheduled_date = iv.date;
      }
      await updateLead(moveTarget.id, payload);
      setSuccessMsg(`Stage changed to ${moveStage}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
      setMoveTarget(null);
    } catch (err) { alert(err.message); }
    finally { setMoving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteLead(deleteConfirm.id);
      setDeleteMsg('Candidate deleted successfully.');
      setDeleteConfirm(null);
      setView(null);
      setTimeout(() => setDeleteMsg(''), 3000);
    } catch {
      setDeleteMsg('Failed to delete candidate.');
      setTimeout(() => setDeleteMsg(''), 3000);
    } finally { setDeleting(false); }
  };

  const stageOptions = [{ value: 'All', label: 'All stages' }, ...CANDIDATE_STAGES.map(s => ({ value: s, label: s }))];
  const sourceOptions = [{ value: 'All', label: 'All sources' }, ...CANDIDATE_SOURCES.map(s => ({ value: s, label: s }))];

  return (
    <>
      {view?.type === 'edit' && current && (
        <CandidateForm candidate={current} user={user} jobRoleSuggestions={jobRoleSuggestions}
          onSubmit={handleUpdate} onCancel={() => setView(null)} />
      )}

      {view?.type === 'detail' && current && (
        <CandidateDetail candidate={current}
          onBack={() => setView(null)}
          onEdit={() => setView({ type: 'edit', id: current.id })}
          onMoveStage={(c) => { setMoveTarget(c); setMoveStage(c.stage); }}
          onDelete={(c) => setDeleteConfirm(c)} />
      )}

      {!view && (
        <div className="card">
          <div className="card-head">
            <h3>All candidates</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Dropdown className="filter-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)} options={stageOptions} />
              <div style={{ position: 'relative' }}>
                <Search width={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-soft)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                  style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px 7px 32px', background: 'transparent', fontSize: 13, width: 180, outline: 'none', transition: 'border-color .2s' }} />
              </div>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
            <div className="filter-bar">
              <Dropdown className="filter-select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} options={sourceOptions} />
              <Dropdown className="filter-select" value={jobFilter} onChange={e => setJobFilter(e.target.value)} options={jobOptions} />
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} aria-label="Filter by date"
                style={{ border: '1.5px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', background: 'transparent', color: 'var(--ink)', fontSize: 12, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s' }} />
              <Dropdown className="filter-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)} options={stageOptions} />
              <span className="sub" style={{ marginLeft: 'auto' }}>{leadsLoading && candidates.length === 0 ? '…' : filtered.length + ' candidates'}</span>
            </div>
          </div>
          {leadsLoading && candidates.length === 0 ? (
            <div style={{ overflowX: 'auto' }}><table><tbody>{[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} cols={6}/>)}</tbody></table></div>
          ) : filtered.length === 0 ? (
            <div className="empty">No candidates match.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th><th>Phone</th><th>Stage</th><th>Source</th><th>Next Interview</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => {
                    const nextIv = dateFilter ? getInterviewOnDate(c, dateFilter) : (getNextInterview(c) || getLatestInterview(c));
                    return (
                      <tr key={c.id}>
                        <td><Who name={c.name} role={c.role} /></td>
                        <td style={{ color: 'var(--ink-soft)' }}>{c.phone}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{c.stage}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{c.source}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                          {nextIv ? (
                            <>
                              <div style={{ fontWeight: 500 }}>{nextIv.date ? fmtInterviewDate(nextIv.date) : 'Not scheduled'}</div>
                              {nextIv.startTime && nextIv.endTime && (
                                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtInterviewTime(nextIv.startTime)}–{fmtInterviewTime(nextIv.endTime)} · {nextIv.round || ''}</div>
                              )}
                              {nextIv.interviewer && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{nextIv.interviewer}</div>}
                            </>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>Not scheduled</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-icon btn-sm" title="Schedule / Edit Interview"
                              onClick={() => {
                                setFormInitial({
                                  candidateId: c.id,
                                  jobRole: c.role && c.role !== '—' ? c.role : '',
                                  round: '', interviewer: '', date: '', startTime: '', endTime: '',
                                  mode: 'Online', link: '', location: '', notes: '', reminder: 'none',
                                });
                                setFormMode('schedule');
                              }}>
                              <Pencil width={14} />
                            </button>
                            {nextIv && (
                              <button type="button" className="btn btn-icon btn-sm" title="View Interview" onClick={() => setIvDetail(nextIv)}><Eye width={14} /></button>
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
          {!leadsLoading && filtered.length > 0 && totalPages > 1 && (
            <div className="pagination">
              <div className="pagination-left">
                <button className="btn btn-sm btn-primary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
              </div>
              <div className="pagination-center">Page {safePage} of {totalPages}</div>
              <div className="pagination-right">
                <div className="pagination-dots">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <span key={p} className={`dot ${p === safePage ? 'dot-active' : ''}`} onClick={() => setPage(p)} />
                  ))}
                </div>
                <button className="btn btn-sm btn-primary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {formInitial && (
        <ScheduleForm title={formMode === 'edit' ? 'Edit interview' : 'Schedule interview'}
          editing={formMode === 'edit'} initial={formInitial} candidates={candidates}
          candidateOptions={ivCandidateOptions} jobOptions={ivJobOptions} interviews={interviews} saving={busy}
          onSave={handleFormSave} onClose={() => setFormInitial(null)} />
      )}

      {ivDetail && (
        <DetailView iv={ivDetail}
          onEdit={() => { const iv = ivDetail; setIvDetail(null); setFormInitial(ivToForm(iv)); setFormMode('edit'); }}
          onConfirm={() => handleSetStatus(ivDetail, 'Confirmed')}
          onNoShow={() => handleSetStatus(ivDetail, 'No Show')}
          onComplete={() => { const iv = ivDetail; setIvDetail(null); setIvComplete(iv); }}
          onCancel={() => { const iv = ivDetail; setIvDetail(null); setIvCancel(iv); }}
          onClose={() => setIvDetail(null)} />
      )}
      {ivComplete && <CompleteForm iv={ivComplete} saving={busy} onSave={handleIvComplete} onClose={() => setIvComplete(null)} />}
      {ivCancel && <CancelForm iv={ivCancel} saving={busy} onSave={handleIvCancel} onClose={() => setIvCancel(null)} />}

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1200, display: 'flex', alignItems: 'center', gap: 10, color: '#166534' }}>
          <span>{toastMsg}</span>
          <button className="btn btn-sm" onClick={() => setToastMsg('')} style={{ padding: '2px 6px', lineHeight: 1, color: '#166534' }}><X width={12}/></button>
        </div>
      )}
      {toastErr && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1200, display: 'flex', alignItems: 'center', gap: 10, color: '#B5603A' }}>
          <span>{toastErr}</span>
          <button className="btn btn-sm" onClick={() => setToastErr('')} style={{ padding: '2px 6px', lineHeight: 1, color: '#B5603A' }}><X width={12}/></button>
        </div>
      )}

      {deleteMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{deleteMsg}</span>
          <button className="btn btn-sm" onClick={() => setDeleteMsg('')} style={{ padding: '2px 6px', lineHeight: 1 }}><X width={12}/></button>
        </div>
      )}

      {successMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '10px 20px', fontSize: 14, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, color: '#166534' }}>
          <span>{successMsg}</span>
          <button className="btn btn-sm" onClick={() => setSuccessMsg('')} style={{ padding: '2px 6px', lineHeight: 1, color: '#166534' }}><X width={12}/></button>
        </div>
      )}

      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#FFFFFF', width: '100%', maxWidth: '400px',
            borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '28px 28px 20px', textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Trash width={22} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                Delete Candidate?
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#6B7280', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong style={{ color: '#111827' }}>"{deleteConfirm.name}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                cursor: 'pointer', flex: 1
              }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#EF4444', color: '#FFFFFF', border: 'none',
                cursor: 'pointer', flex: 1
              }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div onClick={() => setMoveTarget(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#FFFFFF', width: '100%', maxWidth: '420px',
            borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '24px 28px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                Move stage
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#6B7280', lineHeight: 1.5 }}>
                Move <strong style={{ color: '#111827' }}>"{moveTarget.name}"</strong> to a new recruitment stage.
              </p>
              <Dropdown value={moveStage} onChange={e => setMoveStage(e.target.value)}
                options={CANDIDATE_STAGES.map(s => ({ value: s, label: s }))} />
            </div>
            <div style={{ padding: '8px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setMoveTarget(null)} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                cursor: 'pointer', flex: 1
              }}>Cancel</button>
              <button onClick={handleMoveStage} disabled={moving || !moveStage || moveStage === moveTarget.stage} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#5B6B4E', color: '#FFFFFF', border: 'none',
                cursor: 'pointer', flex: 1
              }}>{moving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
