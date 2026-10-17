import { useMemo, useState } from 'react';
import { X, Clock } from 'lucide-react';
import { validateTemporaryAccess, createTemporaryAccess, extendTemporaryAccess, revokeTemporaryAccess } from '../api/auth';

// ─── Grant Temporary Access modal ────────────────────────────────────────────
// Separate file from StationManagement.jsx (~3,200 lines) on purpose: this is a
// NEW permission flow that must never be entangled with the permanent FRO
// dropdown. Opening this modal does not read, write, or preselect the
// station's permanent assignment — granting access changes WHO MAY WORK on
// the data, never who OWNS it.
//
// The modal is also the reassignment surface: when the station already holds
// a live grant, picking the SAME FRO turns the submit into an EXTEND of that
// grant; picking a DIFFERENT FRO offers to revoke the old grant in the same
// action, so "give this data to another FRO" is one confirmed step instead of
// a revoke-then-grant pair.
//
// v1 scope is whole-station only (locked decision); selected-donor subsets
// arrive later with their child table. Expiry is mandatory — there is no
// "indefinite" option anywhere in this form.

const REASONS = [
  { value: 'STAFF_ABSENCE', label: 'Staff absence' },
  { value: 'WORKLOAD_SUPPORT', label: 'Temporary workload support' },
  { value: 'SPECIAL_ASSIGNMENT', label: 'Special assignment' },
  { value: 'OTHER', label: 'Other (explanation required)' },
];

// The server stores UTC timestamptz; admins think in IST (the CRM's whole
// reporting day is IST-bound). Default the end to today 18:00 IST and show
// the zone explicitly so "6 PM" can never mean something else.
function istOffsetMs() {
  // IST is UTC+5:30 with no DST — computed rather than hard-coded only to
  // keep the arithmetic honest if the runtime TZ differs.
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  return new Date(utc.getTime() + 5.5 * 3600000) - now;
}

