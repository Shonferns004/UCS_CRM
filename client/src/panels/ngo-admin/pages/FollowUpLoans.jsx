import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, RefreshCw, Ban, History, X, Search, PlusCircle } from 'lucide-react';
import {
  apiGet,
  listFollowUpLoans,
  getFollowUpLoan,
  extendFollowUpLoan,
  returnFollowUpLoan,
  revokeFollowUpLoan,
} from '../api/auth';
import FollowUpLoanModal from './FollowUpLoanModal';
import { isFreshStation } from '../../../lib/stations';

// ─── Lead Loans — station-first lending board ────────────────────────────────
// Same layout as Stations & FROs: three NGO columns (BSCT / AFLF / MANN), one
// row per station. Click a station (or its Lend button) to lend its open
// follow-ups / callbacks; active loans show as chips on that station row.
// Ownership is never rewritten; only the work window moves.

const NGO_NAME_COLORS = {
  bsct: '#2563eb',
  aflf: '#16a34a',
  mann: '#ec4899',
};

const NGO_GROUP_ORDER = ['bsct', 'aflf', 'mann', 'other'];

function groupOfName(name) {
  const k = String(name || '').trim().toLowerCase();
  if (NGO_NAME_COLORS[k]) return k;
  if (k.includes('bsct')) return 'bsct';
  if (k.includes('aflf')) return 'aflf';
  if (k.includes('mann')) return 'mann';
  return 'other';
}

const BUCKETS = [
  { key: 'old', label: 'Old', color: '#2563eb' },
  { key: 'new', label: 'New', color: '#16a34a' },
];

