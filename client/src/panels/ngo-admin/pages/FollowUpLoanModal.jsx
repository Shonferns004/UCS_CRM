import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, AlertTriangle, CheckCircle2, Check, Download } from 'lucide-react';
import {
  createFollowUpLoan,
  previewFollowUpLoan,
  listFollowUpLoanFroCandidates,
} from '../api/auth';
import Time12Control from '../components/Time12Control';
import FroSelect from '../components/FroSelect';
import { exportLoanLeadsXlsx } from '../utils/leadLoanExport';

// ─── Lend follow-ups / callbacks (station → station) ─────────────────────────
// A loan only grants a time-boxed visibility window. No donor row, station or
// owner is moved, so the permanent FRO and the donor's history stay untouched.

// One chip per work category. "Overdue" is a lens over the other three: it
// matches past-due leads from whichever buckets are ticked, so ticking only
// Overdue lends the whole overdue set.
const BUCKET_CHIPS = [
  { key: 'follow_up', label: 'Follow up', countKey: 'follow_up' },
  { key: 'promise', label: 'Promise', countKey: 'promise' },
  { key: 'callback', label: 'Callback', countKey: 'callback' },
  { key: 'overdue', label: 'Overdue', countKey: 'overdue' },
];

const labelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em',
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
  const [buckets, setBuckets] = useState(['follow_up', 'promise', 'callback']);
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [froId, setFroId] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  const activeFros = useMemo(() => (candidates || []).filter(w => {
    const dept = String(w.department || '').toLowerCase().trim();
    return (dept === 'fro' || dept === 'telecaller' || dept === '')
      && w.is_active !== false
      && w.employment_status !== 'terminated';
  }), [candidates]);

  // Every receiving FRO is shown with the station they own — picking the FRO is
  // the only choice the admin makes, and its station becomes the target.
  const froOptions = useMemo(() => {
    return activeFros
      .map(w => {
        const st = (stations || []).find(s =>
          String(s.fro_worker_id) === String(w.id)
          && String(s.station || '').trim()
          && String(s.station).trim() !== source.station
          && (s.ngos || []).some(n => String(n.ngo_id) === String(source.ngoId))
        );
        return { ...w, station: st ? String(st.station).trim() : '' };
      })
      .filter(w => w.station)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [activeFros, stations, source.station, source.ngoId]);

  useEffect(() => {
    const picked = froOptions.find(w => String(w.id) === String(froId));
    if (picked?.station) setTargetStation(picked.station);
    else if (!froId) setTargetStation('');
  }, [froId, froOptions]);

  // Preview runs as soon as the source station is known so every chip can show
  // its own count before the admin picks a receiver. The count is debounced.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      previewFollowUpLoan({
        ngo_id: source.ngoId,
        source_station: source.station,
        target_station: targetStation || '',
        target_fro_worker_id: froId || '',
        scope: 'BOTH',
        buckets: buckets.join(','),
        overdue: includeOverdue ? '1' : '0',
        selection: 'ALL_OPEN',
        count: '',
      })
        .then(p => { if (alive) setPreview(p); })
        .catch(e => { if (alive) { setPreview(null); setPreviewError(e?.message || 'Preview failed'); } })
        .finally(() => { if (alive) setPreviewLoading(false); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [source.ngoId, source.station, targetStation, froId, buckets, includeOverdue]);

  function toggleChip(key) {
    if (key === 'overdue') {
      setIncludeOverdue(v => !v);
      return;
    }
    setBuckets(prev => (prev.includes(key) ? prev.filter(b => b !== key) : [...prev, key]));
  }

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
  const nothingPicked = buckets.length === 0 && !includeOverdue;
  const canSubmit = !!targetStation && !!froId && !windowError && !blockers.length
    && selectedCount > 0 && !submitting;

  const selectedFro = froOptions.find(w => String(w.id) === String(froId)) || null;

  async function downloadExcel() {
    setError(null);
    if (nothingPicked) return setError('Pick what to lend first');
    setExporting(true);
    try {
      const p = await previewFollowUpLoan({
        ngo_id: source.ngoId,
        source_station: source.station,
        target_station: targetStation || '',
        target_fro_worker_id: froId || '',
        scope: 'BOTH',
        buckets: buckets.join(','),
        overdue: includeOverdue ? '1' : '0',
        selection: 'ALL_OPEN',
        count: '',
        include_items: '1',
      });
      const rows = (p.items || []).map(r => ({ ...r, station: source.station }));
      if (rows.length === 0) return setError('Nothing to export for this selection');
      exportLoanLeadsXlsx(rows, `followups-${source.station}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e?.message || 'Could not build the Excel file');
    } finally {
      setExporting(false);
    }
  }

  async function submit() {
    setError(null);
    if (!froId || !targetStation) return setError('Select the receiving FRO');
    if (nothingPicked) return setError('Pick what to lend — follow up, promise, callback or overdue');
    if (windowError) return setError(windowError);
    if (!selectedCount) return setError('No open follow-up, promise or callback leads match this selection');

    setSubmitting(true);
    try {
      const payload = await createFollowUpLoan({
        ngo_id: source.ngoId,
        source_station: source.station,
        target_station: targetStation,
        target_fro_worker_id: froId,
        scope: 'BOTH',
        buckets: buckets.join(','),
        overdue: includeOverdue ? '1' : '0',
        selection: 'ALL_OPEN',
        count: null,
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
    const froName = selectedFro?.name || 'the receiving FRO';
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '94%', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-head" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>Leads lent</h3>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                  The receiving FRO can work these leads until the window ends.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--ink-soft)', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
            ><X size={16} /></button>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #bbf7d0', background: '#ecfdf5', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#047857' }}>Leads lent</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#065f46', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {Number(result.lent || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 10.5, color: '#047857', marginTop: 2 }}>follow-up / promise / callback</div>
              </div>
              <div style={{ border: '1px solid var(--line, #e5e7eb)', background: '#fff', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)' }}>Visible until</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginTop: 4, lineHeight: 1.3 }}>
                  {fmt(loan.expires_at)}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 2 }}>IST · then it returns automatically</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: '10px 12px', background: '#f8fafc', minWidth: 0 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)' }}>From</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800 }}>{source.station}</span>
                  {source.ngoName && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#4338ca', background: '#e0e7ff', padding: '1px 6px', borderRadius: 5 }}>{source.ngoName}</span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 1 }}>Owner: {source.permanentFroName || 'source FRO'}</div>
              </div>
              <ArrowRightLeft size={15} color="#0f766e" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)' }}>To</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{froName}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 1 }}>Station {targetStation}</div>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Ownership did not change — {source.permanentFroName || 'the source FRO'} still owns these leads.
              Calls made during the window are credited to the receiving FRO.
            </div>
          </div>

          <div className="modal-foot" style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line, #e5e7eb)', background: '#fff' }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, width: '94%', height: 'min(780px, calc(100dvh - 40px))', maxHeight: 'calc(100dvh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 16 }}>
        <div className="modal-head" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#f0fdfa', color: '#0f766e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowRightLeft size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>Lend Followups</h3>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                Move the work window to another FRO — ownership never changes.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: 'var(--ink-soft)', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
          ><X size={16} /></button>
        </div>

        {/* Source banner — a slim strip under the header so the admin always
            sees which station's follow-ups are being lent out. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0,
          padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid var(--line, #e5e7eb)',
          fontSize: 12,
        }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
            Source station
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{source.station}</span>
          {source.ngoName && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#4338ca', background: '#e0e7ff', padding: '1px 6px', borderRadius: 5 }}>
              {source.ngoName}
            </span>
          )}
          {source.permanentFroName && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-soft)' }}>
              Owner: <b style={{ color: 'var(--ink)' }}>{source.permanentFroName}</b>
            </span>
          )}
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>
                What to lend
                {previewLoading && !preview && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · counting…</span>}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {BUCKET_CHIPS.map(c => {
                  const on = c.key === 'overdue' ? includeOverdue : buckets.includes(c.key);
                  const count = preview ? preview[c.countKey] : null;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleChip(c.key)}
                      aria-pressed={on}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
                        padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${on ? '#93c5fd' : 'var(--line, #e5e7eb)'}`,
                        background: on ? '#eff6ff' : '#fff',
                        fontSize: 12, fontWeight: on ? 700 : 500,
                        color: on ? '#1d4ed8' : 'var(--ink)', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${on ? '#2563eb' : '#cbd5e1'}`,
                        background: on ? '#2563eb' : '#fff', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {on && <Check size={10} strokeWidth={3.5} />}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                      {count !== null && (
                        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {nothingPicked && (
                <div style={{ marginTop: 5, fontSize: 11, color: '#b45309' }}>Pick at least one category.</div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Receiving FRO</label>
              <FroSelect
                options={froOptions}
                value={froId}
                onChange={setFroId}
                placeholder={froOptions.length === 0 ? 'No FRO with a station…' : 'Select an FRO…'}
                disabled={froOptions.length === 0}
              />
              {!froId && froOptions.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
                  Target station is taken from the FRO.
                </div>
              )}
            </div>
          </div>

          {froOptions.length === 0 && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              No other FRO with a station exists under <b>{source.ngoName || 'this NGO'}</b>. Assign another FRO to a station first, then lend again.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Loan window
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <Time12Control compact label="Starts" value={startsLocal} onChange={setStartsLocal} />
              <Time12Control compact label="Expires (required)" value={expiresLocal} onChange={setExpiresLocal} />
            </div>
          </div>

          {windowError && startsLocal && expiresLocal && (
            <div style={{ fontSize: 12.5, color: '#991b1b' }}>{windowError}</div>
          )}

          {preview?.already_loaned > 0 && !blockers.length && !warnings.length && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
              {preview.already_loaned} lead(s) from this station are already on loan and are skipped.
            </div>
          )}

          {previewError && (
            <div style={{ fontSize: 12, color: '#991b1b' }}>{previewError}</div>
          )}

          {blockers.map((c, i) => (
            <div key={`b-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#991b1b' }}>
              <AlertTriangle size={13} /> {c.message}
            </div>
          ))}
          {warnings.map((c, i) => (
            <div key={`w-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#92400e' }}>
              <AlertTriangle size={13} /> {c.message}
            </div>
          ))}

          {error && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line, #e5e7eb)', background: '#fff' }}>
          <button
            type="button"
            className="btn"
            onClick={downloadExcel}
            disabled={exporting || nothingPicked}
            title="Download the donors, mobile numbers and stations that will be lent"
            style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Lending…' : (selectedCount ? `Lend ${selectedCount} lead${selectedCount === 1 ? '' : 's'}` : 'Lend')}
          </button>
        </div>
      </div>
    </div>
  );
}
