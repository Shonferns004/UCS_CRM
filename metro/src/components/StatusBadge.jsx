import React from 'react';

const statusMap = {
  ACTIVE: 'success',
  INACTIVE: 'danger',
  OFFLINE: 'gray',
  MAINTENANCE: 'warning',
  NORMAL: 'success',
  LOW_STOCK: 'warning',
  EMPTY: 'danger',
  OPEN: 'info',
  INVESTIGATING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'gray',
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'warning',
  CRITICAL: 'danger',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
};

const labelMap = {
  LOW_STOCK: 'Low Stock',
  IN_PROGRESS: 'In Progress',
};

function StatusBadge({ status, size = 'md' }) {
  const variant = statusMap[status] || 'gray';
  const label = labelMap[status] || (status ? status.charAt(0) + status.slice(1).toLowerCase() : '');

  return (
    <span className={`status-badge ${variant}${size === 'sm' ? ' sm' : ''}`}>
      {label}
    </span>
  );
}

export default StatusBadge;
