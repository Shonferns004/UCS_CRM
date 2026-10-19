import { useEffect, useMemo, useState } from 'react';
import { X, Clock } from 'lucide-react';
import { validateTemporaryAccess, createTemporaryAccess, extendTemporaryAccess, revokeTemporaryAccess, listTemporaryAccessFroCandidates } from '../api/auth';

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

// ── 12-hour clock controls ────────────────────────────────────────────────────
// The canonical state stays a datetime-local string ("YYYY-MM-DDTHH:MM",
// 24-hour), so validation, defaults and toIso() above are untouched — only the
// WIDGET changed, because the browser's native datetime picker renders as a
// 24-hour clock in most locales. These two helpers convert between the stored
// value and the visible 12-hour parts.
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

const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' };
const inputStyle = { width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, fontFamily: 'inherit', background: '#fff' };

function Time12Control({ label, value, onChange }) {
  const p = splitLocal(value);
  const set = (patch) => onChange(joinLocal({ ...p, ...patch }));
  const selStyle = { ...inputStyle, width: 'auto', padding: '7px 4px', textAlign: 'center', cursor: 'pointer' };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <Clock size={14} style={{ color: 'var(--ink-soft)', flex: '0 0 auto', marginRight: 1 }} />
        <input
          type="date"
          style={{ ...inputStyle, flex: '1 1 auto', minWidth: 0 }}
          value={p.date}
          onChange={e => set({ date: e.target.value })}
        />
        <select style={{ ...selStyle, flex: '0 0 54px' }} value={p.hour12} onChange={e => set({ hour12: Number(e.target.value) })} aria-label="Hour">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)', marginLeft: -2, marginRight: -2 }}>:</span>
        <select style={{ ...selStyle, flex: '0 0 58px' }} value={String(p.minute).padStart(2, '0')} onChange={e => set({ minute: Number(e.target.value) })} aria-label="Minute">
          {Array.from({ length: 60 }, (_, i) => i).map(m => (
            <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
        <select style={{ ...selStyle, flex: '0 0 60px', fontWeight: 700 }} value={p.period} onChange={e => set({ period: e.target.value })} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

// Window times as the admin reads them (IST reporting day, minute precision).
function fmtWindow(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TemporaryAccessModal({ target, existingGrants = [], onClose, onGranted }) {
  const [froId, setFroId] = useState('');
  const [froSearch, setFroSearch] = useState('');
  // Candidate FROs, fetched fresh on every open from the dedicated endpoint —
  // so an FRO created after the Stations page loaded still appears. Grants are
  // keyed on workers.id; no CRM-agent setup is required. null = still loading.
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

  // Fresh on every open: an FRO created after the Stations page loaded still
  // appears, and revoked/terminated workers drop out without a page reload.
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

  // Freeze the page behind the modal — the NGO-admin modal CSS has no overlay
  // scroll lock of its own, so without this the stations list keeps scrolling
  // under the dialog.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const eligibleFros = useMemo(
    () => (candidates || []).filter(w => {
      const dept = String(w.department || '').toLowerCase().trim();
      const deptOk = dept === 'fro' || dept === 'telecaller' || dept === ''; // dept '' when the list endpoint omits it
      const activeOk = w.is_active !== false && w.employment_status !== 'terminated';
      const notPermanent = w.id !== target.permanentFroId; // already owns it — no grant needed
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

  // Live pre-check: duplicate grant for this FRO+station, or another FRO
  // already on this station (overlap warning). Debounced by onBlur of picker
  // rather than on every keystroke.
  async function checkConflicts(workerId) {
    if (!workerId) { setWarnings(null); return; }
    try {
      const w = await validateTemporaryAccess({ station: target.station, working_fro_worker_id: workerId, ngo_id: target.ngoId });
      setWarnings(w);
      setHasHighTier(!!w?.has_high_tier);
      // Reset scope if station doesn't have high-tier data.
      if (!w?.has_high_tier) setScopeType('STATION_ALL');
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
          reason: (reasonCode === 'OTHER' && reasonNote.trim()) || `Extended from grant modal (was ${selectedLiveGrant.expires_at})`,
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
        scope_type: scopeType,
        reason_code: reasonCode,
        reason_note: reasonCode === 'OTHER' ? reasonNote.trim() || null : null,
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
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3><Clock size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Grant temporary access</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Station summary (read-only) ── */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '6px 12px' }}>
              <div><span style={{ color: 'var(--ink-soft)' }}>Station:</span> <b>{target.station}</b></div>
              <div><span style={{ color: 'var(--ink-soft)' }}>Donors:</span> <b>{Number(target.donorCount || 0).toLocaleString('en-IN')}</b></div>
              <div><span style={{ color: 'var(--ink-soft)' }}>Scope:</span> <b>Entire station</b></div>
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
                  {candidates === null && (
                    <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>
                      Loading FROs…
                    </div>
                  )}
                  {candidates !== null && candidatesError && (
                    <div style={{ padding: 10, fontSize: 11.5, color: '#991b1b', textAlign: 'center' }}>
                      Couldn&apos;t load the FRO list — close and reopen to retry.
                    </div>
                  )}
                  {candidates !== null && !candidatesError && filteredFros.map(w => (
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
                  {candidates !== null && !candidatesError && filteredFros.length === 0 && (
                    <div style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center' }}>
                      No eligible FROs match — workers must be active, non-test FROs of your NGO(s); terminated workers and the permanent FRO are excluded
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

          {/* ── Scope (tier-aware) ── */}
          {hasHighTier && (
            <div>
              <label style={labelStyle}>Access scope</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { value: 'STATION_ALL', label: 'Full station (all donors)', desc: 'Grants access to every donor on this station. Only one grant allowed per station.' },
                  { value: 'STATION_HIGH_TIER', label: 'High-tier donors only', desc: 'Only high-tier leads. Can coexist with a normal-only grant.' },
                  { value: 'STATION_NORMAL', label: 'Normal donors only', desc: 'Only normal (non-high-tier) leads. Can coexist with a high-tier grant.' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: scopeType === opt.value ? '#eff6ff' : '#fff', border: `1px solid ${scopeType === opt.value ? '#93c5fd' : 'var(--line, #e5e7eb)'}`, borderRadius: 6, padding: '9px 11px', cursor: 'pointer' }}>
                    <input type="radio" name="tac-scope" checked={scopeType === opt.value} onChange={() => setScopeType(opt.value)} style={{ marginTop: 2, accentColor: '#2563eb' }} />
                    <span>
                      <b>{opt.label}</b>
                      <br />
                      <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!hasHighTier && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', background: '#f8fafc', border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, padding: '8px 10px' }}>
              <b>Scope:</b> Entire station (all donors) — this station has no high-tier data.
            </div>
          )}

          {/* ── Duration (mandatory expiry) — 12-hour clock, side by side ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
            {!isExtendMode && <Time12Control label="Starts" value={startsLocal} onChange={setStartsLocal} />}
            <Time12Control label={isExtendMode ? 'New expiry (required)' : 'Expires (required)'} value={expiresLocal} onChange={setExpiresLocal} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -8 }}>
            There is no indefinite access — access always ends at the expiry shown above.
          </div>
          {windowError && startsLocal && expiresLocal && (
            <div style={{ fontSize: 12.5, color: '#991b1b' }}>{windowError}</div>
          )}

          {/* ── Reason ── */}
          <div>
            <label style={labelStyle}>Reason</label>
            <select style={inputStyle} value={reasonCode} onChange={e => { setReasonCode(e.target.value); if (e.target.value !== 'OTHER') setReasonNote(''); }}>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {reasonCode === 'OTHER' && (
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                placeholder="Explain why access is needed (required)…"
                value={reasonNote}
                onChange={e => setReasonNote(e.target.value)}
              />
            )}
          </div>

          {/* ── Radio-style confirmation ── */}
          <div>
            <label style={labelStyle}>Confirm</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: confirmed ? '#eff6ff' : '#fff', border: `1px solid ${confirmed ? '#93c5fd' : 'var(--line, #e5e7eb)'}`, borderRadius: 6, padding: '9px 11px', cursor: 'pointer', transition: 'border-color .15s, background .15s' }}>
                <input type="radio" name="tac-confirm" checked={confirmed} onChange={() => setConfirmed(true)} style={{ marginTop: 2, accentColor: '#2563eb' }} />
                <span>
                  I confirm — <b>{selectedFro?.name || 'the selected FRO'}</b>{' '}
                  {isExtendMode
                    ? <>gets their grant on <b>{target.station}</b> extended until <b>{fmtWindow(expiryIso)}</b>.</>
                    : <>gets temporary access to <b>{target.station}</b> from <b>{fmtWindow(startIso)}</b> until <b>{fmtWindow(expiryIso)}</b>.</>}
                  {alsoRevoke && otherLiveGrants.length > 0 && (
                    <> Access of <b>{otherLiveGrants.map(g => g.working_fro_name || 'FRO').join(', ')}</b> will be revoked in the same step.</>
                  )}
                </span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: !confirmed ? '#f8fafc' : '#fff', border: `1px solid ${!confirmed ? 'var(--line, #e5e7eb)' : '#93c5fd'}`, borderRadius: 6, padding: '9px 11px', cursor: 'pointer' }}>
                <input type="radio" name="tac-confirm" checked={!confirmed} onChange={() => setConfirmed(false)} style={{ marginTop: 2, accentColor: '#2563eb' }} />
                <span style={{ color: 'var(--ink-soft)' }}>Not yet — I&apos;ll keep editing</span>
              </label>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--line, #e5e7eb)' }}>
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
