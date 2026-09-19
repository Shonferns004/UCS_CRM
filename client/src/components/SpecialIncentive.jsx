import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../api/auth';
import { useRealtime } from '../hooks/useRealtime';
import { CoinsBag } from './AkiBanner';
import { useUcs } from '../store';
import { requestNotifPermission, showDesktopNotification } from '../utils/desktopNotif';
import beingMp3 from '../assets/audio/being.mp3';
import mannMp3 from '../assets/audio/mann.mp3';
import ashrayMp3 from '../assets/audio/ashray.mp3';
import ngoMp3 from '../assets/audio/ngo.mp3';

const SEEN_KEY = 'si_seen_v1';
const CELEB_KEY = 'si_celeb_v1';
const CELEB_PHOTO_KEY = 'si_celeb_photo_v1';

// One recycled Audio object per file so repeated incentives don't re-download.
const siAudioCache = {};
let siAudioUnlocked = false;
let siPendingAudioSrc = null;
const getSiAudio = (src) => {
  if (!siAudioCache[src]) {
    try {
      const a = new Audio(src);
      a.preload = 'auto';
      siAudioCache[src] = a;
    } catch { siAudioCache[src] = null; }
  }
  return siAudioCache[src] || null;
};
// NGO-specific intro sound when the "Sir ka Incentive" popup appears:
// BSCT -> being, MANN -> mann, ASHRAY -> ashray, everything else / all-NGO -> ngo.
const ngoAudioFor = (ngoName) => {
  const name = String(ngoName || '').toUpperCase();
  if (name.includes('BSCT') || name.includes('BS') || name.includes('BEING') || name.includes('SEVAK')) return beingMp3;
  if (name.includes('MANN') || name.includes('MAA')) return mannMp3;
  if (name.includes('ASHRAY') || name.includes('AFL')) return ashrayMp3;
  return ngoMp3;
};
const playSiAudioSrc = (src) => {
  if (!siAudioUnlocked) {
    siPendingAudioSrc = src;
    return;
  }
  try {
    const a = getSiAudio(src);
    if (a) {
      a.muted = false;
      a.volume = 1;
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    }
  } catch { /* ignore */ }
};
const warmupSiAudio = () => {
  if (siAudioUnlocked) return;
  siAudioUnlocked = true;
  const pending = siPendingAudioSrc;
  siPendingAudioSrc = null;
  for (const src of [beingMp3, mannMp3, ashrayMp3, ngoMp3]) {
    if (src === pending) continue;
    const a = getSiAudio(src);
    if (!a) continue;
    try {
      a.muted = true;
      a.volume = 0;
      const p = a.play();
      if (p && p.then) p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        a.volume = 1;
      }).catch(() => {});
    } catch { /* ignore */ }
  }
  // Keep this synchronous: setTimeout would lose the browser's user gesture.
  if (pending) playSiAudioSrc(pending);
};
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', warmupSiAudio, { once: false, passive: true });
  window.addEventListener('keydown', warmupSiAudio, { once: false });
  window.addEventListener('touchstart', warmupSiAudio, { once: false, passive: true });
}
const playNgoAudio = (ngoName) => {
  playSiAudioSrc(ngoAudioFor(ngoName));
};

const fmt = (n) => {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN');
};
const pctOf = (collected, target) => {
  const t = Number(target);
  const c = Number(collected);
  if (!(t > 0) || !Number.isFinite(c)) return 0;
  return Math.min(100, Math.max(0, c / t * 100));
};
const fmtClock = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
};
const fmtEnd = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f472b6', '#fb923c', '#facc15'];

const CONFETTI_CSS = `
@keyframes si-confetti-fall { 0% { transform: translateY(-6vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: .8; } }
@keyframes si-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
@keyframes si-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes si-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes si-rise { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes si-drop { 0% { transform: translateY(-110vh) scale(.92); opacity: 0; } 45% { transform: translateY(2vh) scale(1.03); opacity: 1; } 62% { transform: translateY(-1.2vh) scale(1); } 78% { transform: translateY(.5vh); } 100% { transform: translateY(0); opacity: 1; } }
.si-confetti { position: fixed; top: -6vh; border-radius: 2px; z-index: 99999; pointer-events: none; animation-name: si-confetti-fall; animation-timing-function: linear; animation-iteration-count: infinite; }
`;

