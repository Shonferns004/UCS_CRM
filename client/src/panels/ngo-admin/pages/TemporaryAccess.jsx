import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Ban, History, X, Lock, Search, PlusCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Avatar } from '../../../components/ui';
import {
  listTemporaryAccess,
  getTemporaryAccess,
  extendTemporaryAccess,
  revokeTemporaryAccess,
} from '../api/auth';
import '../temporaryAccess.css';

// ─── Temporary Access — admin management page ────────────────────────────────
// Redesigned surface. Reads permanent ownership (read-only) and mutates only
// temporary_data_assignments via the existing API. All business logic unchanged.

const FILTERS = ['ALL', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'REVOKED'];

function fmtIst(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    ...opts,
  });
}

function relativeExpiry(value) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (isNaN(ms)) return null;
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

function isExpiringSoon(value) {
  if (!value) return false;
  const ms = new Date(value).getTime() - Date.now();
  return ms > 0 && ms <= 24 * 3600000;
}

function StatusPill({ status }) {
  return (
    <span className={`ta-status ta-status--${status || 'EXPIRED'}`}>
      <span className="ta-status__dot" />
      {status ? status.charAt(0) + status.slice(1).toLowerCase() : 'Expired'}
    </span>
  );
}

function scopeLabel(scope) {
  if (scope === 'STATION_ALL') return 'Entire station';
  if (scope === 'STATION_HIGH_TIER') return 'High-tier only';
  if (scope === 'STATION_NORMAL') return 'Normal only';
  return scope || '—';
}

