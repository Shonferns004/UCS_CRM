import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

function EmptyState({ text }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center z-10 p-xl rounded-xl border border-border-subtle bg-surface/80 backdrop-blur-sm max-w-sm w-full mx-auto shadow-2xl">
        <Icon name="database_off" className="text-on-surface-variant mb-4 inline-block" size={36} />
        <h3 className="font-headline-md text-headline-md text-on-surface mb-2">No rows</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
      </div>
    </div>
  );
}

function cellClass(v) {
  return v === null || v === undefined ? 'null' : (typeof v === 'object' ? 'json' : 'cell');
}

const colName = (c) => c.column_name || c.name;
const isLong = (v) => typeof v === 'string' && v.length > 120;
const needsTextarea = (v) => v === null || typeof v === 'object' || isLong(v);

// Text shown in the editor for the current value. Objects (json/jsonb) are
// pretty-printed so it stays readable and re-parseable.
function toEditText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 2); } catch (e) { return ''; }
  }
  return String(v);
}

function display(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// A cell stays out of edit mode when the column is not writable (generated,
// identity, read-only) or the grid has no save handler (e.g. a query result).
function editableCol(c, pk) {
  const name = colName(c);
  if (!name) return false;
  if (pk && pk.indexOf(name) !== -1) return false;
  if (c.is_generated && c.is_generated !== 'NEVER') return false;
  if (c.is_identity && c.is_identity !== 'NO') return false;
  if (c.is_updatable && c.is_updatable !== 'YES') return false;
  return true;
}

function CellEditor({ name, row, saving, onCancel, onSave }) {
  const multiline = needsTextarea(row[name]);
  const [text, setText] = useState(() => toEditText(row[name]));
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (el.type === 'text') el.setSelectionRange(0, el.value.length);
    else el.setSelectionRange(0, 0);
  }, []);

  // null is sent as SQL NULL; everything else goes as text and Postgres casts
  // it to the column type. An empty box therefore stores an empty string.
  const submit = (value) => onSave(value);

  return (
    <div className="cell-editor" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {multiline ? (
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(text); }
          }}
          spellCheck={false}
          className="cell-editor-input font-code-snippet text-code-snippet"
        />
      ) : (
        <input
          ref={ref}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            if (e.key === 'Enter') { e.preventDefault(); submit(text); }
          }}
          spellCheck={false}
          className="cell-editor-input font-code-snippet text-code-snippet"
        />
      )}
      <div className="cell-editor-bar">
        <button
          onClick={() => submit(null)}
          disabled={saving}
          className="cell-editor-btn"
          title="Store SQL NULL"
        >
          NULL
        </button>
        <button onClick={onCancel} disabled={saving} className="cell-editor-btn">
          Cancel
        </button>
        <button onClick={() => submit(text)} disabled={saving} className="cell-editor-btn cell-editor-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function DataGrid({
  current, order, desc, onSort, selected, onToggleRow, onToggleAll,
  onUpdateCell, emptyText, hintText, resetKey,
}) {
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cellError, setCellError] = useState(null);

  // Loading a different page/table invalidates an in-flight edit. Keyed on the
  // table + offset rather than the rows object so an optimistic cell write does
  // not slam the editor shut mid-request.
  useEffect(() => { setEdit(null); setSaving(false); setCellError(null); }, [resetKey]);

  if (!current) return <EmptyState text={emptyText || 'Select a table on the left'} />;
  const { columns, rows, pk } = current;
  const pkCols = pk || [];
  const hasCheck = pkCols.length > 0;
  const canEdit = typeof onUpdateCell === 'function';
  const rowKey = (row) => pkCols.length ? pkCols.map((c) => String(row[c])).join('|') : JSON.stringify(row);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));

  const startEdit = (k, row, c) => {
    if (!canEdit || !editableCol(c, pkCols)) return;
    setCellError(null);
    setEdit({ k, name: colName(c), row });
  };

  const commit = async (value) => {
    if (!edit) return;
    setSaving(true);
    setCellError(null);
    try {
      await onUpdateCell({ row: edit.row, column: edit.name, value, pk: pkCols });
      setSaving(false);
      setEdit(null);
    } catch (e) {
      setSaving(false);
      setCellError(e.message);
    }
  };

  if (!rows.length) {
    return <EmptyState text={emptyText || 'This table is currently empty or your filters returned no results.'} />;
  }

  return (
    <div>
      {canEdit && (
        <div className="px-3 py-1 border-b border-border-subtle bg-surface-container-low text-body-sm font-body-sm text-on-surface-variant flex items-center gap-2">
          <Icon name="terminal" size={13} />
          <span>{hintText || 'Double-click a cell to edit it. Enter saves, Esc cancels.'}</span>
        </div>
      )}
      {cellError && (
        <div className="px-3 py-1.5 border-b border-error/60 bg-error/10 text-body-sm font-body-sm text-error whitespace-pre-wrap">
          {cellError}
        </div>
      )}
      <table className="w-full text-left border-collapse table-auto">
        <thead>
          <tr>
            {hasCheck && (
              <th className="sticky top-0 z-10 bg-surface-container-high px-3 py-2.5 text-center cursor-default" style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="rounded bg-surface-container border-border-subtle text-primary w-4 h-4 cursor-pointer"
                />
              </th>
            )}
            {columns.map((c) => {
              const name = colName(c);
              const sorted = order === name;
              const icon = sorted ? (desc ? 'arrow_drop_down' : 'arrow_drop_up') : 'unfold_more';
              const isPk = pkCols.indexOf(name) !== -1;
              return (
                <th
                  key={name}
                  className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider text-left px-3 py-2.5 border-b border-border-subtle cursor-pointer whitespace-nowrap select-none hover:text-on-surface transition-colors"
                  title={`${c.data_type || ''}${isPk ? ' (primary key)' : ''}`}
                  onClick={onSort ? () => onSort(name) : undefined}
                >
                  {name}
                  {isPk && <span className="text-primary opacity-70 align-middle ml-0.5">*</span>}
                  <Icon name={icon} className={`align-middle ${sorted ? 'text-primary' : 'opacity-40'}`} size={14} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row);
            return (
              <tr key={k} className={`border-b border-border-subtle hover:bg-surface-container-low transition-colors ${selected.has(k) ? 'sel-row' : ''}`}>
                {hasCheck && (
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(k)}
                      onChange={(e) => onToggleRow(k, row, e.target.checked)}
                      className="rounded bg-surface-container border-border-subtle text-primary w-4 h-4 cursor-pointer"
                    />
                  </td>
                )}
                {columns.map((c) => {
                  const name = colName(c);
                  const v = row[name];
                  const cls = cellClass(v);
                  const long = isLong(v);
                  let extra = 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[420px]';
                  if (cls === 'json' || long) extra = 'whitespace-pre-wrap break-words font-code-snippet text-primary';
                  else if (cls === 'null') extra = 'text-on-surface-variant italic';
                  const isEditing = edit && edit.k === k && edit.name === name;
                  const canEditCell = canEdit && editableCol(c, pkCols);
                  return (
                    <td
                      key={name}
                      title={!isEditing && typeof v === 'string' ? v : undefined}
                      onDoubleClick={canEditCell ? () => startEdit(k, row, c) : undefined}
                      className={`px-3 py-2 text-on-surface font-body-sm text-body-sm align-top border-b border-border-subtle ${extra} ${canEditCell ? 'cell-editable' : ''} ${isEditing ? 'cell-editing' : ''}`}
                    >
                      {isEditing ? (
                        <CellEditor
                          name={name}
                          row={row}
                          saving={saving}
                          onCancel={() => { setEdit(null); setCellError(null); }}
                          onSave={commit}
                        />
                      ) : (
                        display(v)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