const NGO_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export function ngoColor(ngoName) {
  const name = String(ngoName || '').toUpperCase();
  if (name.includes('MANN') || name.includes('MAA')) return '#ec4899';
  if (name.includes('BSCT') || name.includes('BS')) return '#38bdf8';
  if (name.includes('AFL')) return '#8b5cf6';
  const idx = [...(ngoName || '')].reduce((a, c) => a + (c.charCodeAt(0) || 0), 0) % NGO_COLORS.length;
  return NGO_COLORS[idx];
}

export function NgoBadge({ ngoName }) {
  if (!ngoName) return null;
  const color = ngoColor(ngoName);
  return (
    <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: .4, background: `${color}1a`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>
      {ngoName}
    </span>
  );
}

const readSet = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
};
const hasInSet = (key, id) => readSet(key).has(String(id));
const addToSet = (key, id) => {
  try {
    const s = readSet(key);
    if (s.has(String(id))) return;
    s.add(String(id));
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch { /* ignore */ }
};

function useUser() {
  try {
    const u = useUcs();
    return u?.user || null;
  } catch { return null; }
}

export function WinnerBanner({ inc }) {
  if (inc?.status === 'won') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1.5px solid #f59e0b' }}>
        <span style={{ fontSize: 22 }}>🏆</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>Winner: {inc.winner_name || 'Unknown'}</div>
          <div style={{ fontSize: 11, color: '#b45309' }}>First to collect ₹{fmt(inc.target_amount)} → won ₹{fmt(inc.incentive_amount)} 🎉</div>
        </div>
      </div>
    );
  }
  if (inc?.status === 'ended' || inc?.status === 'cancelled') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: '1.5px solid var(--line)' }}>
        <span style={{ fontSize: 20 }}>⏳</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{inc.status === 'cancelled' ? 'Cancelled by Sir' : 'Ended — no winner'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{inc.title}</div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── SIR KA INCENTIVE live modal (reference-image implementation) ───
// Data + behavior preserved: same inc payload, shared nowMs countdown,
// realtime leaderboard, existing close action. Presentation only.
const SI_MODAL_CSS = `
.si-im-overlay { position: fixed; inset: 0; z-index: 99990; display: flex; align-items: center; justify-content: center; padding: 20px; width: 100%; overflow: hidden; background: rgba(15,27,45,.48); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); box-sizing: border-box; }
.si-im-overlay *, .si-im-overlay *:before, .si-im-overlay *:after { box-sizing: border-box; }
.si-im-modal { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px); min-width: 0; display: flex; flex-direction: column; background: #FFFFFF; border: 1px solid #DCE6F3; border-radius: 18px; box-shadow: 0 24px 70px rgba(15,35,65,.22); overflow: hidden; position: relative; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #10213D; }
.si-im-header, .si-im-footer { flex: 0 0 auto; }
.si-im-scroll { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
.si-im-close { width: 34px; height: 34px; border-radius: 50%; border: none; background: #EAF2FB; color: #10213D; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color 150ms ease; font-family: inherit; }
.si-im-close:hover { background: #DCE8F6; }
.si-im-close:focus-visible, .si-im-cta:focus-visible, .si-im-filter:focus-visible { outline: 2px solid #3E82F7; outline-offset: 2px; }
.si-im-row, .si-im-headrow { display: grid; grid-template-columns: 32px minmax(160px, 1fr) 110px minmax(150px, 1.1fr); gap: 0 10px; align-items: center; min-width: 0; }
.si-im-rank { grid-area: rank; } .si-im-fro { grid-area: fro; } .si-im-amt { grid-area: amt; } .si-im-prog { grid-area: prog; }
@media (max-width: 699px) {
  .si-im-overlay { padding: 8px; }
  .si-im-modal { width: calc(100vw - 16px); max-height: calc(100vh - 16px); border-radius: 14px; }
  .si-im-headrow { display: none; }
  .si-im-row { grid-template-columns: 24px minmax(0, 1fr) auto; grid-template-areas: "rank fro amt" "prog prog prog"; row-gap: 5px; }
}
`;

const SI_RANK_STYLE = [
  { bg: '#FDF1D6', color: '#A9760C' },
  { bg: '#EEF2F6', color: '#5E6B7E' },
  { bg: '#FBEDDE', color: '#9A5A22' },
];

function SiAvatar({ url, name, size = 36 }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [url]);
  const box = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' };
  if (url && !err) {
    return <img src={url} alt={name || 'FRO'} onError={() => setErr(true)} style={{ ...box, display: 'block', background: '#EDF2F7' }} />;
  }
  const initials = String(name || 'F').split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  return (
    <div aria-hidden="true" style={{ ...box, background: '#E8F1FC', color: '#3E82F7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.35), fontWeight: 800 }}>
      {initials}
    </div>
  );
}

function SiRing({ pct, size = 160, stroke = 11 }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const r = (size - stroke) / 2 - 2;
  const circ = 2 * Math.PI * r;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label="Your progress toward target"
      style={{ width: size, height: size, flexShrink: 0, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E3EAF5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3E82F7" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * p) / 100} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.16), fontWeight: 800, color: '#10213D' }}>
        {Math.round(p)}%
      </div>
    </div>
  );
}

function SiBoardRow({ p, i, target, you }) {
  const collected = Number(p.collected_amount) || 0;
  const t = Number(target) || 0;
  const pct = t > 0 ? Math.min(100, Math.max(0, (collected / t) * 100)) : 0;
  const rank = SI_RANK_STYLE[i] || null;
  const isMe = you && p.worker_id === you;
  return (
    <div className="si-im-row" style={{ padding: '6px 12px', borderBottom: '1px solid #EDF2F7', minWidth: 0 }}>
      <span className="si-im-rank" style={{
        width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11.5, fontWeight: 800, flexShrink: 0,
        background: rank ? rank.bg : '#F1F5F9', color: rank ? rank.color : '#475569',
      }}>{i + 1}</span>
      <span className="si-im-fro" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <SiAvatar url={p.photo_url} name={p.name} size={26} />
        <span title={p.name} style={{ fontSize: 12.5, fontWeight: isMe ? 750 : 650, color: isMe ? '#10213D' : '#203553', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}{isMe ? ' (you)' : ''}
        </span>
      </span>
      <span className="si-im-amt" style={{ fontSize: 12.5, fontWeight: 750, color: '#10213D', whiteSpace: 'nowrap' }}>₹{fmt(collected)}</span>
      <span className="si-im-prog" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ flex: '1 1 0', minWidth: 0, height: 9, borderRadius: 999, background: '#E4ECF6', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: '#3E82F7', transition: 'width .4s ease' }} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5D7696', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>{Math.round(pct)}%</span>
      </span>
    </div>
  );
}

function PopupModal({ inc, you, onClose, nowMs }) {
  const [filter, setFilter] = useState('all');
  const closeRef = useRef(null);
  const prevFocusRef = useRef(null);

  const target = Number(inc?.target_amount) || 0;
  const reward = Number(inc?.incentive_amount) || 0;
  const collected = Number(inc?.mine?.collected_amount) || 0;
  const myPct = target > 0 ? Math.min(100, Math.max(0, (collected / target) * 100)) : 0;
  const endMs = inc ? new Date(inc.end_at).getTime() : NaN;
  const left = inc && Number.isFinite(endMs) ? Math.max(0, endMs - nowMs) : 0;
  const ended = inc ? (Number.isFinite(endMs) ? nowMs >= endMs : false) : false;

  const board = useMemo(() => {
    const rows = Array.isArray(inc?.leaderboard) ? inc.leaderboard.slice() : [];
    return filter === 'top10' ? rows.slice(0, 10) : rows;
  }, [inc, filter]);

  // Lock page scroll + Escape to close + focus handling. All cleaned up.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    if (closeRef.current) closeRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      const prev = prevFocusRef.current;
      if (prev && prev.focus) { try { prev.focus(); } catch { /* ignore */ } }
    };
  }, [onClose]);

  if (!inc) {
    return (
      <div className="si-im-overlay" onClick={onClose}>
        <style>{SI_MODAL_CSS}</style>
        <div className="si-im-modal" role="dialog" aria-modal="true" aria-label="Incentive" onClick={(e) => e.stopPropagation()}
          style={{ width: 'min(460px, calc(100vw - 48px))', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10213D' }}>Unable to load incentive</div>
          <div style={{ fontSize: 13, color: '#5D7696', marginTop: 6 }}>Please try again.</div>
          <button type="button" onClick={onClose}
            style={{ marginTop: 16, height: 42, padding: '0 24px', borderRadius: 10, border: 'none', background: '#3E82F7', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="si-im-overlay">
      <style>{SI_MODAL_CSS}</style>
      <div className="si-im-modal" role="dialog" aria-modal="true" aria-labelledby="si-im-title">
        {/* Header: status + title + countdown + close */}
        <div className="si-im-header" style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: ended ? '#64748B' : '#EF2B31', color: '#FFFFFF', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800, letterSpacing: .3, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', display: 'inline-block', flexShrink: 0 }} />
            {ended ? 'ENDED' : 'LIVE'}
          </span>
          <NgoBadge ngoName={inc.ngo_name} />
          <span id="si-im-title" title={inc.title} style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: '#10213D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inc.title || 'Special Incentive'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#B75A00', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', background: '#FFF7E8', border: '1px solid #F5E1B9', padding: '4px 9px', borderRadius: 999, flexShrink: 0 }}>
            ⏳ {fmtClock(left)}
          </span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close incentive" className="si-im-close">✕</button>
        </div>

        {inc.message && (
          <div style={{ padding: '0 14px 4px', fontSize: 12.5, lineHeight: 1.5, color: '#5D7696', overflowWrap: 'anywhere' }}>{inc.message}</div>
        )}

        {/* Progress summary: ring + numbers + reward in one row */}
        <div style={{ margin: '8px 12px 0', background: '#F9FBFE', border: '1px solid #DCE7F4', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <SiRing pct={myPct} size={72} stroke={8} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 750, color: '#5D7696', letterSpacing: '.02em' }}>YOUR COLLECTION</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#10213D', whiteSpace: 'nowrap' }}>₹{fmt(collected)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#67809F', whiteSpace: 'nowrap' }}>of ₹{fmt(target)} target</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', background: '#EAF9F1', color: '#15965A', borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>↗ Keep going!</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#E4ECF6', overflow: 'hidden', marginTop: 7 }}>
              <div style={{ width: `${myPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#3E82F7,#5694f8)', transition: 'width .5s ease' }} />
            </div>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0, background: '#FFF1F5', border: '1px solid #F5D6E0', borderRadius: 12, padding: '8px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 750, color: '#8A4B5C' }}>REWARD</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#D62D4A', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>🏆 ₹{fmt(reward)}</div>
            <div style={{ fontSize: 10, fontWeight: 650, color: '#8A4B5C', marginTop: 1, whiteSpace: 'nowrap' }}>1st to reach target</div>
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ margin: '10px 12px 12px', background: '#FFFFFF', border: '1px solid #DCE7F4', borderRadius: 12, padding: '0 0 4px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: '#10213D' }}>🔥 FRO Leaderboard</span>
              <span style={{ fontSize: 11.5, color: '#67809F', marginLeft: 8 }}>{board.length} FRO{board.length !== 1 ? 's' : ''}</span>
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Leaderboard filter" className="si-im-filter"
              style={{ height: 30, padding: '0 10px', background: '#FFFFFF', border: '1px solid #C9DAEE', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#10213D', fontFamily: 'inherit', cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
              <option value="all">All FROs</option>
              <option value="top10">Top 10</option>
            </select>
          </div>
          <div className="si-im-headrow" aria-hidden="true" style={{ background: '#F3F7FC', padding: '6px 12px', fontSize: 11.5, fontWeight: 750, color: '#6B82A0' }}>
            <span>#</span>
            <span>FRO</span>
            <span style={{ textAlign: 'right' }}>Collection (₹)</span>
            <span>Progress</span>
          </div>
          <div style={{ minWidth: 0 }}>
            {board.length === 0 ? (
              <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#10213D' }}>No FRO activity yet</div>
                <div style={{ fontSize: 11, color: '#5D7696', marginTop: 2 }}>Verified collections will appear here as they come in.</div>
              </div>
            ) : (
              board.map((p, i) => <SiBoardRow key={p.worker_id} p={p} i={i} target={target} you={you} />)
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="si-im-footer" style={{ padding: '0 12px 10px' }}>
          <button type="button" onClick={onClose}
            style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: '#102E59', color: '#FFFFFF', fontSize: 13.5, fontWeight: 750, cursor: 'pointer', fontFamily: 'inherit', transition: 'background-color 150ms ease', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 16px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1A3F73'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#102E59'; }}>
            ⚡ Get in the race! Start collecting now! →
          </button>
        </div>
      </div>
    </div>
  );
}

function Celebration({ inc, you, onClose }) {
  const isWinner = you && inc.winner_worker_id === you;
  const hasPhoto = !!inc.winner_avatar;
  const pieces = useMemo(() => Array.from({ length: 130 }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 3,
    dur: 2.6 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 10,
  })), []);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99992, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{CONFETTI_CSS}</style>
      {pieces.map((p, i) => (
        <div key={i} className="si-confetti" style={{
          left: `${p.left}%`, width: p.w, height: p.h, background: p.color,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
        }} />
      ))}
      <div style={{ width: 'min(420px,100%)', borderRadius: 20, padding: 26, textAlign: 'center', background: 'linear-gradient(160deg,#fff8e7,#ffe6b3)', border: '3px solid #f59e0b', boxShadow: '0 30px 80px rgba(0,0,0,.4)', animation: 'si-pop .5s cubic-bezier(.22,1,.36,1)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12, cursor: 'pointer', width: 30, height: 30, borderRadius: 50, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--ink)', zIndex: 2 }} onClick={onClose}>✕</div>
        {hasPhoto ? (
          <div style={{ position: 'relative', display: 'inline-block', marginTop: 2, animation: 'si-bounce 1.2s ease-in-out infinite' }}>
            <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: 'linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)', boxShadow: '0 8px 22px rgba(180,83,9,.4)' }} />
            <img src={inc.winner_avatar} alt={inc.winner_name || 'Winner'} style={{ width: 108, height: 108, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', position: 'relative', display: 'block', background: '#fde68a' }} />
            <div style={{ position: 'absolute', right: -4, bottom: 0, fontSize: 30, textShadow: '0 2px 6px rgba(0,0,0,.25)' }}>{isWinner ? '🏆' : '🎉'}</div>
          </div>
        ) : (
          <div style={{ fontSize: 54, animation: 'si-bounce 1.2s ease-in-out infinite' }}>{isWinner ? '🏆' : '🎉'}</div>
        )}
        <div style={{ fontSize: 15, fontWeight: 800, color: '#b45309', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Winner Declared <NgoBadge ngoName={inc.ngo_name} /></span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--ink)', margin: '8px 0 4px' }}>
          {isWinner ? 'YOU WON IT!' : `${inc.winner_name || 'A FRO'} won!`}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          {isWinner
            ? <>You were the first to collect ₹{fmt(inc.target_amount)} in <b>{inc.title}</b>.</>
            : <>{inc.winner_name || 'Someone'} was first to collect ₹{fmt(inc.target_amount)} in <b>{inc.title}</b>.</>}
        </div>
        <div style={{ margin: '14px 0 4px', fontSize: 18, fontWeight: 900, color: '#d97706' }}>Won ₹{fmt(inc.incentive_amount)} 🎉</div>
      </div>
    </div>
  );
}

// Small winner popup pinned to the RIGHT CORNER for that day only. Shows the
// winner's photo + name + prize, stays for the rest of the day, dismissible.
// The 5-second Celebration + photo flash still happen at hit-target moment.
function CornerWinnerCard({ inc }) {
  const [open, setOpen] = useState(true);
  if (!inc || !open) return null;
  const hasPhoto = !!inc.winner_photo_url;
  return (
    <div style={{ position: 'fixed', top: 74, right: 14, zIndex: 99983, width: 230, borderRadius: 14, overflow: 'hidden', border: '2px solid #f59e0b', background: 'linear-gradient(160deg,#fffdf5 0%,#fff3d6 100%)', boxShadow: '0 14px 34px rgba(0,0,0,.28)', animation: 'si-rise .35s ease' }}>
      <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, cursor: 'pointer', width: 24, height: 24, borderRadius: 50, background: '#fff', border: '1.5px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#b45309', boxShadow: '0 2px 6px rgba(0,0,0,.18)' }} onClick={() => setOpen(false)}>✕</div>
      {hasPhoto ? (
        <div style={{ height: 108, position: 'relative', overflow: 'hidden' }}>
          <img src={inc.winner_photo_url} alt="Winner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#fde68a' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 48%, rgba(120,53,15,.6) 100%)' }} />
          <div style={{ position: 'absolute', right: 6, top: 6, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .4 }}>
            🏆 Winner · Today
          </div>
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.winner_name || 'The Winner'}</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 12.5, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>Won ₹{fmt(inc.incentive_amount)} 🎉</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', fontSize: 30, animation: 'si-bounce 1.2s ease-in-out infinite' }}>🏆</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .5, textTransform: 'uppercase' }}>Today's Winner</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.winner_name || 'The Winner'}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Won ₹{fmt(inc.incentive_amount)} 🎉</div>
          </div>
        </div>
      )}
      <div style={{ padding: '7px 10px', borderTop: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{inc.title}</span>
        <NgoBadge ngoName={inc.ngo_name} />
      </div>
    </div>
  );
}

// Persistent mini card; exported for reuse on dashboards & panels.
export function SpecialIncentiveCard({ inc, you, nowMs }) {
  if (!inc) return null;
  const target = Number(inc?.target_amount) || 0;
  const myPct = pctOf(inc?.mine?.collected_amount, target);
  const left = inc ? Math.max(0, new Date(inc.end_at).getTime() - nowMs) : 0;
  return (
    <div style={{ width: 300, borderRadius: 14, border: '2px solid #f59e0b', background: 'linear-gradient(150deg,#fffdf5,#fff3d6)', boxShadow: '0 14px 34px rgba(0,0,0,.22)', overflow: 'hidden', animation: 'si-rise .3s ease' }}>
      <div style={{ padding: '10px 14px', background: 'linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>💰</span>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</span>
          <span style={{ flexShrink: 0 }}><NgoBadge ngoName={inc.ngo_name} /></span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, background: '#fff', color: '#b45309', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {inc.status === 'won' ? '🏆 WON' : inc.status === 'ended' || inc.status === 'cancelled' ? (inc.status === 'cancelled' ? 'CANCELLED' : 'ENDED') : `⏳ ${fmtClock(left)}`}
        </span>
      </div>
      <div style={{ padding: 12 }}>
        {inc.status === 'won' || inc.status === 'ended' || inc.status === 'cancelled' ? (
          <WinnerBanner inc={inc} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ animation: 'si-bounce 2.6s ease-in-out infinite' }}><CoinsBag size={44} /></div>
              {you ? (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>My progress</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)' }}>₹{fmt(inc.mine?.collected_amount || 0)} <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>/ ₹{fmt(target)}</span></div>
                  <div style={{ height: 8, borderRadius: 6, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: `${myPct}%`, height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 6, transition: 'width .5s ease' }} />
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-soft)' }}>Win ₹{fmt(inc.incentive_amount)} — first past ₹{fmt(target)}! 🏁</div>
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Leader: {((inc.leaderboard || [])[0]?.name) || '—'}</span>
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>· Ends {fmtEnd(inc.end_at)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shared hook: fetch + realtime + popup/celebration state for any panel.
// Supports several incentives live at once (one per NGO): popups and winner
// celebrations are queued and shown one at a time; sticky leaderboard cards
// stack in the corner for every still-running race.
export function useSpecialIncentive() {
  const user = useUser();
  const [data, setData] = useState({ incentives: [], recent: [] });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [celebrateQueue, setCelebrateQueue] = useState([]);
  const [photoCeleb, setPhotoCeleb] = useState(null);
  const [popupQueue, setPopupQueue] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const freshTimersRef = useRef(new Map());
  const trackedRef = useRef(new Set());
  const notifiedRef = useRef(new Set());
  const celebrationShownRef = useRef(new Set());
  const photoShownRef = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const r = await api('/incentive/special/active', { _prefix: 'ucs' });
      if (r && Array.isArray(r.incentives)) setData(r);
    } catch { /* 401/offline */ }
  }, []);

  const debMsg = useRef(0);
  const reloadSoon = useCallback(() => {
    clearTimeout(debMsg.current);
    debMsg.current = setTimeout(() => load(), 300);
  }, [load]);

  // Instantly drop a deleted/stopped incentive from every piece of local state
  // so popups, corner cards, winner cards and queues vanish on deletion.
  const purgeIncentive = useCallback((id) => {
    const sid = String(id);
    setData((prev) => ({
      ...prev,
      incentives: (prev.incentives || []).filter((i) => String(i.id) !== sid),
      recent: (prev.recent || []).filter((c) => String(c.id) !== sid),
      celeb: prev.celeb && String(prev.celeb.id) === sid ? null : prev.celeb,
    }));
    setPopupQueue((prev) => prev.filter((qid) => String(qid) !== sid));
    setCelebrateQueue((prev) => prev.filter((qid) => String(qid) !== sid));
    setPhotoCeleb((prev) => (prev && String(prev.id) === sid ? null : prev));
  }, []);

  useRealtime('special_incentives', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: (old) => { if (old && old.id) { purgeIncentive(old.id); reloadSoon(); } } });
  useRealtime('special_incentive_progress', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon });

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const c = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  const incentives = data.incentives || [];

  // Auto-queue the popup for every new active incentive, once per id.
  useEffect(() => {
    const liveIds = new Set(incentives.map((i) => String(i.id)));
    setPopupQueue((prev) => {
      const stray = prev.some((id) => !liveIds.has(String(id)));
      return stray ? prev.filter((id) => liveIds.has(String(id))) : prev;
    });
    const fresh = incentives.filter((i) => !trackedRef.current.has(i.id));
    if (fresh.length === 0) return;
    fresh.forEach((i) => trackedRef.current.add(i.id));
    setPopupQueue((prev) => [...prev, ...fresh.map((i) => i.id)]);
  }, [incentives]);

  // Brand-new races get a pulsing "NEW" tag for ~12s (shared so sidebar + float cards agree).
  useEffect(() => {
    if (incentives.length === 0) return;
    const ids = new Set(freshIds);
    let changed = false;
    incentives.forEach((i) => {
      if (!ids.has(i.id)) { ids.add(i.id); changed = true; }
    });
    if (changed) {
      setFreshIds(ids);
      incentives.forEach((i) => {
        if (freshTimersRef.current.has(i.id)) return;
        freshTimersRef.current.set(i.id, setTimeout(() => {
          freshTimersRef.current.delete(i.id);
          setFreshIds((prev) => { const n = new Set(prev); n.delete(i.id); return n; });
        }, 12000));
      });
    }
  }, [incentives]);

  // Notify + vibrate when a new popup actually shows (first time only).
  const popupInc = popupQueue.length ? incentives.find((i) => i.id === popupQueue[0]) || null : null;
  useEffect(() => {
    if (popupInc && !notifiedRef.current.has(popupInc.id)) {
      notifiedRef.current.add(popupInc.id);
      try { if (navigator.vibrate) navigator.vibrate(300); } catch { /* ignore */ }
      playNgoAudio(popupInc.ngo_name);
      requestNotifPermission().then(() => {
        showDesktopNotification('Sir ka Incentive LIVE 🎯', popupInc.title || 'New special incentive is live — go collect!');
      }).catch(() => {});
    }
  }, [popupInc]);

  // Queue a celebration for every recently closed winner — one NGO's race may
  // finish while the others are still live, so this no longer waits for all to
  // close. Shown one at a time for ~6.5s each.
  useEffect(() => {
    const closedWins = (data.recent || []).filter(
      (c) => c.status === 'won' && !c.archived_at && !celebrationShownRef.current.has(c.id) && !hasInSet(CELEB_KEY, c.id)
    );
    if (closedWins.length === 0) return;
    closedWins.forEach((c) => {
      celebrationShownRef.current.add(c.id);
      addToSet(CELEB_KEY, c.id);
    });
    setCelebrateQueue((prev) => [...prev, ...closedWins]);
  }, [data.recent]);

  useEffect(() => {
    if (celebrateQueue.length === 0) return;
    const t = setTimeout(() => setCelebrateQueue((prev) => prev.slice(1)), 5000);
    return () => clearTimeout(t);
  }, [celebrateQueue]);

  // Winner corner popup: Sir posts the winner's photo → show the small card in
  // the right corner for the rest of that day (once per id per device).
  useEffect(() => {
    const c = data.celeb;
    if (c && c.celebrated_at && !c.archived_at && !photoShownRef.current.has(c.id) && !hasInSet(CELEB_PHOTO_KEY, c.id)) {
      photoShownRef.current.add(c.id);
      addToSet(CELEB_PHOTO_KEY, c.id);
      setPhotoCeleb(c);
    }
  }, [data.celeb]);

  return {
    incentives,
    popupInc,
    popupOpen: popupInc !== null,
    recent: data.recent || [],
    celebrate: celebrateQueue[0] || null,
    photoCeleb,
    nowMs,
    user,
    dismissedIds,
    dismissCard: (id) => setDismissedIds((prev) => { const s = new Set(prev); s.add(String(id)); return s; }),
    openId,
    setOpenId,
    freshIds,
    closePopup: () => setPopupQueue((prev) => prev.slice(1)),
    closeCelebrate: () => setCelebrateQueue((prev) => prev.slice(1)),
    closePhotoCeleb: () => setPhotoCeleb(null),
    reload: load,
  };
}

// Compact "Sir ka Incentive" card for the FRO sidebar. Renders below the nav,
// themed by the running incentive's NGO colour. The cat rides the fill edge and
// the whole card opens the shared popup modal on click.
export function SidebarIncentive({ si }) {
  if (!si) return null;
  const { incentives, setOpenId } = si;
  if (!incentives || incentives.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', padding: '12px 8px 0' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--ink-soft)', padding: '0 6px' }}>Special Incentives</div>
      {incentives.map((inc) => {
        const target = Number(inc?.target_amount) || 0;
        const collected = Number(inc?.mine?.collected_amount) || 0;
        const myPct = pctOf(collected, target);
        const color = ngoColor(inc.ngo_name);
        return (
          <div
            key={inc.id}
            onClick={() => { playNgoAudio(inc.ngo_name); setOpenId(inc.id); }}
            title={inc.title || 'Special Incentive'}
            style={{ borderRadius: 14, border: `1.5px solid ${color}cc`, background: `linear-gradient(165deg,#ffffff,#fff,${color}14)`, boxShadow: `0 8px 20px ${color}2e`, cursor: 'pointer', padding: '9px 11px 10px', transition: 'transform .12s ease, boxShadow .12s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 12px 24px ${color}4a`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 8px 20px ${color}2e`; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: .7, textTransform: 'uppercase', animation: 'si-pulse 1s linear infinite', flexShrink: 0 }}>
                <span style={{ fontSize: 6.5 }}>●</span> Live
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <NgoBadge ngoName={inc.ngo_name} />
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '3px 0 5px' }}>
              <div style={{ flex: 1, height: 12, borderRadius: 999, background: `${color}1c`, overflow: 'hidden', border: `1px solid ${color}40` }}>
                <div style={{ width: `${myPct}%`, height: '100%', background: `linear-gradient(90deg,${color}99,${color})`, borderRadius: 999, transition: 'width .5s ease' }} />
              </div>
              <span style={{ position: 'absolute', top: '50%', left: `${myPct}%`, transform: 'translate(-50%,-50%)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#fff', border: `2px solid ${color}`, boxShadow: `0 2px 7px ${color}55`, transition: 'left .5s cubic-bezier(.22,1,.36,1)' }}>
                <Trophy size={13} color={color} strokeWidth={2.6} fill={`${color}22`} />
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color }}>₹{fmt(collected)}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-soft)' }}>₹{fmt(target)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SpecialIncentive({ si }) {
  const own = useSpecialIncentive();
  const h = si || own;
  const { incentives, celebrate, photoCeleb, nowMs, user, dismissedIds, dismissCard, closePopup, closeCelebrate, openId, setOpenId, freshIds } = h;
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width:820px)').matches);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width:820px)');
    const onMq = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  // Winner popups, LIVE cards and celebrations show ONLY in the FRO panel.
  // Accounts / HR / Super Admin render nothing from this widget.
  const isFro = !!user && (user.role === 'fro' || user.role === 'worker');
  const you = user?.id || null;
  const expanded = openId ? incentives.find((i) => i.id === openId) || null : null;

  // Sticky bottom-left cards float ONLY on mobile (sidebar is a drawer there).
  // On desktop the incentive card lives inside the sidebar instead.
  const visibleCards = incentives.filter((i) => !dismissedIds.has(String(i.id)));

  if (!isFro) return null;

  return (
    <>
      <style>{CONFETTI_CSS}</style>
      {photoCeleb && <CornerWinnerCard inc={photoCeleb} />}
      {celebrate && <Celebration inc={celebrate} you={you} onClose={closeCelebrate} />}
      {expanded && <PopupModal inc={expanded} you={you} nowMs={nowMs} onClose={() => { setOpenId(null); closePopup(); }} />}
      {isMobile && visibleCards.length > 0 && !celebrate && (
        <div style={{ position: 'fixed', left: 14, bottom: 14, zIndex: 99980, display: 'flex', flexDirection: 'column', gap: 10, width: 312 }}>
          {visibleCards.map((inc) => (
            <div
              key={inc.id}
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => { playNgoAudio(inc.ngo_name); setOpenId(inc.id); closePopup(); }}
            >
              <div
                onClick={(e) => { e.stopPropagation(); dismissCard(inc.id); }}
                title="Close"
                style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, cursor: 'pointer', width: 24, height: 24, borderRadius: 50, background: '#fff', border: '1.5px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#b45309', boxShadow: '0 2px 6px rgba(0,0,0,.18)' }}
              >✕</div>
              {freshIds.has(inc.id) && (
                <div style={{ position: 'absolute', top: -7, left: 10, zIndex: 3, padding: '2px 8px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: .4, animation: 'si-pulse 1s linear infinite' }}>🔴 NEW</div>
              )}
              <SpecialIncentiveCard inc={inc} you={you} nowMs={nowMs} />
              <div style={{ marginTop: 4, textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#b45309', background: '#fffdf5', border: '1.5px dashed #f59e0b', borderRadius: 9, padding: '5px 8px' }}>&#128072; Tap to view full leaderboard &#9654;</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
