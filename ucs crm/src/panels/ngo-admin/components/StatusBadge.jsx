import { Activity, Clock, UserX, Coffee } from 'lucide-react';

const DEFAULT_CONFIG = {
  calling: { icon: <Activity className="w-3 h-3 animate-pulse" />, label: 'Calling', color: '#16a34a', bg: '#dcfce7' },
  idle: { icon: <Clock className="w-3 h-3" />, label: 'Idle', color: '#f59e0b', bg: '#fffbeb', alert: true },
  offline: { icon: <UserX className="w-3 h-3" />, label: 'Offline', color: '#9ca3af', bg: '#f3f4f6' },
  break: { icon: <Coffee className="w-3 h-3" />, label: 'Break', color: '#3b82f6', bg: '#eff6ff' },
};

export function StatusBadge({ status = 'offline', idleMinutes = 0, config = DEFAULT_CONFIG }) {
  const cfg = config[status] || config.offline;
  const isAlert = cfg.alert && idleMinutes > 10;

  return (
    <span style={{ 
      display: 'inline-flex', 
      alignItems: 'center', 
      gap: 6,
      padding: '4px 10px', 
      borderRadius: 20, 
      background: cfg.bg, 
      border: `1px solid ${cfg.color}40`,
      fontSize: 11, 
      fontWeight: 600,
      color: cfg.color,
    }}>
      {cfg.icon}
      <span>{cfg.label}{idleMinutes > 0 ? ` ${idleMinutes}m` : ''}</span>
      {isAlert && (
        <span style={{ 
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          background: '#dc2626', 
          display: 'inline-block',
          animation: 'pulse 1s ease-in-out infinite'
        }} />
      )}
    </span>
  );
}

export default StatusBadge;