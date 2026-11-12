import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, AlertTriangle, CheckCircle2, Check, Search, Download } from 'lucide-react';
import {
  createFollowUpLoan,
  previewFollowUpLoan,
  listFollowUpLoanFroCandidates,
} from '../api/auth';
import Time12Control from '../components/Time12Control';
import FroSelect from '../components/FroSelect';
import { exportLoanLeadsXlsx } from '../utils/leadLoanExport';

// ─── Bulk lend follow-ups (many stations → one FRO) ──────────────────────────
// Each source station still gets its own loan row (the backend stores one
// source_station per loan), but the admin picks them all at once and lends the
// same buckets to a single receiving FRO in one go. Nothing is moved: the
// receiving FRO only gets a visibility window.

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
const num = (v) => Number(v || 0).toLocaleString('en-IN');

export default function BulkFollowUpLoanModal({
  stations = [],
  ngoOptions = [],
  initialNgoId = '',
  onClose,
  onCreated,
}) {
  const fallbackNgo = initialNgoId && initialNgoId !== 'all'
    ? String(initialNgoId)
    : String(ngoOptions[0]?.id || '');
  const [ngoId, setNgoId] = useState(fallbackNgo);
  const [targets, setTargets] = useState([]);
  const [search, setSearch] = useState('');
  const [targetStation, setTargetStation] = useState('');
  const [froId, setFroId] = useState('');
  const [buckets, setBuckets] = useState(['follow_up', 'promise', 'callback']);
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [candidates, setCandidates] = useState(null);
  const [previewMap, setPreviewMap] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
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
    setCandidates(null);
    listFollowUpLoanFroCandidates(ngoId)
      .then(rows => { if (alive) setCandidates(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setCandidates([]); });
    return () => { alive = false; };
  }, [ngoId]);

  // Changing NGO invalidates the station + FRO choices (loans never cross NGOs).
  useEffect(() => {
    setTargets([]);
    setFroId('');
    setTargetStation('');
    setPreviewMap({});
  }, [ngoId]);

  const ngoStations = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of stations || []) {
      const name = String(s.station || '').trim();
      if (!name || seen.has(name)) continue;
      const belongs = (s.ngos || []).some(n => String(n.ngo_id) === String(ngoId));
      if (!belongs) continue;
      seen.add(name);
      out.push({
        station: name,
        donorCount: Number(s.donor_count?.[ngoId] || 0),
      });
    }
    return out.sort((a, b) => a.station.localeCompare(b.station));
  }, [stations, ngoId]);

  const activeFros = useMemo(() => (candidates || []).filter(w => {
    const dept = String(w.department || '').toLowerCase().trim();
    return (dept === 'fro' || dept === 'telecaller' || dept === '')
      && w.is_active !== false
      && w.employment_status !== 'terminated';
  }), [candidates]);

  const froOptions = useMemo(() => {
    return activeFros
      .map(w => {
        const st = (stations || []).find(s =>
          String(s.fro_worker_id) === String(w.id)
          && String(s.station || '').trim()
          && (s.ngos || []).some(n => String(n.ngo_id) === String(ngoId))
        );
        return { ...w, station: st ? String(st.station).trim() : '' };
      })
      .filter(w => w.station)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [activeFros, stations, ngoId]);

  useEffect(() => {
    const picked = froOptions.find(w => String(w.id) === String(froId));
    if (picked?.station) {
      setTargetStation(picked.station);
      // A station can never lend to itself.
      setTargets(prev => prev.filter(t => t !== picked.station));
    } else if (!froId) {
      setTargetStation('');
    }
  }, [froId, froOptions]);

  const visibleStations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return ngoStations;
    return ngoStations.filter(s => s.station.toLowerCase().includes(needle));
  }, [ngoStations, search]);

  const targetsKey = targets.join('|');
  const bucketsKey = buckets.join(',');

  // Preview each chosen station with the same bucket/chips, debounced. Every
  // call is independent so one bad station cannot blank the whole preview.
  useEffect(() => {
    if (!ngoId || targets.length === 0) {
      setPreviewMap({});
      setPreviewError(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      Promise.all(targets.map(st =>
        previewFollowUpLoan({
          ngo_id: ngoId,
          source_station: st,
          target_station: targetStation || '',
          target_fro_worker_id: froId || '',
          scope: 'BOTH',
          buckets: bucketsKey,
          overdue: includeOverdue ? '1' : '0',
          selection: 'ALL_OPEN',
          count: '',
        })
          .then(p => [st, p])
          .catch(e => [st, { error: e?.message || 'Preview failed' }])
      )).then(pairs => {
        if (!alive) return;
        const map = {};
        for (const [st, p] of pairs) map[st] = p;
        setPreviewMap(map);
      }).finally(() => { if (alive) setPreviewLoading(false); });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [ngoId, targetsKey, targetStation, froId, bucketsKey, includeOverdue]);

  const totals = useMemo(() => {
    const t = { follow_up: 0, promise: 0, callback: 0, overdue: 0, selected: 0, stations: 0 };
    for (const st of targets) {
      const p = previewMap[st];
      if (!p || p.error) continue;
      t.follow_up += p.follow_up || 0;
      t.promise += p.promise || 0;
      t.callback += p.callback || 0;
      t.overdue += p.overdue || 0;
      t.selected += p.selected_count || 0;
      if ((p.selected_count || 0) > 0) t.stations += 1;
    }
    return t;
  }, [previewMap, targets]);

  const previewFailing = targets
    .map(st => ({ station: st, error: previewMap[st]?.error }))
    .filter(x => x.error);

  const nothingPicked = buckets.length === 0 && !includeOverdue;

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

  const canSubmit = !!froId && !!targetStation && targets.length > 0
    && !nothingPicked && !windowError && totals.selected > 0
    && !submitting && !previewLoading;

  function toggleChip(key) {
    if (key === 'overdue') { setIncludeOverdue(v => !v); return; }
    setBuckets(prev => (prev.includes(key) ? prev.filter(b => b !== key) : [...prev, key]));
  }

  function toggleStation(station) {
    if (station === targetStation) return;
    setTargets(prev => (prev.includes(station) ? prev.filter(s => s !== station) : [...prev, station]));
  }

  function selectAllVisible() {
    setTargets(prev => {
      const next = new Set(prev);
      for (const s of visibleStations) if (s.station !== targetStation) next.add(s.station);
      return [...next];
    });
  }

  async function downloadExcel() {
    setError(null);
    if (targets.length === 0) return setError('Select at least one source station');
    if (nothingPicked) return setError('Pick what to lend first');
    setExporting(true);
    try {
      const rows = [];
      for (const st of targets) {
        const p = await previewFollowUpLoan({
          ngo_id: ngoId,
          source_station: st,
          target_station: targetStation || '',
          target_fro_worker_id: froId || '',
          scope: 'BOTH',
          buckets: bucketsKey,
          overdue: includeOverdue ? '1' : '0',
          selection: 'ALL_OPEN',
          count: '',
          include_items: '1',
        });
        for (const r of p.items || []) rows.push({ ...r, station: st });
      }
      if (rows.length === 0) return setError('Nothing to export for this selection');
      exportLoanLeadsXlsx(rows, `bulk-followups-${targets.length}stations-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e?.message || 'Could not build the Excel file');
    } finally {
      setExporting(false);
    }
  }

  async function submit() {
    setError(null);
    if (!froId || !targetStation) return setError('Select the receiving FRO');
    if (targets.length === 0) return setError('Select at least one source station');
    if (nothingPicked) return setError('Pick what to lend — follow up, promise, callback or overdue');
    if (windowError) return setError(windowError);
    if (!totals.selected) return setError('No open leads match this selection in the chosen stations');

    setSubmitting(true);
    const ok = [];
    const failed = [];
    const skipped = [];
    for (const st of targets) {
      // A station can have zero leads for the chosen chips (the preview already
      // knows this). Skip it instead of calling create, which would return
      // NO_ELIGIBLE_LEADS and look like a failure.
      const pv = previewMap[st];
      if (pv && !pv.error && (pv.selected_count || 0) === 0) {
        skipped.push({ station: st, message: 'no matching leads — skipped' });
        continue;
      }
      try {
        const payload = await createFollowUpLoan({
          ngo_id: ngoId,
          source_station: st,
          target_station: targetStation,
          target_fro_worker_id: froId,
          scope: 'BOTH',
          buckets: bucketsKey,
          overdue: includeOverdue ? '1' : '0',
          selection: 'ALL_OPEN',
          count: null,
          starts_at: toIso(startsLocal),
          expires_at: toIso(expiresLocal),
          reason_code: 'WORKLOAD_SUPPORT',
          reason_note: null,
        });
        ok.push({ station: st, lent: payload?.lent || 0, expiresAt: payload?.loan?.expires_at || toIso(expiresLocal) });
      } catch (e) {
        failed.push({ station: st, message: e?.message || 'Could not create the loan' });
      }
    }
    setSubmitting(false);
    setResult({ ok, failed, skipped, froName: froOptions.find(w => String(w.id) === String(froId))?.name || '' });
    if (ok.length > 0) {
      onCreated?.({
        stations: ok.length,
        lent: ok.reduce((sum, r) => sum + r.lent, 0),
        target: targetStation,
      });
    }
  }

  if (result) {
    const lent = result.ok.reduce((sum, r) => sum + r.lent, 0);
    const expires = result.ok[0]?.expiresAt;
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '94%', borderRadius: 16, overflow: 'hidden' }}>
          <div className="modal-head" style={{ padding: '16px 18px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={17} color="#059669" /> Bulk lend complete
            </h3>
            <button type="button" onClick={onClose} aria-label="Close"
              style={{ border: 'none', background: 'transparent', color: 'var(--ink-soft)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
            {result.ok.length > 0 && (
              <div style={{ fontSize: 12.5, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 10px' }}>
                <b>{num(lent)}</b> lead(s) lent from <b>{result.ok.length}</b> station(s) to{' '}
                <b>{result.froName || 'the receiving FRO'}</b> at <b>{targetStation}</b>
                {expires ? <> until <b>{fmt(expires)} IST</b></> : null}.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.ok.map(r => (
                <div key={`ok-${r.station}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                  <span><b>{r.station}</b></span>
                  <span style={{ color: '#065f46', fontWeight: 700, textAlign: 'right' }}>{num(r.lent)} lead{r.lent === 1 ? '' : 's'}</span>
                </div>
              ))}
              {result.skipped.map(r => (
                <div key={`skip-${r.station}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 12, alignItems: 'baseline', color: 'var(--ink-soft)' }}>
                  <span><b>{r.station}</b></span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message}</span>
                </div>
              ))}
              {result.failed.map(r => (
                <div key={`fail-${r.station}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                  <span><b>{r.station}</b></span>
                  <span style={{ color: '#991b1b', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.message}>{r.message}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
              Ownership did not change — the source stations still own these leads; the receiving FRO can work them until the window ends.
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, width: '96%', height: 'min(860px, calc(100dvh - 40px))', maxHeight: 'calc(100dvh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 16 }}>
        <div className="modal-head" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#f0fdfa', color: '#0f766e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowRightLeft size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>Bulk lend follow-ups</h3>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                Pick several source stations and lend them all to one FRO — ownership never changes.
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: 'var(--ink-soft)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* NGO banner — source and target must live in the same NGO. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid var(--line, #e5e7eb)', fontSize: 12 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>NGO</span>
          {ngoOptions.length > 1 ? (
            <select value={ngoId} onChange={e => setNgoId(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>
              {ngoOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>{ngoOptions.find(n => String(n.id) === String(ngoId))?.name || '—'}</span>
          )}
          <span style={{ color: 'var(--ink-soft)' }}>· {ngoStations.length} station(s)</span>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Receiving FRO</label>
              <FroSelect
                options={froOptions}
                value={froId}
                onChange={setFroId}
                placeholder={froOptions.length === 0 ? 'No FRO with a station…' : 'Select an FRO…'}
                disabled={froOptions.length === 0}
              />
              {froId && targetStation && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  Target station: <b style={{ color: '#1d4ed8' }}>{targetStation}</b> · {targets.length} source station(s) selected
                </div>
              )}
              {!froId && froOptions.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
                  Target station is taken from the FRO.
                </div>
              )}
              {froOptions.length === 0 && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#991b1b' }}>
                  No FRO with a station exists under this NGO.
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>
                What to lend
                {previewLoading && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · counting…</span>}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {BUCKET_CHIPS.map(c => {
                  const on = c.key === 'overdue' ? includeOverdue : buckets.includes(c.key);
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
                      <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{num(totals[c.countKey])}</span>
                    </button>
                  );
                })}
              </div>
              {nothingPicked && (
                <div style={{ marginTop: 5, fontSize: 11, color: '#b45309' }}>Pick at least one category.</div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Source stations</label>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{targets.length} selected</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160, border: '1px solid var(--line, #e5e7eb)', borderRadius: 7, padding: '4px 8px', background: '#fff' }}>
                <Search size={12} color="var(--ink-soft)" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter stations…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', minWidth: 0 }}
                />
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={selectAllVisible} style={{ fontSize: 11 }}>
                Select all
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setTargets([])} style={{ fontSize: 11 }} disabled={targets.length === 0}>
                Clear
              </button>
            </div>
            <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, background: '#fff', maxHeight: 132, overflowY: 'auto', padding: '6px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4 }}>
              {visibleStations.length === 0 && (
                <div style={{ padding: 8, fontSize: 11.5, color: 'var(--ink-soft)', gridColumn: '1 / -1' }}>No stations match.</div>
              )}
              {visibleStations.map(s => {
                const isTarget = s.station === targetStation;
                const on = targets.includes(s.station);
                const pv = previewMap[s.station];
                const cnt = pv && !pv.error ? (pv.selected_count || 0) : null;
                return (
                  <label
                    key={s.station}
                    title={isTarget ? 'This is the receiving FRO\'s station' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6,
                      fontSize: 12, minWidth: 0,
                      cursor: isTarget ? 'not-allowed' : 'pointer',
                      opacity: isTarget ? 0.45 : 1,
                      background: on ? '#eff6ff' : 'transparent',
                      color: on ? '#1d4ed8' : 'var(--ink)',
                      fontWeight: on ? 700 : 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={isTarget}
                      onChange={() => toggleStation(s.station)}
                      style={{ accentColor: '#2563eb', margin: 0, cursor: isTarget ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.station}</span>
                    {cnt !== null && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: cnt === 0 ? '#b45309' : '#0f766e' }}>
                        {cnt}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

          {previewFailing.map(f => (
            <div key={f.station} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#991b1b' }}>
              <AlertTriangle size={13} /> {f.station}: {f.error}
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
            disabled={exporting || targets.length === 0 || nothingPicked}
            title="Download the donors, mobile numbers and stations that will be lent"
            style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting
              ? 'Lending…'
              : (totals.selected
                ? `Lend ${num(totals.selected)} leads from ${targets.length} station${targets.length === 1 ? '' : 's'}`
                : 'Lend')}
          </button>
        </div>
      </div>
    </div>
  );
}