const TABS = [
  { key: 'LENDING', label: 'Lending out', color: '#d97706' },
  { key: 'RECEIVING', label: 'Receiving', color: '#2563eb' },
  { key: 'HISTORY', label: 'History', color: '#475569' },
];

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeExpiry(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return '';
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function toLocalInputValue(d) {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const offset = new Date(utc.getTime() + 5.5 * 3600000) - now;
  const ist = new Date(d.getTime() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}T${p(ist.getHours())}:${p(ist.getMinutes())}`;
}

function StatusPill({ status }) {
  const palette = {
    ACTIVE: { bg: '#ecfdf5', color: '#047857', dot: '#10b981' },
    SCHEDULED: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    EXPIRED: { bg: '#f3f4f6', color: '#4b5563', dot: '#9ca3af' },
    RETURNED: { bg: '#eef2ff', color: '#4338ca', dot: '#6366f1' },
    REVOKED: { bg: '#fef2f2', color: '#b91c1c', dot: '#ef4444' },
  }[status] || { bg: '#f3f4f6', color: '#4b5563', dot: '#9ca3af' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: palette.bg, color: palette.color, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.03em', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: palette.dot }} />
      {status}
    </span>
  );
}

function scopeLabel(scope) {
  if (scope === 'FOLLOW_UP') return 'Follow-ups + promises';
  if (scope === 'CALLBACK') return 'Callbacks';
  return 'Follow-ups + promises + callbacks';
}

function loanChip(l) {
  const live = l.computed_status === 'ACTIVE' || l.computed_status === 'SCHEDULED';
  const out = l.direction === 'out';
  const other = out ? l.target_station : l.source_station;
  const rel = live ? relativeExpiry(l.expires_at) : '';
  const status = live ? '' : ` · ${l.computed_status}`;
  return `⇄ ${l.item_count} ${out ? '→' : '←'} ${other}${rel ? ` · ${rel}` : ''}${status}`;
}

const inputStyle = {
  width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 6, fontFamily: 'inherit', background: '#fff',
};

export default function FollowUpLoans() {
  const [stations, setStations] = useState([]);
  const [froWorkers, setFroWorkers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [dataTab, setDataTab] = useState('old');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [extendRow, setExtendRow] = useState(null);
  const [revokeRow, setRevokeRow] = useState(null);
  const [loanSource, setLoanSource] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stationRows, froRows, loanRows] = await Promise.all([
        apiGet('/ngo-admin/stations'),
        apiGet('/ngo-admin/fro-workers'),
        listFollowUpLoans(),
      ]);
      setStations(Array.isArray(stationRows) ? stationRows : []);
      setFroWorkers(Array.isArray(froRows) ? froRows : []);
      setLoans(Array.isArray(loanRows) ? loanRows : []);
    } catch (e) {
      setError(e?.message || 'Failed to load stations and loans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const froNameById = useMemo(() => {
    const map = {};
    for (const w of froWorkers) map[String(w.id)] = w.name;
    return map;
  }, [froWorkers]);

  // One row per (station, NGO) pair, exactly like the Stations & FROs columns.
  const stationRows = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const s of stations) {
      const ngos = Array.isArray(s?.ngos) ? s.ngos : [];
      for (const n of ngos) {
        if (!n?.ngo_id) continue;
        const key = `${s.station}|${n.ngo_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rowLoans = loans
          .filter(l => l.source_station === s.station || l.target_station === s.station)
          .filter(l => !l.ngo_id || String(l.ngo_id) === String(n.ngo_id))
          .map(l => ({ ...l, direction: l.source_station === s.station ? 'out' : 'in' }));
        out.push({
          key,
          station: s.station,
          ngoId: n.ngo_id,
          ngoName: n.ngo_name || 'Unknown',
          ownerId: s.fro_worker_id || null,
          ownerName: froNameById[String(s.fro_worker_id)] || s.fro_worker_name || '',
          donorCount: Number(s.donor_count?.[n.ngo_id] || 0) + Number(s.high_tier_donor_count?.[n.ngo_id] || 0),
          loans: rowLoans,
          activeLoans: rowLoans.filter(l => l.computed_status === 'ACTIVE' || l.computed_status === 'SCHEDULED'),
          historyLoans: rowLoans.filter(l => !['ACTIVE', 'SCHEDULED'].includes(l.computed_status)),
        });
      }
    }
    return out.sort((a, b) => a.station.localeCompare(b.station, undefined, { numeric: true }) || a.ngoName.localeCompare(b.ngoName));
  }, [stations, loans, froNameById]);

  const bucketRows = useMemo(() => stationRows.filter(r =>
    dataTab === 'new' ? isFreshStation(r.station) : !isFreshStation(r.station)
  ), [stationRows, dataTab]);

  const counts = useMemo(() => ({
    LENDING: bucketRows.filter(r => r.activeLoans.some(l => l.direction === 'out')).length,
    RECEIVING: bucketRows.filter(r => r.activeLoans.some(l => l.direction === 'in')).length,
    HISTORY: bucketRows.filter(r => r.historyLoans.length > 0).length,
  }), [bucketRows]);

  const visible = useMemo(() => bucketRows.filter(r => {
    if (tab === 'LENDING' && !r.activeLoans.some(l => l.direction === 'out')) return false;
    if (tab === 'RECEIVING' && !r.activeLoans.some(l => l.direction === 'in')) return false;
    if (tab === 'HISTORY' && r.historyLoans.length === 0) return false;
    if (!search) return true;
    const n = search.toLowerCase();
    return [r.station, r.ngoName, r.ownerName]
      .some(v => String(v || '').toLowerCase().includes(n));
  }), [bucketRows, tab, search]);

  const bucketCounts = useMemo(() => ({
    old: stationRows.filter(r => !isFreshStation(r.station)).length,
    new: stationRows.filter(r => isFreshStation(r.station)).length,
  }), [stationRows]);

  const grouped = useMemo(() => {
    const map = { bsct: [], aflf: [], mann: [], other: [] };
    for (const r of visible) map[groupOfName(r.ngoName)].push(r);
    return map;
  }, [visible]);

  const hasOther = grouped.other.length > 0;
  const displayGroups = NGO_GROUP_ORDER.filter(g => g !== 'other' || hasOther);

  function openLoanFor(row) {
    setLoanSource({
      station: row.station,
      ngoId: row.ngoId,
      ngoName: row.ngoName,
      permanentFroName: row.ownerName || null,
    });
  }

  async function openDetail(loan) {
    try {
      const data = await getFollowUpLoan(loan.id);
      setDetail(data);
    } catch (e) {
      setActionMsg(e?.message || 'Failed to load loan');
    }
  }

  async function doReturn(loan) {
    if (!window.confirm(`Return these leads to ${loan.source_station} now?`)) return;
    setBusyId(loan.id);
    setActionMsg(null);
    try {
      await returnFollowUpLoan(loan.id, { reason: 'Returned early from Lead Loans page' });
      setActionMsg('Leads returned. The source station can work them again immediately.');
      setDetail(null);
      await load();
    } catch (e) {
      setActionMsg(e?.message || 'Return failed');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmExtend() {
    if (!extendRow?.expiresLocal) return;
    const iso = new Date(extendRow.expiresLocal).toISOString();
    if (isNaN(new Date(iso).getTime())) { setActionMsg('Pick a valid expiry'); return; }
    setBusyId(extendRow.row.id);
    setActionMsg(null);
    try {
      await extendFollowUpLoan(extendRow.row.id, { expires_at: iso, reason: 'Extended from Lead Loans page' });
      setActionMsg('Loan extended.');
      setExtendRow(null);
      setDetail(null);
      await load();
    } catch (e) {
      setActionMsg(e?.message || 'Extend failed');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRevoke() {
    if (!revokeRow) return;
    setBusyId(revokeRow.row.id);
    setActionMsg(null);
    try {
      await revokeFollowUpLoan(revokeRow.row.id, { reason: revokeRow.reason || 'Revoked from Lead Loans page' });
      setActionMsg('Loan revoked. Borrowed leads returned to the source station.');
      setRevokeRow(null);
      setDetail(null);
      await load();
    } catch (e) {
      setActionMsg(e?.message || 'Revoke failed');
    } finally {
      setBusyId(null);
    }
  }

  const detailLive = detail && ['ACTIVE', 'SCHEDULED'].includes(detail.computed_status);

  return (
    <div className="lead-loans-page" style={{ padding: 0, margin: 0 }}>
      <style>{`
        .lead-loans-page .ll-chip { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 6px; font-size: 9.5px; font-weight: 700; cursor: pointer; border: 1px solid transparent; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .lead-loans-page .ll-lend-btn { display: inline-flex; align-items: center; justify-content: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid #99f6e4; background: #f0fdfa; color: #0f766e; cursor: pointer; white-space: nowrap; }
        .lead-loans-page .ll-col-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .lead-loans-page .ll-col-table th { padding: 6px 10px; text-align: left; font-weight: 700; color: var(--ink-soft); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; background: #f8fafc; border-bottom: 1px solid var(--line, #e5e7eb); }
        .lead-loans-page .ll-col-table td { padding: 6px 10px; vertical-align: top; border-bottom: 1px solid var(--line, #f1f5f9); }
        .lead-loans-page .ll-col-table tbody tr:last-child td { border-bottom: none; }
        .lead-loans-page .ll-col-table tbody tr:hover { background: var(--bg, #f8fafc); }
        @media (max-width: 1100px) {
          .lead-loans-page .ll-columns { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="card" style={{ margin: 0, borderRadius: 0, boxShadow: 'none', border: 'none', height: '100%' }}>
        <div className="card-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowRightLeft size={20} /> Lead Loans
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', maxWidth: 860 }}>
                Click a station to lend its open follow-up / callback leads to another station for a fixed
                window. Ownership never changes: the source station keeps the lead, and calls made during
                the window are credited to the receiving FRO.
              </p>
            </div>
            <button onClick={load} className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }} disabled={loading}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
                {BUCKETS.map(b => (
                  <button
                    key={b.key}
                    onClick={() => setDataTab(b.key)}
                    style={{
                      padding: '5px 12px', border: 'none', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                      fontFamily: 'inherit', cursor: 'pointer',
                      background: dataTab === b.key ? b.color : 'transparent',
                      color: dataTab === b.key ? '#fff' : 'var(--ink-soft)',
                      transition: 'all .15s',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {b.label}
                    <span style={{ background: dataTab === b.key ? 'rgba(255,255,255,.24)' : '#e2e8f0', padding: '0 5px', borderRadius: 999, fontSize: 9.5 }}>
                      {bucketCounts[b.key]}
                    </span>
                  </button>
                ))}
              </div>

              <span style={{ width: 1, height: 22, background: 'var(--line, #e5e7eb)', margin: '0 2px' }} />

              {TABS.map(t => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(active ? 'ALL' : t.key)}
                    title={active ? 'Click again to show all stations' : `Show ${t.label.toLowerCase()} stations`}
                    style={{
                      padding: '6px 14px', border: '1px solid ' + (active ? t.color : 'var(--line, #e5e7eb)'),
                      borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                      fontFamily: 'inherit', cursor: 'pointer',
                      background: active ? t.color : '#fff',
                      color: active ? '#fff' : 'var(--ink-soft)',
                      transition: 'all .15s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {t.label}
                    <span style={{ background: active ? 'rgba(255,255,255,.24)' : '#eef2f7', padding: '0 6px', borderRadius: 999, fontSize: 10 }}>
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px', maxWidth: 320, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
              <Search size={14} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search FRO or station..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }}
              />
            </div>
          </div>
        </div>

        <div className="card-pad">
          {actionMsg && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#166534' }}>
              {actionMsg}
            </div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#991b1b' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {[0, 1, 2].map(c => (
                <div key={c} style={{ border: '1px solid var(--line, #e5e7eb)', background: '#fff' }}>
                  <div style={{ height: 34, background: '#e2e8f0', opacity: 0.7 }} />
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} style={{ height: 26, borderRadius: 6, background: '#eef2f7' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <p>
                {stationRows.length === 0
                  ? 'No stations found. Add a station under Stations & FROs first.'
                  : `No ${dataTab} stations match this filter.`}
              </p>
            </div>
          ) : (
            <div className="ll-columns" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, alignItems: 'start' }}>
              {displayGroups.map(g => {
                const rows = grouped[g];
                const color = NGO_NAME_COLORS[g] || '#6b7280';
                const totalDonors = rows.reduce((sum, r) => sum + r.donorCount, 0);
                return (
                  <div key={g} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 0, overflow: 'hidden', background: '#fff' }}>
                    <div style={{ background: color, color: '#fff', padding: '8px 12px', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{g === 'other' ? 'OTHER' : g.toUpperCase()}</span>
                      <span style={{ opacity: 0.85, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span>{rows.length} station{rows.length === 1 ? '' : 's'}</span>
                        <span>· {totalDonors.toLocaleString('en-IN')} donor{totalDonors === 1 ? '' : 's'}</span>
                      </span>
                    </div>
                    <table className="ll-col-table">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>FRO Name</th>
                          <th style={{ textAlign: 'right' }}>Lend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
                              No stations
                            </td>
                          </tr>
                        ) : rows.map(r => {
                          const active = r.activeLoans;
                          const history = r.historyLoans;
                          return (
                            <tr key={r.key}>
                              <td>
                                <strong
                                  style={{ fontSize: 14, letterSpacing: '.2px', cursor: 'pointer', color: 'var(--sage)' }}
                                  onClick={() => openLoanFor(r)}
                                  title="Click to lend this station's follow-ups / callbacks"
                                >
                                  {r.station}
                                </strong>
                                <div style={{ fontSize: 9, color: 'var(--ink-soft)', lineHeight: 1.2 }}>
                                  {r.donorCount.toLocaleString('en-IN')} donor{r.donorCount === 1 ? '' : 's'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                  {active.map(l => (
                                    <span
                                      key={l.id}
                                      className="ll-chip"
                                      onClick={() => openDetail(l)}
                                      title={`${l.direction === 'out' ? 'Lent to' : 'Received from'} ${l.direction === 'out' ? l.target_station : l.source_station} · ${l.item_count} leads · until ${fmt(l.expires_at)} IST. Click for details.`}
                                      style={{
                                        background: l.direction === 'out' ? '#fffbeb' : '#eff6ff',
                                        color: l.direction === 'out' ? '#92400e' : '#1d4ed8',
                                        borderColor: l.direction === 'out' ? '#fde68a' : '#bfdbfe',
                                      }}
                                    >
                                      {loanChip(l)}
                                    </span>
                                  ))}
                                  {active.length === 0 && history.length > 0 && (
                                    <span
                                      className="ll-chip"
                                      onClick={() => openDetail(history[0])}
                                      style={{ background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}
                                      title={`Last loan: ${history[0].computed_status} · ${history[0].item_count} leads`}
                                    >
                                      {loanChip(history[0])}
                                    </span>
                                  )}
                                  {active.length === 0 && history.length === 0 && (
                                    <span style={{ fontSize: 9.5, color: 'var(--ink-soft)' }}>No active loan</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.ownerName || '—'}</span>
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>owner of record</div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="ll-lend-btn"
                                  onClick={() => openLoanFor(r)}
                                  title="Lend this station's open follow-ups / callbacks"
                                >
                                  <PlusCircle size={11} /> Lend
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Loan detail / management */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-head">
              <h3>Loan · {detail.source_station} → {detail.target_station}</h3>
              <button className="icon-btn" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <StatusPill status={detail.computed_status} />
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {scopeLabel(detail.scope)} · {detail.item_count} leads · {fmt(detail.starts_at)} → {fmt(detail.expires_at)}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
                {[
                  ['Lent', detail.item_count],
                  ['Worked', detail.worked_count || 0],
                  ['Scope', scopeLabel(detail.scope)],
                  ['Receiving FRO', detail.target_fro_name || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-soft)', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Leads</div>
              <div style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, overflow: 'hidden', maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: '6px 9px' }}>Donor</th>
                      <th style={{ padding: '6px 9px' }}>Status</th>
                      <th style={{ padding: '6px 9px' }}>Due</th>
                      <th style={{ padding: '6px 9px' }}>Worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map(i => (
                      <tr key={i.id} style={{ borderTop: '1px solid var(--line, #f2f4f7)' }}>
                        <td style={{ padding: '6px 9px' }}>{i.donor_name || 'Unknown'}</td>
                        <td style={{ padding: '6px 9px' }}>{i.current_status || i.original_status || '—'}</td>
                        <td style={{ padding: '6px 9px' }}>{i.current_next_follow_up || i.original_next_follow_up || '—'}</td>
                        <td style={{ padding: '6px 9px', color: i.worked ? '#047857' : 'var(--ink-soft)' }}>{i.worked ? 'Yes' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Audit</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(detail.events || []).map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--ink-soft)', alignItems: 'flex-start' }}>
                    <History size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.event_type}</span>
                    <span>{fmt(e.created_at)}</span>
                    {e.reason ? <span>· {e.reason}</span> : null}
                  </div>
                ))}
                {(detail.events || []).length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>No events.</div>
                )}
              </div>
            </div>
            {detailLive && (
              <div className="modal-foot">
                <button
                  className="btn"
                  onClick={() => setExtendRow({ row: detail, expiresLocal: toLocalInputValue(new Date(Date.now() + 10 * 3600000)) })}
                >
                  Extend
                </button>
                <button className="btn" onClick={() => doReturn(detail)} disabled={busyId === detail.id}>
                  Return early
                </button>
                <button
                  className="btn"
                  style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }}
                  onClick={() => setRevokeRow({ row: detail, reason: '' })}
                  disabled={busyId === detail.id}
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extend */}
      {extendRow && (
        <div className="modal-overlay" onClick={() => setExtendRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <h3>Extend loan</h3>
              <button className="icon-btn" onClick={() => setExtendRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase' }}>
                New expiry (IST)
              </label>
              <input
                type="datetime-local" style={inputStyle}
                value={extendRow.expiresLocal}
                onChange={e => setExtendRow({ ...extendRow, expiresLocal: e.target.value })}
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                Max 30 days from now. Ownership does not change.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setExtendRow(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmExtend} disabled={busyId === extendRow.row.id}>
                {busyId === extendRow.row.id ? 'Saving…' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke */}
      {revokeRow && (
        <div className="modal-overlay" onClick={() => setRevokeRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ban size={15} /> Revoke loan</h3>
              <button className="icon-btn" onClick={() => setRevokeRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                This returns all borrowed leads to <b>{revokeRow.row.source_station}</b> immediately.
                Work already logged stays credited to the receiving FRO.
              </p>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase' }}>
                Reason (optional)
              </label>
              <input
                style={inputStyle}
                value={revokeRow.reason}
                onChange={e => setRevokeRow({ ...revokeRow, reason: e.target.value })}
                placeholder="Why is this loan being revoked?"
              />
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setRevokeRow(null)}>Cancel</button>
              <button
                className="btn" onClick={confirmRevoke}
                style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }}
                disabled={busyId === revokeRow.row.id}
              >
                {busyId === revokeRow.row.id ? 'Revoking…' : 'Revoke loan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loanSource && (
        <FollowUpLoanModal
          source={loanSource}
          stations={stations}
          onClose={() => setLoanSource(null)}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
