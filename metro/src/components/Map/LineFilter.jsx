import React from 'react';
import { metroLines, DISPLAY_LINE_IDS } from '../../data/mumbaiMetro.js';

function LineFilter({ activeLineId, onSelect }) {
  const chips = [{ id: null, label: 'All', flag: '#' }, ...metroLines
    .filter((l) => DISPLAY_LINE_IDS.includes(l.id))
    .map((l) => ({
    id: l.id,
    label: `Line ${l.number}`,
    flag: l.number,
    color: l.color,
  }))];

  return (
    <div className="metro-map-chips" role="tablist" aria-label="Show metro lines">
      {chips.map((chip) => (
        <button
          key={chip.id || 'all'}
          type="button"
          role="tab"
          aria-selected={activeLineId === chip.id}
          className={`metro-chip ${activeLineId === chip.id ? 'active' : ''}`}
          onClick={() => onSelect(chip.id)}
          style={chip.color ? { '--chip-color': chip.color } : undefined}
        >
          <span className="chip-flag">{chip.flag}</span>
          {chip.label}
          <span className="chip-dot" />
        </button>
      ))}
    </div>
  );
}

export default LineFilter;