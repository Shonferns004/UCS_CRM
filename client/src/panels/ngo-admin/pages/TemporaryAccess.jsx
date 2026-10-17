import { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw, Ban, History, X } from 'lucide-react';
import {
  listTemporaryAccess,
  getTemporaryAccess,
  extendTemporaryAccess,
  revokeTemporaryAccess,
} from '../api/auth';

// ─── Temporary Access — admin management page ────────────────────────────────
// Read/manage every temporary grant: who may work which station, until when,
// granted by whom, and the full audit trail. This page READS permanent
// ownership (permanent FRO column) to show the contrast, but every mutation
// here touches temporary_data_assignments only — revoking or extending a
// grant never reassigns a station or a donor.
//
// If the backend answers 503 TEMP_ACCESS_DISABLED the feature flag is off:
// we show an explanatory empty state rather than an error, so a rollout that
// has not started yet does not look broken.

const STATUS_PILL = {
  ACTIVE:      { bg: '#ecfdf5', fg: '#065f46', bd: '#a7f3d0' },
  SCHEDULED:   { bg: '#eff6ff', fg: '#1e40af', bd: '#bfdbfe' },
  EXPIRED:     { bg: '#f9fafb', fg: '#6b7280', bd: '#e5e7eb' },
  REVOKED:     { bg: '#fef2f2', fg: '#991b1b', bd: '#fecaca' },
  CANCELLED:   { bg: '#f9fafb', fg: '#6b7280', bd: '#e5e7eb' },
};

const FILTERS = ['ALL', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'REVOKED'];

function fmtIst(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.EXPIRED;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11,
      fontWeight: 600, background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
    }}>{status}</span>
  );
}

