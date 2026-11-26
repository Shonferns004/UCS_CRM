import { useEffect, useMemo, useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import ModalPortal from './ModalPortal';

const FILTERS = [
  { key: 'all', label: 'All categories' },
  { key: 'premium', label: 'Premium (₹5,000+)' },
  { key: 'high', label: 'High Value (₹2,000–4,999)' },
  { key: 'medium', label: 'Medium (₹500–1,999)' },
  { key: 'low', label: 'Low Value (₹251–499)' },
  { key: 'below', label: 'Below Low (₹0–250)' },
];

export default function UniqueDonorModal({ stations = [], allNgos = [], onClose, onDone }) {
  const sourceNgOs = useMemo(
    () => allNgos.filter(n => /aflf|ashray|mann/i.test(`${n.name || ''} ${n.code || ''}`)),
    [allNgos],
  );
  const targetStations = useMemo(() => {
    const names = new Set();
    for (const s of stations) {
      if (!s?.station || !/^BOD-\d+$/i.test(s.station)) continue;
      const list = Array.isArray(s.ngos) && s.ngos.length
        ? s.ngos
        : (s.ngo_id ? [{ ngo_id: s.ngo_id, ngo_name: s.ngo_name }] : []);
      const hasBsct = list.some(n => /bsct|being/i.test(`${n.ngo_name || n.name || ''}`));
      if (hasBsct) names.add(s.station);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stations]);

  const [sourceNgoId, setSourceNgoId] = useState(sourceNgOs[0]?.id || '');
  const [target, setTarget] = useState('');
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!sourceNgoId) { setPreview(null); return; }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ source_ngo_id: sourceNgoId, filter });
    if (target) params.set('target_station', target);
    apiGet(`/ngo-admin/unique-donors/preview?${params.toString()}`)
      .then(r => { if (!cancelled) setPreview(r); })
      .catch(e => { if (!cancelled) { setPreview(null); toast(e?.message || 'Preview failed', 'error'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sourceNgoId, filter, target]);

  const counts = preview?.counts || {};
  const eligible = preview?.eligible ?? 0;
  const canAdd = !!sourceNgoId && !!target && eligible > 0 && !adding;

  const add = async () => {
    if (!canAdd) return;
    if (!window.confirm(`Add ${eligible} unique donor(s) to ${target}?`)) return;
    setAdding(true);
    try {
      const r = await apiPost('/ngo-admin/unique-donors/add', {
        source_ngo_id: sourceNgoId,
        target_station: target,
        filter,
      });
      const baseMsg = r.message || 'Donors added to BSCT';
      toast(
        r.skipped_bsct_dnd
          ? `${baseMsg} — ${Number(r.skipped_bsct_dnd).toLocaleString('en-IN')} BSCT DND donor(s) skipped.`
          : baseMsg,
        'success',
      );
      onDone?.();
      onClose?.();
    } catch (e) {
      toast(e?.message || 'Could not add donors', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={adding ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={17} /> Unique donors → BSCT
          </h3>
          <button className="btn btn-icon" onClick={onClose} disabled={adding} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field">
              Source NGO (unique donors)
              <select value={sourceNgoId} onChange={e => setSourceNgoId(e.target.value)}>
                {sourceNgOs.length === 0 && <option value="">—</option>}
                {sourceNgOs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <label className="field">
              Add to BSCT station
              <select value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Select BOD station</option>
                {targetStations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <label className="field">
            {preview?.source_ngo_code || 'Source'} category
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              {FILTERS.map(f => {
                const n = f.key === 'all' ? counts.all : counts[f.key];
                return <option key={f.key} value={f.key}>{f.label}{n != null ? ` — ${Number(n).toLocaleString('en-IN')}` : ''}</option>;
              })}
            </select>
          </label>

          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 12, lineHeight: 1.55 }}>
            {loading ? 'Checking unique donors…' : preview ? (
              <>
                <div><strong>{Number(eligible).toLocaleString('en-IN')}</strong> unique {preview.source_ngo_code} donor(s) will be added to <strong>{target || 'the target station'}</strong>.</div>
                <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                  {Number(preview.existing_bsct || 0).toLocaleString('en-IN')} already have a BSCT assignment (moved to this station),
                  {' '}{Number(preview.new_assignments || 0).toLocaleString('en-IN')} will get a new BSCT assignment.
                </div>
                <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                  Unique means: source station AOD/MOD donor with no BOD assignment in BSCT.
                </div>
                {Number(preview.excluded_bsct_dnd || 0) > 0 && (
                  <div style={{ color: '#b45309', marginTop: 2, fontWeight: 600 }}>
                    {Number(preview.excluded_bsct_dnd).toLocaleString('en-IN')} donor(s) already in BSCT DND — excluded, not sent to BSCT.
                  </div>
                )}
              </>
            ) : 'Select a source NGO to preview.'}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={adding}>Cancel</button>
          <button className="btn btn-primary" onClick={add} disabled={!canAdd}>
            {adding ? 'Adding…' : `Add ${eligible ? Number(eligible).toLocaleString('en-IN') : ''} donor(s)`}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
