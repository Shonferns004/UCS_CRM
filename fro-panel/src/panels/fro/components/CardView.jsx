import { useState, useEffect } from 'react';

export default function CardView({ items, renderCard, emptyHeading, emptyText, index: controlledIndex, onIndexChange }) {
  const isControlled = controlledIndex !== undefined && onIndexChange !== undefined;
  const [internalIndex, setInternalIndex] = useState(0);
  const index = isControlled ? controlledIndex : internalIndex;

  useEffect(() => {
    if (!isControlled) setInternalIndex(0);
  }, [items.length, isControlled]);

  const setIndex = (fn) => {
    if (isControlled) {
      onIndexChange(fn(index));
    } else {
      setInternalIndex(fn);
    }
  };

  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="icon">{'\u{1F4CB}'}</div>
        <h3>{emptyHeading || 'Nothing here'}</h3>
        <p>{emptyText || ''}</p>
      </div>
    );
  }

  const item = items[index];
  const isFirst = index === 0;
  const isLast = index === items.length - 1;

  return (
    <div className="card-view">
      <div className="card-view-body">
        {renderCard(item)}
      </div>
      <div className="card-view-footer">
        <button
          className="btn btn-sm"
          disabled={isFirst}
          onClick={() => setIndex(i => i - 1)}
          style={{ background: isFirst ? 'transparent' : 'var(--card-bg)', border: '1px solid var(--line)', minWidth: 90 }}
        >
          {'\u2190'} Prev
        </button>
        <span className="card-view-counter">{index + 1} of {items.length}</span>
        <button
          className="btn btn-sm"
          disabled={isLast}
          onClick={() => setIndex(i => i + 1)}
          style={{ background: isLast ? 'transparent' : 'var(--card-bg)', border: '1px solid var(--line)', minWidth: 90 }}
        >
          Next {'\u2192'}
        </button>
      </div>
    </div>
  );
}
