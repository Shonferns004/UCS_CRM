import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { LayoutDashboard, Users, Gift, Ticket, MessageCircle, MessagesSquare, Coins, Trophy, Medal } from 'lucide-react'
import { useUcs } from '../../store'
import { themes, applyTheme } from '../hr/theme'
import { getScheduled, getCallbacks } from './api/donors'
import { getMyDashboard, getMyStations } from './api/donors'
import { getMyTarget } from './api/target'
import DataUsageModal from './components/DataUsageModal'
import { useRealtime } from '../../hooks/useRealtime'
import { onFroAction, onFroBroadcast, onFroTeamBroadcast, onFroForceLogout } from '../../lib/socket'
// Acting FRO (work-as) retired: the FRO-side entry helpers above were removed
// with it. releaseWorkAs/exitImpersonation stay so a session started before the
// retirement can still exit cleanly via the banner below.
import { api, releaseWorkAs, isImpersonating, exitImpersonation } from '../../api/auth'
import { requestNotifPermission, showDesktopNotification } from '../../utils/desktopNotif'
import { toast } from '../../components/Toast'
import DispositionModal from './components/DispositionModal'
import { CallProvider, useCall, DISPOSITION_WINDOW, SETTLE_SECONDS } from './CallContext'
import { API_BASE as apiBase } from '../../lib/apiBase'
import NotificationDrawer from '../../components/NotificationDrawer'
import SettingsDrawer from '../../components/SettingsDrawer'
import ToastContainer from '../../components/Toast'
import Dashboard from './pages/Dashboard'
import MyLeadsSuspense from './pages/MyLeadsSuspense'
import Donors from './pages/Donors'
import IncentiveInfo from './pages/IncentiveInfo'
import LeadIncentive from './pages/LeadIncentive'
import AkiBanner from '../../components/AkiBanner'
import SpecialIncentive, { SidebarIncentive, useSpecialIncentive } from '../../components/SpecialIncentive'
import RangeRulePopup from '../../components/RangeRulePopup'
import IdleNoticeHost from './components/IdleNoticeHost'
import IdleWarningModal from './components/IdleWarningModal'
import * as socketModule from '../../lib/socket'
import LeadChampionCelebration from '../../components/LeadChampionCelebration'
import LeadIncentiveLeaderboard from '../../components/LeadIncentiveLeaderboard'
import FroTeamRacePopup from './components/FroTeamRacePopup'
import NoticePopup from '../../components/NoticePopup'
import History from './pages/History'
import FroTickets from './pages/Tickets'
import FroSuspense from './pages/Suspense'
import WhatsAppChat from './pages/WhatsAppChat'
import { useIsMobile } from '../../hooks/useIsMobile'
import { istDateString } from './utils/time'
import { readWaInboxAgents, writeWaInboxAgents } from './utils/waInboxAgents'
import teleWav from '../../assets/audio/tele.wav'
import followDueMp3 from '../../assets/audio/follow_due.mp3'
import callLessMp3 from '../../assets/audio/call_less.mp3'
import ChatWorkspace from '../../components/chat/ChatWorkspace'
import SuperAdminTicketSection from '../../components/SuperAdminTicketSection'
import ChatNavBadge from '../../components/chat/ChatNavBadge'
import reelMp3 from '../../assets/audio/reel.mp3'
import congratsMp3 from '../../assets/audio/congrats.mp3'

// Realtime events on fro_donor_logs / fro_assignments arrive one per row write
// and are broadcast to every open FRO, not just the one who caused them. A short
// trailing window is invisible to a person (the drawer is a summary list) and
// turns a burst of events into a single pair of queries.
const REMINDER_RELOAD_COALESCE_MS = 5000;

const suspenseAlertAudio = new Audio(teleWav);
suspenseAlertAudio.preload = 'auto';
const followDueAudio = new Audio(followDueMp3);
const callLessAudio = new Audio(callLessMp3);
const entertainAudio = new Audio(reelMp3);
const congratsAudio = new Audio(congratsMp3);
const customEntertainAudioCache = new Map();
followDueAudio.preload = 'auto';
callLessAudio.preload = 'auto';
entertainAudio.preload = 'auto';
congratsAudio.preload = 'auto';
const SUSPENSE_RING_WINDOW_MS = 90 * 1000;
const suspensePendingRef = { current: false };
function playSuspenseAlert(title) {
  toast(title || 'Suspense Alert', 'info');
  try {
    suspenseAlertAudio.currentTime = 0;
    const p = suspenseAlertAudio.play();
    if (p && p.catch) p.catch(() => {
      suspensePendingRef.current = true;
      console.warn('[fro] suspense audio autoplay blocked; will play on next interaction');
    });
  } catch (e) { console.warn('[fro] suspense audio play threw:', e?.message || e); }
}
if (typeof window !== 'undefined') {
  const unlockSuspense = () => {
    if (!suspensePendingRef.current) return;
    suspensePendingRef.current = false;
    try {
      suspenseAlertAudio.currentTime = 0;
      suspenseAlertAudio.play().catch(() => {});
    } catch {}
  };
  window.addEventListener('pointerdown', unlockSuspense);
  window.addEventListener('keydown', unlockSuspense);
  window.addEventListener('touchstart', unlockSuspense);
}
const froActionPendingRef = { current: null };
function playFroAction(type, title, audioUrl) {
  toast(title || 'FRO action', 'info');
  let audio = type === 'fro_action_follow_up' ? followDueAudio : (type === 'fro_action_less_calls' ? callLessAudio : entertainAudio);
  if (type === 'fro_action_entertain' && audioUrl) {
    if (!customEntertainAudioCache.has(audioUrl)) {
      const custom = new Audio(audioUrl);
      custom.preload = 'auto';
      customEntertainAudioCache.set(audioUrl, custom);
    }
    audio = customEntertainAudioCache.get(audioUrl);
  }
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {
      froActionPendingRef.current = audio;
      console.warn('[fro] fro-action audio autoplay blocked; will play on next interaction');
    });
  } catch (e) { console.warn('[fro] fro-action audio play threw:', e?.message || e); }
}
if (typeof window !== 'undefined') {
  const unlockFroAction = () => {
    if (!froActionPendingRef.current) return;
    const audio = froActionPendingRef.current;
    froActionPendingRef.current = null;
    try { audio.currentTime = 0; audio.play().catch(() => {}); } catch {}
  };
  window.addEventListener('pointerdown', unlockFroAction);
  window.addEventListener('keydown', unlockFroAction);
  window.addEventListener('touchstart', unlockFroAction);
}
function playTeamCongratsAudio() {
  try {
    congratsAudio.currentTime = 0;
    const p = congratsAudio.play();
    if (p && p.then) p.catch(() => {});
  } catch {}
}
let suspenseAudioUnlocked = false;
function warmupSuspenseAudio() {
  if (suspenseAudioUnlocked) return;
    suspenseAudioUnlocked = true;
    try {
    suspenseAlertAudio.volume = 0;
    suspenseAlertAudio.muted = true;
    const p = suspenseAlertAudio.play();
    if (p && p.then) p.then(() => {
      suspenseAlertAudio.pause();
      suspenseAlertAudio.currentTime = 0;
      suspenseAlertAudio.muted = false;
      suspenseAlertAudio.volume = 1;
    }).catch(() => {});
    for (const audio of [followDueAudio, callLessAudio, entertainAudio, congratsAudio]) {
      audio.volume = 0;
      audio.muted = true;
      const p = audio.play();
      if (p && p.then) p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1;
      }).catch(() => {});
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', warmupSuspenseAudio, { once: false });
  window.addEventListener('keydown', warmupSuspenseAudio, { once: false });
  window.addEventListener('touchstart', warmupSuspenseAudio, { once: false });
}

