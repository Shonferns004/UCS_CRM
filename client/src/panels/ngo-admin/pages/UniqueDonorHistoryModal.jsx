import { useEffect, useState } from 'react';
import { X, RotateCcw, UserPlus } from 'lucide-react';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import ModalPortal from './ModalPortal';

const FILTER_LABELS = {
  all: 'All categories',
  premium: 'Premium',
  high: 'High Value',
  medium: 'Medium',
  low: 'Low Value',
  below: 'Below Low',
};

const fmt = (v) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function UniqueDonorHistoryModal({ onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  const load = () => {
    setLoading(true);
    apiGet('/ngo-admin/unique-donor-additions')
      .then(r => setRows(Array.isArray(r) ? r : []))
      .catch(e => toast(e?.message || 'Could not load history', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const restore = async (id) => {
    if (!window.confirm('Remove these added donors from BSCT?')) return;
    setRestoringId(id);
    try {
      const r = await apiPost(`/ngo-admin/unique-donor-additions/${id}/restore`, {});
      toast(`Restored ${r.restored || 0} donor(s)${r.skipped ? `, ${r.skipped} skipped` : ''}`, 'success');
      onChanged?.();
      load();
    } catch (e) {
      toast(e?.message || 'Restore failed', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={17} /> Unique donor history
          </h3>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>No unique-donor additions yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(t => {
                const active = t.status === 'active';
                const partial = t.status === 'partial';
                const total = Number(t.items_total || t.donor_count || 0);
                const restored = Number(t.items_restored || 0);
                return (
                  <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{t.source_ngo_code}</span>
                        <span style={{ color: 'var(--ink-soft)' }}>→</span>
                        <span>{t.target_station}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: active ? '#dbeafe' : partial ? '#fef3c7' : '#dcfce7', color: active ? '#1d4ed8' : partial ? '#92400e' : '#166534' }}>
                          {active ? 'ACTIVE' : partial ? 'PARTIAL' : 'RESTORED'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                        {t.source_ngo_code} → BSCT · {t.donor_count || total} donor(s) · {FILTER_LABELS[t.filter_key] || t.filter_key} · {fmt(t.created_at)}
                        {!active && total > 0 ? ` · restored ${restored}/${total}` : ''}
                      </div>
                    </div>
                    {active || partial ? (
                      <button className="btn btn-sm btn-outline" onClick={() => restore(t.id)} disabled={restoringId === t.id} style={{ whiteSpace: 'nowrap' }}>
                        <RotateCcw size={13} /> {restoringId === t.id ? 'Restoring…' : 'Restore'}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
