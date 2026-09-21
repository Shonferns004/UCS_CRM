import React from 'react';
import { ArrowUpRight } from 'lucide-react';

const colorVariantMap = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  green: 'success',
  orange: 'warning',
  red: 'danger',
  blue: 'info',
  purple: 'primary',
  teal: 'teal',
  pink: 'pink',
  indigo: 'indigo',
};

function KpiCard({ title, value, icon, color = 'primary', subtitle, trend, action, to, onAction }) {
  const variant = colorVariantMap[color] || 'primary';
  const canClick = Boolean(onAction || to);

  return (
    <div className={`kpi-card${canClick ? ' clickable' : ''}`} onClick={onAction}>
      <div className={`kpi-icon ${variant}`}>
        {typeof icon === 'string' ? <span className="kpi-icon-emoji">{icon}</span> : icon}
      </div>
      <div className="kpi-body">
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
        {(subtitle || trend) && (
          <div className="kpi-footer">
            <span className="kpi-subtitle">{subtitle}</span>
            {trend && (
              <span className={`kpi-trend ${trend.direction}`}>
                {trend.direction === 'up' ? '↗' : '↘'} {trend.value}
              </span>
            )}
          </div>
        )}
      </div>
      {action && <span className="kpi-action">{action}</span>}
      {canClick && <ArrowUpRight size={15} strokeWidth={2} className={`kpi-corner-arrow ${variant}`} />}
    </div>
  );
}

export default KpiCard;