const NAV_BASE = [
  { id: 'dashboard', path: '/fro/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'my-leads', path: '/fro/my-leads', label: 'My Leads', Icon: Users },
  { id: 'donors', path: '/fro/donors', label: 'Donors', Icon: Gift },
  { id: 'lead-incentive', path: '/fro/lead-incentive', label: 'Lead Incentive', Icon: Trophy },
  { id: 'tickets', path: '/fro/tickets', label: 'Raise Ticket', Icon: Ticket },
  { id: 'chat', path: '/fro/chat', label: 'UCS Chat', Icon: MessagesSquare },
]

const formatTeamName = (name) => String(name || '').replace(/^UFS\s*(\d+)$/i, 'UFS $1');
const sortTeamBroadcasts = (teams) => [...(teams || [])].sort((a, b) => {
  const am = String(a?.name || '').match(/^UFS\s*(\d+)$/i);
  const bm = String(b?.name || '').match(/^UFS\s*(\d+)$/i);
  if (am && bm) return Number(am[1]) - Number(bm[1]);
  return String(a?.name || '').localeCompare(String(b?.name || ''));
});

const INBOX_SHORT = { bsct: 'BSCT', bsct2: 'BSCT2', aflf: 'AFLF', mann: 'MANN' }

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014'

// Admin per-FRO pause gate: fullscreen blocking overlay while this FRO is
// paused. No dismiss, no resume button — only an admin resume (socket event)
// lifts it. Rendered inside <CallProvider> so useCall() is available.
function PauseGate() {
  const { paused, pausedBy, resumeSelf } = useCall();
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState(null);
  if (!paused) return null;
  const onPlay = async () => {
    if (resuming) return;
    setResuming(true);
    setResumeError(null);
    try {
      await resumeSelf();
    } catch (e) {
      setResumeError(e?.message || 'Resume failed. Please try again.');
    } finally {
      setResuming(false);
    }
  };
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Account paused by admin"
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15,23,42,.82)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(420px, 100%)', borderRadius: 18, background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.45)', padding: 24, textAlign: 'center' }}>
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </span>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#17233C' }}>You are paused</div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 6, lineHeight: 1.6 }}>
          {pausedBy ? <>Paused by {pausedBy}.<br /></> : null}
          All your timers are stopped — nothing is being counted right now.
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12.5, fontWeight: 600, color: '#92400E', lineHeight: 1.55 }}>
          Contact your admin to resume, or press Play below — this screen lifts the moment anyone resumes you.
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={resuming}
          aria-label="Resume work"
          style={{ marginTop: 14, width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', background: '#16A34A', color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', cursor: resuming ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          {resuming ? 'Resuming…' : 'Play — Resume Work'}
        </button>
        {resumeError && (
          <div role="alert" style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#DC2626' }}>{resumeError}</div>
        )}
      </div>
    </div>
  );
}

// mm:ss for the disposition countdown. Plain text on purpose — the previous
// seven-segment SVG was hard to read at a glance, and its always-visible
// "unlit" segments made a perfectly live clock look broken.
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Disposition countdown, floating over every FRO screen.
//
// Logging in buys a one-time 3-minute settle-in grace, and the ordinary
// 4-minute window arms by itself the moment that runs out — so the FRO always
// ends up on a real clock without being billed for the seconds they spent
// getting started. Until a window exists the widget shows the grace instead of
// "Not started". Once armed it counts down from the server's deadline; paused, in
// a meeting or off shift it holds and says why, because the server issues no
// deadline in those states.
function DispositionTimer() {
  const { secondsLeft, isIdle, inShift, paused, status, settleSecondsLeft } = useCall();

  const held = paused || status === 'meeting';
  const armed = secondsLeft != null;
  // The grace only shows while there is no window to show. Once the window is
  // armed it supersedes the grace, so the widget never displays two clocks.
  //
  // Held and off-shift are excluded because the server grants and advances nothing
  // in those states either. A FRO who pauses during the grace would otherwise sit
  // watching it run down to 0:00, and at zero the client would keep asking the
  // server to arm a window the server is deliberately refusing to arm.
  const settling = !armed && settleSecondsLeft != null && !held && inShift;
  const counting = inShift && !held && armed;
  const value = armed ? secondsLeft : DISPOSITION_WINDOW;
  // Urgency belongs to the window only. A grace is a countdown the FRO cannot be
  // billed for, so it must never turn amber or red — at 0:30 of grace, warning
  // someone "due now" would be a lie.
  const urgent = counting && value <= 60;
  const warn = counting && value <= 120;

  let tone = 'live';
  if (isIdle) tone = 'urgent';
  else if (held || !inShift || !armed) tone = 'held';
  else if (urgent) tone = 'urgent';
  else if (warn) tone = 'warn';

  const color = tone === 'urgent' ? '#DC2626' : tone === 'warn' ? '#B45309' : tone === 'live' ? '#0369A1' : '#64748B';
  const border = tone === 'urgent' ? '#FCA5A5' : tone === 'warn' ? '#FCD34D' : tone === 'live' ? '#BAE6FD' : 'var(--line, #e2e8f0)';

  const label = isIdle ? 'Idle'
    : held ? (status === 'meeting' ? 'Meeting' : 'Paused')
    : !inShift ? 'Off shift'
    : settling ? 'Settling in'
    : !armed ? 'Not started'
    : urgent ? 'Now'
    : warn ? 'Due'
    : 'Disposition';

  // While idle the window is gone, so there is no number to count down and no
  // local tally: idle seconds are the server's to measure, and recording any
  // activity clears the state on the server.
  const display = isIdle
    ? '—:—'
    : armed ? formatClock(value)
      : settling ? formatClock(settleSecondsLeft)
        : '—:—';

  const tip = isIdle
    ? 'You are idle. Record any activity to clear it.'
    : settling
      ? 'Settling in. Your 4-minute disposition window starts as soon as this runs out — nothing is counted against you until then.'
      : held
        ? 'On hold — the 4-minute window is frozen while you are paused or in a meeting.'
        : !inShift
          ? 'Off shift, so the window is not running. It opens when you start your shift.'
          : !armed
            ? 'Your 4-minute disposition window is starting up. It runs on its own — you do not need to log anything first.'
            : 'Time left to record an activity. Every activity resets this to 4:00.';

  // Fraction of the window still remaining, for the bar underneath. While idle
  // the bar is full-width: the countdown is over. During the grace it tracks the
  // grace, not a window that does not exist yet.
  const remaining = isIdle
    ? 1
    : armed ? Math.max(0, Math.min(1, value / DISPOSITION_WINDOW))
      : settling ? Math.max(0, Math.min(1, settleSecondsLeft / SETTLE_SECONDS))
        : 1;

  // Portalled to document.body on purpose. Rendered inline it sat at z-index 70,
  // so the detailed donor/lead page (z-index 1400) and the donation modal (2000)
  // covered it completely — the clock vanished exactly where the FRO spends
  // their time. Portalled, it escapes those stacking contexts and sits above
  // every page overlay, but still below the two full-screen holds (meeting
  // 99999 / admin pause) which are meant to block the whole app.
  return createPortal(
    <>
      {/* Keyframes live here rather than in the broadcast block: this widget is
          on screen permanently, the broadcast is not. */}
      <style>{'@keyframes froIdlePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.35); } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); } }'}</style>
      <div
        title={tip}
        style={{
          position: 'fixed',
          right: 20,
          // "a little below the right middle" — 58% down the viewport, lifted by
          // half its own height so the widget straddles that line.
          top: '58%',
          transform: 'translateY(-50%)',
          zIndex: 99997,
          width: 130,
          padding: '10px 12px',
          borderRadius: 14,
          background: 'var(--card-bg, #fff)',
          border: `1px solid ${border}`,
          boxShadow: tone === 'urgent' ? '0 10px 28px rgba(220,38,38,.22)' : '0 8px 22px rgba(15,23,42,.16)',
          ...(tone === 'urgent' ? { animation: 'froIdlePulse 1.4s infinite' } : {}),
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontSize: 9.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: .5, lineHeight: 1.2 }}>
          {label}
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, color: tone === 'held' ? '#94A3B8' : '#17233C',
          lineHeight: 1.15, marginTop: 2, fontVariantNumeric: 'tabular-nums',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        }}>
          {display}
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--line, #e2e8f0)', overflow: 'hidden', marginTop: 7 }}>
          <div style={{ height: '100%', width: `${remaining * 100}%`, background: color, transition: 'width .95s linear' }} />
        </div>
      </div>
    </>,
    document.body,
  );
}

