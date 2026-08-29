import { Trophy, Medal, Flag, AlertTriangle, TrendingUp, Users, Award } from 'lucide-react';

const RANK_ICONS = [
  <Trophy width="18" height="18" style={{ fill: '#fbbf24' }} />,
  <Medal width="18" height="18" style={{ fill: '#c0c0c0' }} />,
  <Award width="18" height="18" style={{ fill: '#cd7f32' }} />,
  <Flag width="18" height="18" style={{ fill: '#8b5cf6' }} />,
  <Flag width="18" height="18" style={{ fill: '#6b7280' }} />,
];

const RANK_COLORS = ['#fbbf24', '#c0c0c0', '#cd7f32', '#8b5cf6', '#6b7280'];

export function TopBottomPerformers({ top, bottom, animate = true }) {
  const metricConfigs = {
    amount: { 
      label: 'TOP 5 - RECEIVED AMOUNT', 
      icon: Trophy, 
      iconColor: '#16a34a', 
      bgColor: '#f0fdf4',
      borderColor: '#16a34a',
      format: v => '₹' + Number(v).toLocaleString('en-IN'),
    },
    donors: { 
      label: 'TOP 5 - DONORS', 
      icon: Users, 
      iconColor: '#3b82f6', 
      bgColor: '#eff6ff',
      borderColor: '#3b82f6',
      format: v => Number(v).toLocaleString('en-IN'),
    },
    conversion: { 
      label: 'TOP 5 - CONVERSION %', 
      icon: TrendingUp, 
      iconColor: '#8b5cf6', 
      bgColor: '#faf5ff',
      borderColor: '#8b5cf6',
      format: v => v + '%',
    },
    target: { 
      label: 'BOTTOM 5 - TARGET %', 
      icon: AlertTriangle, 
      iconColor: '#dc2626', 
      bgColor: '#fef2f2',
      borderColor: '#dc2626',
      format: v => v + '%',
    },
  };

  const getConfig = (metric) => metricConfigs[metric] || metricConfigs.amount;

  function PerformerCard({ metric, data }) {
    const config = getConfig(metric);
    const Icon = config.icon;
    
    return (
      <div style={{ 
        flex: 1, 
        minWidth: 200,
        background: config.bgColor, 
        border: `1.5px solid ${config.borderColor}33`,
        borderRadius: 12, 
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon width="18" height="18" style={{ color: config.iconColor }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: config.iconColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {config.label}
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((item, index) => (
            <div key={item.fro_id || index} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.7)',
              transition: 'all 0.15s',
              opacity: animate ? 0 : 1,
              transform: animate ? 'translateX(-10px)' : 'none',
              animation: animate ? `slideIn 0.3s ease forwards ${index * 0.08}s` : 'none',
            }}>
              <div style={{ 
                width: 28, 
                height: 28, 
                borderRadius: '50%', 
                background: RANK_COLORS[index] + '20', 
                color: RANK_COLORS[index],
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {index < 3 ? RANK_ICONS[index] : <span>{index + 1}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.fro_name || item.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                  {item.data_total !== undefined ? `${item.data_total} assigned` : ''}
                  {item.conversion_pct !== undefined ? ` • ${item.conversion_pct}% conv.` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: config.iconColor, fontVariantNumeric: 'tabular-nums' }}>
                  {config.format(item.collection_amount || item.lead_done_count || item.conversion_pct || item.target_pct)}
                </div>
                {item.target_pct !== undefined && item.target_amount && (
                  <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>Target: ₹{Number(item.target_amount).toLocaleString('en-IN')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {top?.amount?.length > 0 && <PerformerCard metric="amount" data={top.amount} />}
      {top?.donors?.length > 0 && <PerformerCard metric="donors" data={top.donors} />}
      {top?.conversion?.length > 0 && <PerformerCard metric="conversion" data={top.conversion} />}
      {bottom?.target?.length > 0 && <PerformerCard metric="target" data={bottom.target} />}
    </div>
  );
}

export default TopBottomPerformers;