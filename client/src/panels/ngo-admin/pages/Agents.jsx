import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listCrmAgents,
  getCrmAgentFroOptions,
  createCrmAgent,
  setCrmAgentActive,
  setCrmAgentAssignment,
  resetCrmAgentPassword,
  deleteCrmAgent,
  bulkCreateCrmAgents,
  apiGet,
  apiPost,
} from '../api/auth';
import { istMonthKey } from '../../../utils/istDate';

const DEFAULT_PASSWORD = '123456';
//
// An agent is a person who works one FRO's data without holding the FRO's own
// credentials: the admin creates one, assigns an FRO, and hands over a login_id
// and password. From the FRO panel it is indistinguishable from the FRO — same
// queue, same donors, and the performance board shows the FRO as the one working.
//
// The password is displayed once, at creation or reset, and is never recoverable
// afterwards. That is why the credentials panel below is not a "reveal" button:
// there is nothing to reveal.

const statusChip = (a) => {
  if (!a.is_active) return { label: 'Inactive', color: '#94a3b8' };
  if (a.worker_is_active === false || a.worker_employment_status === 'terminated') {
    return { label: 'FRO inactive', color: '#f59e0b' };
  }
  if (a.station_count === 0) return { label: 'No stations', color: '#f59e0b' };
  return { label: 'Active', color: '#16a34a' };
};