// Live status pill for the top bar — mirrors the backend fro_live_status value.
// Rendered inside <CallProvider> so useCall() is available.
function FroStatusPill() {
  // The pill must agree with the countdown, so it is driven by the derived
  // `isIdle` (the same value the timer widget flips to at 0:00), never by the
  // raw status column. A stale/heartbeat-raced row can say status='idle' while
  // the deadline is still open — trusting that here made the header show Idle
  // while the countdown still read 3:00. Offline stays column-driven since no
  // derivation covers it.
  const { status, isIdle } = useCall();
  const key = status === 'offline' ? 'offline' : (isIdle ? 'idle' : 'active');
  const cfg = {
    active: { label: 'Active', bg: '#e7f3ec', border: '#bce5cd', color: '#15803d', dot: '#16a34a' },
    idle: { label: 'Idle', bg: '#FEE2E2', border: '#FCA5A5', color: '#B91C1C', dot: '#DC2626' },
    offline: { label: 'Offline', bg: '#f3f4f6', border: '#e5e7eb', color: '#6b7280', dot: '#9ca3af' },
  }[key];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: cfg.bg, border: `1px solid ${cfg.border}`, marginTop: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block', ...(key === 'active' ? { boxShadow: '0 0 0 0 rgba(22,163,74,.45)', animation: 'froActivePulse 2s infinite' } : key === 'idle' ? { boxShadow: '0 0 0 0 rgba(220,38,38,.45)', animation: 'froIdlePulse 1.4s infinite' } : {}) }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: .4 }}>{cfg.label}</span>
    </div>
  );
}

