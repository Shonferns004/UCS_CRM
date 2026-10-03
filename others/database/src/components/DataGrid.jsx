import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { mediaKind, resolveSrc, openExternally, forgetCache } from '../lib/media.js';
import { setAdminKey } from '../lib/api.js';

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

// ---------------------------------------------------------------------------
// Image / file cells.
//
// A photo column holds a URL, and that URL is either publicly readable or in a
// private bucket that needs the admin key. Either way the picture belongs in the
// cell itself — that is the whole point of a data browser — so it renders as a
// thumbnail with no click required. Clicking only enlarges it.
// ---------------------------------------------------------------------------
function usePreviewSrc(value, enabled, token) {
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    let live = true;
    if (!enabled) { setState({ status: 'idle' }); return () => { live = false; }; }

    const r = resolveSrc(value);
    if (r && r.src) { setState({ status: 'ready', src: r.src }); return () => { live = false; }; }
    if (!r) { setState({ status: 'idle' }); return () => { live = false; }; }

    setState({ status: 'loading' });
    Promise.resolve(r).then((out) => {
      if (!live) return;
      if (out && out.src) setState({ status: 'ready', src: out.src });
      else setState({ status: 'error', error: (out && out.error) || 'missing' });
    });
    return () => { live = false; };
  }, [value, enabled, token]);

  return [state];
}

// Asks for ENV_ADMIN_KEY the same way the S3 panel does, then retries the
// preview instead of leaving the cell stuck on "key required".
function useKeyPrompt(refreshKey) {
  return () => {
    const key = window.prompt('This file is in a private S3 bucket.\nPaste the admin key (ENV_ADMIN_KEY) to preview it:');
    if (!key || !key.trim()) return;
    setAdminKey(key.trim());
    forgetCache();
    refreshKey();
  };
}

function MediaCell({ value, kind, onPreview }) {
  const isImage = kind === 'image';
  const [tick, setTick] = useState(0);
  const [state] = usePreviewSrc(value, isImage, tick);
  const retry = useKeyPrompt(() => setTick((t) => t + 1));
  const pendingClick = useRef(null);

  useEffect(() => () => { if (pendingClick.current) clearTimeout(pendingClick.current); }, []);

  if (!isImage) {
    return (
      <span className="media-file">
        <Icon name="database" size={14} className="opacity-50" />
        <a href={value} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
          {fileName(value)}
        </a>
      </span>
    );
  }

  // A single click enlarges; the second click of a double-click arrives inside
  // this window and means "edit this cell" instead.
  const click = (e) => {
    e.stopPropagation();
    if (pendingClick.current) clearTimeout(pendingClick.current);
    if (state.status === 'error') { retry(); return; }
    pendingClick.current = setTimeout(() => {
      pendingClick.current = null;
      if (state.src) onPreview({ src: state.src, url: value });
      else openExternally(value);
    }, 200);
  };
  const dblClick = () => {
    if (pendingClick.current) { clearTimeout(pendingClick.current); pendingClick.current = null; }
  };

  let thumb;
  if (state.status === 'ready') {
    thumb = <img className="media-thumb" src={state.src} alt="" loading="lazy" />;
  } else if (state.status === 'error') {
    thumb = (
      <span
        className="media-thumb media-thumb-empty media-thumb-key"
        title={state.error === 'key'
          ? 'Private bucket — click to enter the admin key'
          : 'Could not load this file — click to retry'}
      >
        <Icon name="key" size={14} />
      </span>
    );
  } else if (state.status === 'loading') {
    thumb = <span className="media-thumb media-thumb-empty"><Icon name="loader" size={14} className="animate-spin" /></span>;
  } else {
    thumb = <span className="media-thumb media-thumb-empty" />;
  }

  return (
    <span className="media-cell" onClick={click} onDoubleClick={dblClick}>
      {thumb}
      <span className="media-label">{fileName(value)}</span>
    </span>
  );
}

function fileName(url) {
  const clean = String(url).split(/[?#]/)[0];
  const parts = clean.split('/');
  return decodeURIComponent(parts[parts.length - 1] || clean) || clean;
}

function Lightbox({ preview, onClose }) {
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, onClose]);

  if (!preview) return null;
  return (
    <div className="media-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="media-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="truncate font-body-sm text-body-sm text-on-surface-variant" title={preview.url}>{fileName(preview.url)}</span>
        <span className="flex-1" />
        <a
          className="media-lightbox-btn"
          href={preview.src}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open
        </a>
        <button className="media-lightbox-btn" onClick={onClose} aria-label="Close preview">
          <Icon name="close" size={16} />
        </button>
      </div>
      <img className="media-lightbox-img" src={preview.src} alt="" onClick={(e) => e.stopPropagation()} />
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
  const [preview, setPreview] = useState(null);

  // Loading a different page/table invalidates an in-flight edit. Keyed on the
  // table + offset rather than the rows object so an optimistic cell write does
  // not slam the editor shut mid-request.
  useEffect(() => { setEdit(null); setSaving(false); setCellError(null); setPreview(null); }, [resetKey]);

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
                  const media = mediaKind(v, name, row);
                  let extra = 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[420px]';
                  if (cls === 'json' || long) extra = 'whitespace-pre-wrap break-words font-code-snippet text-primary';
                  else if (cls === 'null') extra = 'text-on-surface-variant italic';
                  // A preview has its own layout, so the text truncation rules
                  // above do not apply to it.
                  if (media) extra = 'max-w-[420px]';
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
                      ) : media ? (
                        <MediaCell value={v} kind={media} onPreview={setPreview} />
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
      <Lightbox preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
