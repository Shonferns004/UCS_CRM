import { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy } from 'lucide-react';

// Shared racing-leaderboard renderer, used by BOTH:
//   - ngo-admin TeamWiseCollection  (dashboard, against the global filter)
//   - fro      TeamWiseCollection  (Collection Race popup, org-wide, today)
//
// Note the same wrapper component serves both panels: they differ only in which
// endpoint they fetch from, so the board is shared rather than forked. Everything
// visual lives here so the two cards cannot drift apart: the row height, the medal
// set, the bar easing, the rank-slide transition, the count-up and the confetti all
// have exactly one definition. The wrapper owns only data fetching and wording.
//
// Why rows are absolutely positioned rather than a normal flex column: the card
// animates ORDER, not just width. Each row is placed at `rank * ROW_H` and its
// transform is transitioned, so when the standings change the rows physically slide
// past one another. A flowing list re-orders in a single frame with nothing to
// animate, which is the difference between a leaderboard and a table.

// Height of one lane. The track's height and every row's translateY are both
// derived from this, so it is the one number that must stay consistent.
export const ROW_H = 40;

// One colour per lane position, cycling. Indexed by position rather than looked up
// by name: teams are user-managed (Accounts > Teams can add / rename / remove), so
// a name-keyed map would collapse the 5th team and every renamed team onto the same
// grey. Position is all it has.
const PALETTE = [
  { bar: '#1f6f3f', tint: '#E7F3EC', text: '#1f6f3f' },
  { bar: '#2563eb', tint: '#EAF1FB', text: '#2563eb' },
  { bar: '#b45309', tint: '#FDF2E3', text: '#b45309' },
  { bar: '#7c3aed', tint: '#F3E8F8', text: '#7c3aed' },
  { bar: '#be185d', tint: '#FCE7F3', text: '#be185d' },
  { bar: '#0e7490', tint: '#E0F2FE', text: '#0e7490' },
];
const MUTED_STYLE = { bar: '#94a3b8', tint: '#F1F5F9', text: '#64748b' };
const MEDALS = ['🥇', '🥈', '🥉'];
const CONFETTI_COLORS = ['#f59e0b', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#f472b6', '#facc15', '#e11d48'];

export const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

const styleFor = (row, index) => (row?.muted ? MUTED_STYLE : PALETTE[(Number(index) || 0) % PALETTE.length]);

// Honours the OS "Animation effects -> Off" setting. Every animation in this card
// degrades to its final state when true, rather than merely running faster - the
// wrappers read the same flag to skip the confetti and the count-up rAF loop
// entirely, so nothing is rendered rather than being rendered fast.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(!!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

// Counts the headline total up to its final value, re-running whenever `key`
// changes, and landing exactly on `target` so a dropped frame mid-flight can never
// leave a wrong number on screen.
function useCountUp(target, key, enabled) {
  const [shown, setShown] = useState(target);
  const frame = useRef(0);
  useEffect(() => {
    const to = Number(target) || 0;
    if (!enabled || to <= 0) { setShown(to); return; }
    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(to);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, key, enabled]);
  return shown;
}

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 46 }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 2.4 + Math.random() * 1.8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w: 4 + Math.random() * 6,
    h: 7 + Math.random() * 8,
  })), []);
  return (
    <div className="twc-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className="twc-confetti-piece" style={{
          left: `${p.left}%`, width: p.w, height: p.h, background: p.color,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
        }} />
      ))}
    </div>
  );
}

/**
 * rows: [{
 *   key,            // stable React key
 *   label,          // lane name ("UFS1" / "Amit")
 *   labelTitle,     // optional tooltip
 *   amount,         // rupees
 *   share,          // 0-100
 *   rank,          // 1-based TRUE rank (may differ from display index when the
 *                  //          wrapper caps the visible lanes)
 *   isYou,         // highlights the viewer's own lane
 *   muted,          // renders in grey (unrostered team / outside the field)
 * }]
 */