function BirthdayPopup() {
  const { user } = useUcs()
  const [celebrants, setCelebrants] = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let retryTimer = null
    const load = () => {
      api('/workers/birthdays', { _prefix: 'ucs' })
        .then(data => {
          if (cancelled) return
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
          const todayMD = istDateString().slice(5)
          const todays = (data || []).filter(w => {
            if (!w.dob) return false
            const d = new Date(w.dob)
            if (isNaN(d.getTime())) return false
            const dobMD = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            return dobMD === todayMD
          })
          setCelebrants(todays)
        })
        .catch(err => {
          if (cancelled) return
          console.error('Birthday popup error:', err.message)
          if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; load() }, 30 * 1000)
        })
    }
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); clearInterval(t) }
  }, [user?.id])

  if (celebrants.length === 0) return null

  return (
    <div className="fro-bday-hdr">
      <style>{`@keyframes froBdaySparkle {0%,100%{box-shadow:0 2px 10px rgba(245,158,11,.18);opacity:1}50%{box-shadow:0 4px 18px rgba(245,158,11,.5);opacity:.8}}
.fro-bday-hdr{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-right:8px}
.fro-bday-card{display:flex;align-items:center;gap:8px;padding:4px 8px 4px 5px;border-radius:12px;background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;animation:froBdaySparkle 2.2s ease-in-out infinite}
.fro-bday-card .ph{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#fffbeb;border:2px solid #fbbf24}
.fro-bday-card .av{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;border:2px solid #fbbf24}
.fro-bday-txt{line-height:1.15;min-width:0;max-width:150px}
.fro-bday-txt .nm{font-size:12.5px;font-weight:700;color:#92400e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fro-bday-txt .sub{font-size:10px;font-weight:700;color:#f59e0b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:640px){.fro-bday-hdr{margin-right:6px}.fro-bday-card{padding:3px 6px 3px 4px}.fro-bday-card .ph,.fro-bday-card .av{width:32px;height:32px;font-size:13px}.fro-bday-txt{max-width:110px}.fro-bday-txt .nm{font-size:11.5px}.fro-bday-txt .sub{font-size:9px}}`}</style>
      {celebrants.map(c => (
        <div key={c.id} className="fro-bday-card" title={`Happy Birthday ${c.name}!`}>
          {c.photo_url ? (
            <img className="ph" src={c.photo_url} alt={c.name} />
          ) : (
            <div className="av">{String(c.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 1).join('').toUpperCase()}</div>
          )}
          <div className="fro-bday-txt">
            <div className="nm">{c.name || 'Team Member'}</div>
            <div className="sub">🎂 Birthday Today!</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkAnniversaryPopup() {
  const { user } = useUcs()
  const [celebrants, setCelebrants] = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let retryTimer = null
    const load = () => {
      api('/workers/anniversaries', { _prefix: 'ucs' })
        .then(data => {
          if (cancelled) return
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
          const todayMD = istDateString().slice(5)
          const todays = (data || []).filter(w => {
            if (!w.created_at) return false
            const d = new Date(w.created_at)
            if (isNaN(d.getTime())) return false
            const annMD = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            return annMD === todayMD
          })
          setCelebrants(todays)
        })
        .catch(err => {
          if (cancelled) return
          console.error('Work anniversary popup error:', err.message)
          if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; load() }, 30 * 1000)
        })
    }
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); clearInterval(t) }
  }, [user?.id])

  if (celebrants.length === 0) return null

  return (
    <div className="fro-ann-hdr">
      <style>{`@keyframes froAnnSparkle {0%,100%{box-shadow:0 2px 10px rgba(139,92,246,.18);opacity:1}50%{box-shadow:0 4px 18px rgba(139,92,246,.5);opacity:.8}}
.fro-ann-hdr{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-right:8px}
.fro-ann-card{display:flex;align-items:center;gap:8px;padding:4px 8px 4px 5px;border-radius:12px;background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1.5px solid #a78bfa;animation:froAnnSparkle 2.2s ease-in-out infinite}
.fro-ann-card .ph{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#f5f3ff;border:2px solid #8b5cf6}
.fro-ann-card .av{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;border:2px solid #a78bfa}
.fro-ann-txt{line-height:1.15;min-width:0;max-width:150px}
.fro-ann-txt .nm{font-size:12.5px;font-weight:700;color:#4c1d95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fro-ann-txt .sub{font-size:10px;font-weight:700;color:#7c3aed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:640px){.fro-ann-hdr{margin-right:6px}.fro-ann-card{padding:3px 6px 3px 4px}.fro-ann-card .ph,.fro-ann-card .av{width:32px;height:32px;font-size:13px}.fro-ann-txt{max-width:110px}.fro-ann-txt .nm{font-size:11.5px}.fro-ann-txt .sub{font-size:9px}}`}</style>
      {celebrants.map(c => {
        const yrs = c.yearsCompleted || 1
        return (
          <div key={c.id} className="fro-ann-card" title={`Happy Work Anniversary ${c.name}!`}>
            {c.photo_url ? (
              <img className="ph" src={c.photo_url} alt={c.name} />
            ) : (
              <div className="av">{String(c.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 1).join('').toUpperCase()}</div>
            )}
            <div className="fro-ann-txt">
              <div className="nm">{c.name || 'Team Member'}</div>
              <div className="sub">🎉 {yrs} Year Work Anniversary!</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Sidebar({ open, onClose, waUnreadCounts, si, waAgents = [] }) {
  const location = useLocation()
  const nav = [...NAV_BASE]
  // waAgents is scoped to the logged-in user by the parent (see waInboxAgents),
  // so an impersonation switch or shared terminal can't leak another FRO's inbox
  // links into this sidebar.
  if (waAgents.length === 1) {
    nav.push({ id: 'whatsapp-chat', path: `/fro/whatsapp-chat?project=${waAgents[0].project}`, label: `WhatsApp ${INBOX_SHORT[waAgents[0].project] || waAgents[0].project}`, Icon: MessageCircle })
  } else if (waAgents.length > 1) {
    waAgents.forEach(a => {
      nav.push({ id: `whatsapp-${a.project}`, path: `/fro/whatsapp-chat?project=${a.project}`, label: `WhatsApp ${INBOX_SHORT[a.project] || a.project}`, Icon: MessageCircle })
    })
  } else {
    nav.push({ id: 'whatsapp-chat', path: '/fro/whatsapp-chat', label: 'WhatsApp', Icon: MessageCircle })
  }
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">U</div>
          <div><h1>UFS</h1><span>FRO Panel</span></div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <nav className="sidebar-nav" style={{ flex: 1 }}>
          {nav.map(n => {
            return (
            <NavLink key={n.id} to={n.path} end
              className={() => `snav-item ${location.pathname + location.search === n.path ? 'active' : location.pathname === n.path && !n.path.includes('?') ? 'active' : ''}`}
              onClick={() => onClose?.()}>
            <n.Icon size={18} strokeWidth={2} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{n.label}</span>
            {n.id === 'chat' && <ChatNavBadge quiet />}
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
            );
          })}
        </nav>
        <SidebarIncentive si={si} />
      </aside>
    </>
  )
}

export default function FROPanel() {
  const { user, logout } = useUcs()
  const location = useLocation()
  const isMobile = useIsMobile()
  const si = useSpecialIncentive()
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [waUnreadCounts, setWaUnreadCounts] = useState({ total: 0 })
  // Inbox links for the sidebar, scoped to the current user so a previous
  // identity's agents don't linger after an impersonation switch.
  const [waAgents, setWaAgents] = useState([])
  const [themeName, setThemeName] = useState(() => localStorage.getItem('fro_theme') || 'sky')
  const menuRef = useRef(null)

  // True only for sessions started BEFORE the Acting FRO feature was retired:
  // the entry button/dropdown are gone, but this flag stays so anyone still
  // mid-acting can leave cleanly via the Exit banner instead of being stranded.
  const impersonating = isImpersonating()

  // Temporary Data Access: stations an admin granted this FRO, shown as
  // read-only chips. Display-only — authorization is re-checked server-side
  // on every request, so a stale chip can never grant access. Refreshed
  // periodically so a mid-session expiry disappears without a reload.
  const [tempStations, setTempStations] = useState([])
  const [tempDeniedMsg, setTempDeniedMsg] = useState(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const list = await getMyStations()
        if (alive) setTempStations((list || []).filter(s => s.via_temporary_access))
      } catch { /* display-only; ignore */ }
    }
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    // The API wrapper emits this when a request is denied with a TEMP_ACCESS_*
    // code — the grant was revoked or expired mid-session. Refresh the chips
    // immediately and explain it in a banner instead of a bare 403.
    const onDenied = (e) => {
      load()
      setTempDeniedMsg(e?.detail?.message || 'Your temporary access has ended. Contact your admin if you need it again.')
      setTimeout(() => alive && setTempDeniedMsg(null), 12000)
    }
    window.addEventListener('temp-access-denied', onDenied)
    return () => { alive = false; clearInterval(t); window.removeEventListener('temp-access-denied', onDenied) }
  }, [])

  // ── Acting FRO (work-as) removed ──────────────────────────────────────────
  // The FRO-initiated identity switch is retired. Admins now grant time-boxed
  // Temporary Data Access from the admin panel instead (chips from tempStations
  // below). No donor ownership, receipt or credit data ever changed under the
  // old feature, so removal required no data cleanup — and per-station claim
  // history in work_as_sessions is preserved server-side for reporting.
  // The backend /auth/impersonate endpoint remains for admin/super-admin use.

  const doExitImpersonation = async () => {
    // Free our claimed stations server-side before restoring the own session.
    try { await releaseWorkAs() } catch (e) { console.error('Error:', e.message) }
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
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [verifiedItems, setVerifiedItems] = useState([]);
  const [allVerified, setAllVerified] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showAki, setShowAki] = useState(false);
  const [raceOpen, setRaceOpen] = useState(false);
  const [akiSlabs, setAkiSlabs] = useState(null);
  const [akiLoading, setAkiLoading] = useState(false);
  let _initSeenNotifs = []; try { _initSeenNotifs = JSON.parse(localStorage.getItem('fro_seen_notifs') || '[]'); } catch { /* corrupted */ }
  const seenNotifIds = useRef(new Set(_initSeenNotifs));
  let _initRungAlerts = []; try { _initRungAlerts = JSON.parse(localStorage.getItem('fro_rung_suspense_alerts') || '[]'); } catch { /* corrupted */ }
  const rungAlertIds = useRef(new Set(_initRungAlerts));
  const notifRef = useRef(null);
  const poppedIds = useRef(new Set());
  const snoozedUntil = useRef({});

  const markRead = async (notifId) => {
    try { await api(`/notifications/${notifId}/read`, { method: 'PUT', _prefix: 'ucs' }); }
    catch (e) { console.error('Error:', e.message); }
  };

  const openAki = async () => {
    setShowAki(true);
    if (!akiSlabs) {
      setAkiLoading(true);
      try {
        const data = await api('/incentive/aki-config');
        setAkiSlabs(data?.slabs || {});
      } catch (e) {
        console.error('Error:', e.message);
      } finally {
        setAkiLoading(false);
      }
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

  const handleSnooze = () => {
    if (modalDonor?.id) {
      snoozedUntil.current[modalDonor.id] = Date.now() + 2 * 60 * 1000;
      poppedIds.current.delete(modalDonor.id);
    }
    setModalNotifId(null);
    setModalDonor(null);
    toast('Snoozed — will pop up again in 2 min', 'info');
  };

  const markRungAlert = (id) => {
    rungAlertIds.current.add(id);
    try { localStorage.setItem('fro_rung_suspense_alerts', JSON.stringify([...rungAlertIds.current])); } catch {}
  };

  const ringSuspenseAlert = (n) => {
    if (!n || rungAlertIds.current.has(n.id)) return;
    markRungAlert(n.id);
    playSuspenseAlert(n.title);
  };

  const loadNotifications = () => {
    const workerId = user?.id;
    if (!workerId) return;
    const now = Date.now();
    api(`/notifications/${workerId}`, { _prefix: 'ucs' })
      .then(data => {
        const allNotifs = data || [];
        allNotifs
          .filter(n => n.type === 'suspense_alert')
          .forEach(n => {
            const t = n.sent_at ? new Date(n.sent_at).getTime() : 0;
            if (now - t <= SUSPENSE_RING_WINDOW_MS) ringSuspenseAlert(n);
          });
        const verified = allNotifs.filter(n => n.type === 'lead_verified' && !n.read_at);
        const verifiedSlice = verified.slice(0, 20);
        verifiedSlice.forEach(n => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            localStorage.setItem('fro_seen_notifs', JSON.stringify([...seenNotifIds.current]));
            showDesktopNotification(n.title, n.body);
          }
        });
        allNotifs
          .filter(n => n.type === 'new_audit' && !n.read_at)
          .slice(0, 20)
          .forEach(n => {
            if (!seenNotifIds.current.has(n.id)) {
              seenNotifIds.current.add(n.id);
              localStorage.setItem('fro_seen_notifs', JSON.stringify([...seenNotifIds.current]));
              showDesktopNotification(n.title, n.body, '/fro/suspense');
              toast(`${n.title}: ${n.body}`, 'info');
            }
          });
        setAllVerified(verified);
        setVerifiedItems(verifiedSlice);
        setVerifiedCount(verified.length);
      })
      .catch((err) => { console.error('Error:', err.message); });
  };
  useEffect(() => {
    loadNotifications();
    requestNotifPermission();
    const poll = setInterval(loadNotifications, 8000);
    return () => clearInterval(poll);
  }, [user?.id]);

// Admin "Warn" on the Telecaller Performance board arrives on this socket as an
// idle_alert. It must open a modal on this panel immediately (not a toast that
// scrolls away): the admin clicked a specific FRO, at a specific escalation
// level, and the telecaller has to acknowledge it.
const [idleWarning, setIdleWarning] = useState(null)
const showIdleWarning = useCallback((action) => {
  const warning = {
    level: action?.level || null,
    title: action?.title || 'You are idle',
    body: action?.body || '',
    // Re-keying on a fresh timestamp re-runs the pop animation when a second
    // warning arrives while the first modal is still open.
    at: Date.now(),
  };
  setIdleWarning(warning);
  try {
    window.dispatchEvent(new CustomEvent('ucs:idle-alert', { detail: warning }));
  } catch (e) {}
}, []);
useEffect(() => onFroAction((action) => {
    console.info('[fro] fro:action received', action?.type)
    if (action?.type === 'fro_action_follow_up' || action?.type === 'fro_action_less_calls' || action?.type === 'fro_action_entertain') {
      playFroAction(action.type, action.title, action.audioUrl);
    } else if (action?.type === 'suspense_alert') {
      const eid = action.eventId || action.sent_at || Date.now();
      if (!rungAlertIds.current.has(eid)) {
        markRungAlert(eid);
        playSuspenseAlert(action.title);
      }
    } else if (action?.type === 'idle_alert') {
      // Only react if this alert is for us (or untargeted).
      const me = (user && (user.id || user.worker_id)) || null;
      if (action.targetWorkerId && me && String(action.targetWorkerId) !== String(me)) return;
      showIdleWarning(action);
    }
  }), [showIdleWarning, user]);

// Direct socket listener as a fallback - some builds/environments don't route
// through onFroAction consistently.
useEffect(() => {
  let unsub = null;
  try {
    const sock = (typeof socketModule?.getSocket === 'function' ? socketModule.getSocket() : null);
    if (sock) {
      const handler = (action) => {
        if (action?.type === 'idle_alert') {
          const me = (user && (user.id || user.worker_id)) || null;
          if (action.targetWorkerId && me && String(action.targetWorkerId) !== String(me)) return;
          showIdleWarning(action);
        }
      };
      sock.on('fro:action', handler);
      unsub = () => {
        try { sock.off('fro:action', handler); } catch (e) {}
      };
    }
  } catch (e) {}
  return () => {
    if (typeof unsub === 'function') unsub();
  };
}, [showIdleWarning, user]);

useEffect(() => {
  const handler = (e) => {
    const d = e?.detail;
    if (!d) return;
    showIdleWarning({ level: d.level, title: d.title, body: d.body });
  };
  window.addEventListener('ucs:idle-alert', handler);
  return () => window.removeEventListener('ucs:idle-alert', handler);
}, [showIdleWarning]);

  const [froBroadcast, setFroBroadcast] = useState(null);
  const [froBroadcastMin, setFroBroadcastMin] = useState(false);
  const froBroadcastSeen = useRef(new Set());
  useEffect(() => onFroBroadcast((evt) => {
    if (!evt?.eventId || froBroadcastSeen.current.has(evt.eventId)) return;
    froBroadcastSeen.current.add(evt.eventId);
    setFroBroadcastMin(false);
    setFroBroadcast(evt);
  }), []);
  useEffect(() => onFroTeamBroadcast((evt) => {
    if (!evt?.eventId || froBroadcastSeen.current.has(evt.eventId)) return;
    froBroadcastSeen.current.add(evt.eventId);
    playTeamCongratsAudio();
    setFroBroadcastMin(false);
    setFroBroadcast(evt);
  }), []);
  // Admin "Logout All FROs": end the session immediately and bounce to login.
  useEffect(() => onFroForceLogout(() => {
    logout()
  }), [logout]);
  // Manual sign-out. The server banks any idle still running (so the day and
  // monthly totals keep it) before closing the session, so no confirm dialog is
  // needed about losing time — the confirm is only to avoid accidental clicks.
  const handleLogout = useCallback(() => {
    setShowMenu(false)
    if (window.confirm('Log out of the FRO panel? Any idle time still running will be recorded up to now.')) {
      logout()
    }
  }, [logout])
  useEffect(() => {
    if (!froBroadcast) return;
    const minimize = setTimeout(() => setFroBroadcastMin(true), 30000);
    const dismiss = setTimeout(() => setFroBroadcast(null), 90000);
    return () => { clearTimeout(minimize); clearTimeout(dismiss); };
  }, [froBroadcast]);
  const broadcastTeams = sortTeamBroadcasts(froBroadcast?.teams);

  const refreshWaUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('ucs_token')
      if (!token) return

      // Resolve this user's inbox agents. Prefer the cache scoped to them; when
      // it is empty (fresh login, or an impersonation switch) re-fetch from the
      // server so the sidebar reflects the identity that is actually signed in.
      const storedAgents = readWaInboxAgents(user?.id)
      setWaAgents(storedAgents)
      let resolvedAgents = storedAgents
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
              writeWaInboxAgents(agents, user?.id)
              setWaAgents(agents)
              resolvedAgents = agents
            }
          }
        } catch { /* silent */ }
      }

      // TEMPORARY ACCESS: surface time-boxed WhatsApp identities as extra inbox
      // entries in the sidebar (derived, never persisted to the cache). Expired
      // grants are filtered out here so the label disappears on the next refresh
      // once the grant ends — no sweeper needed.
      try {
        const accRes = await fetch(`${apiBase}/fro/whatsapp/my-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (accRes.ok) {
          const accounts = await accRes.json()
          console.log('[FROPanel] my-accounts:', accounts)
          const now = Date.now()
          const baseProjects = new Set((resolvedAgents || []).map(a => a.project).filter(Boolean))
          const tempEntries = (Array.isArray(accounts) ? accounts : [])
            .filter(a => a?.temporary && a?.project && (!a.expires_at || new Date(a.expires_at).getTime() > now))
            .filter(a => !baseProjects.has(a.project))
            .reduce((acc, a) => (acc.some(x => x.project === a.project) ? acc : [...acc, a]), [])
            .map(a => ({
              agentUserId: resolvedAgents?.[0]?.agentUserId || 'fro',
              accountName: a.name,
              project: a.project,
              whatsappUserId: a.id,
              token,
              temporary: true,
              expiresAt: a.expires_at,
            }))
          if (tempEntries.length) {
            setWaAgents(prev => {
              const merged = [...prev]
              for (const t of tempEntries) {
                if (!merged.some(m => m.project === t.project)) merged.push(t)
              }
              return merged
            })
          }
        }
      } catch { /* temp layer is optional */ }

      // Fetch unread counts — use the FRO JWT for all WhatsApp API calls
      // since agent tokens are session tokens, not JWTs compatible with the
      // authenticate middleware.
      const counts = { total: 0 }
      try {
        const res = await fetch(`${apiBase}/fro/whatsapp/conversations/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          counts.total = data?.count || 0
        }
      } catch { /* skip */ }
      setWaUnreadCounts(counts)
    } catch (e) { console.error('Error:', e.message); }
  }, [user?.id])
  useEffect(() => { refreshWaUnread() }, [refreshWaUnread])

  useRealtime('messages', {
    event: '*',
    onInsert: refreshWaUnread,
    onUpdate: refreshWaUnread,
  })

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
      const todayStr = istDateString();
      const items = []; const seen = new Set();
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && istDateString(d.scheduled_at) !== todayStr && !seen.has(d.id)) {
          seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, assignment_id: d.assignment_id, type: 'scheduled' });
        }
      });
      (callbacks || []).forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at || null, assignment_id: d.assignment_id, type: 'callback' }); } });
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && istDateString(d.scheduled_at) === todayStr && !seen.has(d.id)) {
          seen.add(d.id); items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, assignment_id: d.assignment_id, type: 'callback' });
        }
      });
      setRows(items);
    }).catch((err) => { console.error('Error:', err.message); });
  };
  useEffect(() => { loadReminders(); }, [refetch]);

  // Realtime on these two tables used to refetch the reminder lists directly on
  // every single insert or update. Each refetch is two queries against
  // fro_scheduled_contacts, and the events are global rather than per-worker, so
  // one FRO logging a call made every other open FRO refetch too. That turned
  // into millions of queries and kept the five connection pool busy enough to
  // stall every other request. Coalescing into one trailing reload keeps the
  // list fresh while collapsing a burst of events into a single query pair.
  const reminderReloadTimer = useRef(null);
  const queueReminderReload = useCallback(() => {
    if (reminderReloadTimer.current) return;
    reminderReloadTimer.current = setTimeout(() => {
      reminderReloadTimer.current = null;
      loadReminders();
    }, REMINDER_RELOAD_COALESCE_MS);
  }, []);
  useEffect(() => () => {
    if (reminderReloadTimer.current) clearTimeout(reminderReloadTimer.current);
  }, []);

  useRealtime('fro_donor_logs', {
    event: '*',
    onInsert: queueReminderReload,
    onUpdate: queueReminderReload,
  })
  useRealtime('fro_assignments', {
    event: '*',
    onInsert: queueReminderReload,
    onUpdate: queueReminderReload,
  })

  const dedupedRows = rows.filter((r, i, a) => i === a.findIndex(x => x.id === r.id));
  const dueItems = dedupedRows.filter(r => r.scheduled_at && new Date(r.scheduled_at) <= new Date());
  const dueCount = dueItems.length;

  const meta = NAV_BASE.find(n => location.pathname === n.path)
  const userName = user?.name || 'User'
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const drawerSections = [
    { label: 'Verified Leads', type: 'verified', items: allVerified },
    { label: 'Follow Up / Callback', type: 'schedule', items: dueItems },
  ];

  const handleDrawerItemClick = (item, section) => {
    setDrawerOpen(false);
    setModalDonor(item);
  };

  return (
    <CallProvider userId={user?.id} operatorId={user?.impersonation ? user?.imposter_id : null}>
    <PauseGate />
    <div className="app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} waUnreadCounts={waUnreadCounts} si={si} waAgents={waAgents} />
      <div className="main">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
              {sidebarOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              )}
            </button>
            <div className="topbar-label">
            <div className="eyebrow">FRO</div>
            <h2>{meta?.label || 'Dashboard'}</h2>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <BirthdayPopup />
            <WorkAnniversaryPopup />
            <div onClick={openAki} title="Aaj Ka Incentive (AKI)" style={{ cursor: 'pointer', padding: 6, borderRadius: 8, transition: 'background .15s' }}>
              <Coins size={20} strokeWidth={2} color="var(--ink-soft)" style={{ color: '#B45309' }} />
            </div>
            {/* Collection Race. Sits immediately after the AKI coin so the two
                "what am I earning / where do I stand" icons read as one cluster,
                and opens the same racing board the NGO-admin header shows rather
                than navigating away from whatever the FRO was doing. */}
            <div onClick={() => setRaceOpen(true)} title="Collection Race" aria-label="Collection Race"
              style={{ cursor: 'pointer', padding: 6, borderRadius: 8, transition: 'background .15s', display: 'flex' }}>
              <Medal size={20} strokeWidth={2} style={{ color: '#b45309' }} />
            </div>
            <div style={{ position:'relative' }}>
              <div onClick={async () => { setShowStats(true); setShowTarget(false); setStatsLoading(true); try { const [d, t] = await Promise.all([getMyDashboard().catch((err) => { console.error('Error:', err.message); }), getMyTarget().catch((err) => { console.error('Error:', err.message); })]);             setStatsData({ dash: d, target: t }); } catch (e) { console.error('Error:', e.message); } finally { setStatsLoading(false); } }} style={{ cursor:'pointer', padding:6, borderRadius:8, transition:'background .15s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>
            {/* The Acting FRO (work-as) button that used to sit here was
                retired with the feature — Temporary Data Access is granted
                from the admin panel now. */}
            <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
              <div className="avatar">{initials}</div>
              {showMenu && (
                <div className="user-menu">
                  <div className="user-menu-item" style={{flexDirection:'column', alignItems:'flex-start', gap:2, cursor:'default'}}>
                    <div style={{fontWeight:600, fontSize:13}}>{userName}</div>
                    <div style={{fontSize:11, color:'var(--ink-soft)'}}>{impersonating && user?.imposter_name ? `OWNER: ${userName} · ACTING: ${user.imposter_name}` : 'FRO'}</div>
                  </div>
                  <div className="user-menu-divider" />
                  <div className="user-menu-item" onClick={() => { setShowMenu(false); setShowSettings(true); }} style={{cursor:'pointer'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 1.65 1.65 0 0 1-1.82.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 1-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 1.82-.33H7a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0 .33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Settings
                  </div>
                  <div className="user-menu-divider" />
                  <div className="user-menu-item" onClick={handleLogout} style={{cursor:'pointer', color:'#b91c1c'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Log Out
                  </div>
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
            <span>OWNER: <b>{userName}</b> · ACTING FRO: <b>{user?.imposter_name || 'you'}</b>{Array.isArray(user?.act_stations) && user.act_stations.length > 0 && <> · Stations: <b>{[...new Set(user.act_stations.map(s => s.station))].join(', ')}</b></>} · Credit goes to <b>{user?.imposter_name || 'you'}</b></span>
            <button className="btn btn-sm" onClick={doExitImpersonation} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 12px', background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Exit Acting FRO</button>
          </div>
        )}
        {!impersonating && tempStations.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(29,78,216,.08)', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--ink)', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Temporary access:</span>
            {tempStations.map(s => (
              <span
                key={`${s.ngo_id}|${s.station}`}
                title={s.ngo_name ? `${s.station} · ${s.ngo_name}` : s.station}
                style={{ padding: '2px 9px', borderRadius: 999, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 11.5, fontWeight: 600 }}
              >
                {s.station}{s.temp_allowed_count ? ` · ${s.temp_allowed_count}` : ''}{s.temp_expires_at ? ` · until ${new Date(s.temp_expires_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST` : ''}
              </span>
            ))}
            <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>Donor ownership stays with the permanent FRO.</span>
          </div>
        )}
        {!impersonating && tempDeniedMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(220,38,38,.10)', borderBottom: '1px solid var(--line)', fontSize: 12.5, color: '#991b1b' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{tempDeniedMsg}</span>
            <button className="btn btn-sm" onClick={() => { setTempDeniedMsg(null); window.location.reload() }} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>Refresh</button>
          </div>
        )}
        {/* Acting FRO station-picker / code-entry modal removed with the feature. */}
        {showStats && !showTarget && (
          <DataUsageModal onClose={() => setShowStats(false)} onShowTarget={() => setShowTarget(true)} />
        )}
        {showStats && showTarget && (
            <div className="modal-overlay" onClick={() => setShowStats(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Monthly Target</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Your collection progress</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => setShowTarget(false)} style={{ fontSize: 11, padding: '4px 10px' }}>Back</button>
                    <button className="btn btn-sm btn-icon" onClick={() => setShowStats(false)} style={{ padding: 4 }} aria-label="Close monthly target">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>

                <div style={{ padding: '20px 22px', background: 'var(--bg)', maxHeight: '78vh', overflowY: 'auto' }}>
                  {(statsLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading...</div>
                      </div>
                    ) : statsData?.target ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
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
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                            {[
                              { label: 'Connected (M)', value: statsData.dash.monthly_connected, color: '#3b82f6' },
                              { label: 'Connected (D)', value: statsData.dash.daily_connected, color: '#8b5cf6' },
                              { label: 'Verified', value: '₹' + Number(statsData.dash.verified_month_amount || 0).toLocaleString('en-IN'), color: '#16a34a' },
                              { label: 'Unverified', value: '₹' + Number(statsData.dash.unverified_month_amount || 0).toLocaleString('en-IN'), color: '#ef4444' },
                              { label: 'Active Donors', value: statsData.dash.active_donors || 0, color: '#5B6B4E' },
                              { label: 'Total', value: '₹' + Number(statsData.dash.total_donations || 0).toLocaleString('en-IN'), color: '#B5603A' },
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
                    ))}
                </div>
              </div>
            </div>
          )}
        {showAki && (
          <div className="modal-overlay" onClick={() => setShowAki(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, width: '92%', borderRadius: 'var(--radius)', overflow: 'hidden', padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Aaj Ka Incentive</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Today's AKI collection slabs shared for all FROs</div>
                </div>
                <button className="btn btn-sm btn-icon" onClick={() => setShowAki(false)} style={{ padding: 4 }} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ padding: '18px 20px', background: 'var(--bg)', maxHeight: '80vh', overflowY: 'auto' }}>
                {akiLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading incentive slabs…</div>
                  </div>
                ) : (
                  <AkiBanner slabs={akiSlabs} compact />
                )}
              </div>
            </div>
          </div>
        )}
        <FroTeamRacePopup open={raceOpen} onClose={() => setRaceOpen(false)} />
        <div className="content-body" style={{ marginRight: drawerOpen ? 320 : 0, transition: 'margin-right .25s ease' }}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="my-leads" element={<MyLeadsSuspense />} />
            <Route path="suspense" element={<FroSuspense />} />
            <Route path="donors" element={<Donors />} />
            <Route path="history" element={<History />} />
            <Route path="incentive-info" element={<IncentiveInfo />} />
            <Route path="lead-incentive" element={<LeadIncentive />} />
            <Route path="tickets" element={<FroTickets />} />
            <Route path="to-super-admin" element={<SuperAdminTicketSection panel="fro" />} />
            <Route path="chat" element={<ChatWorkspace />} />
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
          onSnooze={handleSnooze}
        />
      )}
      <NotificationDrawer topOffset={72}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sections={drawerSections}
        onItemClick={handleDrawerItemClick}
      />
      <SpecialIncentive si={si} />
      <RangeRulePopup />
      <IdleNoticeHost />
      {idleWarning && (
        <IdleWarningModal
          key={idleWarning.at}
          warning={idleWarning}
          onClose={() => setIdleWarning(null)}
        />
      )}
      <LeadChampionCelebration />
      <LeadIncentiveLeaderboard />
      <NoticePopup />
      {froBroadcast && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99996, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setFroBroadcast(null)}>
          <style>{'@keyframes fro-bc-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } } @keyframes froActivePulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.45); } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } } @keyframes froIdlePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.4); } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); } }'}</style>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', borderRadius: 18, background: 'var(--card-bg, #fff)', boxShadow: '0 24px 60px rgba(0,0,0,.35)', overflow: 'hidden', animation: 'fro-bc-pop .4s cubic-bezier(.22,1,.36,1)', position: 'relative' }}>
            <div style={{ height: 4, background: 'linear-gradient(90deg,#8b5cf6,#6366f1,#38bdf8)' }} />
            <button onClick={() => setFroBroadcast(null)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'var(--line, #f1f5f9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink, #0f172a)', fontWeight: 700, fontSize: 14, zIndex: 2 }}>✕</button>
            <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', flexDirection: 'column', textAlign: 'center' }}>
              {froBroadcast.kind === 'team' ? (
                <>
                  <div style={{ width: 104, height: 104, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff', fontSize: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 28px rgba(245,158,11,.45)' }}>🏆</div>
                  <span style={{ marginTop: 12, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#b45309', background: '#fef3c7', padding: '4px 10px', borderRadius: 999 }}>Team Achievement</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                     {broadcastTeams.map((t) => (
                       <span key={t.name} style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e', background: '#ffedd5', border: '1px solid #fed7aa', padding: '4px 10px', borderRadius: 999 }}>{formatTeamName(t.name)}</span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {froBroadcast.photoUrl ? (
                    <img src={froBroadcast.photoUrl} alt={froBroadcast.workerName || 'FRO'} style={{ width: 150, height: 150, borderRadius: '50%', objectFit: 'cover', border: '5px solid #fff', boxShadow: '0 10px 28px rgba(99,102,241,.4)', display: 'block', background: '#f1f5f9' }} />
                  ) : (
                    <div style={{ width: 150, height: 150, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', fontSize: 52, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {(froBroadcast.workerName || 'FRO').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ marginTop: 12, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#7c3aed', background: '#ede9fe', padding: '4px 10px', borderRadius: 999 }}>Announcement</span>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink, #0f172a)', marginTop: 6 }}>{froBroadcast.workerName || 'FRO'}</div>
                </>
              )}
            </div>
            <div style={{ padding: '14px 24px 22px', textAlign: 'center' }}>
              <div style={{ fontSize: 14.5, color: 'var(--ink-soft, #475569)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{froBroadcast.text || ''}</div>
               {froBroadcast.kind === 'team' && broadcastTeams.some(t => t.members.length) && (
                 <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', textAlign: 'left' }}>
                   {broadcastTeams.filter(t => t.members.length).map((t) => (
                     <div key={t.name} style={{ fontSize: 11.5, color: '#92400e', lineHeight: 1.45 }}>
                       <span style={{ fontWeight: 800 }}>{formatTeamName(t.name)}:</span> {t.members.join(', ')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-soft, #94a3b8)', fontWeight: 600 }}>Minimizes in 30s · moves to top-right</div>
              <button onClick={() => setFroBroadcast(null)} style={{ marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--ink, #0f172a)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
            </div>
          </div>
        </div>
      )}
      {froBroadcast && froBroadcastMin && (
        <div onClick={() => setFroBroadcastMin(false)} title="Expand announcement" style={{ position: 'fixed', top: 72, right: 16, zIndex: 99996, maxWidth: 320, width: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--card-bg, #fff)', boxShadow: '0 12px 32px rgba(0,0,0,.28)', border: '1px solid var(--line, #e2e8f0)', cursor: 'pointer', animation: 'fro-bc-slide .3s ease' }}>
          <style>{'@keyframes fro-bc-slide { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes fro-bc-dismiss { from { width: 100%; } to { width: 0%; } }'}</style>
          {froBroadcast.kind === 'team' ? (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🏆</div>
          ) : froBroadcast.photoUrl ? (
            <img src={froBroadcast.photoUrl} alt={froBroadcast.workerName || 'FRO'} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#f1f5f9' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(froBroadcast.workerName || 'FRO').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
             <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{froBroadcast.kind === 'team' ? 'Team Achievement · ' + broadcastTeams.map(t => formatTeamName(t.name)).join(' + ') : (froBroadcast.workerName || 'FRO')}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{froBroadcast.text || ''}</div>
            <div style={{ marginTop: 6, height: 3, borderRadius: 99, background: '#eef2f7', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', background: '#8b5cf6', animation: 'fro-bc-dismiss 60s linear forwards' }} />
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setFroBroadcast(null); }} aria-label="Close" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--line, #f1f5f9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink, #0f172a)', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✕</button>
        </div>
      )}
      <ToastContainer />
    </div>
    </CallProvider>
  )
}
