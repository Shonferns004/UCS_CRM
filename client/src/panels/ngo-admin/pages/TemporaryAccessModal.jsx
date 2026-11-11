import { useEffect, useMemo, useState } from 'react';
import { X, Clock, CheckCircle2, ShieldCheck, User, MapPin, CalendarClock } from 'lucide-react';
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

  const R = 68, CX = 80, CY = 80;
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
  const hx = CX + R * 0.52 * Math.cos(hourAngle);
  const hy = CY + R * 0.52 * Math.sin(hourAngle);
  const minuteAngle = (p.minute * 6 - 90) * (Math.PI / 180);
  const mx = CX + R * 0.74 * Math.cos(minuteAngle);
  const my = CY + R * 0.74 * Math.sin(minuteAngle);

  const hourNumbers = Array.from({ length: 12 }, (_, i) => {
    const num = i === 0 ? 12 : i;
    const a = (i * 30 - 90) * (Math.PI / 180);
    return { num, x: CX + R * 0.78 * Math.cos(a), y: CY + R * 0.78 * Math.sin(a) };
  });

  const modeBtn = (active) => ({
    padding: '4px 10px', border: 'none', borderRadius: 5, fontFamily: 'inherit',
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : '#475569',
  });

  return (
    <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, background: '#fff', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {String(p.hour12).padStart(2, '0')}:{String(p.minute).padStart(2, '0')} {p.period}
        </span>
      </div>

      <input type="date" style={{ ...inputStyle, padding: '6px 8px' }} value={p.date} onChange={e => set({ date: e.target.value })} />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={160} height={160} viewBox="0 0 160 160"
          style={{ cursor: 'pointer', borderRadius: '50%', background: '#f8fafc', border: '1px solid #eef2f7' }}
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
            return <circle key={i} cx={CX + R * 0.93 * Math.cos(a)} cy={CY + R * 0.93 * Math.sin(a)} r={1.4} fill="#d1d5db" />;
          })}
          <line x1={CX} y1={CY} x2={hx} y2={hy} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" opacity={mode === 'hour' ? 1 : 0.25} />
          <line x1={CX} y1={CY} x2={mx} y2={my} stroke="#2563eb" strokeWidth={2} strokeLinecap="round" opacity={mode === 'minute' ? 1 : 0.25} />
        </svg>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'inline-flex', padding: 2, borderRadius: 7, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
          <button type="button" onClick={() => setMode('hour')} style={modeBtn(mode === 'hour')}>Hour</button>
          <button type="button" onClick={() => setMode('minute')} style={modeBtn(mode === 'minute')}>Min</button>
        </div>
        <select value={p.period} onChange={e => set({ period: e.target.value })}
          style={{ ...inputStyle, width: 72, padding: '5px 7px', fontWeight: 700, fontSize: 11 }} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div style={{ fontSize: 10, color: 'var(--ink-soft)', textAlign: 'center' }}>
        {mode === 'hour' ? 'Tap a number to set the hour' : 'Tap the clock face to set minutes'}
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
  const [allowedCount, setAllowedCount] = useState('');
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
        allowed_count: (scopeType === 'STATION_HIGH_TIER' && allowedCount !== '') ? Number(allowedCount) : null,
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
    // Readable IST timestamp ("11 Nov 2026, 7:00 pm") instead of the browser's
    // default "11/11/2026, 7:00:00 pm" that was hard to scan.
    const expiresLabel = a.expires_at
      ? new Date(a.expires_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      : '—';
    const detailRows = [
      { Icon: User, label: 'Temporary FRO', value: selectedFro?.name || '—' },
      { Icon: MapPin, label: 'Station', value: target.station },
      { Icon: CalendarClock, label: 'Valid until', value: expiresLabel === '—' ? '—' : `${expiresLabel} IST` },
    ];

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 460, width: '94%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 14 }}
        >
          <div className="modal-head" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={18} />
              </span>
              <h3 style={{ margin: 0 }}>{extended ? 'Access extended' : 'Temporary access granted'}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Summary */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px' }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#d1fae5', color: '#047857', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#065f46', lineHeight: 1.5 }}>
                <b>{selectedFro?.name || 'The FRO'}</b> can now work on <b>{target.station}</b> donors.
                <div style={{ fontSize: 11.5, marginTop: 2, color: '#047857' }}>
                  {extended ? 'Existing grant extended — no new grant was created.' : 'Temporary access is active.'}
                </div>
              </div>
              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: '#d1fae5', color: '#047857', border: '1px solid #6ee7b7', marginTop: 2 }}>
                Active
              </span>
            </div>

            {/* Grant details */}
            <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', background: '#f8fafc', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                Grant details
              </div>
              {detailRows.map(({ Icon, label, value }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${i === 0 ? 'var(--line, #e5e7eb)' : '#f1f5f9'}` }}>
                  <span style={{ display: 'inline-flex', color: 'var(--ink-soft)' }}><Icon size={14} /></span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 96 }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginLeft: 'auto', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Ownership note */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '11px 12px' }}>
              <ShieldCheck size={16} style={{ color: '#475569', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.55 }}>
                <b>Ownership unchanged.</b> {target.permanentFroName || 'The permanent FRO'} remains the permanent FRO of {target.station}. Donor records, receipts and history were not moved or copied.
              </div>
            </div>

            {revokedList.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '11px 12px', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                <Clock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  Revoked in the same step: <b>{revokedList.map(g => g.working_fro_name || 'FRO').join(', ')}</b>.
                  They lose {target.station} on their next request; completed work stays untouched.
                </div>
              </div>
            )}

            {revokeFailures.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '11px 12px', fontSize: 12, color: '#991b1b', lineHeight: 1.5 }}>
                Could not auto-revoke: <b>{revokeFailures.map(f => f.name).join(', ')}</b> — revoke them from the station row's ✕ button or the Temporary Access page.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '13px 20px', borderTop: '1px solid var(--line, #e5e7eb)', background: '#fff' }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="modal-head" style={{ padding: '16px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>Grant temporary access</h3>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                Give another FRO this station — ownership stays with the permanent FRO.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', boxShadow: 'none', background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* ── Working FRO picker ── */}
          <div>
            <label style={labelStyle}>Working FRO</label>
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
          {scopeType === 'STATION_HIGH_TIER' && (
            <div>
              <label style={labelStyle}>Slice size (optional — leave blank for all high-tier rows on this station)</label>
              <input
                type="number"
                min="1"
                value={allowedCount}
                onChange={e => setAllowedCount(e.target.value)}
                placeholder="e.g. 70"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line, #e5e7eb)', fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                Auto-offset: slices are assigned in order (first grant takes rows 1–N, next grant N+1–…). Max = available high-tier rows on this station.
              </div>
            </div>
          )}
          {/* Duration — the two clocks sit in equal cards so the dates, dials
              and time controls line up instead of floating at different heights. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Duration
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {!isExtendMode && <Time12Control label="Starts" value={startsLocal} onChange={setStartsLocal} />}
              <Time12Control label={isExtendMode ? 'New expiry (required)' : 'Expires (required)'} value={expiresLocal} onChange={setExpiresLocal} />
            </div>
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

        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--line, #e5e7eb)', background: '#fff', flexShrink: 0 }}>
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