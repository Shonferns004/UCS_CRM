import { useEffect, useMemo, useState } from 'react';
import { X, Clock, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Avatar } from '../../../components/ui';
import { validateTemporaryAccess, createTemporaryAccess, extendTemporaryAccess, revokeTemporaryAccess, listTemporaryAccessFroCandidates } from '../api/auth';
import '../temporaryAccess.css';

// Grant Temporary Access modal â€” redesigned, logic unchanged.

const REASONS = [
  { value: 'STAFF_ABSENCE', label: 'Staff absence' },
  { value: 'WORKLOAD_SUPPORT', label: 'Temporary workload support' },
  { value: 'SPECIAL_ASSIGNMENT', label: 'Special assignment' },
  { value: 'OTHER', label: 'Other (explanation required)' },
];

function istOffsetMs() {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  return new Date(utc.getTime() + 5.5 * 3600000) - now;
}

function toLocalInputValue(d) {
  const ist = new Date(d.getTime() + istOffsetMs());
  const p = (n) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}T${p(ist.getHours())}:${p(ist.getMinutes())}`;
}

function defaultStart() { return toLocalInputValue(new Date()); }

function defaultExpiry() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return toLocalInputValue(d);
}

function toIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function splitLocal(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(v || ''));
  if (!m) return { date: '', hour12: 12, minute: 0, period: 'AM' };
  const hh = Number(m[2]);
  return {
    date: m[1],
    hour12: hh % 12 === 0 ? 12 : hh % 12,
    minute: Number(m[3]),
    period: hh >= 12 ? 'PM' : 'AM',
  };
}

function joinLocal({ date, hour12, minute, period }) {
  if (!date) return '';
  let hh = Number(hour12) % 12;
  if (period === 'PM') hh += 12;
  return `${date}T${String(hh).padStart(2, '0')}:${String(Number(minute) || 0).padStart(2, '0')}`;
}

function fmtWindow(iso) {
  if (!iso) return 'â€”';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' };

function Time12Control({ label, value, onChange }) {
  const p = splitLocal(value);
  const set = (patch) => onChange(joinLocal({ ...p, ...patch }));
  const selStyle = { padding: '7px 4px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'center' };
  return (
    <div className="ta-time-control">
      <label className="ta-time-control__label">{label}</label>
      <div className="ta-time-control__row">
        <Clock size={14} style={{ color: 'var(--ink-soft)', flex: '0 0 auto' }} />
        <input type="date" style={{ flex: '1 1 auto', minWidth: 0, padding: '7px 9px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card-bg)' }}
          value={p.date} onChange={e => set({ date: e.target.value })} />
        <select style={{ ...selStyle, flex: '0 0 52px' }} value={p.hour12} onChange={e => set({ hour12: Number(e.target.value) })} aria-label="Hour">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>:</span>
        <select style={{ ...selStyle, flex: '0 0 56px' }} value={String(p.minute).padStart(2, '0')} onChange={e => set({ minute: Number(e.target.value) })} aria-label="Minute">
          {Array.from({ length: 60 }, (_, i) => i).map(m => (
            <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
        <select style={{ ...selStyle, flex: '0 0 58px', fontWeight: 700 }} value={p.period} onChange={e => set({ period: e.target.value })} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

export default function TemporaryAccessModal({ target, existingGrants = [], onClose, onGranted }) {
  const [froId, setFroId] = useState('');
  const [froSearch, setFroSearch] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [candidatesError, setCandidatesError] = useState(false);
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [scopeType, setScopeType] = useState('STATION_ALL');
  const [hasHighTier, setHasHighTier] = useState(false);
  const [reasonCode, setReasonCode] = useState('STAFF_ABSENCE');
  const [reasonNote, setReasonNote] = useState('');
  const [froPickerOpen, setFroPickerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [warnings, setWarnings] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [alsoRevoke, setAlsoRevoke] = useState(true);

  const liveExisting = existingGrants.filter(g => g.computed_status === 'ACTIVE' || g.computed_status === 'SCHEDULED');
  const selectedLiveGrant = liveExisting.find(g => g.working_fro_worker_id === froId) || null;
  const otherLiveGrants = liveExisting.filter(g => g.working_fro_worker_id !== froId);
  const isExtendMode = !!selectedLiveGrant;

  useEffect(() => {
    let alive = true;
    setCandidates(null);
    setCandidatesError(false);
    listTemporaryAccessFroCandidates()
      .then(rows => { if (alive) setCandidates(Array.isArray(rows) ? rows : []); })
      .catch(e => {
        console.error('FRO candidates load failed:', e?.message || e);
        if (alive) { setCandidates([]); setCandidatesError(true); }
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const eligibleFros = useMemo(
    () => (candidates || []).filter(w => {
      const dept = String(w.department || '').toLowerCase().trim();
      const deptOk = dept === 'fro' || dept === 'telecaller' || dept === '';
      const activeOk = w.is_active !== false && w.employment_status !== 'terminated';
      const notPermanent = w.id !== target.permanentFroId;
      return deptOk && activeOk && notPermanent;
    }),
    [candidates, target.permanentFroId],
  );

  const filteredFros = eligibleFros.filter(w =>
    !froSearch
    || String(w.name || '').toLowerCase().includes(froSearch.toLowerCase())
    || String(w.login_id || '').toLowerCase().includes(froSearch.toLowerCase()));

  const selectedFro = eligibleFros.find(w => w.id === froId) || null;

  const startIso = toIso(startsLocal);
  const expiryIso = toIso(expiresLocal);

  const windowError = (() => {
    if (!startsLocal || !expiresLocal) return 'Start and expiry are both required';
    if (!startIso || !expiryIso) return 'Invalid date';
    if (new Date(expiryIso) <= new Date(startIso)) return 'Expiry must be after the start time';
    if (new Date(expiryIso).getTime() <= Date.now()) return 'Expiry must be in the future';
    return null;
  })();

  async function checkConflicts(workerId) {
    if (!workerId) { setWarnings(null); return; }
    try {
      const w = await validateTemporaryAccess({ station: target.station, working_fro_worker_id: workerId, ngo_id: target.ngoId });
      setWarnings(w);
      setHasHighTier(!!w?.has_high_tier);
      if (!w?.has_high_tier) setScopeType('STATION_ALL');
    } catch {
      setWarnings(null);
    }
  }

  async function submit() {
    setError(null);
    if (!froId) return setError('Select the FRO who will get temporary access');
    if (windowError) return setError(windowError);
    if (reasonCode === 'OTHER' && !reasonNote.trim()) return setError('Explain the reason (required for "Other")');
    if (!confirmed) return setError('Confirm the summary before granting');
    setSubmitting(true);
    try {
      if (isExtendMode) {
        const payload = await extendTemporaryAccess(selectedLiveGrant.id, {
          expires_at: expiryIso,
          reason: (reasonCode === 'OTHER' && reasonNote.trim()) || `Extended from grant modal (was ${selectedLiveGrant.expires_at})`,
        });
        setResult({ ...payload, mode: 'extended' });
        onGranted?.(payload);
        return;
      }
      const payload = await createTemporaryAccess({
        ngo_id: target.ngoId,
        station: target.station,
        working_fro_worker_id: froId,
        starts_at: startIso,
        expires_at: expiryIso,
        scope_type: scopeType,
        reason_code: reasonCode,
        reason_note: reasonCode === 'OTHER' ? reasonNote.trim() || null : null,
      });
      let revokeFailures = [];
      if (alsoRevoke && otherLiveGrants.length > 0) {
        for (const g of otherLiveGrants) {
          try {
            await revokeTemporaryAccess(g.id, {
              reason: `Reassigned: temporary access to ${target.station} granted to ${selectedFro?.name || 'another FRO'}`,
            });
          } catch (e) {
            revokeFailures.push({ name: g.working_fro_name || 'FRO', error: e?.message || 'failed' });
          }
        }
      }
      setResult({ ...payload, mode: 'created', revoked: alsoRevoke ? otherLiveGrants : [], revokeFailures });
      onGranted?.(payload);
    } catch (e) {
      const body = e?.data || {};
      if (body.code === 'DUPLICATE_GRANT') {
        setError('An active grant already exists for this FRO and station. Re-select the FRO to extend their existing grant instead.');
      } else {
        setError(e?.message || body.message || 'Failed to create grant');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const a = result.assignment || {};
    const extended = result.mode === 'extended';
    const revokedList = result.revoked || [];
    const revokeFailures = result.revokeFailures || [];
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal ta-modal ta-modal--wide" onClick={e => e.stopPropagation()}>
          <div className="ta-modal-head">
            <h3><Clock size={16} /> {extended ? 'Access extended' : 'Temporary access granted'}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="ta-modal-body">
            <div className="ta-success">
              <div className="ta-success__icon"><CheckCircle2 size={26} /></div>
              <h3 className="ta-success__title">{extended ? 'Extended' : 'Granted'}</h3>
              <p className="ta-success__text">
                {selectedFro?.name || 'The FRO'} may now work on <b>{target.station}</b> donors until{' '}
                <b>{new Date(a.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</b>.
                {extended && ' Their previous expiry was pushed forward â€” no new grant was created.'}
              </p>
            </div>
            {revokedList.length > 0 && (
              <div className="ta-banner ta-banner--warn">
                Revoked in the same step: <b>{revokedList.map(g => g.working_fro_name || 'FRO').join(', ')}</b> â€”
                they lose {target.station} on their next request. Their completed work stays untouched.
              </div>
            )}
            {revokeFailures.length > 0 && (
              <div className="ta-banner ta-banner--danger">
                Could not auto-revoke: <b>{revokeFailures.map(f => f.name).join(', ')}</b> â€”
                revoke them from the station row's âœ• button or the Temporary Access page.
              </div>
            )}
            <div className="ta-summary-card">
              <div className="ta-summary-card__row"><span className="ta-summary-card__label">Ownership unchanged</span><span className="ta-summary-card__value">{target.permanentFroName || 'the permanent FRO'}</span></div>
              <div className="ta-summary-card__row"><span className="ta-summary-card__label">Station</span><span className="ta-summary-card__value">{target.station}</span></div>
            </div>
            {result.conflicts?.length > 0 && !extended && (
              <div className="ta-banner ta-banner--warn">
                Note: {result.conflicts.length} other temporary grant(s) also cover this station.
              </div>
            )}
          </div>
          <div className="ta-modal-foot">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ta-modal ta-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="ta-modal-head">
          <h3><Clock size={16} /> Grant temporary access</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="ta-modal-body">
          <div className="ta-grant">
            {/* Station summary */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Station (read-only)</div>
              <div className="ta-summary-card">
                <div className="ta-summary-card__row"><span className="ta-summary-card__label">Station</span><span className="ta-summary-card__value">{target.station}</span></div>
                <div className="ta-summary-card__row"><span className="ta-summary-card__label">Donors</span><span className="ta-summary-card__value">{Number(target.donorCount || 0).toLocaleString('en-IN')}</span></div>
                <div className="ta-summary-card__row"><span className="ta-summary-card__label">Scope default</span><span className="ta-summary-card__value">Entire station</span></div>
                <div className="ta-summary-card__row"><span className="ta-summary-card__label">Permanent FRO (unchanged)</span><span className="ta-summary-card__value">{target.permanentFroName || 'â€”'}</span></div>
              </div>
            </div>

            {/* Working FRO picker */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Working FRO (temporary)</div>
              {froId ? (
                <div className="ta-fro-selected">
                  <Avatar name={selectedFro?.name || '?'} size={24} />
                  <span>{selectedFro?.name}</span>
                  <span style={{ fontSize: 11.5, opacity: .8 }}>{selectedFro?.login_id || ''}</span>
                  <button onClick={() => { setFroId(''); setFroSearch(''); setWarnings(null); setConfirmed(false); }} aria-label="Clear selection">Ã—</button>
                </div>
              ) : (
                <div className="ta-fro-picker">
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-soft)' }} />
                    <input
                      className="ta-input"
                      style={{ paddingLeft: 30 }}
                      value={froSearch}
                      onChange={e => { setFroSearch(e.target.value); setFroPickerOpen(true); setFroId(''); setWarnings(null); }}
                      onFocus={() => setFroPickerOpen(true)}
                      onBlur={() => { setTimeout(() => setFroPickerOpen(false), 150); if (froId) checkConflicts(froId); }}
                      placeholder="Search FRO by name or login idâ€¦"
                    />
                  </div>
                  {froPickerOpen && (
                    <div className="ta-fro-list">
                      {candidates === null && (
                        <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>Loading FROsâ€¦</div>
                      )}
                      {candidates !== null && candidatesError && (
                        <div style={{ padding: 10, fontSize: 11.5, color: '#991b1b', textAlign: 'center' }}>Couldn't load the FRO list â€” close and reopen to retry.</div>
                      )}
                      {candidates !== null && !candidatesError && filteredFros.map(w => (
                        <div key={w.id} className="ta-fro-item" onMouseDown={() => {
                          setFroId(w.id); setFroSearch(''); setFroPickerOpen(false);
                          setConfirmed(false); checkConflicts(w.id);
                        }}>
                          <div>
                            <div className="ta-fro-item__name">{w.name}</div>
                            <div className="ta-fro-item__meta">{w.login_id || ''}</div>
                          </div>
                          <Avatar name={w.name} size={24} />
                        </div>
                      ))}
                      {candidates !== null && !candidatesError && filteredFros.length === 0 && (
                        <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>
                          No eligible FROs match â€” workers must be active, non-test FROs of your NGO(s); terminated workers and the permanent FRO are excluded
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warnings */}
            {warnings?.duplicate && !isExtendMode && (
              <div className="ta-banner ta-banner--danger">
                This FRO already has an active grant for {target.station} (expires{' '}
                {new Date(warnings.duplicate.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST).
                Saving will extend that grant instead of creating a new one.
              </div>
            )}
            {isExtendMode && (
              <div className="ta-banner ta-banner--info">
                <b>Extending existing grant:</b> {selectedLiveGrant.working_fro_name || 'This FRO'} already has temporary access
                to {target.station} until {new Date(selectedLiveGrant.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST â€”
                saving pushes the expiry to the time below. No new grant is created.
              </div>
            )}
            {warnings?.conflicts?.length > 0 && !isExtendMode && (
              <div className="ta-banner ta-banner--warn">
                <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {warnings.conflicts.length} other FRO(s) already hold temporary access to this station â€” overlapping access can duplicate work.
              </div>
            )}

            {/* Reassignment */}
            {!isExtendMode && otherLiveGrants.length > 0 && (
              <label className="ta-banner ta-banner--warn" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={alsoRevoke} onChange={e => setAlsoRevoke(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  Also revoke the current temporary access of{' '}
                  <b>{otherLiveGrants.map(g => g.working_fro_name || 'FRO').join(', ')}</b> on {target.station} â€”
                  reassigning the station's temporary work to <b>{selectedFro?.name || 'the newly selected FRO'}</b>.
                  <br />
                  <span style={{ fontSize: 11.5, opacity: .8 }}>Completed work (calls, donations, receipts) stays untouched.</span>
                </span>
              </label>
            )}

            {/* Scope */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Access scope</div>
              {hasHighTier ? (
                <div className="ta-scope-options">
                  {[
                    { value: 'STATION_ALL', label: 'Full station (all donors)', desc: 'Grants access to every donor on this station. Only one grant allowed per station.' },
                    { value: 'STATION_HIGH_TIER', label: 'High-tier donors only', desc: 'Only high-tier leads. Can coexist with a normal-only grant.' },
                    { value: 'STATION_NORMAL', label: 'Normal donors only', desc: 'Only normal (non-high-tier) leads. Can coexist with a high-tier grant.' },
                  ].map(opt => (
                    <label key={opt.value} className={`ta-scope-option ${scopeType === opt.value ? 'is-selected' : ''}`}>
                      <input type="radio" name="tac-scope" checked={scopeType === opt.value} onChange={() => setScopeType(opt.value)} />
                      <span>
                        <div className="ta-scope-option__label">{opt.label}</div>
                        <div className="ta-scope-option__desc">{opt.desc}</div>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="ta-banner ta-banner--info" style={{ fontSize: 12 }}>
                  <b>Scope:</b> Entire station (all donors) â€” this station has no high-tier data.
                </div>
              )}
            </div>

            {/* Duration */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Duration (expiry required)</div>
              <div className="ta-time-grid">
                {!isExtendMode && <Time12Control label="Starts" value={startsLocal} onChange={setStartsLocal} />}
                <Time12Control label={isExtendMode ? 'New expiry (required)' : 'Expires (required)'} value={expiresLocal} onChange={setExpiresLocal} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>There is no indefinite access â€” access always ends at the expiry shown above.</div>
              {windowError && startsLocal && expiresLocal && (
                <div style={{ fontSize: 12.5, color: '#991b1b' }}>{windowError}</div>
              )}
            </div>

            {/* Reason */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Reason</div>
              <select className="ta-input" value={reasonCode} onChange={e => { setReasonCode(e.target.value); if (e.target.value !== 'OTHER') setReasonNote(''); }}>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {reasonCode === 'OTHER' && (
                <input className="ta-input" style={{ marginTop: 8 }} placeholder="Explain why access is needed (required)â€¦"
                  value={reasonNote} onChange={e => setReasonNote(e.target.value)} />
              )}
            </div>

            {/* Confirmation */}
            <div className="ta-grant-section">
              <div className="ta-grant-section__title">Confirm</div>
              <label className={`ta-confirm-option ${confirmed ? 'is-selected' : ''}`}>
                <input type="radio" name="tac-confirm" checked={confirmed} onChange={() => setConfirmed(true)} />
                <span>
                  I confirm â€” <b>{selectedFro?.name || 'the selected FRO'}</b>{' '}
                  {isExtendMode
                    ? <>gets their grant on <b>{target.station}</b> extended until <b>{fmtWindow(expiryIso)}</b>.</>
                    : <>gets temporary access to <b>{target.station}</b> from <b>{fmtWindow(startIso)}</b> until <b>{fmtWindow(expiryIso)}</b>.</>}
                  {alsoRevoke && otherLiveGrants.length > 0 && (
                    <> Access of <b>{otherLiveGrants.map(g => g.working_fro_name || 'FRO').join(', ')}</b> will be revoked in the same step.</>
                  )}
                </span>
              </label>
              <label className={`ta-confirm-option ${!confirmed ? 'is-selected' : ''}`}>
                <input type="radio" name="tac-confirm" checked={!confirmed} onChange={() => setConfirmed(false)} />
                <span style={{ color: 'var(--ink-soft)' }}>Not yet â€” I'll keep editing</span>
              </label>
            </div>

            {error && <div className="ta-banner ta-banner--danger">{error}</div>}
          </div>
        </div>

        <div className="ta-modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={submitting || !!windowError} onClick={submit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {submitting ? (isExtendMode ? 'Extendingâ€¦' : 'Grantingâ€¦') : (isExtendMode ? 'Extend access' : 'Grant temporary access')}
          </button>
        </div>
      </div>
    </div>
  );
}
