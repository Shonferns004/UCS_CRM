import { useMemo } from 'react';
import { Users, Phone, PhoneCall, Heart, DollarSign } from 'lucide-react';

const STAGE_ICONS = {
  Assigned: Users,
  Called: Phone,
  Connected: PhoneCall,
  Interested: Heart,
  Received: DollarSign,
};

const STAGE_COLORS = {
  Assigned: '#3b82f6',
  Called: '#8b5cf6',
  Connected: '#06b6d4',
  Interested: '#ec4899',
  Received: '#16a34a',
};

export function DonationFunnel({ data, onStageClick, animate = true }) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No funnel data available</div>
      </div>
    );
  }

  const maxCount = useMemo(() => Math.max(...data.map(d => d.count)), [data]);
  const total = data[0]?.count || 1;

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Donation Funnel</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.stage] || Users;
          const color = STAGE_COLORS[stage.stage] || '#94a3b8';
          const widthPct = (stage.count / maxCount) * 100;
          const pctOfTotal = total > 0 ? ((stage.count / total) * 100).toFixed(1) : 0;

          return (
            <button
              key={stage.stage}
              onClick={() => onStageClick?.(stage.stage)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                border: 'none',
                borderRadius: 10,
                background: index === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                cursor: onStageClick ? 'pointer' : 'default',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease',
                opacity: animate ? 0 : 1,
                transform: animate ? 'translateY(10px)' : 'none',
                animation: animate ? `fadeInUp 0.4s ease forwards ${index * 0.08}s` : 'none',
              }}
              onMouseEnter={e => {
                if (onStageClick) e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
              }}
              onMouseLeave={e => {
                if (onStageClick) e.currentTarget.style.background = index === 0 ? 'transparent' : 'rgba(0,0,0,0.02)';
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon width="18" height="18" style={{ color }} />
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{stage.stage}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '15', padding: '2px 8px', borderRadius: 999 }}>
                    {stage.count.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${widthPct}%`, 
                      height: '100%', 
                      borderRadius: 3, 
                      background: color,
                      transition: animate ? 'width 0.6s ease-out' : 'none',
                    }} 
                  />
                </div>
              </div>
              
              <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {stage.count.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {pctOfTotal}% of total
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default DonationFunnel;