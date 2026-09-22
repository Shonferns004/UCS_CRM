import React, { useEffect } from 'react';
import Users from '../pages/Users.jsx';
import { Users as UsersIcon, X } from 'lucide-react';

function UsersDrawer({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="users-drawer-overlay" onClick={onClose}>
      <aside className="users-drawer" role="dialog" aria-modal="true" aria-label="Users" onClick={(e) => e.stopPropagation()}>
        <header className="users-drawer-header">
          <div className="users-drawer-title">
            <UsersIcon size={16} strokeWidth={2} /> Users
          </div>
          <button className="users-drawer-close" onClick={onClose} aria-label="Close users panel">
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="users-drawer-body">
          <Users />
        </div>
      </aside>
    </div>
  );
}

export default UsersDrawer;