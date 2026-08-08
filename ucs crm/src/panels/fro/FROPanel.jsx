import { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { LayoutDashboard, CalendarClock, Users, ArrowLeftRight, Gift, HeartCrack, Ticket, MessageCircle } from 'lucide-react'
import { useUcs } from '../../store'
import { themes, applyTheme } from '../hr/theme'
import { getScheduled, getCallbacks } from './api/donors'
import { getMyDashboard } from './api/donors'
import { getMyTarget } from './api/target'
import { useRealtime } from '../../hooks/useRealtime'
import { api, impersonateFRO, generateImpersonationCode, getFroWorkersForImpersonation, isImpersonating, startImpersonation, exitImpersonation } from '../../api/auth'
import { requestNotifPermission, showDesktopNotification } from '../../utils/desktopNotif'
import DispositionModal from './components/DispositionModal'
import CallTimer from './components/CallTimer'
import { CallProvider } from './CallContext'
import NotificationDrawer from '../../components/NotificationDrawer'
import SettingsDrawer from '../../components/SettingsDrawer'
import ToastContainer from '../../components/Toast'
import Dashboard from './pages/Dashboard'
import MyDonors from './pages/MyDonors'
import TransferredLeads from './pages/TransferredLeads'
import RejectedLeads from './pages/RejectedLeads'
import Donors from './pages/Donors'
import Scheduled from './pages/Scheduled'
import IncentiveInfo from './pages/IncentiveInfo'
import History from './pages/History'
import WhatsAppChat from './pages/WhatsAppChat'
import FroTickets from './pages/Tickets'

const NAV_BASE = [
  { id: 'dashboard', path: '/fro/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'scheduled', path: '/fro/scheduled', label: 'Follow Up / Callback', Icon: CalendarClock },
  { id: 'my-leads', path: '/fro/my-leads', label: 'My Leads', Icon: Users },
  { id: 'transferred-leads', path: '/fro/transferred-leads', label: 'Transferred', Icon: ArrowLeftRight },
  { id: 'donors', path: '/fro/donors', label: 'Donors', Icon: Gift },
  { id: 'rejected', path: '/fro/rejected-leads', label: 'Rejected Leads', Icon: HeartCrack },
  { id: 'tickets', path: '/fro/tickets', label: 'Raise Ticket', Icon: Ticket },
]

const INBOX_SHORT = { bsct: 'BSCT', aflf: 'AFLF', maan: 'MAAN' }

const MAX_DROPDOWN = 4

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014'

function callFmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function loadTodayStats() {
  try {
    const raw = localStorage.getItem('fro_call_stats');
    if (!raw) return null;
    const data = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return null;
    return data;
  } catch { return null; }
}

function Sidebar({ open, onClose, waUnreadCounts }) {
  const location = useLocation()
  const nav = [...NAV_BASE]
  const waAgents = JSON.parse(localStorage.getItem('wa_agents') || '[]')
  if (waAgents.length === 1) {
    nav.push({ id: 'whatsapp-chat', path: `/fro/whatsapp-chat?project=${waAgents[0].project}`, label: `Inbox ${INBOX_SHORT[waAgents[0].project] || waAgents[0].project}`, Icon: MessageCircle })
  } else if (waAgents.length > 1) {
    waAgents.forEach(a => {
      nav.push({ id: `whatsapp-${a.project}`, path: `/fro/whatsapp-chat?project=${a.project}`, label: `Inbox ${INBOX_SHORT[a.project] || a.project}`, Icon: MessageCircle })
    })
  } else {
    nav.push({ id: 'whatsapp-chat', path: '/fro/whatsapp-chat', label: 'Inbox', Icon: MessageCircle })
  }
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">U</div>
          <div><h1>UFS</h1><span>FRO Panel</span></div>
        </div>
        <nav className="sidebar-nav">
          {nav.map(n => (
            <NavLink key={n.id} to={n.path} end
              className={() => `snav-item ${location.pathname + location.search === n.path ? 'active' : location.pathname === n.path && !n.path.includes('?') ? 'active' : ''}`}
              onClick={() => onClose?.()}>
            <n.Icon size={18} strokeWidth={2} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{n.label}</span>
              {n.id.startsWith('whatsapp') && waUnreadCounts?.[n.id] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#25D366', color: '#fff', borderRadius: 10, padding: '1px 7px', lineHeight: '16px', minWidth: 18, textAlign: 'center' }}>
                  {waUnreadCounts[n.id] > 9 ? '9+' : waUnreadCounts[n.id]}
                </span>
              )}
              {n.id === 'whatsapp-chat' && waAgents.length === 1 && waUnreadCounts?.[`whatsapp-${waAgents[0]?.project}`] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#25D366', color: '#fff', borderRadius: 10, padding: '1px 7px', lineHeight: '16px', minWidth: 18, textAlign: 'center' }}>
                  {waUnreadCounts[`whatsapp-${waAgents[0]?.project}`] > 9 ? '9+' : waUnreadCounts[`whatsapp-${waAgents[0]?.project}`]}
                </span>
              )}
              {n.id === 'whatsapp-chat' && waUnreadCounts?.total > 0 && !waAgents.length && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#25D366', color: '#fff', borderRadius: 10, padding: '1px 7px', lineHeight: '16px', minWidth: 18, textAlign: 'center' }}>
                  {waUnreadCounts.total > 9 ? '9+' : waUnreadCounts.total}
                </span>
              )}
            </span>
          </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default function FROPanel() {
  const { user, logout } = useUcs()
  const location = useLocation()
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [waUnreadCounts, setWaUnreadCounts] = useState({ total: 0 })
  const [themeName, setThemeName] = useState(() => localStorage.getItem('fro_theme') || 'sky')
  const menuRef = useRef(null)
  const workAsRef = useRef(null)

  const [showWorkAs, setShowWorkAs] = useState(false)
  const [froList, setFroList] = useState([])
  const [workAsLoading, setWorkAsLoading] = useState(false)
  const [workAsSearch, setWorkAsSearch] = useState('')
  const [pendingTarget, setPendingTarget] = useState(null)
  const [codeInput, setCodeInput] = useState('')
  const [codeSubmitting, setCodeSubmitting] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [codeGenerated, setCodeGenerated] = useState(false)
  const impersonating = isImpersonating()

  const openWorkAs = async () => {
    setShowWorkAs(v => !v)
    setWorkAsSearch('')
    if (froList.length > 0) return
    setWorkAsLoading(true)
    try {
      const res = await getFroWorkersForImpersonation()
      setFroList(res?.workers || [])
    } catch (e) { console.error('Error:', e.message); }
    finally { setWorkAsLoading(false) }
  }

  const pickImpersonateTarget = (worker) => {
    setShowWorkAs(false)
    setPendingTarget(worker)
    setCodeInput('')
    setCodeGenerated(false)
  }

  const generateCodeForSwitch = async () => {
    setGeneratingCode(true)
    try {
      await generateImpersonationCode()
      setCodeGenerated(true)
      setCodeInput('')
    } catch (e) {
      console.error('Error:', e.message)
      alert(e.message || 'Could not generate code')
    } finally {
      setGeneratingCode(false)
    }
  }

  const filteredFroList = froList.filter(w => !workAsSearch || (w.name || '').toLowerCase().includes(workAsSearch.toLowerCase()))

  const doImpersonate = async () => {
    if (!pendingTarget) return
    setCodeSubmitting(true)
    try {
      const res = await impersonateFRO(pendingTarget.id, codeInput.trim())
      startImpersonation(res.token, res.user)
      setPendingTarget(null)
      window.location.reload()
    } catch (e) {
      console.error('Error:', e.message)
      alert(e.message || 'Could not switch FRO')
    } finally {
      setCodeSubmitting(false)
    }
  }

  const doExitImpersonation = () => {
    exitImpersonation()
    window.location.reload()
  }

  useEffect(() => {
    if (themes[themeName]) {
      applyTheme(themes[themeName], '.panel-fro')
      const t = themes[themeName]
      const el = document.querySelector('.panel-fro') || document.documentElement
      el.style.setProperty('--bg', t.sand); el.style.setProperty('--card-bg', t.paper); el.style.setProperty('--sage-light', t['sage-soft'])
    }
    localStorage.setItem('fro_theme', themeName)
  }, [themeName])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

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
  const [showTarget, setShowTarget] = useState(false);
  let _initSeenNotifs = []; try { _initSeenNotifs = JSON.parse(localStorage.getItem('fro_seen_notifs') || '[]'); } catch { /* corrupted */ }
  const seenNotifIds = useRef(new Set(_initSeenNotifs));
  const notifRef = useRef(null);
  const pollRef = useRef(null);
  const poppedIds = useRef(new Set());
  const [autoPopTick, setAutoPopTick] = useState(0);

  const markRead = async (notifId) => {
    try { await api(`/notifications/${notifId}/read`, { method: 'PUT', _prefix: 'ucs' }); }
    catch (e) { console.error('Error:', e.message); }
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
    if (modalDonor?.id) poppedIds.current.add(modalDonor.id);
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
      .catch((err) => { console.error('Error:', err.message); });
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
    const fetchWaUnread = async () => {
      try {
        const token = localStorage.getItem('ucs_token')
        if (!token) return
        const apiBase = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'

        // Try auto-login first if no agents stored
        const storedAgents = JSON.parse(localStorage.getItem('wa_agents') || '[]')
        if (storedAgents.length === 0 && user?.id) {
          try {
            const loginRes = await fetch(`${apiBase}/fro/whatsapp/auto-login`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (loginRes.ok) {
              const loginData = await loginRes.json()
              const sessionList = loginData.agents || loginData.sessions || []
              if (sessionList.length) {
                const agents = sessionList.map(s => ({
                  agentUserId: s.agentId,
                  accountName: s.account?.name,
                  project: s.project,
                  whatsappUserId: s.account?.id,
                  token: s.token,
                }))
                localStorage.setItem('wa_agents', JSON.stringify(agents))
              }
            }
          } catch { /* silent */ }
        }

        // Fetch unread counts for each agent
        const agents = JSON.parse(localStorage.getItem('wa_agents') || '[]')
        const counts = { total: 0 }
        for (const agent of agents) {
          try {
            const res = await fetch(`${apiBase}/fro/whatsapp/conversations/unread-count`, {
              headers: { Authorization: `Bearer ${agent.token}` },
            })
            if (res.ok) {
              const data = await res.json()
              const key = `whatsapp-${agent.project}`
              counts[key] = data?.count || 0
              counts.total += data?.count || 0
            }
          } catch { /* skip */ }
        }
        // Fallback: try the FRO token for a single count
        if (agents.length === 0) {
          try {
            const res = await fetch(`${apiBase}/fro/whatsapp/conversations/unread-count`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
              const data = await res.json()
              counts.total = data?.count || 0
            }
          } catch { /* skip */ }
        }
        setWaUnreadCounts(counts)
      } catch (e) { console.error('Error:', e.message); }
    }
    fetchWaUnread()
    const interval = setInterval(fetchWaUnread, 15000)
    return () => clearInterval(interval)
  }, [user?.id])

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifList(false)
      if (workAsRef.current && !workAsRef.current.contains(e.target)) setShowWorkAs(false)
    }
    if (showMenu || showNotifList || showWorkAs) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu, showNotifList, showWorkAs])

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
    }).catch((err) => { console.error('Error:', err.message); });
  };
  useEffect(() => { loadReminders(); }, [refetch]);
  useEffect(() => { const interval = setInterval(() => loadReminders(), 30000); return () => clearInterval(interval); }, []);

  const dedupedRows = rows.filter((r, i, a) => i === a.findIndex(x => x.id === r.id));
  const dueItems = dedupedRows.filter(r => r.scheduled_at && new Date(r.scheduled_at) <= new Date());
  const dueCount = dueItems.length;

  useEffect(() => { const i = setInterval(() => setAutoPopTick(t => t + 1), 5000); return () => clearInterval(i); }, []);

  useEffect(() => {
    if (modalDonor) return;
    const due = dueItems.filter(r => !poppedIds.current.has(r.id))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    if (due.length > 0) {
      poppedIds.current.add(due[0].id);
      setModalDonor(due[0]);
    }
  }, [autoPopTick, dueItems, modalDonor]);

  const rejectedToShow = rejectedItems.slice(0, MAX_DROPDOWN);
  const verifiedToShow = verifiedItems.slice(0, MAX_DROPDOWN - rejectedToShow.length);
  const dueToShow = dueItems.slice(0, MAX_DROPDOWN - rejectedToShow.length - verifiedToShow.length);
  const totalShown = rejectedToShow.length + verifiedToShow.length + dueToShow.length;
  const totalHidden = rejectedCount + verifiedCount + dueCount - totalShown;

  const meta = NAV_BASE.find(n => location.pathname === n.path)
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
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} waUnreadCounts={waUnreadCounts} />
      <div className="main">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <div>
            <div className="eyebrow">FRO</div>
            <h2>{meta?.label || 'Dashboard'}</h2>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <CallTimer />
            <div ref={notifRef} style={{ position:'relative' }}>
              <div onClick={() => setDrawerOpen(true)} style={{ cursor:'pointer', position:'relative', padding:6, borderRadius:8, transition:'background .15s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={rejectedCount + verifiedCount + dueCount > 0 ? 'var(--sage)' : 'var(--ink-soft)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={rejectedCount + verifiedCount + dueCount > 0 ? 'bell-ring' : ''}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {rejectedCount + verifiedCount + dueCount > 0 && (
                  <span style={{ position:'absolute', top:0, right:0, background:'#dc2626', color:'#fff', borderRadius:'50%', minWidth:16, height:16, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, lineHeight:1, padding:'0 3px' }}>
                    {rejectedCount + verifiedCount + dueCount > 9 ? '9+' : rejectedCount + verifiedCount + dueCount}
                  </span>
                )}
              </div>
            </div>
            <div style={{ position:'relative' }}>
              <div onClick={async () => { setShowStats(true); setShowTarget(false); setStatsLoading(true); try { const [d, t] = await Promise.all([getMyDashboard().catch((err) => { console.error('Error:', err.message); }), getMyTarget().catch((err) => { console.error('Error:', err.message); })]);             setStatsData({ dash: d, target: t }); } catch (e) { console.error('Error:', e.message); } finally { setStatsLoading(false); } }} style={{ cursor:'pointer', padding:6, borderRadius:8, transition:'background .15s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>
            <div ref={workAsRef} style={{ position: 'relative' }}>
              <div onClick={openWorkAs} title={impersonating ? `Working as ${userName}` : 'Work as another FRO'} style={{ cursor: 'pointer', padding: 6, borderRadius: 8, transition: 'background .15s', background: impersonating ? 'var(--sage-soft, rgba(22,163,74,.15))' : undefined }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={impersonating ? 'var(--sage)' : 'var(--ink-soft)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M16 8h.01"/><path d="M8 12h8"/><path d="M8 8h.01"/><path d="M16 12h.01"/></svg>
              </div>
              {showWorkAs && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 240, background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, zIndex: 60 }}>
                  <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>Work as FRO</div>
                  <input
                    value={workAsSearch}
                    onChange={e => setWorkAsSearch(e.target.value)}
                    placeholder="Search FRO…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', marginBottom: 4, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-soft, #f1f5f9)', color: 'var(--ink)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                  />
                  {workAsLoading && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>Loading…</div>}
                  {!workAsLoading && (
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {filteredFroList.map(w => (
                        <div key={w.id} onClick={() => { if (w.id !== user?.id) pickImpersonateTarget(w); }} style={{ cursor: 'pointer', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, background: w.id === user?.id ? 'var(--bg-soft, #f1f5f9)' : undefined, color: 'var(--ink)' }}>
                          <span style={{ fontWeight: 600 }}>{w.name}</span>
                          {w.id === user?.id && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-soft)' }}>You</span>}
                        </div>
                      ))}
                      {filteredFroList.length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>{froList.length === 0 ? 'No other FROs available' : 'No matching FROs'}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
              <div className="avatar">{initials}</div>
              {showMenu && (
                <div className="user-menu">
                  <div className="user-menu-item" style={{flexDirection:'column', alignItems:'flex-start', gap:2, cursor:'default'}}>
                    <div style={{fontWeight:600, fontSize:13}}>{userName}</div>
                    <div style={{fontSize:11, color:'var(--ink-soft)'}}>{impersonating && user?.imposter_name ? `Working as FRO · you are ${user.imposter_name}` : 'FRO'}</div>
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
        </header>
        {impersonating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(22,163,74,.12)', borderBottom: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            <span><b>{userName}</b>'s account · you are {user?.imposter_name || 'an administrator'}. Collections credit to {user?.imposter_name || 'you'}.</span>
            <button className="btn btn-sm" onClick={doExitImpersonation} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 12px', background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Exit work-as</button>
          </div>
        )}
        {pendingTarget && (
          <div className="modal-overlay" onClick={() => setPendingTarget(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, padding: 22, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Work as {pendingTarget.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 16 }}>
                {codeGenerated
                  ? 'Code generated! Ask your admin for the code and enter it below to switch.'
                  : 'Generate a code to authorize switching. Your admin will share the code with you.'}
              </div>
              {!codeGenerated && (
                <button
                  className="btn"
                  onClick={generateCodeForSwitch}
                  disabled={generatingCode}
                  style={{ width: '100%', justifyContent: 'center', background: 'var(--sage)', color: '#fff' }}
                >
                  {generatingCode ? 'Generating…' : '+ Generate code'}
                </button>
              )}
              <input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && codeInput.length === 4) doImpersonate(); }}
                placeholder="••••"
                inputMode="numeric"
                style={{ width: '100%', textAlign: 'center', fontSize: 24, fontWeight: 700, letterSpacing: 10, padding: '9px 0', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginTop: 14 }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn" onClick={() => setPendingTarget(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button
                  className="btn"
                  onClick={doImpersonate}
                  disabled={codeInput.length !== 4 || codeSubmitting}
                  style={{ flex: 1, justifyContent: 'center', background: 'var(--sage)', color: '#fff' }}
                >
                  {codeSubmitting ? 'Switching…' : 'Switch'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showStats && (
            <div className="modal-overlay" onClick={() => setShowStats(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{showTarget ? 'Monthly Target' : "Today's Activity"}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{showTarget ? 'Your collection progress' : 'Your calling stats for today'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {showTarget && <button className="btn btn-sm" onClick={() => setShowTarget(false)} style={{ fontSize: 11, padding: '4px 10px' }}>← Stats</button>}
                    {!showTarget && <button className="btn btn-sm" onClick={() => setShowTarget(true)} style={{ fontSize: 11, padding: '4px 10px' }}>Target →</button>}
                    <button className="btn btn-sm btn-icon" onClick={() => setShowStats(false)} style={{ padding: 4 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>

                <div style={{ padding: '20px 22px', background: 'var(--bg)' }}>
                  {!showTarget ? (() => {
                    const ts = loadTodayStats();
                    const totalProd = (ts?.totalSeconds || 0) + (ts?.idleSeconds || 0);
                    if (!ts || (ts.calls === 0 && ts.skippedDonors === 0 && ts.breakSeconds === 0 && ts.idleSeconds === 0)) {
                      return (
                        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" opacity=".4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 12 }}>No activity yet today</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)', opacity: .6, marginTop: 4 }}>Start calling to see your stats here</div>
                        </div>
                      );
                    }
                    const pct = Math.round((ts.totalSeconds / (totalProd || 1)) * 100);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a', lineHeight: 1.1 }}>{ts.calls}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Calls</div>
                          </div>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{callFmt(ts.totalSeconds)}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Talk Time</div>
                          </div>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{callFmt(Math.round(ts.totalSeconds / (ts.calls || 1)))}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Avg Call</div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{ts.skippedDonors}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Skipped</div>
                            </div>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" opacity=".5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          </div>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: 22, fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{callFmt(ts.idleSeconds)}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Idle</div>
                            </div>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" opacity=".5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          </div>
                        </div>

                        <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: ts.breakSeconds > 3600 ? '#fef2f2' : '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ts.breakSeconds > 3600 ? '#ef4444' : '#d97706', fontSize: 18 }}>☕</div>
                            <div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: ts.breakSeconds > 3600 ? '#ef4444' : '#d97706', fontVariantNumeric: 'tabular-nums' }}>{callFmt(ts.breakSeconds)}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{ts.breakCount || 0} breaks</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: pct > 50 ? '#16a34a' : '#d97706' }}>{pct}%</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Productivity</div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    statsLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading...</div>
                      </div>
                    ) : statsData?.target ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6' }}>{'\u20B9' + Number(statsData.target.target || 0).toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Target</div>
                          </div>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{'\u20B9' + Number(statsData.target.collected || 0).toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Collected</div>
                          </div>
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '16px 18px', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{'\u20B9' + Math.max(0, (statsData.target.target || 0) - (statsData.target.collected || 0)).toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Remaining</div>
                          </div>
                        </div>

                        {statsData.target.target > 0 && (
                          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 6 }}>
                              <span>Progress</span>
                              <span>{Math.min(100, Math.round(((statsData.target.collected || 0) / statsData.target.target) * 100))}%</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: Math.min(100, ((statsData.target.collected || 0) / statsData.target.target) * 100) + '%', background: 'linear-gradient(90deg, #8b5cf6, #16a34a)', transition: 'width .5s ease' }} />
                            </div>
                          </div>
                        )}

                        {statsData.dash && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                              { label: 'Connected (M)', value: statsData.dash.monthly_connected, color: '#3b82f6' },
                              { label: 'Connected (D)', value: statsData.dash.daily_connected, color: '#8b5cf6' },
                              { label: 'Verified', value: '\u20B9' + Number(statsData.dash.verified_month_amount || 0).toLocaleString('en-IN'), color: '#16a34a' },
                              { label: 'Unverified', value: '\u20B9' + Number(statsData.dash.unverified_month_amount || 0).toLocaleString('en-IN'), color: '#ef4444' },
                              { label: 'Active Donors', value: statsData.dash.active_donors || 0, color: '#5B6B4E' },
                              { label: 'Total', value: '\u20B9' + Number(statsData.dash.total_donations || 0).toLocaleString('en-IN'), color: '#B5603A' },
                            ].map(s => (
                              <div key={s.label} style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', boxShadow: 'var(--shadow)' }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 1 }}>{s.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No target data available</div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        <div className="content-body" style={{ marginRight: drawerOpen ? 320 : 0, transition: 'margin-right .25s ease' }}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="my-leads" element={<MyDonors />} />
            <Route path="transferred-leads" element={<TransferredLeads />} />
            <Route path="rejected-leads" element={<RejectedLeads />} />
            <Route path="donors" element={<Donors />} />
            <Route path="history" element={<History />} />
            <Route path="incentive-info" element={<IncentiveInfo />} />
            <Route path="tickets" element={<FroTickets />} />
            <Route path="whatsapp-chat" element={<WhatsAppChat />} />
            <Route path="whatsapp-chat/:project" element={<WhatsAppChat />} />
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
          onClose={() => { setModalNotifId(null); setModalDonor(null); poppedIds.current.clear(); }}
          onDone={handlePopDone}
        />
      )}
      <NotificationDrawer topOffset={72}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sections={drawerSections}
        onItemClick={handleDrawerItemClick}
      />
      <ToastContainer />
    </div>
    </CallProvider>
  )
}
