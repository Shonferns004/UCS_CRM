import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
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

// Absconding flips employment_status but leaves the worker in department 'FRO', so
// this endpoint still lists them and they render like everyone else - an ex-FRO
// sitting among active names with a live target. Only absconded is labelled; other
// non-active statuses deliberately stay unmarked so this page keeps one concern.
const isAbsconded = (r) => String(r.employment_status || 'active').toLowerCase() === 'absconded';

function StatusPill({ row }) {
  if (!isAbsconded(row)) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  return (
    <span style={{ background: '#fff3e0', color: '#e65100', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      Absconded
    </span>
  );
}

function Row({ row, onEdit }) {
  const absconded = isAbsconded(row);
  // An orange "needs a target" row is the loudest signal on this screen, so an
  // absconded FRO gets a muted grey row instead - they cannot collect, and the
  // row is context, not a task.
  const needsAttention = !absconded && row.target_source === 'not_set';
  const td = { padding: '10px 12px', borderBottom: '1px solid #eee' };

  return (
    <tr style={{ background: needsAttention ? '#fff7ed' : undefined, opacity: absconded ? 0.65 : undefined }}>
      <td style={{ ...td, fontWeight: 600 }}>
        {row.name}
        {needsAttention && <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309', fontWeight: 600 }}>needs a target</span>}
      </td>
      <td style={{ ...td, color: '#6b7280', fontSize: 13 }}>{row.login_id || '—'}</td>
      <td style={td}>{money(row.salary)}</td>
      <td style={td}>{row.months_employed != null ? row.months_employed + 1 : '—'}</td>
      <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(row.target)}</td>
      <td style={td}>
        <button className="btn btn-sm btn-outline" onClick={() => onEdit(row)}>
          {needsAttention ? 'Set target' : 'Edit'}
        </button>
      </td>
      <td style={td}><SourcePill row={row} /></td>
      <td style={td}><StatusPill row={row} /></td>
    </tr>
  );
}

// Editing used to swap a 120px input in beside two buttons inside the row, which
// overflowed the Target column and left no room for the number you were typing.
// This is a real dialog instead: the amount gets a full-width field with a rupee
// affix, the current value and where it came from are stated up front, and
// Enter/Escape behave the way they do in the rest of the app.
function TargetModal({ row, month, value, setValue, saving, onSave, onClose }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const field = {
    width: '100%', padding: '10px 12px', fontSize: 16, fontWeight: 600,
    border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box',
  };
  const label = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', fontWeight: 600 };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(17,24,39,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={`Set target for ${row.name}`}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400,
          boxShadow: '0 20px 45px rgba(0,0,0,.22)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{row.target_source === 'not_set' ? 'Set target' : 'Edit target'}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{row.name}{row.login_id ? ` · ${row.login_id}` : ''}</div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ ...label, marginBottom: 6 }}>Collection target for {fmtMonth(month)}</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 15, fontWeight: 600 }}>₹</span>
            <input
              ref={inputRef}
              type="number" min="0" step="1" value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
              style={{ ...field, paddingLeft: 30 }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
            Current: <strong>{money(row.target)}</strong> · <SourcePill row={row} />
          </div>
        </div>

        <div style={{ padding: '12px 20px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save target'}</button>
        </div>
      </div>
    </div>
  );
}

export default function FroTargets() {
  const [month, setMonth] = useState(() => istMonthKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editValue, setEditValue] = useState('');

  const openEditor = useCallback((row) => {
    setEditValue(row.target_source === 'not_set' ? '' : String(row.target ?? 0));
    setEditingRow(row);
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditingRow(null);
    setEditValue('');
  }, [saving]);

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/ngo-admin/targets?month=${month}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((err) => toast(err.message || 'Could not load targets', 'error'))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(load, [load]);

  const save = async (row, amount) => {
    if (!Number.isFinite(amount) || amount < 0) { toast('Enter a non-negative amount', 'error'); return; }
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
      setEditingRow(null);
      setEditValue('');
    } catch (err) {
      toast(err.message || 'Could not save target', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Someone who absconded cannot collect, so they are not "waiting on a decision"
  // and counting them would bury the real gap. The row is still on screen - the
  // number on the board must match the number of rows.
  const needsCount = useMemo(() => rows.filter((r) => !isAbsconded(r) && r.target_source === 'not_set').length, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      // The 'Needs a target' filter is a worklist, so an absconded FRO is not on
      // it - same rule as the banner count.
      .filter((r) => (filter === 'not_set' ? (!isAbsconded(r) && r.target_source === 'not_set') : (filter === 'all' ? true : r.target_source === filter)))
      .filter((r) => !q || String(r.name || '').toLowerCase().includes(q) || String(r.login_id || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Absconded sink to the bottom as a group; each group stays alphabetical
        // so the active block reads the same as it always did.
        const g = Number(isAbsconded(b)) - Number(isAbsconded(a));
        return g || String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [rows, filter, search]);

  // Exports exactly what the table shows, so the search box and source filter
  // apply to the file too - otherwise a filtered screen would silently hand over
  // the whole roster. Target stays a number (not "₹1,00,000") so the column is
  // still summable in Excel.
  const exportExcel = useCallback(() => {
    if (visible.length === 0) { toast('Nothing to export with the current filter', 'error'); return; }
    try {
      const data = visible.map((r) => ({
        'FRO Name': r.name || '',
        'Login ID': r.login_id || '',
        'Salary': Number(r.salary) || 0,
        'Tenure (months)': r.months_employed != null ? r.months_employed + 1 : '',
        'Target': Number(r.target) || 0,
        'Source': (SOURCE_LABEL[r.target_source] || SOURCE_LABEL.not_set)(r),
        'Status': isAbsconded(r) ? 'Absconded' : 'Active',
        'Set for Month': fmtMonth(month),
      }));

      const header = Object.keys(data[0]);
      const ws = XLSX.utils.json_to_sheet(data, { header });
      ws['!cols'] = [
        { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 32 }, { wch: 12 }, { wch: 14 },
      ];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'FRO Targets');

      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `fro-targets-${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast(`Exported ${visible.length} FRO${visible.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err.message || 'Could not export targets', 'error');
    }
  }, [visible, month]);

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
          <button className="btn btn-sm btn-outline" onClick={exportExcel}>Download</button>
          <button className="btn btn-sm btn-outline" onClick={load}>Refresh</button>
          <button className="btn btn-sm btn-outline" onClick={exportExcel} disabled={loading || visible.length === 0}>
            Export Excel
          </button>
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
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#6b7280' }}>
          {visible.length} shown{abscondedShown > 0 ? ` · ${abscondedShown} absconded at the bottom` : ''}
        </span>
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
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No FROs match this filter.</td></tr>
            ) : (
              visible.map((r) => <Row key={r.id} row={r} onEdit={openEditor} />)
            )}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <TargetModal
          row={editingRow}
          month={month}
          value={editValue}
          setValue={setEditValue}
          saving={saving}
          onSave={() => save(editingRow, Number(editValue))}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}