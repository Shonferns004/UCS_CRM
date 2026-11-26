import { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { apiDelete } from '../api/auth';
import { toast } from '../../../components/Toast';
import ModalPortal from './ModalPortal';

const ngoIdOf = (n) => n?.ngo_id ?? n?.id ?? null;
const ngoNameOf = (n, allNgos) => (
  n?.ngo_name || n?.name || allNgos.find(a => String(a.id) === String(ngoIdOf(n)))?.name || 'NGO'
);

export default function BulkDeleteStationsModal({ stations = [], allNgos = [], onClose, onDone }) {
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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const options = useMemo(() => {
    if (!ngoId) return [];
    return [...stationMap.entries()]
      .filter(([, m]) => m.has(String(ngoId)))
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stationMap, ngoId]);

  const visible = query.trim()
    ? options.filter(s => s.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const selectedNgoName = ngoOptions.find(n => String(n.id) === String(ngoId))?.name || '';
  const allVisibleSelected = visible.length > 0 && visible.every(s => selected.includes(s));

  const toggle = (s) => setSelected(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));
  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => prev.filter(s => !visible.includes(s)));
    } else {
      setSelected(prev => [...new Set([...prev, ...visible])]);
    }
  };

  const changeNgo = (id) => {
    setNgoId(id);
    setSelected([]);
    setQuery('');
  };

  const handleDelete = async () => {
    if (!ngoId || selected.length === 0 || deleting) return;
    if (!window.confirm(
      `Permanently delete ${selected.length} station(s) from ${selectedNgoName || 'this NGO'}?\n\n` +
      `The station rows will be removed and their donor assignments will be detached. This cannot be undone.`,
    )) return;

    setDeleting(true);
    const failed = [];
    for (const station of selected) {
      try {
        await apiDelete(`/ngo-admin/stations/${encodeURIComponent(station)}?ngo_id=${encodeURIComponent(ngoId)}`);
      } catch (e) {
        failed.push({ station, message: e?.message || 'Delete failed' });
      }
    }
    setDeleting(false);

    const deleted = selected.length - failed.length;
    if (failed.length === 0) {
      toast(`Deleted ${deleted} station(s) permanently.`, 'success');
      onDone?.();
      onClose?.();
      return;
    }

    setSelected(failed.map(f => f.station));
    toast(
      `${deleted} station(s) deleted. ${failed.length} failed: ` +
      failed.map(f => `${f.station} (${f.message})`).slice(0, 2).join(', ') +
      (failed.length > 2 ? '…' : ''),
      'error',
    );
    onDone?.();
  };

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={deleting ? undefined : onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modal-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={17} /> Delete stations
            </h3>
            <button className="btn btn-icon" onClick={onClose} disabled={deleting} aria-label="Close"><X size={16} /></button>
          </div>

          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field">
              NGO
              <select value={ngoId} onChange={e => changeNgo(e.target.value)} disabled={deleting}>
                <option value="">Select NGO</option>
                {ngoOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>

            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>Stations ({selected.length} selected)</span>
                {options.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={deleting || visible.length === 0}
                    style={{ background: 'none', border: 'none', color: 'var(--sage)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >
                    {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search stations…"
                  disabled={!ngoId || deleting}
                  style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 2 }}
                />
                {!ngoId && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Select an NGO first.</span>}
                {ngoId && options.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No stations for this NGO.</span>}
                {ngoId && options.length > 0 && visible.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No station matches.</span>}
                {visible.map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)} disabled={deleting} />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, lineHeight: 1.55, color: '#991b1b' }}>
              Permanent delete: the station row is removed and its donor assignments are detached. This cannot be undone.
              Stations with an active follow-up loan are skipped with an error.
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn btn-outline" onClick={onClose} disabled={deleting}>Cancel</button>
            <button
              className="btn"
              onClick={handleDelete}
              disabled={!ngoId || selected.length === 0 || deleting}
              style={{ background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' }}
            >
              <Trash2 size={14} /> {deleting ? 'Deleting…' : `Delete ${selected.length || ''} station(s)`}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
