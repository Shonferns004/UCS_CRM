import { useState, useRef, useEffect } from 'react';
import { MoreVertical, X } from 'lucide-react';

export function ActionMenu({ items, trigger = 'dots' }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && 
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemClick = (item) => {
    item.onClick?.();
    setOpen(false);
  };

  if (items.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        style={{ 
          padding: '6px', 
          border: 'none', 
          background: 'transparent', 
          cursor: 'pointer',
          color: 'var(--ink-soft)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {trigger === 'dots' ? <MoreVertical width="18" height="18" /> : trigger}
      </button>

      {open && (
        <div 
          ref={menuRef}
          style={{ 
            position: 'absolute', 
            top: '100%', 
            right: 0, 
            zIndex: 100,
            marginTop: 4,
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item)}
              style={{ 
                width: '100%',
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                padding: '10px 12px',
                border: 'none',
                background: 'transparent',
                color: item.variant === 'destructive' ? '#dc2626' : 'var(--ink)',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = item.variant === 'destructive' ? '#fef2f2' : 'var(--bg)'; }}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {item.icon && <span style={{ display: 'flex', width: 16, height: 16 }}>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionMenu;