import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/auth';
import { toast } from './Toast';
import { istMonthKey } from '../utils/istDate';

// Both the HR and Accounts panels mount this same component. The api wrapper is
// built here rather than imported from either panel's helper because both panels'
// wrappers are byte-identical (same `ucs` token prefix, same base URL) and a
// shared screen must not depend on one panel's module layout.
const apiGet = (path) => api(path, { _prefix: 'ucs' });
const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body), _prefix: 'ucs' });

// Per-FRO monthly collection targets, for HR and Accounts.
//
// Why this page exists. A monthly target used to be editable only from the
// NGO-admin Station Management screen, which the NGO-admin panel is for. Two
// consequences: the 20 roster FROs who have never had a target in any month could
// not be given one by HR at all, and on the 1st of a month every established FRO
// read "Not set" until an NGO admin manually re-entered last month's figure.
// Carry-forward now removes the second problem automatically, but the first is
// only solved if HR can set a figure - so this screen lists exactly who still
// needs one.
//
// It reads the same endpoint the NGO-admin board reads (GET /ngo-admin/targets)
// rather than its own query, so there is one definition of what an FRO's target
// is. target_source comes from the shared resolver:
//   auto            - salary x 1 / 2.5 / 3, first three months
//   manual          - a figure someone set for this month
//   carried_forward - inherited from an earlier month, nothing set here yet
//   not_set         - nothing at all; needs a decision
// Editing always writes this month, and overrides the auto tier while the FRO is
// still inside their first three months.

const fmtMonth = (m) => {
  if (!m) return '—';
  const p = String(m).slice(0, 7).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(p[1], 10) - 1]} ${p[0]}`;
};

const money = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));

const SOURCE_LABEL = {
  auto: (r) => `Auto · month ${Math.min((r.months_employed ?? 0) + 1, 3)}`,
  manual: () => 'Set for this month',
  carried_forward: (r) => `Carried over from ${fmtMonth(r.target_source_month) || 'an earlier month'}`,
  not_set: () => 'Not set',
};

const SOURCE_STYLE = {
  auto: { bg: '#fef3c7', color: '#92400e' },
  manual: { bg: '#dcfce7', color: '#166534' },
  carried_forward: { bg: '#dbeafe', color: '#1e40af' },
  not_set: { bg: '#fee2e2', color: '#991b1b' },
};

function SourcePill({ row }) {
  const style = SOURCE_STYLE[row.target_source] || SOURCE_STYLE.not_set;
  const label = (SOURCE_LABEL[row.target_source] || SOURCE_LABEL.not_set)(row);
  return (
    <span style={{ background: style.bg, color: style.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function Row({ row, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const needsAttention = row.target_source === 'not_set';

  const open = () => {
    setValue(row.target_source === 'not_set' ? '' : String(row.target ?? 0));
    setEditing(true);
  };

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) { toast('Enter a non-negative amount', 'error'); return; }
    await onSave(row, n);
    setEditing(false);
  };

  return (
    <tr style={{ background: needsAttention ? '#fff7ed' : undefined }}>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
        {row.name}
        {needsAttention && <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309', fontWeight: 600 }}>needs a target</span>}
      </td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', color: '#6b7280', fontSize: 13 }}>{row.login_id || '—'}</td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>{money(row.salary)}</td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>{row.months_employed != null ? row.months_employed + 1 : '—'}</td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {editing ? (
          <input
            autoFocus
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ width: 120, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          />
        ) : money(row.target)}
      </td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
        {editing ? (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>Save</button>
            <button className="btn btn-sm btn-outline" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <button className="btn btn-sm btn-outline" onClick={open}>
            {row.target_source === 'not_set' ? 'Set target' : 'Edit'}
          </button>
        )}
      </td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}><SourcePill row={row} /></td>
    </tr>
  );
}

export default function FroTargets() {
  const [month, setMonth] = useState(() => istMonthKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/ngo-admin/targets?month=${month}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((err) => toast(err.message || 'Could not load targets', 'error'))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(load, [load]);

  const save = async (row, amount) => {
    setSaving(true);
    try {
      await apiPost('/ngo-admin/targets', {
        fro_worker_id: row.id,
        month,
        target_amount: amount,
        ngo_id: row.ngo_id || undefined,
      });
      toast(`Target set for ${row.name}`, 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not save target', 'error');
    } finally {
      setSaving(false);
    }
  };

  const needsCount = useMemo(() => rows.filter((r) => r.target_source === 'not_set').length, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : r.target_source === filter))
      .filter((r) => !q || String(r.name || '').toLowerCase().includes(q) || String(r.login_id || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [rows, filter, search]);

  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>FRO Monthly Targets</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Collection targets per FRO. First three months are derived from salary; after that a target
            carries over from the last month one was set until you change it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
          <button className="btn btn-sm btn-outline" onClick={load}>Refresh</button>
        </div>
      </div>

      {needsCount > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          <strong>{needsCount}</strong> FRO{needsCount === 1 ? '' : 's'} still {needsCount === 1 ? 'has' : 'have'} no target for {fmtMonth(month)}.
          Set one so their incentive and leaderboard rank calculate.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name or login ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, minWidth: 220 }}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}>
          <option value="all">All sources</option>
          <option value="not_set">Needs a target</option>
          <option value="carried_forward">Carried over</option>
          <option value="manual">Set for this month</option>
          <option value="auto">Auto (first 3 months)</option>
        </select>
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#6b7280' }}>{visible.length} shown</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>FRO</th>
              <th style={th}>Login ID</th>
              <th style={th}>Salary</th>
              <th style={th}>Tenure</th>
              <th style={th}>Target</th>
              <th style={th}></th>
              <th style={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No FROs match this filter.</td></tr>
            ) : (
              visible.map((r) => <Row key={r.id} row={r} saving={saving} onSave={save} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}