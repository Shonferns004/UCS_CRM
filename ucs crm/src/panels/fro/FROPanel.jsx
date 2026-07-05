import { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useUcs } from '../../store'
import { themes, applyTheme } from '../hr/theme'
import { getScheduled, getCallbacks } from './api/donors'
import { getMyDashboard } from './api/donors'
import { getMyTarget } from './api/target'
import { useRealtime } from '../../hooks/useRealtime'
import { api } from '../../api/auth'
import { requestNotifPermission, showDesktopNotification } from '../../utils/desktopNotif'
import DispositionModal from './components/DispositionModal'
import CallTimer from './components/CallTimer'
import { CallProvider } from './CallContext'
import NotificationDrawer from '../../components/NotificationDrawer'
import SettingsDrawer from '../../components/SettingsDrawer'
import Dashboard from './pages/Dashboard'
import MyDonors from './pages/MyDonors'
import TransferredLeads from './pages/TransferredLeads'
import RejectedLeads from './pages/RejectedLeads'
import Donors from './pages/Donors'
import Scheduled from './pages/Scheduled'
import IncentiveInfo from './pages/IncentiveInfo'
import History from './pages/History'
import CallLogs from './pages/CallLogs'
import MyTarget from './pages/MyTarget'
import Suspense from './pages/Suspense'