export default function TemporaryAccess() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [auditRow, setAuditRow] = useState(null); // assignment with events loaded
  const [busyId, setBusyId] = useState(null);
  const [extendRow, setExtendRow] = useState(null); // { row, datetimeLocal }
  const [revokeRow, setRevokeRow] = useState(null); // { row, reason }
  const [actionMsg, setActionMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTemporaryAccess();
      setRows(Array.isArray(data) ? data : []);
      setDisabled(false);
    } catch (e) {
      if (e?.data?.code === 'TEMP_ACCESS_DISABLED') setDisabled(true);
      else setError(e?.message || 'Failed to load temporary access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.computed_status !== filter) return false;
    if (!search) return true;
    const n = search.toLowerCase();
    return [r.station, r.working_fro_name, r.permanent_fro_name, r.reason_code]
      .some(v => String(v || '').toLowerCase().includes(n));
  });

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
      setActionMsg('Expiry extended.');
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

  const inputStyle = { padding: '6px 9px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, fontFamily: 'inherit' };

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Clock size={20} />
        <h2 style={{ margin: 0, fontSize: 18 }}>Temporary Data Access</h2>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-soft)', maxWidth: 760, lineHeight: 1.5 }}>
        Time-boxed, admin-granted permission for an FRO to work on another station's donors.
        Permanent station ownership never changes — the owner column below is read-only, and
        completed calls, donations and receipts are never moved or rewritten when a grant
        starts, extends, expires or is revoked.
      </p>

      {disabled && (
        <div style={{ padding: 14, borderRadius: 8, background: '#f9fafb', border: '1px solid var(--line, #e5e7eb)', fontSize: 13, color: 'var(--ink-soft)' }}>
          Temporary Data Access is switched off on this server (<code>TEMP_DATA_ACCESS_ENABLED</code> is not <code>true</code>).
          Grants cannot be created or managed until it is enabled.
        </div>
      )}

      {!disabled && (
        <>
          {/* controls */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >{f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}</button>
            ))}
            <input
              style={{ ...inputStyle, minWidth: 220 }}
              placeholder="Search station / FRO / reason…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={load}>
              <RefreshCw size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Refresh
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>
              {visible.length} grant{visible.length === 1 ? '' : 's'}
            </span>
          </div>

          {actionMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12.5, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
              {actionMsg}
            </div>
          )}
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12.5, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              {error}
            </div>
          )}

          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    {['Station', 'Permanent FRO (owner)', 'Working FRO (temporary)', 'Scope', 'Granted by', 'Starts', 'Expires', 'Status', 'Reason', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #e5e7eb)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line, #f3f4f6)' }}>
                      <td style={cell}><b>{r.station}</b></td>
                      <td style={cell}>
                        {r.permanent_fro_name || '—'}
                        <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>unchanged by grants</div>
                      </td>
                      <td style={cell}>
                        {r.working_fro_name || r.working_fro_worker_id}
                        {r.working_fro_active === false && (
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: '#991b1b' }}>(inactive now)</span>
                        )}
                      </td>
                      <td style={cell}>{r.scope_type === 'STATION_ALL' ? 'Entire station' : r.scope_type}</td>
                      <td style={cell}>{r.granted_by_name || '—'}</td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fmtIst(r.starts_at)}</td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fmtIst(r.expires_at)}</td>
                      <td style={cell}><StatusPill status={r.computed_status} /></td>
                      <td style={{ ...cell, maxWidth: 180 }}>
                        <div>{String(r.reason_code || '').replace(/_/g, ' ').toLowerCase()}</div>
                        {r.reason_note && <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{r.reason_note}</div>}
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        <button className="btn btn-outline" style={btnSm} onClick={() => openAudit(r)} title="Audit history">
                          <History size={12} />
                        </button>{' '}
                        {(r.computed_status === 'ACTIVE' || r.computed_status === 'SCHEDULED') && (
                          <>
                            <button
                              className="btn btn-outline"
                              style={btnSm}
                              title="Extend expiry"
                              disabled={busyId === r.id}
                              onClick={() => setExtendRow({
                                row: r,
                                datetimeLocal: defaultExtendValue(r.expires_at),
                              })}
                            >Extend</button>{' '}
                            <button
                              className="btn btn-outline"
                              style={{ ...btnSm, color: '#991b1b', borderColor: '#fecaca' }}
                              title="Revoke now"
                              disabled={busyId === r.id}
                              onClick={() => setRevokeRow({ row: r, reason: '' })}
                            ><Ban size={12} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && !loading && (
                    <tr>
                      <td colSpan={10} style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12.5 }}>
                        No temporary grants{filter !== 'ALL' ? ` with status ${filter}` : ''}. Create one from
                        the ⋮ menu on any row in <b>Stations &amp; FROs</b>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── extend dialog ── */}
      {extendRow && (
        <div className="modal-overlay" onClick={() => setExtendRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Extend expiry — {extendRow.row.station}</h3>
              <button className="icon-btn" onClick={() => setExtendRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ color: 'var(--ink-soft)' }}>
                Current expiry: <b>{fmtIst(extendRow.row.expires_at)} IST</b>. Only the expiry moves —
                start time, scope and ownership stay as they are.
              </div>
              <input
                type="datetime-local"
                style={inputStyle}
                value={extendRow.datetimeLocal}
                onChange={e => setExtendRow(v => ({ ...v, datetimeLocal: e.target.value }))}
              />
            </div>
            <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setExtendRow(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busyId === extendRow.row.id} onClick={confirmExtend}>
                {busyId === extendRow.row.id ? 'Extending…' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── revoke dialog ── */}
      {revokeRow && (
        <div className="modal-overlay" onClick={() => setRevokeRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <h3>Revoke temporary access — {revokeRow.row.station}</h3>
              <button className="icon-btn" onClick={() => setRevokeRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
                <b>{revokeRow.row.working_fro_name || 'The FRO'}</b> immediately loses access to <b>{revokeRow.row.station}</b> on
                their next request. Calls, dispositions, donations and receipts already recorded stay exactly
                where they are, and <b>{revokeRow.row.permanent_fro_name || 'the permanent FRO'}</b> remains the owner.
              </div>
              <textarea
                style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }}
                placeholder="Reason (optional, recorded in the audit trail)"
                value={revokeRow.reason}
                onChange={e => setRevokeRow(v => ({ ...v, reason: e.target.value }))}
              />
            </div>
            <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setRevokeRow(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                disabled={busyId === revokeRow.row.id}
                onClick={confirmRevoke}
              >{busyId === revokeRow.row.id ? 'Revoking…' : 'Revoke now'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── audit dialog ── */}
      {auditRow && (
        <div className="modal-overlay" onClick={() => setAuditRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h3><History size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Audit — {auditRow.station} · {auditRow.working_fro_name || auditRow.working_fro_worker_id}</h3>
              <button className="icon-btn" onClick={() => setAuditRow(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ padding: 16, maxHeight: 420, overflowY: 'auto' }}>
              {(auditRow.events || []).length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No events recorded.</p>
              )}
              {(auditRow.events || []).map(ev => (
                <div key={ev.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line, #f3f4f6)', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b>{ev.event_type}</b>
                    <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{fmtIst(ev.created_at)} IST</span>
                  </div>
                  {ev.actor_admin_id && (
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>by admin {ev.actor_admin_id} ({ev.actor_role || '—'})</div>
                  )}
                  {ev.reason && <div style={{ fontSize: 11.5 }}>Reason: {ev.reason}</div>}
                  {ev.previous_state && (
                    <pre style={{ fontSize: 10.5, background: '#f8fafc', borderRadius: 4, padding: 6, margin: '4px 0 0', overflowX: 'auto' }}>
                      {JSON.stringify(ev.previous_state, null, 1)}
                    </pre>
                  )}
                  {ev.new_state && (
                    <pre style={{ fontSize: 10.5, background: '#f0fdf4', borderRadius: 4, padding: 6, margin: '4px 0 0', overflowX: 'auto' }}>
                      {JSON.stringify(ev.new_state, null, 1)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };
const btnSm = { padding: '3px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 };

function defaultExtendValue(expiresAt) {
  // Pre-fill with current expiry + 1 day, in the browser's local (IST) input format.
  const base = new Date(expiresAt);
  if (isNaN(base.getTime())) base.setTime(Date.now() + 86400000);
  base.setDate(base.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}T${p(base.getHours())}:${p(base.getMinutes())}`;
}
