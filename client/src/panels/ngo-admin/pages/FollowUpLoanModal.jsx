import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  createFollowUpLoan,
  previewFollowUpLoan,
  listFollowUpLoanFroCandidates,
} from '../api/auth';
import Time12Control from '../components/Time12Control';

// ─── Lend follow-ups / callbacks (station → station) ─────────────────────────
// A loan only grants a time-boxed visibility window. No donor row, station or
// owner is moved, so the permanent FRO and the donor's history stay untouched.

const SCOPES = [
  { value: 'BOTH', label: 'Follow-ups + promises + callbacks' },
  { value: 'FOLLOW_UP', label: 'Follow-ups + promises' },
  { value: 'CALLBACK', label: 'Callbacks only' },
];

const SELECTIONS = [
  { value: 'ALL_OPEN', label: 'All open (incl. overdue)' },
  { value: 'UPCOMING_ONLY', label: 'Upcoming only (skip overdue)' },
  { value: 'OVERDUE_ONLY', label: 'Overdue only' },
  { value: 'FIXED_COUNT', label: 'Fixed count' },
];

const labelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em',
};
const inputStyle = {
  width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 6, fontFamily: 'inherit', background: '#fff',
};

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
function toIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function defaultStart() { return toLocalInputValue(new Date()); }
function defaultExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + 10);
  return toLocalInputValue(d);
}
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function FollowUpLoanModal({ source, stations = [], onClose, onCreated }) {
  const [targetStation, setTargetStation] = useState('');
  const [scope, setScope] = useState('BOTH');
  const [selection, setSelection] = useState('ALL_OPEN');
  const [count, setCount] = useState('');
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [froId, setFroId] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let alive = true;
    listFollowUpLoanFroCandidates(source.ngoId)
      .then(rows => { if (alive) setCandidates(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setCandidates([]); });
    return () => { alive = false; };
  }, [source.ngoId]);

  const targetOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of stations || []) {
      const name = String(s?.station || '').trim();
      if (!name || name === source.station) continue;
      const belongs = (s.ngos || []).some(n => String(n.ngo_id) === String(source.ngoId));
      if (!belongs || seen.has(name)) continue;
      seen.add(name);
      out.push({ station: name, ownerId: s.fro_worker_id || null });
    }
    return out.sort((a, b) => a.station.localeCompare(b.station));
  }, [stations, source.station, source.ngoId]);

  const activeFros = useMemo(() => (candidates || []).filter(w => {
    const dept = String(w.department || '').toLowerCase().trim();
    return (dept === 'fro' || dept === 'telecaller' || dept === '')
      && w.is_active !== false
      && w.employment_status !== 'terminated';
  }), [candidates]);

  const selectedTarget = targetOptions.find(t => t.station === targetStation) || null;

  useEffect(() => {
    if (!selectedTarget) { setFroId(''); return; }
    setFroId(selectedTarget.ownerId || '');
  }, [targetStation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview counts with a small debounce so typing a count does not spam the API.
  useEffect(() => {
    if (!targetStation) { setPreview(null); setPreviewError(null); return; }
    let alive = true;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      previewFollowUpLoan({
        ngo_id: source.ngoId,
        source_station: source.station,
        target_station: targetStation,
        target_fro_worker_id: froId || '',
        scope,
        selection,
        count: selection === 'FIXED_COUNT' ? (count || '') : '',
      })
        .then(p => { if (alive) setPreview(p); })
        .catch(e => { if (alive) { setPreview(null); setPreviewError(e?.message || 'Preview failed'); } })
        .finally(() => { if (alive) setPreviewLoading(false); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [source.ngoId, source.station, targetStation, froId, scope, selection, count]);

  const windowError = (() => {
    if (!startsLocal || !expiresLocal) return 'Start and expiry are both required';
    const startIso = toIso(startsLocal);
    const expiryIso = toIso(expiresLocal);
    if (!startIso || !expiryIso) return 'Invalid date';
    if (new Date(expiryIso) <= new Date(startIso)) return 'Expiry must be after the start time';
    if (new Date(expiryIso).getTime() <= Date.now()) return 'Expiry must be in the future';
    if (new Date(expiryIso).getTime() - new Date(startIso).getTime() > 30 * 24 * 3600000) {
      return 'A loan window cannot exceed 30 days';
    }
    return null;
  })();

  const blockers = (preview?.conflicts || []).filter(c => c.severity !== 'warning');
  const warnings = (preview?.conflicts || []).filter(c => c.severity === 'warning');
  const selectedCount = preview?.selected_count || 0;
  const canSubmit = !!targetStation && !!froId && !windowError && !blockers.length
    && selectedCount > 0 && !submitting;

  async function submit() {
    setError(null);
    if (!targetStation) return setError('Select a target station');
    if (!froId) return setError('Select the FRO who will receive the leads');
    if (windowError) return setError(windowError);
    if (!selectedCount) return setError('No open follow-up, promise or callback leads match this selection');

    setSubmitting(true);
    try {
      const payload = await createFollowUpLoan({
        ngo_id: source.ngoId,
        source_station: source.station,
        target_station: targetStation,
        target_fro_worker_id: froId,
        scope,
        selection,
        count: selection === 'FIXED_COUNT' ? Number(count) : null,
        starts_at: toIso(startsLocal),
        expires_at: toIso(expiresLocal),
        reason_code: 'WORKLOAD_SUPPORT',
        reason_note: null,
      });
      setResult(payload);
      onCreated?.(payload);
    } catch (e) {
      setError(e?.message || 'Could not create the loan');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const loan = result.loan || {};
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-head">
            <h3><CheckCircle2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Leads lent</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px', color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 10px' }}>
              <b>{result.lent}</b> follow-up / promise / callback lead(s) from <b>{source.station}</b> are now with{' '}
              <b>{targetStation}</b> until <b>{fmt(loan.expires_at)} IST</b>.
            </p>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              Ownership did not change: {source.permanentFroName || 'the source FRO'} still owns these leads.
              Calls made during the window are credited to the receiving FRO.
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3><ArrowRightLeft size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Lend follow-ups / promises / callbacks</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg, #f8fafc)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Source station</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{source.station}</div>
            {source.ngoName && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#4338ca', background: '#e0e7ff', padding: '1px 7px', borderRadius: 999 }}>
                {source.ngoName}
              </span>
            )}
            {source.permanentFroName && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginLeft: 'auto' }}>
                Owner: {source.permanentFroName}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>What to lend</label>
              <select style={inputStyle} value={scope} onChange={e => setScope(e.target.value)}>
                {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Selection</label>
              <select style={inputStyle} value={selection} onChange={e => setSelection(e.target.value)}>
                {SELECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {selection === 'FIXED_COUNT' && (
            <div>
              <label style={labelStyle}>Number of leads</label>
              <input
                type="number" min="1" max="5000" style={inputStyle}
                value={count} onChange={e => setCount(e.target.value)}
                placeholder="e.g. 60"
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Target station</label>
              <select style={inputStyle} value={targetStation} onChange={e => setTargetStation(e.target.value)}>
                <option value="">Select a station…</option>
                {targetOptions.map(t => <option key={t.station} value={t.station}>{t.station}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Receiving FRO</label>
              <select style={inputStyle} value={froId} onChange={e => setFroId(e.target.value)}>
                <option value="">Select an FRO…</option>
                {activeFros.map(w => <option key={w.id} value={w.id}>{w.name}{w.login_id ? ` (${w.login_id})` : ''}</option>)}
              </select>
            </div>
          </div>

          {targetOptions.length === 0 && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              No other station exists under <b>{source.ngoName || 'this NGO'}</b>. Add another station under the same NGO first, then lend again.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Loan window
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <Time12Control label="Starts (required)" value={startsLocal} onChange={setStartsLocal} />
              <Time12Control label="Expires (required)" value={expiresLocal} onChange={setExpiresLocal} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
              Leads are visible to the receiving FRO between these two times, then return to {source.station} automatically.
            </div>
          </div>

          {windowError && startsLocal && expiresLocal && (
            <div style={{ fontSize: 12.5, color: '#991b1b' }}>{windowError}</div>
          )}

          <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: 12, background: 'var(--bg, #f8fafc)' }}>
            {!targetStation && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Select a target station to preview the leads.</div>
            )}
            {targetStation && previewLoading && !preview && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Counting eligible leads…</div>
            )}
            {previewError && (
              <div style={{ fontSize: 12, color: '#991b1b' }}>{previewError}</div>
            )}
            {preview && (
              <>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
                  <span><b style={{ fontSize: 16 }}>{preview.follow_up}</b> follow-ups</span>
                  <span><b style={{ fontSize: 16 }}>{preview.promise}</b> promises</span>
                  <span><b style={{ fontSize: 16 }}>{preview.callback}</b> callbacks</span>
                  <span><b style={{ fontSize: 16 }}>{preview.overdue}</b> overdue</span>
                  <span><b style={{ fontSize: 16 }}>{preview.total}</b> total</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }}>
                    {preview.already_loaned} already on loan
                  </span>
                </div>
                <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--ink-soft)' }}>
                  Matches the station FRO&apos;s lists: follow-ups + promises are the upcoming work, overdue is the past-due set.
                  Overdue leads are included in “All open”.
                </div>
                <div style={{ fontSize: 12, marginTop: 6, color: blockers.length ? '#991b1b' : '#065f46', fontWeight: 600 }}>
                  {selectedCount} lead(s) will be lent for this window
                </div>
                {blockers.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12, color: '#991b1b' }}>
                    <AlertTriangle size={13} /> {c.message}
                  </div>
                ))}
                {warnings.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12, color: '#92400e' }}>
                    <AlertTriangle size={13} /> {c.message}
                  </div>
                ))}
              </>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Lending…' : `Lend ${selectedCount || ''} lead${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
