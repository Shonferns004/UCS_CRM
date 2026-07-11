import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main">
        <div className="mobile-top">
          <button className="hamburger" onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
          <div className="mtop-brand">
            <div className="brand-mark" style={{background:'var(--sage)',borderRadius:8,width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14}}>W</div>
            <span>WhatsApp CRM</span>
          </div>
        </div>
        <Header />
        <div className="content-body">
          <div className="wa-anim-fade">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
