import React from 'react';

const colorVariantMap = {
  primary: 'blue',
  success: 'mint',
  warning: 'amber',
  danger: 'red',
  info: 'blue',
  green: 'mint',
  teal: 'mint',
  orange: 'amber',
  red: 'red',
  blue: 'blue',
  purple: 'lavender',
  lavender: 'lavender',
  indigo: 'lavender',
  pink: 'pink',
  amber: 'amber',
  mint: 'mint',
  beige: 'beige',
  coral: 'red',
};

function KpiCard({ title, value, icon, color = 'blue', subtitle, trend, onClick }) {
  const accent = colorVariantMap[color] || 'blue';
  const canClick = Boolean(onClick);

  return (
    <div className={`kpi-card${canClick ? ' clickable' : ''}`} onClick={onClick}>
      <div className={`kpi-icon ${accent}`}>
        {typeof icon === 'string' ? <span className="kpi-icon-emoji">{icon}</span> : icon}
      </div>
      <div className="kpi-label">{title}</div>
      <div className="kpi-value">{value}</div>
      {(subtitle || trend) && (
        <div className="kpi-footer">
          {subtitle && <span className="kpi-subtitle">{subtitle}</span>}
          {trend && (
            <span className={`kpi-trend ${trend.direction}`}>
              {trend.direction === 'up' ? '↗' : '↘'} {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default KpiCard;