import Icon from './Icon.jsx';

export default function Toolbar({ searchText, setSearchText, searchCol, setSearchCol, columns, onSearch, onReset, selectedCount, onDelete, onDrop, dropDisabled }) {
  return (
    <div className="p-md border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            placeholder="Search value..."
            className="w-full bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded pl-10 pr-3 py-1.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-text-muted transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={searchCol}
            onChange={(e) => setSearchCol(e.target.value)}
            className="appearance-none bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded pl-3 pr-8 py-1.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="">(auto)</option>
            {(columns || []).map((c) => (
              <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
            ))}
          </select>
          <Icon name="arrow_drop_down" className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" size={18} />
        </div>
        <button onClick={onSearch} className="bg-surface-container border border-border-subtle text-on-surface hover:bg-surface-container-high transition-colors py-1.5 px-4 rounded font-body-sm text-body-sm cursor-pointer">
          Search
        </button>
        <button onClick={onReset} className="bg-transparent border border-transparent text-on-surface-variant hover:text-on-surface transition-colors py-1.5 px-2 rounded font-body-sm text-body-sm flex items-center gap-1 cursor-pointer">
          <Icon name="close" size={14} /> Reset
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onDelete}
          disabled={selectedCount === 0}
          className="bg-transparent border border-error/50 text-error hover:bg-error/10 transition-colors py-1.5 px-4 rounded font-body-sm text-body-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Delete selected ({selectedCount})
        </button>
        <button
          onClick={onDrop}
          disabled={dropDisabled}
          className="bg-error/10 border border-error/20 text-error hover:bg-error/20 transition-colors py-1.5 px-4 rounded font-body-sm text-body-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Icon name="delete" size={16} />
          Drop table
        </button>
      </div>
    </div>
  );
}
