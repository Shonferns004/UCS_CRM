import Icon from './Icon.jsx';

export default function Sidebar({ tables, activeTable, capOpen, filterText, setFilterText, onSelectTable, onNewTable, onOpenSqlEditor, onToggleCapacity }) {
  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n);
  const f = filterText.toLowerCase();
  const list = tables.filter((t) => t.name.toLowerCase().includes(f));

  return (
    <nav className="w-60 h-screen flex-shrink-0 bg-surface-container-lowest dark:bg-surface-dim border-r border-border-subtle flex flex-col h-full py-4 relative z-20 hidden md:flex">
      <div className="px-lg mb-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center">
          <Icon name="database" className="text-primary" size={20} />
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-primary truncate">RDS</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">Production v1.0</p>
        </div>
      </div>

      <div className="px-md mb-6">
        <button
          onClick={onNewTable}
          className="w-full bg-primary-container text-on-primary-fixed-variant hover:bg-primary-fixed transition-colors py-2 px-4 rounded font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
          <Icon name="add" />
          New Table
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-sm space-y-1">
        <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 rounded font-body-sm text-body-sm" href="#">
          <Icon name="table_chart" size={18} />
          <span>Table Editor</span>
        </a>
        <a className="flex items-center gap-3 px-3 py-2 text-primary font-bold border-l-2 border-primary bg-on-primary-fixed-variant/10 rounded-r font-body-sm text-body-sm" href="#">
          <Icon name="database" size={18} />
          <span>Database</span>
        </a>
        <a onClick={(e) => { e.preventDefault(); onOpenSqlEditor(); }} className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 rounded font-body-sm text-body-sm cursor-pointer" href="#">
          <Icon name="terminal" size={18} />
          <span>SQL Editor</span>
        </a>
        <a onClick={(e) => { e.preventDefault(); onToggleCapacity(); }} className={`flex items-center gap-3 px-3 py-2 rounded font-body-sm text-body-sm cursor-pointer transition-colors duration-200 ${capOpen ? 'text-primary font-bold border-l-2 border-primary bg-on-primary-fixed-variant/10 rounded-r' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`} href="#">
          <Icon name="speed" size={18} />
          <span>Shon RDS</span>
        </a>

        <div className="mt-8 mb-2 px-3">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Tables</span>
        </div>
        <div className="px-3 pb-2">
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter tables…"
            className="w-full bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded pl-3 pr-3 py-1.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-text-muted transition-all"
          />
        </div>
        <div className="space-y-0.5">
          {list.map((t) => {
            const active = activeTable === t.name;
            return (
              <div
                key={t.name}
                onClick={() => onSelectTable(t.name)}
                className={`flex items-center justify-between gap-2 pl-8 pr-3 py-1.5 rounded cursor-pointer font-body-sm text-body-sm ${active ? 'bg-surface-container-low border-l border-primary text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon name="table_rows" className={`${active ? 'text-primary' : 'text-on-surface-variant'}`} size={16} />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="text-[11px] text-on-surface-variant">{fmt(t.approx_rows)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto px-sm pt-4 border-t border-border-subtle">
        <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 rounded font-body-sm text-body-sm" href="#">
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </a>
        <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 rounded font-body-sm text-body-sm" href="#">
          <Icon name="help" size={18} />
          <span>Support</span>
        </a>
      </div>
    </nav>
  );
}
