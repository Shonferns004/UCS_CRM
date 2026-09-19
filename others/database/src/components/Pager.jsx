import Icon from './Icon.jsx';

export default function Pager({ count, limit, offset, onPrev, onNext }) {
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  return (
    <div className="h-12 border-t border-border-subtle bg-surface flex items-center justify-between px-md flex-shrink-0">
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        {total.toLocaleString()} rows — page {page}/{pages} ({limit}/page)
      </span>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} disabled={offset <= 0} className="w-8 h-8 flex items-center justify-center rounded border border-border-subtle bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          <Icon name="chevron_left" size={14} />
        </button>
        <button onClick={onNext} disabled={offset + limit >= total} className="w-8 h-8 flex items-center justify-center rounded border border-border-subtle bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          <Icon name="chevron_right" size={14} />
        </button>
      </div>
    </div>
  );
}