const NAV = [
  { id: 'dashboard', path: '/fro/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'scheduled', path: '/fro/scheduled', label: 'Follow Up / Callback', icon: 'calendar_month' },
  { id: 'my-leads', path: '/fro/my-leads', label: 'My Leads', icon: 'group' },
  { id: 'transferred-leads', path: '/fro/transferred-leads', label: 'Transferred', icon: 'swap_horiz' },
  { id: 'donors', path: '/fro/donors', label: 'Donors', icon: 'card_giftcard' },
  { id: 'logs', path: '/fro/logs', label: 'Call Logs', icon: 'call_log' },
  { id: 'rejected', path: '/fro/rejected-leads', label: 'Rejected Leads', icon: 'heart_broken' },
  { id: 'target', path: '/fro/target', label: 'My Target', icon: 'track_changes' },
  { id: 'suspense', path: '/fro/suspense', label: 'Suspense', icon: 'help_outline' },
]

const MAX_DROPDOWN = 4

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014'

function Sidebar() {
  const location = useLocation()
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">U</div>
        <div><h1>UFS</h1><span>FRO Panel</span></div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(n => (
          <NavLink key={n.id} to={n.path}
            className={`snav-item ${location.pathname === n.path ? 'active' : ''}`}>
            <span className="ico material-symbols-outlined" style={{ fontSize: 18 }}>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default function FROPanel() {
  const { user, logout } = useUcs()
  const location = useLocation()
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [themeName, setThemeName] = useState(() => localStorage.getItem('fro_theme') || 'sky')
  const menuRef = useRef(null)

  useEffect(() => {
    if (themes[themeName]) {
      applyTheme(themes[themeName], '.panel-fro')
      const t = themes[themeName]
      const el = document.querySelector('.panel-fro') || document.documentElement
      el.style.setProperty('--bg', t.sand); el.style.setProperty('--card-bg', t.paper); el.style.setProperty('--sage-light', t['sage-soft'])
    }
    localStorage.setItem('fro_theme', themeName)
  }, [themeName])

  const [modalDonor, setModalDonor] = useState(null);
  const [modalNotifId, setModalNotifId] = useState(null);
  const [rows, setRows] = useState([]);
  const [refetch, setRefetch] = useState(0);
  const [showNotifList, setShowNotifList] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [rejectedItems, setRejectedItems] = useState([]);
  const [verifiedItems, setVerifiedItems] = useState([]);
  const [allNotifs, setAllNotifs] = useState([]);
  const [allVerified, setAllVerified] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const seenNotifIds = useRef(new Set(JSON.parse(localStorage.getItem('fro_seen_notifs') || '[]')));
  const notifRef = useRef(null);
  const pollRef = useRef(null);

  const markRead = async (notifId) => {
    try { await api(`/notifications/${notifId}/read`, { method: 'PUT', _prefix: 'ucs' }); }
    catch {}
  };

  const handleRejectedClick = async (item) => {
    setShowNotifList(false);
    if (item.fro_donor_log_id) {
      try {
        const info = await api(`/notifications/${item.id}/lead-info`, { _prefix: 'ucs' });
        setModalNotifId(item.id);
        setModalDonor({
          id: info.donorId,
          ngo_id: info.ngoId,
          assignment_id: info.assignmentId,
          donor_name: info.donorName,
          donor_mobile: info.donorMobile,
        });
      } catch { return; }
    }
  };

  const handlePopDone = async () => {
    if (modalNotifId) await markRead(modalNotifId);
    setModalNotifId(null);
    setModalDonor(null);
    setRefetch(n => n + 1);
    loadNotifications();
    loadReminders();
  };

  const loadNotifications = () => {
    const workerId = user?.id;
    if (!workerId) return;
    api(`/notifications/${workerId}`, { _prefix: 'ucs' })
      .then(data => {
        const allNotifs = data || [];
        const rejected = allNotifs.filter(n => n.type === 'lead_rejected' && !n.read_at);
        const verified = allNotifs.filter(n => n.type === 'lead_verified' && !n.read_at);
        const rejectedSlice = rejected.slice(0, 20);
        const verifiedSlice = verified.slice(0, 20);
        rejectedSlice.forEach(n => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            localStorage.setItem('fro_seen_notifs', JSON.stringify([...seenNotifIds.current]));
            showDesktopNotification(n.title, n.body);
          }
        });
        verifiedSlice.forEach(n => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            localStorage.setItem('fro_seen_notifs', JSON.stringify([...seenNotifIds.current]));
            showDesktopNotification(n.title, n.body);
          }
        });
        setAllNotifs(rejected);
        setAllVerified(verified);
        setRejectedItems(rejectedSlice);
        setVerifiedItems(verifiedSlice);
        setRejectedCount(rejected.length);
        setVerifiedCount(verified.length);
      })
      .catch(() => {});
  };
  useEffect(() => {
    loadNotifications();
    requestNotifPermission();
    pollRef.current = setInterval(() => loadNotifications(), 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user?.id]);

  useRealtime('notification_log', {
    filter: `worker_id=eq.${user?.id}`,
    onInsert: () => loadNotifications(),
    enabled: !!user?.id,
  });

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifList(false)
    }
    if (showMenu || showNotifList) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu, showNotifList])

  const loadReminders = () => {
    Promise.all([getScheduled(), getCallbacks()]).then(([scheduled, callbacks]) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const items = []; const seen = new Set();
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && d.scheduled_at.slice(0, 10) !== todayStr && !seen.has(d.id)) {
          seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, assignment_id: d.assignment_id, type: 'scheduled' });
        }
      });
      (callbacks || []).forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at || null, assignment_id: d.assignment_id, type: 'callback' }); } });
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && d.scheduled_at.slice(0, 10) === todayStr && !seen.has(d.id)) {
          seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, assignment_id: d.assignment_id, type: 'callback' });
        }
      });
      setRows(items);
    }).catch(() => {});
  };
  useEffect(() => { loadReminders(); }, [refetch]);
  useEffect(() => { const interval = setInterval(() => loadReminders(), 30000); return () => clearInterval(interval); }, []);

  const dedupedRows = rows.filter((r, i, a) => i === a.findIndex(x => x.id === r.id));
  const dueItems = dedupedRows.filter(r => r.scheduled_at && new Date(r.scheduled_at) <= new Date());
  const dueCount = dueItems.length;

  const rejectedToShow = rejectedItems.slice(0, MAX_DROPDOWN);
  const verifiedToShow = verifiedItems.slice(0, MAX_DROPDOWN - rejectedToShow.length);
  const dueToShow = dueItems.slice(0, MAX_DROPDOWN - rejectedToShow.length - verifiedToShow.length);
  const totalShown = rejectedToShow.length + verifiedToShow.length + dueToShow.length;
  const totalHidden = rejectedCount + verifiedCount + dueCount - totalShown;

  const meta = NAV.find(n => location.pathname === n.path)
  const userName = user?.name || 'User'
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const drawerSections = [
    { label: 'Rejected Leads', type: 'rejected', items: allNotifs },
    { label: 'Verified Leads', type: 'verified', items: allVerified },
    { label: 'Follow Up / Callback', type: 'schedule', items: dueItems },
  ];

  const handleDrawerItemClick = (item, section) => {
    setDrawerOpen(false);
    if (section.type === 'rejected') {
      handleRejectedClick(item);
    } else {
      setModalDonor(item);
    }
  };

  return (
    <CallProvider userId={user?.id}>
    <div className="app">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">FRO</div>
            <h2>{meta?.label || 'Dashboard'}</h2>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <CallTimer />
            <div ref={notifRef} style={{ position:'relative' }}>
              <div onClick={() => setShowNotifList(!showNotifList)} style={{ cursor:'pointer', position:'relative', padding:6, borderRadius:8, transition:'background .15s', background: showNotifList ? '#f3f4f6' : 'transparent' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={rejectedCount + verifiedCount + dueCount > 0 ? 'var(--sage)' : 'var(--ink-soft)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {rejectedCount + verifiedCount + dueCount > 0 && (
                  <span style={{ position:'absolute', top:0, right:0, background:'#dc2626', color:'#fff', borderRadius:'50%', minWidth:16, height:16, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, lineHeight:1, padding:'0 3px' }}>
                    {rejectedCount + verifiedCount + dueCount > 9 ? '9+' : rejectedCount + verifiedCount + dueCount}
                  </span>
                )}
              </div>
              {showNotifList && (
                <div style={{ position:'absolute', top:'100%', right:0, marginTop:6, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,.12)', width:340, maxHeight:420, overflowY:'auto', zIndex:100, padding:0 }}>
                  {/* Header */}
                  <div style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>Notifications</span>
                    <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{rejectedCount + verifiedCount + dueCount} pending</span>
                  </div>

                  {rejectedCount + verifiedCount + dueCount === 0 && (
                    <div style={{ padding:24, fontSize:12, color:'var(--ink-soft)', textAlign:'center' }}>No pending items</div>
                  )}

                  {/* Rejected items */}
                  {rejectedToShow.map((item, i) => (
                    <div key={`rj-${item.id}`}
                      onClick={() => handleRejectedClick(item)}
                      style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6', cursor:'pointer', fontSize:12, transition:'background .15s' }}
                      onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:6, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', color:'#dc2626', flexShrink:0, marginTop:1 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                            <span style={{ background:'#dc2626', color:'#fff', fontSize:9, padding:'1px 5px', borderRadius:4, fontWeight:700, lineHeight:'14px' }}>REJECTED</span>
                            <span style={{ fontWeight:600, fontSize:12 }}>{item.body?.replace(/^Your lead for /, '').replace(/ \(.*$/, '') || 'Lead'}</span>
                          </div>
                          <div style={{ color:'#6b7280', fontSize:11, lineHeight:1.3 }}>{item.body?.replace(/^.*Reason: /, '')}</div>
                          <div style={{ color:'#9ca3af', fontSize:10, marginTop:2 }}>{item.sent_at ? new Date(item.sent_at).toLocaleString('en-GB') : ''}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Verified items */}
                  {verifiedToShow.map((item, i) => (
                    <div key={`vr-${item.id}`}
                      style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6', fontSize:12, cursor:'default' }}
                      onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:6, background:'#f0fdf4', display:'flex', alignItems:'center', justifyContent:'center', color:'#16a34a', flexShrink:0, marginTop:1 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                            <span style={{ background:'#16a34a', color:'#fff', fontSize:9, padding:'1px 5px', borderRadius:4, fontWeight:700, lineHeight:'14px' }}>VERIFIED</span>
                            <span style={{ fontWeight:600, fontSize:12 }}>{item.body?.replace(/^Your lead for /, '').replace(/ \(.*$/, '') || 'Lead'}</span>
                          </div>
                          <div style={{ color:'#6b7280', fontSize:11, lineHeight:1.3 }}>{item.body?.replace(/^.*has been verified\. /, '')}</div>
                          <div style={{ color:'#9ca3af', fontSize:10, marginTop:2 }}>{item.sent_at ? new Date(item.sent_at).toLocaleString('en-GB') : ''}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Due items */}
                  {dueToShow.map(item => (
                    <div key={`${item.id}-${item.ngo_id || ''}`}
                      onClick={() => { setShowNotifList(false); setModalDonor(item); }}
                      style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6', cursor:'pointer', fontSize:12 }}
                      onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:6, background:'#f0fdf4', display:'flex', alignItems:'center', justifyContent:'center', color:'#16a34a', flexShrink:0, marginTop:1 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:12, marginBottom:2 }}>{item.donor_name}</div>
                          <div style={{ color:'var(--ink-soft)', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:11 }}>schedule</span>
                            {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('en-GB') : 'Callback'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* View All link */}
                  {totalHidden > 0 && (
                    <div style={{ padding:'10px 14px', textAlign:'center', borderTop:'1px solid #f3f4f6' }}>
                      <button onClick={() => { setShowNotifList(false); setDrawerOpen(true); }}
                        style={{ background:'none', border:'none', color:'var(--sage)', cursor:'pointer', fontSize:12, fontWeight:600, padding:'4px 12px', borderRadius:6 }}>
                        View All ({totalHidden} more)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ position:'relative' }}>
              <div onClick={async () => { setShowStats(true); setStatsLoading(true); try { const [d, t] = await Promise.all([getMyDashboard().catch(() => null), getMyTarget().catch(() => null)]); setStatsData({ dash: d, target: t }); } catch {} finally { setStatsLoading(false); } }} style={{ cursor:'pointer', padding:6, borderRadius:8, transition:'background .15s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>
            <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
              <div className="avatar">{initials}</div>
              {showMenu && (
                <div className="user-menu">
                  <div className="user-menu-item" style={{flexDirection:'column', alignItems:'flex-start', gap:2, cursor:'default'}}>
                    <div style={{fontWeight:600, fontSize:13}}>{userName}</div>
                    <div style={{fontSize:11, color:'var(--ink-soft)'}}>FRO</div>
                  </div>
                  <div className="user-menu-divider" />
                  <div className="user-menu-item" onClick={() => { setShowMenu(false); setShowSettings(true); }} style={{cursor:'pointer'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Settings
                  </div>
                  <div className="user-menu-divider" />
                  <button className="user-menu-item" onClick={() => { setShowMenu(false); logout() }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
          <SettingsDrawer
            open={showSettings}
            onClose={() => setShowSettings(false)}
            themes={themes}
            themeName={themeName}
            onThemeChange={(key) => setThemeName(key)}
          />
          {showStats && (
            <div className="modal-overlay" onClick={() => setShowStats(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-head">
                  <h3>My Performance</h3>
                  <button className="btn btn-sm btn-icon" onClick={() => setShowStats(false)} style={{ padding: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="modal-body">
                  {statsLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</div>
                  ) : statsData ? (
                    <>
                      {statsData.target && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 2 }}>Monthly Target</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#8b5cf6' }}>{'\u20B9' + Number(statsData.target.target || 0).toLocaleString('en-IN')}</div>
                          </div>
                          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 2 }}>Collected</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{'\u20B9' + Number(statsData.target.collected || 0).toLocaleString('en-IN')}</div>
                          </div>
                          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 2 }}>Remaining</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: Math.max(0, (statsData.target.target || 0) - (statsData.target.collected || 0)) > 0 ? '#ef4444' : '#10b981' }}>
                              {'\u20B9' + Math.max(0, (statsData.target.target || 0) - (statsData.target.collected || 0)).toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>
                      )}
                      {statsData.dash && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            { label: 'Monthly Connected', value: statsData.dash.monthly_connected, color: '#3b82f6' },
                            { label: 'Daily Connected', value: statsData.dash.daily_connected, color: '#8b5cf6' },
                            { label: 'Monthly Donations', value: '\u20B9' + Number(statsData.dash.daily_donations || 0).toLocaleString('en-IN'), color: '#10b981' },
                            { label: 'Daily Donations', value: '\u20B9' + Number(statsData.dash.daily_donations || 0).toLocaleString('en-IN'), color: '#f59e0b' },
                            { label: 'Verified (Month)', value: '\u20B9' + Number(statsData.dash.verified_month_amount || 0).toLocaleString('en-IN'), color: '#10b981' },
                            { label: 'Unverified (Month)', value: '\u20B9' + Number(statsData.dash.unverified_month_amount || 0).toLocaleString('en-IN'), color: '#ef4444' },
                            { label: 'Active Donors', value: statsData.dash.active_donors || 0, color: '#5B6B4E' },
                            { label: 'Total Donations', value: '\u20B9' + Number(statsData.dash.total_donations || 0).toLocaleString('en-IN'), color: '#B5603A' },
                          ].map(s => (
                            <div key={s.label} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 2 }}>{s.label}</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No data available</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>
        <div className="content-body">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="my-leads" element={<MyDonors />} />
            <Route path="transferred-leads" element={<TransferredLeads />} />
            <Route path="rejected-leads" element={<RejectedLeads />} />
            <Route path="donors" element={<Donors />} />
            <Route path="logs" element={<CallLogs />} />
            <Route path="target" element={<MyTarget />} />
            <Route path="history" element={<History />} />
            <Route path="incentive-info" element={<IncentiveInfo />} />
            <Route path="suspense" element={<Suspense />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </div>
      </div>
      {modalDonor && (
        <DispositionModal
          donorId={modalDonor.id}
          ngoId={modalDonor.ngo_id}
          donorName={modalDonor.donor_name}
          donorMobile={modalDonor.donor_mobile}
          scheduledAt={modalDonor.scheduled_at}
          onClose={() => { setModalNotifId(null); setModalDonor(null); }}
          onDone={handlePopDone}
        />
      )}
      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sections={drawerSections}
        onItemClick={handleDrawerItemClick}
      />
    </div>
    </CallProvider>
  )
}
