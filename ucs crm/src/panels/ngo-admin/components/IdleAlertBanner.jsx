import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, X, Clock, User, AlertCircle } from 'lucide-react';

export function IdleAlertBanner({ 
  alerts, 
  onView, 
  onDismiss,
  autoHide = 30000 
}) {
  const [visibleAlerts, setVisibleAlerts] = useState(alerts || []);

  useEffect(() => {
    setVisibleAlerts(alerts || []);
  }, [alerts]);

  useEffect(() => {
    if (visibleAlerts.length === 0) return;
    const timer = setTimeout(() => {
      setVisibleAlerts([]);
    }, autoHide);
    return () => clearTimeout(timer);
  }, [visibleAlerts, autoHide]);

  if (visibleAlerts.length === 0) return null;

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 20, 
      right: 20, 
      zIndex: 9999,
      display: 'flex', 
      flexDirection: 'column', 
      gap: 8,
      animation: 'slideUp 0.3s ease-out',
    }}>
      {visibleAlerts.map((alert, index) => (
        <div 
          key={alert.fro_id}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12,
            padding: '14px 18px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(220,38,38,0.15)',
            minWidth: 320,
            maxWidth: 420,
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div style={{ 
            width: 36, 
            height: 36, 
            borderRadius: '50%', 
            background: '#dc2626', 
            color: '#fff', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle width="18" height="18" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
              {alert.fro_name}
            </div>
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock width="12" height="12" />
              No activity for {alert.idle_minutes} minutes
            </div>
            <div style={{ fontSize: 10, color: '#991b1b', marginTop: 1 }}>
              Last seen: {new Date(alert.last_activity).toLocaleTimeString('en-IN')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onView?.(alert.fro_id)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)',
                background: '#fff', color: 'var(--ink)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Eye width="13" height="13" />
              View
            </button>
            <button
              onClick={() => { onDismiss?.(alert.fro_id); setVisibleAlerts(v => v.filter(a => a.fro_id !== alert.fro_id)); }}
              style={{ 
                padding: '6px', borderRadius: 6, border: 'none',
                background: 'transparent', color: '#dc2626', cursor: 'pointer',
              }}
            >
              <X width="14" height="14" />
            </button>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default IdleAlertBanner;