const fmtDate = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Shown once after create / reset. Deliberately a modal the admin must dismiss,
// not a toast: this is the only copy of the credential, and a toast that
// disappears after 4 seconds is how an admin ends up resetting the password again.
function CredentialsModal({ grant, onClose }) {
  const { agent, credentials } = grant || {};
  if (!agent) return null;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `${credentials.login_id} / ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, borderRadius: 'var(--radius)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 24px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{agent.label} is ready</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Share these with {agent.label}. This is the only time the password is shown — it is
            stored hashed and cannot be retrieved later.
          </p>
        </div>

        <div style={{ padding: '16px 24px', display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>
              Login ID
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>
              {credentials.login_id}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>
              Password
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>
              {credentials.password}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Covers <strong>{agent.worker_name}</strong>
          </div>
        </div>

        <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [grant, setGrant] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [formWorkerId, setFormWorkerId] = useState('');
  const [formPassword, setFormPassword] = useState(DEFAULT_PASSWORD);
  const [formMustChange, setFormMustChange] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editWorkerId, setEditWorkerId] = useState('');

  const [targets, setTargets] = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [targetAmount, setTargetAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, w, t] = await Promise.all([
        listCrmAgents(),
        getCrmAgentFroOptions(),
        apiGet(`/ngo-admin/targets?month=${istMonthKey()}`).catch(() => []),
      ]);
      setAgents(a?.agents || []);
      setWorkers(w?.workers || []);
      setTargets(Array.isArray(t) ? t : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Options are the FROs that are free, plus the one each existing agent already
  // holds — otherwise re-assigning an agent to its current FRO would render as
  // "unavailable" and the dropdown would be stuck.
  const availableWorkers = useMemo(
    () => workers.filter((w) => w.assignable || w.agent_id === editingId),
    [workers, editingId]
  );

  const heldCount = agents.filter((a) => a.is_active).length;

  const run = async (fn, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      await load();
      if (successMessage) setNotice(successMessage);
      return result;
    } catch (e) {
      setError(e?.message || 'Something went wrong');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const res = await run(
      () =>
        createCrmAgent({
          worker_id: formWorkerId || undefined,
          password: formPassword || DEFAULT_PASSWORD,
          must_change_password: formMustChange,
        }),
      null
    );
    if (res?.agent) {
      setGrant({ agent: { ...res.agent, worker_name: workers.find((w) => w.id === formWorkerId)?.name }, credentials: res.credentials });
      setCreateOpen(false);
      setFormWorkerId('');
      setFormPassword(DEFAULT_PASSWORD);
      setFormMustChange(false);
    }
  };

  const submitBulk = async () => {
    const ids = bulkIds
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    setBulkStatus('');
    try {
      const res = await bulkCreateCrmAgents({
        login_ids: ids,
        password: DEFAULT_PASSWORD,
        must_change_password: false,
      });
      setNotice(res?.message || `${ids.length} created.`);
      setBulkStatus(
        (res?.errors || [])
          .map((e) => `${e.login_id}: ${e.message}`)
          .join('\n')
      );
      setBulkIds('');
      await load();
    } catch (e) {
      setError(e?.message || 'Bulk create failed');
    } finally {
      setBusy(false);
    }
  };

  const submitReassign = async (agent) => {
    if (!editWorkerId) return;
    const res = await run(
      () => setCrmAgentAssignment(agent.id, editWorkerId),
      `${agent.label} reassigned.`
    );
    if (res) {
      setEditingId(null);
      setEditWorkerId('');
    }
  };

  const doReset = async (agent) => {
    // No confirm dialog: a reset to the standard default is a routine,
    // reversible admin action, and the modal afterwards shows the result.
    const res = await run(() => resetCrmAgentPassword(agent.id), null);
    if (res?.credentials) setGrant({ agent, credentials: res.credentials });
  };

  return (
    <div>
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Agents</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
              An agent works one FRO&rsquo;s account without using the FRO&rsquo;s own login. The FRO
              still shows as online on the performance board, and everything they collect is credited
              to them.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {heldCount} active &middot; {agents.length} total
            </span>
            <button className="btn primary" onClick={() => { setCreateOpen(v => !v); setBulkOpen(false); }} disabled={busy}>
              {createOpen ? 'Cancel' : '+ New agent'}
            </button>
            <button className="btn ghost" onClick={() => { setBulkOpen(v => !v); setCreateOpen(false); }} disabled={busy}>
              {bulkOpen ? 'Cancel' : '+ Bulk add'}
            </button>
          </div>
        </div>

        {createOpen && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'grid',
              gap: 12,
              maxWidth: 520,
            }}
          >
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Covered FRO</label>
              <select
                className="input"
                value={formWorkerId}
                onChange={(e) => setFormWorkerId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              >
                <option value="">Select an FRO&hellip;</option>
                {availableWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.station_count > 0 ? ` \u2014 ${w.station_count} station${w.station_count > 1 ? 's' : ''}` : ' \u2014 no stations'}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Only FROs nobody is covering yet. Leave blank only to create a bare handle you will
                assign later via Reassign. Creating an agent also signs the FRO out of any session
                they have open.
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Password</label>
              <input
                className="input"
                type="text"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              />
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={formMustChange} onChange={(e) => setFormMustChange(e.target.checked)} />
                Require a password change at first login
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={submitCreate} disabled={busy}>
                {busy ? 'Creating\u2026' : 'Create agent'}
              </button>
            </div>
          </div>
        )}

        {bulkOpen && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'grid',
              gap: 12,
              maxWidth: 520,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 600 }}>Bulk add login ids (one per line, comma, or space)</label>
            <textarea
              className="input"
              value={bulkIds}
              onChange={(e) => setBulkIds(e.target.value)}
              rows={6}
              placeholder={'agent1\nagent2\nagent3'}
              style={{ width: '100%', marginTop: 4, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Creates each as an unassigned {DEFAULT_PASSWORD}-password agent. You can assign FROs
              after using Reassign.
            </div>
            {bulkStatus && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{bulkStatus}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setBulkOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={submitBulk} disabled={busy || !bulkIds.trim()}>
                {busy ? 'Creating\u2026' : 'Create all'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="card"
          style={{ padding: '10px 14px', marginBottom: 12, borderLeft: '3px solid #dc2626', color: '#b91c1c', fontSize: 13 }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          className="card"
          style={{ padding: '10px 14px', marginBottom: 12, borderLeft: '3px solid #16a34a', color: '#15803d', fontSize: 13 }}
        >
          {notice}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Loading agents&hellip;</div>
        ) : agents.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No agents yet</div>
            <div style={{ fontSize: 13 }}>
              Create one to hand a colleague access to an FRO&rsquo;s account.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Agent</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Covers</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Login ID</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Target</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Created</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...agents]
                .sort((a, b) => {
                  const aOk = a.is_active && a.worker_is_active !== false && a.employment_status !== 'terminated' && a.station_count > 0;
                  const bOk = b.is_active && b.worker_is_active !== false && b.employment_status !== 'terminated' && b.station_count > 0;
                  if (aOk !== bOk) return aOk ? -1 : 1;
                  return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true });
                })
                .map((a) => {
                const chip = statusChip(a);
                const isEditing = editingId === a.id;
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', opacity: a.is_active ? 1 : 0.6 }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {a.station_count} station{a.station_count === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select
                            className="input"
                            value={editWorkerId || a.worker_id}
                            onChange={(e) => setEditWorkerId(e.target.value)}
                          >
                            <option value={a.worker_id}>{a.worker_name} (current)</option>
                            {workers
                              .filter((w) => w.assignable && w.id !== a.worker_id)
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                          </select>
                          <button className="btn primary" onClick={() => submitReassign(a)} disabled={busy}>
                            Save
                          </button>
                          <button className="btn ghost" onClick={() => { setEditingId(null); setEditWorkerId(''); }} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div>{a.worker_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.worker_login_id}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>{a.login_id}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          color: chip.color,
                          background: `${chip.color}1a`,
                        }}
                      >
                        {chip.label}
                      </span>
                      {a.must_change_password && (
                        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 3 }}>password change pending</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {(() => {
                        const row = a.worker_id ? targets.find((t) => t.fro_worker_id === a.worker_id) : null;
                        const amount = row ? parseFloat(row.target_amount) : 0;
                        return (
                          <button
                            className="btn ghost"
                            style={{ fontSize: 11, padding: '2px 8px', color: row ? 'var(--ink)' : '#9ca3af' }}
                            onClick={() => {
                              setEditTarget({ workerId: a.worker_id, name: a.worker_name || a.label, ngoId: a.ngo_id, amount: row ? String(row.target_amount) : '' });
                              setTargetAmount(row ? String(row.target_amount) : '');
                            }}
                          >
                            {row ? `\u20B9${Number(amount).toLocaleString('en-IN')}` : 'Set target'}
                          </button>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ghost" onClick={() => { setEditingId(a.id); setEditWorkerId(''); }} disabled={busy}>
                        Reassign
                      </button>{' '}
                      <button className="btn ghost" onClick={() => doReset(a)} disabled={busy}>
                        Reset password
                      </button>{' '}
                      {a.is_active ? (
                        <button className="btn ghost" onClick={() => run(() => setCrmAgentActive(a.id, false), `${a.label} deactivated.`)} disabled={busy}>
                          Deactivate
                        </button>
                      ) : (
                        <button className="btn ghost" onClick={() => run(() => setCrmAgentActive(a.id, true), `${a.label} reactivated.`)} disabled={busy}>
                          Reactivate
                        </button>
                      )}{' '}
                      <button
                        className="btn ghost"
                        style={{ color: '#dc2626' }}
                        onClick={() => {
                          if (window.confirm(`Delete ${a.label}? This removes the login entirely and cannot be undone. Deactivate instead if it may come back.`)) {
                            run(() => deleteCrmAgent(a.id), `${a.label} deleted.`);
                          }
                        }}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
                })}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
        Deactivating stops the agent signing in and frees the FRO to be covered again; their row is
        kept so past records still read correctly. Reassigning moves the agent, login and all — an
        agent is always tied to exactly one FRO at a time, and what they collected beforehand stays
        credited to whoever held the account at the time.
      </p>

      {grant && <CredentialsModal grant={grant} onClose={() => setGrant(null)} />}

      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Set Target — {editTarget.name}</h3>
            <div className="field">
              <label>Monthly Target Amount (₹)</label>
              <input type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} min="0" />
            </div>
            <button
              className="btn btn-primary"
              disabled={!targetAmount}
              onClick={async () => {
                try {
                  await apiPost('/ngo-admin/targets', {
                    fro_worker_id: editTarget.workerId,
                    month: istMonthKey(),
                    target_amount: parseFloat(targetAmount),
                    ngo_id: editTarget.ngoId || null,
                  });
                  setEditTarget(null);
                  await load();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
