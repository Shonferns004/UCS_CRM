import { useEffect, useMemo, useState } from 'react';
import { X, Clock } from 'lucide-react';
import { validateTemporaryAccess, createTemporaryAccess, extendTemporaryAccess, revokeTemporaryAccess, listTemporaryAccessFroCandidates } from '../api/auth';

// ─── Grant Temporary Access modal ────────────────────────────────────────────
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

function defaultStart() {
  return toLocalInputValue(new Date());
}

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

const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' };
const inputStyle = { width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, fontFamily: 'inherit', background: '#fff' };

// ── Clock-based time picker (analog clock face) ──
function Time12Control({ label, value, onChange }) {
  const p = splitLocal(value);
  const set = (patch) => onChange(joinLocal({ ...p, ...patch }));
  const [mode, setMode] = useState('hour');

  const R = 80, CX = 90, CY = 90;
  const handleClockClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - CX;
    const y = e.clientY - rect.top - CY;
    const angle = ((Math.atan2(y, x) * (180 / Math.PI)) + 90 + 360) % 360;
    if (mode === 'hour') {
      let h = Math.round(angle / 30); if (h === 0) h = 12;
      set({ hour12: h }); setMode('minute');
    } else {
      let m = Math.round(angle / 6); if (m === 60) m = 0;
      set({ minute: m });
    }
  };

  const hourAngle = ((p.hour12 % 12) * 30 - 90) * (Math.PI / 180);
  const hx = CX + R * 0.5 * Math.cos(hourAngle);
  const hy = CY + R * 0.5 * Math.sin(hourAngle);
  const minuteAngle = (p.minute * 6 - 90) * (Math.PI / 180);
  const mx = CX + R * 0.72 * Math.cos(minuteAngle);
  const my = CY + R * 0.72 * Math.sin(minuteAngle);

  const hourNumbers = Array.from({ length: 12 }, (_, i) => {
    const num = i === 0 ? 12 : i;
    const a = (i * 30 - 90) * (Math.PI / 180);
    return { num, x: CX + R * 0.78 * Math.cos(a), y: CY + R * 0.78 * Math.sin(a) };
  });

  const selStyle = { ...inputStyle, width: 'auto', padding: '4px 6px', textAlign: 'center', cursor: 'pointer' };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input type="date" style={{ ...inputStyle, flex: '1 1 130px', minWidth: 0 }} value={p.date} onChange={e => set({ date: e.target.value })} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <svg width={180} height={180} viewBox="0 0 180 180"
            style={{ cursor: 'pointer', borderRadius: '50%', background: '#f8fafc', border: '1px solid var(--line, #e5e7eb)' }}
            onClick={handleClockClick}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e5e7eb" strokeWidth={1} />
            <circle cx={CX} cy={CY} r={3} fill="#2563eb" />
            {hourNumbers.map(({ num, x, y }) => (
              <text key={num} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11}
                fontWeight={p.hour12 === num ? 700 : 400} fill={p.hour12 === num ? '#2563eb' : '#374151'}>
                {num}
              </text>
            ))}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 - 90) * (Math.PI / 180);
              return <circle key={i} cx={CX + R * 0.9 * Math.cos(a)} cy={CY + R * 0.9 * Math.sin(a)} r={1.5} fill="#d1d5db" />;
            })}
            <line x1={CX} y1={CY} x2={hx} y2={hy} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" opacity={mode === 'hour' ? 1 : 0.3} />
            <line x1={CX} y1={CY} x2={mx} y2={my} stroke="#2563eb" strokeWidth={2} strokeLinecap="round" opacity={mode === 'minute' ? 1 : 0.3} />
          </svg>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
            <button type="button" onClick={() => setMode('hour')} style={{ padding: '2px 6px', fontSize: 10, fontWeight: mode === 'hour' ? 700 : 400, border: '1px solid var(--line, #e5e7eb)', borderRadius: 4, background: mode === 'hour' ? '#eff6ff' : '#fff', cursor: 'pointer', color: mode === 'hour' ? '#2563eb' : 'var(--ink-soft)' }}>Hr</button>
            <button type="button" onClick={() => setMode('minute')} style={{ padding: '2px 6px', fontSize: 10, fontWeight: mode === 'minute' ? 700 : 400, border: '1px solid var(--line, #e5e7eb)', borderRadius: 4, background: mode === 'minute' ? '#eff6ff' : '#fff', cursor: 'pointer', color: mode === 'minute' ? '#2563eb' : 'var(--ink-soft)' }}>Min</button>
            <span style={{ fontWeight: 700, color: '#2563eb', minWidth: 48, textAlign: 'center', fontSize: 12 }}>
              {String(p.hour12).padStart(2, '0')}:{String(p.minute).padStart(2, '0')} {p.period}
            </span>
            <select value={p.period} onChange={e => set({ period: e.target.value })} style={{ ...selStyle, flex: '0 0 56px', fontWeight: 700, fontSize: 11 }} aria-label="AM or PM">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
            {mode === 'hour' ? 'Click a number to set hour' : 'Click on clock to set minutes'}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtWindow(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

  // Check high-tier status on mount.
  useEffect(() => {
    let alive = true;
    validateTemporaryAccess({ station: target.station, ngo_id: target.ngoId })
      .then(w => { if (alive) setHasHighTier(!!w?.has_high_tier); })
      .catch(() => {});
    return () => { alive = false; };
  }, [target.station, target.ngoId]);

  // Freeze body scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fresh candidates on every open.
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
      const otherScopes = (w?.conflicts || []).map(c => c.scope_type);
      const isTiered = scopeType === 'STATION_HIGH_TIER' || scopeType === 'STATION_NORMAL';
      const hasComplementary = otherScopes.some(s =>
        (scopeType === 'STATION_HIGH_TIER' && s === 'STATION_NORMAL') ||
        (scopeType === 'STATION_NORMAL' && s === 'STATION_HIGH_TIER')
      );
      if (isTiered && hasComplementary) setAlsoRevoke(false);
      else setAlsoRevoke(true);
    } catch {
      setWarnings(null);
    }
  }

  useEffect(() => {
    if (!warnings) return;
    const otherScopes = (warnings.conflicts || []).map(c => c.scope_type);
    const isTiered = scopeType === 'STATION_HIGH_TIER' || scopeType === 'STATION_NORMAL';
    const hasComplementary = otherScopes.some(s =>
      (scopeType === 'STATION_HIGH_TIER' && s === 'STATION_NORMAL') ||
      (scopeType === 'STATION_NORMAL' && s === 'STATION_HIGH_TIER')
    );
    if (isTiered && hasComplementary) setAlsoRevoke(false);
    else setAlsoRevoke(true);
  }, [scopeType, warnings]);

  async function submit() {
    setError(null);
    if (!froId) return setError('Select the FRO who will get temporary access');
    if (windowError) return setError(windowError);
    setSubmitting(true);
    try {
      if (isExtendMode) {
        const payload = await extendTemporaryAccess(selectedLiveGrant.id, {
          expires_at: expiryIso,
          reason: `Extended from grant modal (was ${selectedLiveGrant.expires_at})`,
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
        reason_code: 'STAFF_ABSENCE',
        reason_note: null,
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
        setError('An active temporary grant already exists for this FRO and station. Re-select the FRO to extend their existing grant instead.');
      } else if (body.code === 'SCOPE_CONFLICT') {
        setError(e?.message || body.message || 'Scope conflict — revoke existing grants first.');
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
          {!isExtendMode && otherLiveGrants.length > 0 && !((scopeType === 'STATION_HIGH_TIER' || scopeType === 'STATION_NORMAL') && otherLiveGrants.some(g => (scopeType === 'STATION_HIGH_TIER' && g.scope_type === 'STATION_NORMAL') || (scopeType === 'STATION_NORMAL' && g.scope_type === 'STATION_HIGH_TIER'))) && (
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