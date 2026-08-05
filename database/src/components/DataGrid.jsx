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

export default function DataGrid({ current, order, desc, onSort, selected, onToggleRow, onToggleAll, emptyText }) {
  if (!current) return <EmptyState text={emptyText || 'Select a table on the left'} />;
  const { columns, rows, pk } = current;
  const hasCheck = pk && pk.length > 0;
  const rowKey = (row) => pk.length ? pk.map((c) => String(row[c])).join('|') : JSON.stringify(row);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));

  if (!rows.length) {
    return <EmptyState text={emptyText || 'This table is currently empty or your filters returned no results.'} />;
  }

  return (
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
            const name = c.column_name || c.name;
            const sorted = order === name;
            const icon = sorted ? (desc ? 'arrow_drop_down' : 'arrow_drop_up') : 'unfold_more';
            return (
              <th
                key={name}
                className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider text-left px-3 py-2.5 border-b border-border-subtle cursor-pointer whitespace-nowrap select-none hover:text-on-surface transition-colors"
                title={c.data_type || c.dataTypeID || ''}
                onClick={onSort ? () => onSort(name) : undefined}
              >
                {name}
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
                const name = c.column_name || c.name;
                const v = row[name];
                const cls = cellClass(v);
                let extra = 'whitespace-nowrap overflow-hidden text-ellipsis';
                if (cls === 'json') extra = 'whitespace-pre-wrap break-words font-code-snippet text-primary';
                else if (cls === 'null') extra = 'text-on-surface-variant italic';
                return (
                  <td
                    key={name}
                    title={typeof v === 'string' ? v : undefined}
                    className={`px-3 py-2 text-on-surface font-body-sm text-body-sm max-w-[420px] align-top border-b border-border-subtle ${extra}`}
                  >
                    {v === null || v === undefined ? 'NULL' : (typeof v === 'object' ? JSON.stringify(v) : String(v))}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
