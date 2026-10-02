import { useEffect, useRef, useState } from 'react';
import DataGrid from './DataGrid.jsx';

const HKEY = 'db-viewer-sql-height';
const MIN_H = 160;

function loadHeight() {
  const v = parseInt(localStorage.getItem(HKEY) || '', 10);
  return Number.isFinite(v) && v >= MIN_H ? v : 300;
}

export default function QueryRunner({ open, sqlText, setSqlText, runStatus, onRun, histOpen, onToggleHist, history, onPickHistory, onClear, result }) {
  const fileRef = useRef(null);
  const areaRef = useRef(null);
  const [height, setHeight] = useState(loadHeight);
  const [expanded, setExpanded] = useState(false);
  const heightRef = useRef(height);

  useEffect(() => { heightRef.current = height; }, [height]);

  // Esc leaves the full-screen mode without touching the editor contents.
  useEffect(() => {
    if (!open || !expanded) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, expanded]);

  if (!open) return null;
  const runCls = runStatus.cls === 'ok' ? 'text-primary' : runStatus.cls === 'err' ? 'text-error' : 'text-on-surface-variant';
  const btn = 'px-2.5 py-1 rounded border border-border-subtle bg-surface text-on-surface font-body-sm text-body-sm hover:border-primary hover:text-primary transition-colors cursor-pointer';

  const loadFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then((t) => {
      setSqlText(t);
      try { localStorage.setItem('db-viewer-sql', t); } catch (_) {}
      setRunStatus({ msg: `Loaded ${f.name}`, cls: 'ok' });
    });
    e.target.value = '';
  };

  // Drag the bar under the editor to make it taller. The whole window tracks
  // the pointer so the cursor can leave the handle mid-drag.
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = areaRef.current ? areaRef.current.offsetHeight : heightRef.current;
    const move = (ev) => {
      const next = Math.max(MIN_H, Math.min(Math.round(startH + ev.clientY - startY), Math.max(MIN_H, window.innerHeight - 200)));
      heightRef.current = next;
      setHeight(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      try { localStorage.setItem(HKEY, String(heightRef.current)); } catch (_) {}
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className={
      expanded
        ? 'fixed inset-0 z-40 flex flex-col bg-surface-container-lowest border border-primary/40'
        : 'mx-md my-md border border-border-subtle rounded bg-surface-card overflow-hidden'
    }>
      <div className="flex items-center gap-2.5 px-3 py-2 bg-surface-container-high border-b border-border-subtle flex-shrink-0">
        <span className="font-headline-md text-headline-md font-bold text-on-surface">Query Runner</span>
        <span className="hidden md:inline font-body-sm text-body-sm text-on-surface-variant">Ctrl+Enter to run</span>
        <span className="flex-1"></span>
        <button onClick={() => fileRef.current && fileRef.current.click()} className={btn}>
          Load .sql file
        </button>
        <input ref={fileRef} type="file" accept=".sql,.txt,text/plain" className="hidden" onChange={loadFile} />
        <button onClick={onToggleHist} className={`${btn} ${histOpen ? 'border-primary text-primary' : ''}`}>
          History
        </button>
        <button
          onClick={() => { if (!expanded) try { localStorage.setItem(HKEY, String(heightRef.current)); } catch (_) {} setExpanded((x) => !x); }}
          className={btn}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <button onClick={onClear} className={btn}>
          Clear
        </button>
      </div>

      <textarea
        ref={areaRef}
        value={sqlText}
        onChange={(e) => { setSqlText(e.target.value); try { localStorage.setItem('db-viewer-sql', e.target.value); } catch (_) {} }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); }
        }}
        onBlur={() => { if (!expanded) try { localStorage.setItem(HKEY, String(heightRef.current)); } catch (_) {} }}
        spellCheck={false}
        placeholder={'Enter SQL…  (Ctrl+Enter to run)\n\nSELECT * FROM workers LIMIT 10;'}
        style={expanded ? { flex: '1 1 auto', minHeight: 0 } : { height }}
        className="sql-editor"
      />

      <div onMouseDown={startResize} className="sql-handle" title="Drag to resize" style={expanded ? { display: 'none' } : undefined}></div>

      <div className="flex items-center gap-2.5 px-3 py-2 border-t border-border-subtle flex-shrink-0">
        <button onClick={onRun} className="bg-primary-container text-on-primary-fixed-variant font-semibold px-4 py-1.5 rounded font-body-sm text-body-sm hover:bg-primary-fixed transition-colors cursor-pointer">
          Run
        </button>
        <span className={`font-body-sm text-body-sm whitespace-pre-wrap ${runCls}`}>{runStatus.msg}</span>
      </div>

      {histOpen && (
        <div className="max-h-[200px] overflow-auto border-t border-border-subtle flex-shrink-0">
          {history.length === 0 ? (
            <div className="hist-item">No history yet</div>
          ) : (
            [...history].reverse().slice(0, 30).map((sql, i) => (
              <div
                key={i}
                className="hist-item"
                onClick={() => { setSqlText(sql); try { localStorage.setItem('db-viewer-sql', sql); } catch (_) {} onPickHistory(); }}
              >
                {sql.length > 400 ? sql.slice(0, 400) + '…' : sql}
              </div>
            ))
          )}
        </div>
      )}

      {result && (
        <div className={expanded ? 'flex-1 min-h-0 overflow-auto border-t border-border-subtle' : 'max-h-[340px] overflow-auto border-t border-border-subtle'}>
          {result.columns && result.columns.length ? (
            <DataGrid
              current={{ columns: result.columns, rows: result.rows || [], pk: [] }}
              order={null}
              desc={false}
              onSort={null}
              selected={new Map()}
              onToggleRow={() => {}}
              onToggleAll={() => {}}
              emptyText="Query returned no rows"
            />
          ) : (
            <div className="px-3 py-2.5" style={{ fontSize: 13, color: '#4edea3' }}>
              OK — {result.rowCount ?? ''} {result.command || ''}{result.rowCount == null ? '' : ' row(s) affected'}
              {result.statementCount && result.statementCount > 1 ? ` · ${result.statementCount} statements ran` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
