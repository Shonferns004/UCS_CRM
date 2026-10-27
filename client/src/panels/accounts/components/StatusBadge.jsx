import React from 'react';

const colors = {
  sent: { bg: '#e5e7eb', color: '#374151' },
  delivered: { bg: '#dbeafe', color: '#1d4ed8' },
  read: { bg: '#dcfce7', color: '#166534' },
  failed: { bg: '#fee2e2', color: '#b91c1c' },
};

export default function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const style = colors[key] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, textTransform: 'capitalize' }}>
      {status || 'unknown'}
    </span>
  );
}