export default function CollectionRaceBoard({
  title,
  scopeLabel = '',
  total = 0,
  rows = [],
  headline = '',
  footLines = [],
  emptyText = 'Nothing to show yet.',
  loading = false,
  error = '',
  errorText = '',
  headerRight = null,
  burstKey = '',
}) {
  const [raceNonce, setRaceNonce] = useState(0);
  const [wiped, setWiped] = useState(false);
  const [burst, setBurst] = useState(0);

  const reduced = useReducedMotion();
  const shownTotal = useCountUp(total, `${burstKey}|${total}`, !reduced);

  // Bar widths are relative to the leader, so the leader always fills the track and
  // everyone else is a fraction of it. Recomputed per response, which is what makes
  // a change of leader visible as every bar re-scaling at once.
  const maxAmount = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.amount) || 0), 0),
    [rows]
  );

  // Re-racing is a two-frame wipe: snap every row back to rank 0 with the bar at 0%
  // and transitions off, then restore on the next frame so the browser has a real
  // change to animate from. Bumping a counter alone does nothing - the transform
  // and width are identical before and after, and a transition only fires when the
  // computed value actually differs.
  useEffect(() => {
    if (raceNonce === 0) return;
    let raf2 = 0;
    setWiped(true);
    raf2 = requestAnimationFrame(() => requestAnimationFrame(() => setWiped(false)));
    return () => cancelAnimationFrame(raf2);
  }, [raceNonce]);

  const leader = rows[0] || null;

  // Confetti fires once per (data, leader) pair. A ref guards it rather than a
  // timeout so a re-render under StrictMode's double-invoke cannot double-burst.
  const lastBurst = useRef('');
  useEffect(() => {
    if (reduced || !leader || (Number(leader.amount) || 0) <= 0) return;
    if (lastBurst.current === burstKey) return;
    lastBurst.current = burstKey;
    setBurst((b) => b + 1);
  }, [burstKey, leader, reduced]);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <Trophy size={18} color="#b45309" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--ink-soft)', flex: 1, minWidth: 0 }}>
        {title}
      </span>
      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {rupee(shownTotal)}
      </span>
      <button className="twc-icon-btn" title="Re-race" aria-label="Re-race"
        onClick={() => setRaceNonce((n) => n + 1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      {headerRight}
    </div>
  );

  const cardStyle = { marginBottom: 0, padding: '16px 18px', position: 'relative', overflow: 'hidden' };

  if (error) {
    return (
      <div className="card twc-card" style={cardStyle}>
        {header}
        <div style={{ fontSize: 12, color: '#b3392b', marginTop: 8 }}>{errorText || 'Unavailable.'} {error}</div>
      </div>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <div className="card twc-card" style={cardStyle}>
        {header}
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', margin: '10px 0 6px' }}>{scopeLabel}</div>
        <div className="twc-track" style={{ height: ROW_H * 3 }}>
          <div className="twc-skel" />
          <div className="twc-skel" style={{ marginTop: 6 }} />
          <div className="twc-skel" style={{ marginTop: 6 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`card twc-card${leader && (Number(leader.amount) || 0) > 0 ? ' twc-has-lead' : ''}`} style={cardStyle}>
      {!reduced && burst > 0 && <Confetti key={burst} />}
      {header}

      <div style={{ fontSize: 11, color: 'var(--ink-soft)', margin: '2px 0 10px' }}>{scopeLabel}</div>

      <div className="twc-track" style={{ height: Math.max(ROW_H, rows.length * ROW_H) }}>
        {rows.map((r, i) => {
          const st = styleFor(r, i);
          const amount = Number(r.amount) || 0;
          // A zero lane still gets a 2% stub so it is visibly occupied rather than
          // looking like a rendering gap or a dropped row.
          const pct = maxAmount > 0 ? Math.max(2, Math.round((amount / maxAmount) * 1000) / 10) : 2;
          const rank = Number(r.rank) || i + 1;
          const isLead = rank === 1 && amount > 0;
          return (
            <div key={r.key}
              className={`twc-row${isLead ? ' is-lead' : ''}${r.isYou ? ' is-you' : ''}${wiped ? ' is-wiped' : ''}`}
              style={{ transform: `translateY(${wiped ? 0 : i * ROW_H}px)`, transitionDelay: `${Math.min(i, 12) * 90}ms` }}
              aria-label={`Rank ${rank}, ${r.label}, ${rupee(amount)}, ${Number(r.share) || 0} percent`}>
              <span className="twc-rank">{MEDALS[rank - 1] || <span className="twc-rank-num">{rank}</span>}</span>
              <span className="twc-name"
                style={{ background: st.tint, color: st.text }} title={r.labelTitle || r.label}>
                {r.label}
              </span>
              <span className="twc-bar-track">
                <span className="twc-bar" style={{
                  width: wiped ? '0%' : `${pct}%`,
                  background: isLead ? `linear-gradient(90deg, ${st.bar}, #fbbf24)` : st.bar,
                  transitionDelay: `${Math.min(i, 12) * 90}ms`,
                }} />
              </span>
              <span className="twc-amount">{rupee(amount)}</span>
              <span className="twc-meta">{Number(r.share) || 0}%</span>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', paddingTop: 4 }}>{emptyText}</div>
        )}
      </div>

      <div className="twc-foot" aria-live="polite">
        {headline && <span className="twc-motto">{headline}</span>}
        {footLines.filter(Boolean).map((line, i) => (
          <span className="twc-foot-stats" key={i}>{line}</span>
        ))}
      </div>
    </div>
  );
}
