import { useEffect, useState } from 'react';
import { X, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import ModalPortal from './ModalPortal';

const FILTER_LABELS = {
  all: 'All leads',
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

export default function StationTransferHistoryModal({ onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  const load = () => {
    setLoading(true);
    apiGet('/ngo-admin/lead-transfers')
      .then(r => setRows(Array.isArray(r) ? r : []))
      .catch(e => toast(e?.message || 'Could not load transfers', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const restore = async (id) => {
    if (!window.confirm('Bring these leads back to the source station?')) return;
    setRestoringId(id);
    try {
      const r = await apiPost(`/ngo-admin/lead-transfers/${id}/restore`, {});
      toast(`Restored ${r.restored || 0} lead(s)${r.skipped ? `, ${r.skipped} skipped` : ''}`, 'success');
      onChanged?.();
      load();
    } catch (e) {
      toast(e?.message || 'Restore failed', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const [openId, setOpenId] = useState(null);
  const [donors, setDonors] = useState({});
  const [donorLoading, setDonorLoading] = useState(false);

  const toggleDonors = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (donors[id]) return;
    setDonorLoading(true);
    try {
      const r = await apiGet(`/ngo-admin/lead-transfers/${id}/donors`);
      setDonors(m => ({ ...m, [id]: Array.isArray(r) ? r : [] }));
    } catch (e) {
      toast(e?.message || 'Could not load donors', 'error');
    } finally {
      setDonorLoading(false);
    }
  };

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowRightLeft size={17} /> Transfer history
          </h3>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>Loading transfers…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>No transfers yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(t => {
                const active = t.status === 'active';
                const partial = t.status === 'partial';
                const restored = Number(t.items_restored || 0);
                const total = Number(t.items_total || t.donor_count || 0);
                const expanded = openId === t.id;
                const donorRows = donors[t.id] || [];
                return (
                  <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{t.source_station}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>→</span>
                          <span>{t.target_station}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: active ? '#dbeafe' : partial ? '#fef3c7' : '#dcfce7', color: active ? '#1d4ed8' : partial ? '#92400e' : '#166534' }}>
                            {active ? 'ACTIVE' : partial ? 'PARTIAL' : 'RESTORED'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                          {t.ngo_code || 'NGO'} · {t.donor_count || total} lead(s) · {FILTER_LABELS[t.filter_key] || t.filter_key}
                          {t.bsct_filter_key && t.bsct_filter_key !== 'all' ? ` · BSCT: ${FILTER_LABELS[t.bsct_filter_key] || t.bsct_filter_key}` : ''}
                          {' · '}{fmt(t.created_at)}
                          {!active && total > 0 ? ` · restored ${restored}/${total}` : ''}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-outline" onClick={() => toggleDonors(t.id)} style={{ whiteSpace: 'nowrap' }}>
                        {expanded ? 'Hide donors' : 'View donors'}
                      </button>
                      {active || partial ? (
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => restore(t.id)}
                          disabled={restoringId === t.id}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          <RotateCcw size={13} /> {restoringId === t.id ? 'Restoring…' : 'Restore'}
                        </button>
                      ) : null}
                    </div>
                    {expanded && (
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                        {donorLoading && !donorRows.length ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Loading donors…</div>
                        ) : donorRows.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No donor rows recorded.</div>
                        ) : (
                          <div style={{ maxHeight: 190, overflowY: 'auto', fontSize: 11 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                  <th style={{ padding: '3px 6px' }}>Donor</th>
                                  <th style={{ padding: '3px 6px' }}>Mobile</th>
                                  <th style={{ padding: '3px 6px' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {donorRows.map(d => (
                                  <tr key={d.assignment_id} style={{ borderTop: '1px solid var(--line)' }}>
                                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{d.name || 'Unknown'}</td>
                                    <td style={{ padding: '4px 6px' }}>{d.mobile_number || '—'}</td>
                                    <td style={{ padding: '4px 6px' }}>{d.restored ? 'Restored' : 'At target'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
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