function toLocalInputValue(d) {
  const ist = new Date(d.getTime() + istOffsetMs());
  const p = (n) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}T${p(ist.getHours())}:${p(ist.getMinutes())}`;
}

function defaultStart() {
  return toLocalInputValue(new Date());
}

function defaultExpiry() {
  const d = new Date();
  d.setHours(18, 0, 0, 0); // today 18:00 local
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // already past → tomorrow
  return toLocalInputValue(d);
}

// Local input value → ISO for the API.
function toIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function TemporaryAccessModal({ target, froWorkers, existingGrants = [], onClose, onGranted }) {
  const [froId, setFroId] = useState('');
  const [froSearch, setFroSearch] = useState('');
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [reasonCode, setReasonCode] = useState('STAFF_ABSENCE');
  const [reasonNote, setReasonNote] = useState('');
  const [froPickerOpen, setFroPickerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [warnings, setWarnings] = useState(null); // { duplicate, conflicts }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // success payload
  // Reassignment: keep the CURRENT live grants for this station so we can
  // (a) turn a same-FRO pick into an extend, (b) offer revoking the others
  // when a different FRO is picked.
  const [alsoRevoke, setAlsoRevoke] = useState(true);
  const liveExisting = existingGrants.filter(g => g.computed_status === 'ACTIVE' || g.computed_status === 'SCHEDULED');
  const selectedLiveGrant = liveExisting.find(g => g.working_fro_worker_id === froId) || null;
  const otherLiveGrants = liveExisting.filter(g => g.working_fro_worker_id !== froId);
  const isExtendMode = !!selectedLiveGrant;

  const eligibleFros = useMemo(
    () => (froWorkers || []).filter(w => {
      const dept = String(w.department || '').toLowerCase().trim();
      const deptOk = dept === 'fro' || dept === 'telecaller' || dept === ''; // dept '' when the list endpoint omits it
      const activeOk = w.is_active !== false && w.employment_status !== 'terminated';
      const notPermanent = w.id !== target.permanentFroId; // already owns it — no grant needed
      return deptOk && activeOk && notPermanent;
    }),
    [froWorkers, target.permanentFroId],
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

  // Live pre-check: duplicate grant for this FRO+station, or another FRO
  // already on this station (overlap warning). Debounced by onBlur of picker
  // rather than on every keystroke.
  async function checkConflicts(workerId) {
    if (!workerId) { setWarnings(null); return; }
    try {
      const w = await validateTemporaryAccess({ station: target.station, working_fro_worker_id: workerId });
      setWarnings(w);
    } catch {
      setWarnings(null); // pre-check is advisory; server enforces for real
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
      // ── Extend mode: this FRO already holds the live grant → push its expiry
      // instead of stacking a duplicate (the server would 409 anyway).
      if (isExtendMode) {
        const payload = await extendTemporaryAccess(selectedLiveGrant.id, {
          expires_at: expiryIso,
          reason: reasonNote.trim() || `Extended from grant modal (was ${selectedLiveGrant.expires_at})`,
        });
        setResult({ ...payload, mode: 'extended' });
        onGranted?.(payload);
        return;
      }

      // ── Grant mode. Create the new grant FIRST so a validation failure
      // leaves the existing access untouched (never revoke before the new
      // grant is confirmed).
      const payload = await createTemporaryAccess({
        ngo_id: target.ngoId,
        station: target.station,
        working_fro_worker_id: froId,
        starts_at: startIso,
        expires_at: expiryIso,
        scope_type: 'STATION_ALL',
        reason_code: reasonCode,
        reason_note: reasonNote.trim() || null,
      });
      // Reassignment: revoke the OTHER FROs' live grants on this station in
      // the same action ("give this data to another FRO"). Best-effort with
      // visible outcome — a failed revoke is reported, never swallowed.
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
      } else if (body.code === 'TEMP_ACCESS_DISABLED') {
        setError('Temporary Data Access is disabled on this server (TEMP_DATA_ACCESS_ENABLED is off).');
      } else {
        setError(e?.message || body.message || 'Failed to create grant');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' };
  const inputStyle = { width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, fontFamily: 'inherit', background: '#fff' };

  if (result) {
    const a = result.assignment || {};
    const extended = result.mode === 'extended';
    const revokedList = result.revoked || [];
    const revokeFailures = result.revokeFailures || [];
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-head">
            <h3><Clock size={16} style={{ marginRight: 6, verticalAlign: -2 }} />{extended ? 'Access extended' : 'Temporary access granted'}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px', color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 10px' }}>
              {selectedFro?.name || 'The FRO'} may now work on <b>{target.station}</b> donors until{' '}
              <b>{new Date(a.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</b>.
              {extended && ' Their previous expiry was pushed forward — no new grant was created.'}
            </p>
            {revokedList.length > 0 && (
              <p style={{ margin: '0 0 6px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
                Revoked in the same step: <b>{revokedList.map(g => g.working_fro_name || 'FRO').join(', ')}</b> —
                they lose {target.station} on their next request. Their completed work stays untouched.
              </p>
            )}
            {revokeFailures.length > 0 && (
              <p style={{ margin: '6px 0 0', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
                Could not auto-revoke: <b>{revokeFailures.map(f => f.name).join(', ')}</b> —
                revoke them from the station row's ✕ button or the Temporary Access page.
              </p>
            )}
            <p style={{ margin: '10px 0 0' }}>
              <b>Ownership unchanged:</b> {target.permanentFroName || 'the permanent FRO'} remains the permanent FRO of {target.station}.
              Donor records, receipts and history were not moved or copied.
            </p>
            {result.conflicts?.length > 0 && !extended && (
              <p style={{ margin: '6px 0 0', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
                Note: {result.conflicts.length} other temporary grant(s) also cover this station.
              </p>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3><Clock size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Grant temporary access</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Station summary (read-only) ── */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              <div><span style={{ color: 'var(--ink-soft)' }}>Station:</span> <b>{target.station}</b></div>
              <div><span style={{ color: 'var(--ink-soft)' }}>Donors:</span> <b>{Number(target.donorCount || 0).toLocaleString('en-IN')}</b></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--ink-soft)' }}>Permanent FRO (unchanged):</span>{' '}
                <b>{target.permanentFroName || '—'}</b>
              </div>
            </div>
          </div>

          {/* ── Working FRO picker ── */}
          <div>
            <label style={labelStyle}>Working FRO (temporary)</label>
            <div style={{ position: 'relative' }}>
              <input
                style={inputStyle}
                value={froSearch || (selectedFro ? selectedFro.name : '')}
                onChange={e => { setFroSearch(e.target.value); setFroPickerOpen(true); setFroId(''); setWarnings(null); }}
                onFocus={() => setFroPickerOpen(true)}
                onBlur={() => { setTimeout(() => setFroPickerOpen(false), 150); if (froId) checkConflicts(froId); }}
                placeholder="Search FRO by name or login id…"
              />
              {froPickerOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 320, marginTop: 2, maxHeight: 190, overflowY: 'auto' }}>
                  {filteredFros.map(w => (
                    <div
                      key={w.id}
                      onMouseDown={() => {
                        setFroId(w.id); setFroSearch(''); setFroPickerOpen(false);
                        setConfirmed(false); checkConflicts(w.id);
                      }}
                      style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{w.name}</span>
                      <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{w.login_id || ''}</span>
                    </div>
                  ))}
                  {filteredFros.length === 0 && (
                    <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>
                      No eligible FROs match (inactive / terminated workers and the permanent FRO are excluded)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Duplicate / overlap warnings ── */}
          {warnings?.duplicate && !isExtendMode && (
            <div style={{ fontSize: 12.5, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              This FRO already has an active grant for {target.station} (expires{' '}
              {new Date(warnings.duplicate.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST).
              Saving will extend that grant instead of creating a new one.
            </div>
          )}
          {isExtendMode && (
            <div style={{ fontSize: 12.5, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 10px' }}>
              <b>Extending existing grant:</b> {selectedLiveGrant.working_fro_name || 'This FRO'} already has temporary access
              to {target.station} until {new Date(selectedLiveGrant.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST —
              saving pushes the expiry to the time below. No new grant is created.
            </div>
          )}
          {warnings?.conflicts?.length > 0 && !isExtendMode && (
            <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
              {warnings.conflicts.length} other FRO(s) already hold temporary access to this station — overlapping access can duplicate work.
            </div>
          )}

          {/* ── Reassignment: revoke the other FROs' grants in the same step ── */}
          {!isExtendMode && otherLiveGrants.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '9px 11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={alsoRevoke} onChange={e => setAlsoRevoke(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Also revoke the current temporary access of{' '}
                <b>{otherLiveGrants.map(g => g.working_fro_name || 'FRO').join(', ')}</b> on {target.station} —
                reassigning the station's temporary work to <b>{selectedFro?.name || 'the newly selected FRO'}</b>.
                <br />
                <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>Completed work (calls, donations, receipts) stays untouched.</span>
              </span>
            </label>
          )}

          {/* ── Scope (v1 fixed) ── */}
          <div>
            <label style={labelStyle}>Access scope</label>
            <div style={{ fontSize: 13, padding: '8px 10px', background: '#f8fafc', border: '1px solid var(--line, #e5e7eb)', borderRadius: 6 }}>
              <b>Entire station</b> — all {Number(target.donorCount || 0).toLocaleString('en-IN')} donors of {target.station} (this NGO).
              <div style={{ color: 'var(--ink-soft)', fontSize: 11.5, marginTop: 2 }}>Selected-donor subsets are not yet available.</div>
            </div>
          </div>

          {/* ── Duration (mandatory expiry) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isExtendMode ? '1fr' : '1fr 1fr', gap: 10 }}>
            {!isExtendMode && (
              <div>
                <label style={labelStyle}>Starts</label>
                <input type="datetime-local" style={inputStyle} value={startsLocal} onChange={e => setStartsLocal(e.target.value)} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{isExtendMode ? 'New expiry (required)' : 'Expires (required)'}</label>
              <input type="datetime-local" style={inputStyle} value={expiresLocal} onChange={e => setExpiresLocal(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -8 }}>
            Times are shown in <b>IST (Asia/Kolkata)</b> — the CRM's reporting timezone. There is no indefinite access; an expiry must be set.
          </div>
          {windowError && startsLocal && expiresLocal && (
            <div style={{ fontSize: 12.5, color: '#991b1b' }}>{windowError}</div>
          )}

          {/* ── Reason ── */}
          <div>
            <label style={labelStyle}>Reason</label>
            <select style={inputStyle} value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <textarea
              style={{ ...inputStyle, marginTop: 8, minHeight: 54, resize: 'vertical' }}
              placeholder={reasonCode === 'OTHER' ? 'Explanation required…' : 'Optional note…'}
              value={reasonNote}
              onChange={e => setReasonNote(e.target.value)}
            />
          </div>

          {/* ── Confirmation ── */}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '9px 11px', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              {isExtendMode ? (
                <>
                  I confirm: extend <b>{selectedFro?.name || 'this FRO'}'s</b> temporary access to <b>{target.station}</b>{' '}
                  until {expiryIso ? new Date(expiryIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} IST.
                </>
              ) : (
                <>
                  I confirm: <b>{selectedFro?.name || 'the selected FRO'}</b> gets temporary access to <b>{target.station}</b>{' '}
                  {startIso && <>from {new Date(startIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} </>}
                  until {expiryIso ? new Date(expiryIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} IST.
                  {alsoRevoke && otherLiveGrants.length > 0 && (
                    <> Current access of <b>{otherLiveGrants.map(g => g.working_fro_name || 'FRO').join(', ')}</b> will be revoked in the same step.</>
                  )}
                </>
              )}
              <br />
              <b>{target.permanentFroName || 'The permanent FRO'} stays the owner</b> — donor ownership, receipts and history will not change.
            </span>
          </label>

          {error && (
            <div style={{ fontSize: 12.5, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={submitting || !!windowError}
            onClick={submit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {submitting ? (isExtendMode ? 'Extending…' : 'Granting…') : (isExtendMode ? 'Extend access' : 'Grant temporary access')}
          </button>
        </div>
      </div>
    </div>
  );
}
