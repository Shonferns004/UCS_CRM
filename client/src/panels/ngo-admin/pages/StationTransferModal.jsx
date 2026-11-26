import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import ModalPortal from './ModalPortal';

const FILTERS = [
  { key: 'all', label: 'All leads' },
  { key: 'premium', label: 'Premium (₹5,000+)' },
  { key: 'high', label: 'High Value (₹2,000–4,999)' },
  { key: 'medium', label: 'Medium (₹500–1,999)' },
  { key: 'low', label: 'Low Value (₹251–499)' },
  { key: 'below', label: 'Below Low (₹0–250)' },
];

const ngoIdOf = (n) => n?.ngo_id ?? n?.id ?? null;
const ngoNameOf = (n, allNgos) => (
  n?.ngo_name || n?.name || allNgos.find(a => String(a.id) === String(ngoIdOf(n)))?.name || 'NGO'
);

export default function StationTransferModal({ stations = [], allNgos = [], onClose, onDone }) {
  const stationMap = useMemo(() => {
    const map = new Map();
    for (const s of stations) {
      const name = String(s?.station || '').trim();
      if (!name) continue;
      const list = Array.isArray(s.ngos) && s.ngos.length
        ? s.ngos
        : (s.ngo_id ? [{ ngo_id: s.ngo_id, ngo_name: s.ngo_name }] : []);
      const set = map.get(name) || new Map();
      for (const n of list) {
        const id = ngoIdOf(n);
        if (id) set.set(String(id), ngoNameOf(n, allNgos));
      }
      map.set(name, set);
    }
    return map;
  }, [stations, allNgos]);

  const ngoOptions = useMemo(
    () => [...allNgos].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [allNgos],
  );

  const [ngoId, setNgoId] = useState('');
  const [sources, setSources] = useState([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [targets, setTargets] = useState([]);
  const [targetQuery, setTargetQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [bsctFilter, setBsctFilter] = useState('all');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  const sourceOptions = useMemo(() => {
    if (!ngoId) return [];
    return [...stationMap.entries()]
      .filter(([, m]) => m.has(String(ngoId)))
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stationMap, ngoId]);
  const targetOptions = useMemo(
    () => sourceOptions.filter(s => !sources.includes(s)),
    [sourceOptions, sources],
  );
  const visibleSources = sourceQuery.trim()
    ? sourceOptions.filter(s => s.toLowerCase().includes(sourceQuery.trim().toLowerCase()))
    : sourceOptions;
  const visibleTargets = targetQuery.trim()
    ? targetOptions.filter(s => s.toLowerCase().includes(targetQuery.trim().toLowerCase()))
    : targetOptions;

  const selectedNgoName = ngoOptions.find(n => String(n.id) === String(ngoId))?.name || '';
  const crossNgo = !!selectedNgoName && !/bsct|being\s*sevak/i.test(selectedNgoName);

  useEffect(() => {
    setSources([]);
    setTargets([]);
    setPreview(null);
    setSourceQuery('');
    setTargetQuery('');
    setFilter('all');
    setBsctFilter('all');
  }, [ngoId]);

  useEffect(() => {
    setTargets(prev => prev.filter(t => !sources.includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.join('|')]);

  useEffect(() => {
    if (!ngoId || sources.length === 0) { setPreview(null); return; }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      ngo_id: ngoId,
      filter,
      source_stations: sources.join(','),
      target_stations: targets.join(','),
    });
    if (crossNgo && bsctFilter !== 'all') params.set('bsct_filter', bsctFilter);
    apiGet(`/ngo-admin/station-transfers/preview?${params.toString()}`)
      .then(r => { if (!cancelled) setPreview(r); })
      .catch(e => { if (!cancelled) { setPreview(null); toast(e?.message || 'Preview failed', 'error'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ngoId, sources.join(','), targets.join(','), filter, bsctFilter, crossNgo]);

  const counts = preview?.counts || {};
  const bsctCounts = preview?.bsct_counts || {};
  const eligible = preview?.eligible ?? 0;
  const matched = preview?.matched ?? 0;
  const skipped = preview?.skipped_at_target ?? 0;
  const canMove = !!ngoId && sources.length > 0 && targets.length > 0 && eligible > 0 && !moving;

  const toggleSource = (s) => setSources(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));
  const toggleTarget = (s) => setTargets(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  const handleMove = async () => {
    if (!canMove) return;
    if (!window.confirm(`Permanently move ${eligible} lead(s) from ${sources.join(', ')} to ${targets.join(', ')}?`)) return;
    setMoving(true);
    try {
      const r = await apiPost('/ngo-admin/station-transfers/permanent', {
        ngo_id: ngoId,
        source_stations: sources,
        target_stations: targets,
        filter,
        bsct_filter: crossNgo ? bsctFilter : 'all',
      });
      toast(r.message || 'Leads transferred', 'success');
      onDone?.();
      onClose?.();
    } catch (e) {
      toast(e?.message || 'Transfer failed', 'error');
    } finally {
      setMoving(false);
    }
  };

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={moving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowRightLeft size={17} /> Transfer leads
          </h3>
          <button className="btn btn-icon" onClick={onClose} disabled={moving} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            NGO
            <select value={ngoId} onChange={e => setNgoId(e.target.value)}>
              <option value="">Select NGO</option>
              {ngoOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </label>

          <label className="field">
            From stations (select one or more)
            <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={sourceQuery}
                onChange={e => setSourceQuery(e.target.value)}
                placeholder="Search source stations…"
                disabled={!ngoId}
                style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 2 }}
              />
              {!ngoId && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Select an NGO first.</span>}
              {ngoId && sourceOptions.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No stations for this NGO.</span>}
              {ngoId && sourceOptions.length > 0 && visibleSources.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No station matches.</span>}
              {visibleSources.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sources.includes(s)} onChange={() => toggleSource(s)} />
                  {s}
                </label>
              ))}
            </div>
            {sources.length > 0 && (
              <span style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{sources.length} source station(s): {sources.join(', ')}</span>
            )}
          </label>

          <label className="field">
            Lead filter
            <select value={filter} onChange={e => setFilter(e.target.value)} disabled={sources.length === 0}>
              {FILTERS.map(f => {
                const n = f.key === 'all' ? counts.all : counts[f.key];
                return <option key={f.key} value={f.key}>{f.label}{n != null ? ` — ${Number(n).toLocaleString('en-IN')}` : ''}</option>;
              })}
            </select>
          </label>

          {crossNgo && (
            <label className="field">
              BSCT category (this donor's BSCT value)
              <select value={bsctFilter} onChange={e => setBsctFilter(e.target.value)} disabled={sources.length === 0}>
                {FILTERS.map(f => {
                  const n = f.key === 'all' ? bsctCounts.all : bsctCounts[f.key];
                  return <option key={f.key} value={f.key}>{f.key === 'all' ? 'All BSCT categories' : `BSCT ${f.label.replace(' leads', '')}`}{n != null ? ` — ${Number(n).toLocaleString('en-IN')}` : ''}</option>;
                })}
              </select>
            </label>
          )}

          <label className="field">
            To stations (same NGO) — equal split
            <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={targetQuery}
                onChange={e => setTargetQuery(e.target.value)}
                placeholder="Search target stations…"
                disabled={!ngoId}
                style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 2 }}
              />
              {!ngoId && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Select an NGO first.</span>}
              {ngoId && targetOptions.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No target stations for this NGO.</span>}
              {ngoId && targetOptions.length > 0 && visibleTargets.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No station matches.</span>}
              {visibleTargets.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={targets.includes(s)} onChange={() => toggleTarget(s)} />
                  {s}
                </label>
              ))}
            </div>
            {targets.length > 0 && (
              <span style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{targets.length} target station(s): {targets.join(', ')}</span>
            )}
          </label>

          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 12, lineHeight: 1.55 }}>
            {loading ? 'Checking leads…' : preview ? (
              <>
                <div><strong>{Number(eligible).toLocaleString('en-IN')}</strong> lead(s) will move from <strong>{sources.length}</strong> source station(s) to <strong>{targets.length}</strong> target station(s).</div>
                {matched > eligible && (
                  <div style={{ color: '#b45309', marginTop: 2 }}>{skipped.toLocaleString('en-IN')} already active on the selected target(s) — skipped to avoid duplicates.</div>
                )}
                {targets.length > 0 && preview?.distribution?.length > 0 && (
                  <div style={{ marginTop: 3 }}>
                    Split: {preview.distribution.map(d => `${d.station}: ${Number(d.count).toLocaleString('en-IN')}`).join(' · ')}
                  </div>
                )}
                {targets.length > 0 && (preview?.distribution || []).some(d => !d.fro_worker_id) && (
                  <div style={{ color: '#b45309', marginTop: 2 }}>
                    No FRO on {(preview.distribution || []).filter(d => !d.fro_worker_id).map(d => d.station).join(', ')} — source FRO will be assigned automatically.
                  </div>
                )}
              </>
            ) : 'Select NGO, source and target stations to preview.'}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={moving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleMove} disabled={!canMove}>
            {moving ? 'Transferring…' : `Transfer ${eligible ? Number(eligible).toLocaleString('en-IN') : ''} lead(s)`}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
