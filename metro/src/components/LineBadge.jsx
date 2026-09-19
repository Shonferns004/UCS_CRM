import React from 'react';
import { getLineColor, hexToRgba } from '../data/mumbaiMetro.js';

function LineBadge({ name, code, size = 'md' }) {
  if (!name && !code) return <span className="cell-muted">—</span>;
  const color = getLineColor(name, code);

  return (
    <span
      className={`line-badge${size === 'sm' ? ' sm' : ''}`}
      style={{ background: hexToRgba(color, 0.12), color }}
    >
      <span className="line-badge-dot" style={{ background: color }} />
      <span className="line-badge-name">{name || code}</span>
      {code && <span className="line-badge-code">{code}</span>}
    </span>
  );
}

export default LineBadge;