export default function TemporaryAccess() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [auditRow, setAuditRow] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [extendRow, setExtendRow] = useState(null);
  const [revokeRow, setRevokeRow] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTemporaryAccess();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load temporary access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const active = rows.filter(r => r.computed_status === 'ACTIVE').length;
    const scheduled = rows.filter(r => r.computed_status === 'SCHEDULED').length;
    const soon = rows.filter(r => r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED')
      .filter(r => isExpiringSoon(r.expires_at)).length;
    return { active, scheduled, soon, total: rows.length };
  }, [rows]);

  const visible = useMemo(() => rows.filter(r => {
    if (filter !== 'ALL' && r.computed_status !== filter) return false;
    if (!search) return true;
    const n = search.toLowerCase();
    return [r.station, r.working_fro_name, r.permanent_fro_name, r.reason_code, r.granted_by_name]
      .some(v => String(v || '').toLowerCase().includes(n));
  }), [rows, filter, search]);

  async function openAudit(row) {
    try {
      const detail = await getTemporaryAccess(row.id);
      setAuditRow(detail);
    } catch (e) {
      setError(e?.message || 'Failed to load audit history');
    }
  }

  async function confirmExtend() {
    if (!extendRow) return;
    const iso = new Date(extendRow.datetimeLocal).toISOString();
    if (isNaN(new Date(extendRow.datetimeLocal).getTime())) { setActionMsg('Pick a valid expiry'); return; }
    setBusyId(extendRow.row.id);
    setActionMsg(null);
    try {
      await extendTemporaryAccess(extendRow.row.id, { expires_at: iso, reason: 'Extended from management page' });
      setActionMsg('Expiry extended successfully.');
      setExtendRow(null);
      load();
    } catch (e) {
      setActionMsg(e?.message || 'Extend failed');
    } finally { setBusyId(null); }
  }

  async function confirmRevoke() {
    if (!revokeRow) return;
    setBusyId(revokeRow.row.id);
    setActionMsg(null);
    try {
      await revokeTemporaryAccess(revokeRow.row.id, { reason: revokeRow.reason || 'Revoked from management page' });
      setActionMsg('Access revoked — the FRO loses this station on their next request. Completed work is untouched.');
      setRevokeRow(null);
      load();
    } catch (e) {
      setActionMsg(e?.message || 'Revoke failed');
    } finally { setBusyId(null); }
  }

  return (
    <div className="ta-page">
      <div className="ta-page-head">
        <div>
          <h2 className="ta-page-head__title"><Clock size={22} /> Temporary Data Access</h2>
          <p className="ta-page-head__sub">
            Time-boxed, admin-granted permission for an FRO to work on another station's donors.
            Permanent station ownership never changes — the owner column is read-only, and completed
            calls, donations and receipts are never moved or rewritten when a grant starts, extends,
            expires or is revoked.
          </p>
        </div>
      </div>

      <div className="ta-stats">
        <div className="ta-stat ta-stat--active"><div className="ta-stat__label">Active grants</div><div className="ta-stat__value">{stats.active}</div></div>
        <div className="ta-stat ta-stat--scheduled"><div className="ta-stat__label">Scheduled</div><div className="ta-stat__value">{stats.scheduled}</div></div>
        <div className="ta-stat ta-stat--soon"><div className="ta-stat__label">Expiring â‰¤24h</div><div className="ta-stat__value">{stats.soon}</div></div>
        <div className="ta-stat"><div className="ta-stat__label">Total grants</div><div className="ta-stat__value">{stats.total}</div></div>
      </div>

      <div className="ta-toolbar">
        <div className="ta-seg">
          {FILTERS.map(f => (
            <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-soft)' }} />
          <input
            className="ta-search"
            style={{ paddingLeft: 30 }}
            placeholder="Search station / FRO / reason⬦"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-outline ta-btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Refresh
        </button>
        <span className="ta-toolbar__count">{visible.length} grant{visible.length === 1 ? '' : 's'}</span>
      </div>

      {actionMsg && <div className="ta-banner ta-banner--success">{actionMsg}</div>}
      {error && <div className="ta-banner ta-banner--danger">{error}</div>}

      {loading ? (
        <div className="ta-card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading⬦</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="ta-card">
          <div className="ta-empty">
            <div className="ta-empty__icon"><Clock size={24} /></div>
            <h3 className="ta-empty__title">No temporary grants{filter !== 'ALL' ? ` with status ${filter}` : ''}</h3>
            <p className="ta-empty__sub">
              Create one from the “Grant temporary access” button on any row in <b>Stations &amp; FROs</b>.
            </p>
            <button className="btn btn-primary ta-btn-sm" onClick={() => window.location.assign('/ngo-admin/stations')}>
              <PlusCircle size={13} style={{ marginRight: 4 }} /> Go to Stations
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ta-card ta-table-wrap">
            <table className="ta-table">
              <thead>
                <tr>
                  {['Station', 'Permanent FRO (owner)', 'Working FRO (temporary)', 'Scope', 'Granted by', 'Starts', 'Expires', 'Status', 'Reason', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const soon = isExpiringSoon(r.expires_at) && (r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED');
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="ta-cell-station">{r.station}</div>
                        {r.working_fro_active === false && <span className="ta-cell-sub" style={{ color: '#991b1b' }}>FRO inactive now</span>}
                      </td>
                      <td>
                        <div className="ta-owner">
                          <span className="ta-owner__name">{r.permanent_fro_name || '—'}</span>
                          <span className="ta-owner__lock"><Lock size={10} /> read-only owner</span>
                        </div>
                      </td>
                      <td>
                        <div className="ta-working">
                          <Avatar name={r.working_fro_name || '?'} size={26} />
                          <div>
                            <div className="ta-working__name">{r.working_fro_name || r.working_fro_worker_id}</div>
                            {r.working_fro_active === false && <span className="ta-inactive">(inactive)</span>}
                          </div>
                        </div>
                      </td>
                      <td><span className="ta-chip ta-chip--scope">{scopeLabel(r.scope_type)}</span></td>
                      <td style={{ fontSize: 12.5 }}>{r.granted_by_name || '—'}</td>
                      <td className="ta-time">{fmtIst(r.starts_at)}</td>
                      <td className="ta-time">
                        <span className={soon ? 'ta-chip ta-chip--soon' : ''} style={soon ? { padding: '2px 8px' } : {}}>
                          {fmtIst(r.expires_at)}
                        </span>
                        <span className="ta-time__rel">{relativeExpiry(r.expires_at)}</span>
                      </td>
                      <td><StatusPill status={r.computed_status} /></td>
                      <td className="ta-reason">
                        <div className="ta-reason__code">{String(r.reason_code || '').replace(/_/g, ' ').toLowerCase()}</div>
                        {r.reason_note && <div className="ta-reason__note" title={r.reason_note}>{r.reason_note}</div>}
                      </td>
                      <td>
                        <div className="ta-actions">
                          <button className="ta-btn-icon" title="Audit history" onClick={() => openAudit(r)}><History size={13} /></button>
                          {(r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED') && (
                            <>
                              <button className="ta-btn-icon" title="Extend expiry" disabled={busyId === r.id}
                                onClick={() => setExtendRow({ row: r, datetimeLocal: defaultExtendValue(r.expires_at) })}>
                                <Clock size={13} />
                              </button>
                              <button className="ta-btn-icon ta-btn-icon--danger" title="Revoke now" disabled={busyId === r.id}
                                onClick={() => setRevokeRow({ row: r, reason: '' })}>
                                <Ban size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="ta-mobile-list">
            {visible.map(r => {
              const soon = isExpiringSoon(r.expires_at) && (r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED');
              return (
                <div key={r.id} className="ta-mobile-card">
                  <div className="ta-mobile-card__head">
                    <span className="ta-mobile-card__station">{r.station}</span>
                    <StatusPill status={r.computed_status} />
                  </div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Permanent FRO</span><span className="ta-mobile-card__value">{r.permanent_fro_name || '—'} <Lock size={10} /></span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Working FRO</span><span className="ta-mobile-card__value">{r.working_fro_name || r.working_fro_worker_id}</span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Scope</span><span className="ta-mobile-card__value">{scopeLabel(r.scope_type)}</span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Granted by</span><span className="ta-mobile-card__value">{r.granted_by_name || '—'}</span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Starts</span><span className="ta-mobile-card__value">{fmtIst(r.starts_at)}</span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Expires</span><span className="ta-mobile-card__value">{fmtIst(r.expires_at)}{soon ? ' âš ' : ''}</span></div>
                  <div className="ta-mobile-card__row"><span className="ta-mobile-card__label">Reason</span><span className="ta-mobile-card__value">{String(r.reason_code || '').replace(/_/g, ' ').toLowerCase()}</span></div>
                  <div className="ta-mobile-card__actions">
                    <button className="ta-btn-icon" title="Audit" onClick={() => openAudit(r)}><History size={13} /></button>
                    {(r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED') && (
                      <>
                        <button className="ta-btn-icon" title="Extend" disabled={busyId === r.id} onClick={() => setExtendRow({ row: r, datetimeLocal: defaultExtendValue(r.expires_at) })}><Clock size={13} /></button>
                        <button className="ta-btn-icon ta-btn-icon--danger" title="Revoke" disabled={busyId === r.id} onClick={() => setRevokeRow({ row: r, reason: '' })}><Ban size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Extend dialog */}
      {extendRow && (
        <div className="modal-overlay" onClick={() => setExtendRow(null)}>
          <div className="modal ta-modal" onClick={e => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3><Clock size={16} /> Extend expiry — {extendRow.row.station}</h3>
              <button className="icon-btn" onClick={() => setExtendRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="ta-modal-body">
              <div className="ta-banner ta-banner--info">
                Current expiry: <b>{fmtIst(extendRow.row.expires_at)} IST</b>. Only the expiry moves — start time, scope and ownership stay as they are.
              </div>
              <div className="ta-field">
                <label className="ta-field__label">New expiry</label>
                <input type="datetime-local" className="ta-input" value={extendRow.datetimeLocal}
                  onChange={e => setExtendRow(v => ({ ...v, datetimeLocal: e.target.value }))} />
              </div>
            </div>
            <div className="ta-modal-foot">
              <button className="btn btn-outline" onClick={() => setExtendRow(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busyId === extendRow.row.id} onClick={confirmExtend}>
                {busyId === extendRow.row.id ? 'Extending⬦' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke dialog */}
      {revokeRow && (
        <div className="modal-overlay" onClick={() => setRevokeRow(null)}>
          <div className="modal ta-modal" onClick={e => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3><Ban size={16} /> Revoke temporary access — {revokeRow.row.station}</h3>
              <button className="icon-btn" onClick={() => setRevokeRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="ta-modal-body">
              <div className="ta-danger-box">
                <b>{revokeRow.row.working_fro_name || 'The FRO'}</b> immediately loses access to <b>{revokeRow.row.station}</b> on
                their next request. Calls, dispositions, donations and receipts already recorded stay exactly
                where they are, and <b>{revokeRow.row.permanent_fro_name || 'the permanent FRO'}</b> remains the owner.
              </div>
              <div className="ta-field">
                <label className="ta-field__label">Reason (optional, recorded in audit trail)</label>
                <textarea className="ta-input ta-textarea" placeholder="Reason⬦"
                  value={revokeRow.reason} onChange={e => setRevokeRow(v => ({ ...v, reason: e.target.value }))} />
              </div>
            </div>
            <div className="ta-modal-foot">
              <button className="btn btn-outline" onClick={() => setRevokeRow(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                disabled={busyId === revokeRow.row.id} onClick={confirmRevoke}>
                {busyId === revokeRow.row.id ? 'Revoking⬦' : 'Revoke now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit dialog */}
      {auditRow && (
        <div className="modal-overlay" onClick={() => setAuditRow(null)}>
          <div className="modal ta-modal ta-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3><History size={16} /> Audit — {auditRow.station} → {auditRow.working_fro_name || auditRow.working_fro_worker_id}</h3>
              <button className="icon-btn" onClick={() => setAuditRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="ta-modal-body">
              {(auditRow.events || []).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No events recorded.</p>
              ) : (
                <div className="ta-timeline">
                  {(auditRow.events || []).map(ev => (
                    <div key={ev.id} className="ta-timeline__item">
                      <span className="ta-timeline__dot" />
                      <div className="ta-timeline__head">
                        <span className="ta-timeline__type">{ev.event_type}</span>
                        <span className="ta-timeline__time">{fmtIst(ev.created_at)} IST</span>
                      </div>
                      {ev.actor_admin_id && (
                        <div className="ta-timeline__meta">by admin {ev.actor_admin_id} ({ev.actor_role || '—'})</div>
                      )}
                      {ev.reason && <div className="ta-timeline__meta">Reason: {ev.reason}</div>}
                      {ev.previous_state && (
                        <pre className="ta-timeline__state">{JSON.stringify(ev.previous_state, null, 1)}</pre>
                      )}
                      {ev.new_state && (
                        <pre className="ta-timeline__state" style={{ background: '#f0fdf4' }}>{JSON.stringify(ev.new_state, null, 1)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const defaultExtendValue = (expiresAt) => {
  const base = new Date(expiresAt);
  if (isNaN(base.getTime())) base.setTime(Date.now() + 86400000);
  base.setDate(base.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}T${p(base.getHours())}:${p(base.getMinutes())}`;
};
