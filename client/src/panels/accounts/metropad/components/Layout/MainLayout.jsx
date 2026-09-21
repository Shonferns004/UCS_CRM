import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import useAuth from '../../hooks/useAuth.js';

function MainLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="layout">
      <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />
      <Header
        user={user}
        onLogout={logout}
        onToggleSidebar={handleToggleSidebar}
      />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
