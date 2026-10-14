import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api/auth';
import { useRealtime } from '../hooks/useRealtime';
import { useUcs } from '../store';

const fmt = (n) => {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN');
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LEAD_CSS = `
@keyframes lil-pop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
@keyframes lil-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes lil-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lil-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes lil-nudge { 0%,100% { transform: translateY(-50%) translateX(0); } 50% { transform: translateY(-50%) translateX(-5px); } }
`;

// Dynamic numbered milestone tiers (per range). Colors cycle by position so any
// number of tiers stays distinct; the count is whatever the admin configured.
const T_PALETTE = [
  { color: '#c2410c', bg: '#ffedd5', border: '#fdba74' }, // 1
  { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' }, // 2
  { color: '#a16207', bg: '#fef3c7', border: '#fcd34d' }, // 3
  { color: '#1d4ed8', bg: '#e0edff', border: '#a9c8f7' }, // 4
  { color: '#7c3aed', bg: '#f0e9fe', border: '#cbb6f5' }, // 5
  { color: '#0f766e', bg: '#dcf7f1', border: '#a6e3d8' }, // 6
  { color: '#be185d', bg: '#fde7f1', border: '#f6bcd9' }, // 7
  { color: '#3f6212', bg: '#eef7dc', border: '#c9e6a1' }, // 8
  { color: '#b45309', bg: '#fef0df', border: '#f3cfa0' }, // 9
  { color: '#334155', bg: '#eef1f5', border: '#c7d0db' }, // 10
];

const tierIndexOf = (tierKey, orderIndex) => {
  if (Number.isFinite(Number(orderIndex))) return Number(orderIndex);
  const m = /tier_(\d+)/i.exec(String(tierKey || ''));
  if (m) return Number(m[1]) - 1;
  const legacy = { bronze: 0, silver: 1, gold: 2 };
  const l = legacy[String(tierKey || '').toLowerCase()];
  return Number.isFinite(l) ? l : 0;
};
export const tMeta = (key, orderIndex) => T_PALETTE[tierIndexOf(key, orderIndex) % T_PALETTE.length];
export const tierNumber = (key, orderIndex) => tierIndexOf(key, orderIndex) + 1;

export function TierPill({ tierKey, orderIndex, label, size = 10.5 }) {
  const m = tMeta(tierKey, orderIndex);
  const n = tierNumber(tierKey, orderIndex);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: m.bg, border: `1px solid ${m.border}`, fontSize: size, fontWeight: 800, color: m.color, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 900 }}>#{n}</span>{label || `Tier ${n}`}
    </span>
  );
}

function useUser() {
  try {
    const u = useUcs();
    return u?.user || null;
  } catch { return null; }
}

const initialsOf = (name) => String(name || 'F')
  .split(' ')
  .slice(0, 2)
  .map(s => s[0]).join('').toUpperCase();

function Avatar({ url, name, size = 34 }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [url]);
  if (url && !err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        border: '2px solid #f59e0b', background: 'var(--bg)',
      }}>
        <img src={url} alt={name} onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#b45309', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, border: '2px solid #fbbf24',
    }}>{initialsOf(name)}</div>
  );
}

// Test/placeholder accounts that must NEVER appear in any incentive view —
// filtered once here so the widget, modal and pages all inherit it.
const HIDDEN_FRO_NAMES = new Set(['anjana vyas', 'appdev']);
const isHiddenFro = (name) => HIDDEN_FRO_NAMES.has(String(name || '').trim().toLowerCase());
const sanitizeLeaderboard = (r) => ({
  ...r,
  ranges: (r.ranges || []).map(x => ({
    ...x,
    fros: (x.fros || []).filter(f => !isHiddenFro(f.fro_name)),
    champion: x.champion && !isHiddenFro(x.champion.fro_name) ? x.champion : null,
    tier_leaders: (x.tier_leaders || []).filter(l => !l.leader || !isHiddenFro(l.leader.fro_name)),
  })),
  champions: (r.champions || []).filter(c => !isHiddenFro(c.fro_name)),
});

// Shared hook: today's per-range leaderboard + realtime refresh.
export function useLeadIncentiveLeaderboard() {
  const [data, setData] = useState({ has_activity: false, ranges: [], champions: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const date = todayLocal();
      const r = await api(`/incentive/lead/leaderboard?date=${date}`, { _prefix: 'ucs' });
      if (r && Array.isArray(r.ranges)) setData(sanitizeLeaderboard(r));
      else setData({ has_activity: false, ranges: [], champions: [] });
    } catch { /* 401 / not launched yet / offline */ }
    finally { setLoading(false); }
  }, []);

  const debMsg = useRef(0);
  const reloadSoon = useCallback(() => {
    clearTimeout(debMsg.current);
    debMsg.current = setTimeout(() => load(), 1200);
  }, [load]);

  useRealtime('lead_champion_announcements', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon });
  useRealtime('incentive_slabs', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon });
  // No polling: verified collections arrive as fro_donor_logs and refresh us
  // through the same debounced reload (mirrors the admin board).
  useRealtime('fro_donor_logs', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon });

  useEffect(() => {
    load();
    return () => clearTimeout(debMsg.current);
  }, [load]);

  return { data, loading, reload: load };
}

// Reusable block: every live range rendered as a RACE TRACK.
// Tier (or win-on) gates stand on the track as vertical bars; the top 4
// circular avatars ride ONE racing line together and glide right as verified
// collections arrive — overlapping is fine, rank badge keeps order readable.
export function RangeLeaderboard({ data, you }) {
  const ranges = data.ranges || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {ranges.map(r => {
        const fros = [...(r.fros || [])]
          .sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0))
          .slice(0, 4);
        const tierMode = !!r.tier_mode && (r.tiers || []).length > 0;
        const tiers = tierMode
          ? [...r.tiers].sort((a, b) => Number(a.target_amount) - Number(b.target_amount))
          : [];
        const maxTierTarget = tiers.length ? Math.max(...tiers.map(t => Number(t.target_amount) || 0)) : 0;
        const winOn = Number(r.amount_to_win) || 1500;
        const prize = Number(r.incentive_amount) || 0;
        // The LAST tier (or the win-on line) IS the finish line: the track
        // ends exactly on it. Anyone past it pins at the finish.
        const trackMax = Math.max(1, tierMode ? maxTierTarget : winOn);
        const xPct = (amount) => Math.min(100, Math.max(0, ((Number(amount) || 0) / trackMax) * 100));
        const gates = tierMode
          ? tiers.map(t => ({
              key: t.tier_key,
              x: xPct(t.target_amount),
              meta: tMeta(t.tier_key, t.order_index),
              short: `#${tierNumber(t.tier_key, t.order_index)}`,
              label: `#${tierNumber(t.tier_key, t.order_index)} ${t.label} · reach ₹${fmt(t.target_amount)} → win ₹${fmt(t.prize_amount)}`,
            }))
          : [{ key: 'win', x: xPct(winOn), meta: { color: '#15803d', bg: '#dcfce7', border: '#86efac' }, short: '🎯', label: `🎯 Win on ₹${fmt(winOn)} collected` }];
        const leaderByKey = {};
        for (const l of r.tier_leaders || []) leaderByKey[l.tier_key] = l;

        // ONE racing line per range — max 4 riders, all at the same height.
        // Overlapping is fine; zIndex (below) keeps the leader on top.
        const pcts = fros.map(f => xPct(f.total_amount));
        const laneH = 70;
        const lineY = 35;
        const leadPct = pcts.length ? pcts[0] : 0;

        return (
          <div key={r.slab_id} style={{ borderRadius: 14, border: '1.5px solid var(--line)', background: '#fff', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, #fff7e6 0%, #fff3d6 100%)', borderBottom: '1px dashed #fcd34d', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)' }}>{r.slab_label}</span>
              <div style={{ flex: 1 }} />
              {tierMode ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: r.tiers_final ? '#16a34a' : '#ffedd5', color: r.tiers_final ? '#fff' : '#c2410c', fontSize: 10.5, fontWeight: 800 }}>
                  {r.tiers_final ? '🏆 FINAL winners' : '● Milestone race · running'}
                </span>
              ) : r.champion ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#16a34a', color: '#fff', fontSize: 10.5, fontWeight: 800, animation: 'lil-pulse 1.6s ease-in-out infinite' }}>
                  🏆 {r.champion.fro_name} won
                </span>
              ) : (
                <span style={{ padding: '3px 10px', borderRadius: 999, background: '#ffedd5', color: '#c2410c', fontSize: 10.5, fontWeight: 800 }}>
                  🏁 Running — no winner yet
                </span>
              )}
              {/* Win-on/prize pills only in flat mode — tier details live in
                  the per-tier summary at the bottom of the card. */}
              {!tierMode && (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#fff', border: '1px solid #fde68a', fontSize: 10.5, fontWeight: 800, color: '#92400e' }}>
                    🎯 Win On ₹{fmt(winOn)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#fff', border: '1px solid #86efac', fontSize: 10.5, fontWeight: 800, color: '#166534' }}>
                    🏆 Prize ₹{fmt(prize)} · first to cross wins
                  </span>
                </div>
              )}
            </div>

            {/* Race field */}
            <div style={{ padding: '12px 14px 10px' }}>
              {/* Gate labels — short chips; the last tier / win-on sits AT the
                  finish (right edge), so it right-aligns instead of centring. */}
              <div style={{ position: 'relative', height: 17, marginBottom: 5 }}>
                {gates.map(g => (
                  <span key={g.key} title={g.label} style={{
                    position: 'absolute', left: `${g.x}%`,
                    transform: `translateX(${g.x >= 97 ? '-100%' : g.x <= 3 ? '0%' : '-50%'})`,
                    fontSize: 9, fontWeight: 900, lineHeight: 1.35, whiteSpace: 'nowrap',
                    color: g.meta.color, background: g.meta.bg, border: `1px solid ${g.meta.border}`,
                    borderRadius: 999, padding: '1px 6px',
                  }}>{g.short}</span>
                ))}
              </div>

              {/* One racing line — everyone rides the SAME track */}
              <div style={{ position: 'relative', height: laneH, marginBottom: 2 }}>
                {/* rail with dashed centre stripe */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: lineY - 4, height: 8, borderRadius: 8, background: 'var(--line)' }} />
                <div style={{ position: 'absolute', left: 2, right: 2, top: lineY - 1, height: 2, borderRadius: 2, background: 'repeating-linear-gradient(90deg, #fff 0 7px, transparent 7px 14px)', opacity: .85, pointerEvents: 'none' }} />
                {/* front fill — up to the current leader */}
                <div style={{ position: 'absolute', left: 0, top: lineY - 4, height: 8, borderRadius: 8, width: `${leadPct}%`, background: 'linear-gradient(90deg, #fbbf24, #f59e0b)', transition: 'width .8s ease' }} />
                {/* finish bar — this IS the last gate (final tier / win-on) */}
                <div style={{ position: 'absolute', right: 0, top: 12, width: 4, height: laneH - 24, borderRadius: 2, background: '#16a34a' }}>
                  {leadPct >= 99.5 && (
                    <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>✓</span>
                  )}
                </div>
                {/* gates — full-height bars; green once the leader has cleared them.
                    The last one is skipped: the finish bar stands in for it. */}
                {gates.map(g => {
                  if (g.x >= 99.5) return null;
                  const cleared = leadPct >= g.x;
                  return (
                    <div key={g.key} title={g.label} style={{
                      position: 'absolute', left: `${g.x}%`, top: 12, width: cleared ? 4 : 2.5, height: laneH - 24,
                      transform: 'translateX(-50%)', borderRadius: 3, zIndex: 1,
                      background: cleared ? '#16a34a' : '#cbd5e1', transition: 'background .4s ease',
                    }}>
                      {cleared && (
                        <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>✓</span>
                      )}
                    </div>
                  );
                })}
                {/* riders */}
                {fros.map((f, i) => {
                  const isMe = you && String(f.fro_id) === String(you);
                  const amt = Number(f.total_amount) || 0;
                  const p = pcts[i];
                  // Clamp the visual position so chips never spill past the card.
                  const x = Math.min(96, Math.max(4, p));
                  const tx = p < 10 ? '0%' : p > 90 ? '-100%' : '-50%';
                  const cy = lineY;
                  const isLeader = i === 0;
                  // In milestone mode the winner isn't decided mid-race — only
                  // mark green once the window is final.
                  const wonFinal = f.is_winner && (!tierMode || r.tiers_final);
                  const rankColor = ['#f59e0b', '#94a3b8', '#b45309'][i] || '#6b7280';
                  // Only the front rider (+ you) gets an on-track chip — the rest
                  // would pile on top of each other at the start line. Everyone
                  // is named in the legend row under the track.
                  const showChip = isLeader || isMe;
                  return (
                    <div key={f.fro_id} title={`${f.fro_name} · ₹${fmt(amt)} · ${f.qualified_leads || 0} verified`}>
                      {showChip && (
                        <div style={{
                          position: 'absolute', left: `${x}%`, top: cy - 34, transform: `translateX(${tx})`,
                          fontSize: 10, fontWeight: 800, lineHeight: 1.3, whiteSpace: 'nowrap',
                          color: isMe ? '#b45309' : 'var(--ink)', background: '#fff',
                          border: `1.5px solid ${wonFinal ? '#86efac' : isLeader ? '#f59e0b' : '#d97706'}`,
                          borderRadius: 999, padding: '1px 8px', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                          transition: 'left .8s ease', zIndex: 3,
                        }}>₹{fmt(amt)}</div>
                      )}
                      {/* the rider — circular avatar on the racing line */}
                      <div style={{ position: 'absolute', left: `${x}%`, top: cy, transform: 'translate(-50%,-50%)', transition: 'left .8s ease', zIndex: 10 - i }}>
                        <div style={{ position: 'relative', borderRadius: '50%', boxShadow: isLeader ? '0 0 0 3px #fde68a' : (isMe ? '0 0 0 2px #fdba74' : '0 0 0 1.5px #fff') }}>
                          <Avatar url={f.photo_url} name={f.fro_name} size={34} />
                          <span style={{
                            position: 'absolute', top: -6, right: -7, minWidth: 16, height: 16, padding: '0 3px',
                            borderRadius: 999, background: rankColor, color: '#fff', border: '1.5px solid #fff',
                            fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{i + 1}</span>
                          {wonFinal && <span style={{ position: 'absolute', top: -15, left: -13, fontSize: 12, lineHeight: 1 }}>🏆</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend row — avatar + name + amount; wraps instead of piling */}
              {fros.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {fros.map((f, i) => {
                    const isMe = you && String(f.fro_id) === String(you);
                    const isLeader = i === 0;
                    return (
                      <span key={f.fro_id} title={`${f.qualified_leads || 0} verified`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px 2px 3px',
                        borderRadius: 999, background: isMe ? '#fff3d6' : '#fff',
                        border: `1.5px solid ${isLeader ? '#f59e0b' : isMe ? '#d97706' : 'var(--line)'}`,
                        fontSize: 10.5, fontWeight: isMe || isLeader ? 800 : 600,
                        color: isMe ? '#b45309' : 'var(--ink)', whiteSpace: 'nowrap', maxWidth: '100%',
                        overflow: 'hidden',
                      }}>
                        <Avatar url={f.photo_url} name={f.fro_name} size={18} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fro_name}{isMe ? ' (you)' : ''}</span>
                        <span style={{ fontWeight: 900, color: isLeader ? '#b45309' : 'var(--ink)' }}>₹{fmt(Number(f.total_amount) || 0)}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              {fros.length === 0 && (
                <div style={{ padding: '16px 10px', fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>
                  No FROs competing in this range yet
                </div>
              )}

              {tierMode && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {tiers.map(t => {
                    const info = leaderByKey[t.tier_key];
                    const ldr = info?.leader;
                    const isFinal = r.tiers_final;
                    return (
                      <div key={t.tier_key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #f3f0e6', borderRadius: 8, padding: '4px 8px' }}>
                        <TierPill tierKey={t.tier_key} orderIndex={t.order_index} label={t.label} size={10} />
                        <span style={{ fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>₹{fmt(t.target_amount)} → <b style={{ color: 'var(--ink)' }}>₹{fmt(t.prize_amount)}</b></span>
                        <span style={{ flex: 1, borderBottom: '1px dashed #fcd34d', opacity: .4 }} />
                        {ldr ? (
                          <span style={{ fontSize: 10.5, fontWeight: isFinal ? 800 : 700, color: isFinal ? '#166534' : (String(ldr.fro_id) === String(you) ? '#b45309' : 'var(--ink)'), whiteSpace: 'nowrap' }}>
                            {isFinal ? '🏆 ' : '📈 '}{ldr.fro_name}{String(ldr.fro_id) === String(you) ? ' (you)' : ''} · ₹{fmt(ldr.amount)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#b3a99a' }}>— waiting</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {fros.length > 0 && (
                <div style={{ fontSize: 9.5, color: 'var(--ink-soft)', textAlign: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                  {tierMode
                    ? `Top ${fros.length} racing · green gate = cleared · highest collection when the window ends wins each tier`
                    : `Top ${fros.length} racing live · first avatar past the 🎯 gate wins ₹${fmt(prize)}`}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {ranges.length === 0 && (
        <div style={{ padding: 20, fontSize: 12.5, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.6 }}>
          No lead ranges are live right now.<br />Ranges appear here once Sir starts today's competition.
        </div>
      )}
    </div>
  );
}

// Big full-screen leaderboard popup: all ranges, ranked FROs, winner photos.
function LeaderboardModal({ data, you, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <style>{LEAD_CSS}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(680px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 20,
        background: '#fffdf5', border: '2px solid #f59e0b', boxShadow: '0 28px 70px rgba(0,0,0,.4)',
        animation: 'lil-pop .35s cubic-bezier(.22,1,.36,1)', position: 'relative',
      }}>
        {/* Brand header — z-index above the rider avatars (max 10) so they
            never float over it while the modal body scrolls */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, padding: '14px 18px', background: 'linear-gradient(135deg, #92400e 0%, #b45309 55%, #d97706 100%)', borderBottom: '1px solid rgba(255,255,255,.14)', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: '#dc2626', fontSize: 10.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'lil-pulse 1s linear infinite' }} /> Lead Incentive · LIVE
            </span>
            <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,.16)', fontSize: 10.5, fontWeight: 800 }}>⏳ Today</span>
            <div style={{ flex: 1 }} />
            <div onClick={onClose} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>✕</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 900, lineHeight: 1.3 }}>
                🚨🔥 SIR KA LEAD INCENTIVE – LIMITED TIME ONLY! 🔥🚨
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffe4b8', lineHeight: 1.5, marginTop: 3 }}>
                Collect the range's target to win — flat prize for the first to cross, or one prize per milestone. Every verified rupee counts!
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <RangeLeaderboard data={data} you={you} />
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Keep collecting! 🔥</button>
        </div>
      </div>
    </div>
  );
}

// Winner card pinned to the TOP-RIGHT corner when a range is won — shows the
// winner's photo + name + prize, like "Sir ka Incentive". Dismissible per day.
function LeadWinnerCard({ champion, onClose, styleTop }) {
  const [open, setOpen] = useState(true);
  const [err, setErr] = useState(false);
  if (!champion || !open) return null;
  const url = champion.photo_url;
  const prize = Number(champion.slab_bonus) || Number(champion.total_incentive) || Number(champion.incentive_amount) || 0;
  return (
    <div style={{ position: 'fixed', top: styleTop || 74, right: 14, zIndex: 99984, width: 230, borderRadius: 14, overflow: 'hidden', border: '2px solid #f59e0b', background: '#fffdf5', boxShadow: '0 14px 34px rgba(0,0,0,.28)', animation: 'lil-rise .35s ease' }}>
      <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, cursor: 'pointer', width: 24, height: 24, borderRadius: 50, background: '#fff', border: '1.5px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#b45309', boxShadow: '0 2px 6px rgba(0,0,0,.18)' }}
        onClick={() => { setOpen(false); onClose && onClose(); }}>✕</div>
      {url && !err ? (
        <div style={{ height: 108, position: 'relative', overflow: 'hidden' }}>
          <img src={url} alt="Winner" onError={() => setErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#fde68a' }} />
          <div style={{ position: 'absolute', right: 6, top: 6, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .4 }}>
            🏆 {champion.tier_label ? `${champion.tier_label} Winner` : 'Winner'} · Today
          </div>
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar url={url} name={champion.fro_name} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 14, textShadow: '0 1px 6px rgba(0,0,0,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champion.fro_name || 'The Winner'}</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 12.5, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>Won ₹{fmt(prize)} 🎉</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', fontSize: 30, animation: 'lil-bounce 1.2s ease-in-out infinite' }}>🏆</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .5, textTransform: 'uppercase' }}>{champion.tier_label ? `${champion.tier_label} Winner` : "Today's Winner"}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champion.fro_name || 'The Winner'}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Won ₹{fmt(prize)} 🎉</div>
          </div>
        </div>
      )}
      <div style={{ padding: '7px 10px', borderTop: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          Lead Incentive · {champion.slab_label}{champion.tier_label ? ` · ${champion.tier_label} tier (₹${fmt(champion.tier_target)})` : ''}
        </span>
      </div>
    </div>
  );
}

// Sticky right-edge arrow tab shown while today's lead competition is live.
// Clicking it opens the big leaderboard modal. No floating card anymore.
export default function LeadIncentiveLeaderboard() {
  const user = useUser();
  const { data } = useLeadIncentiveLeaderboard();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [dismissedWinners, setDismissedWinners] = useState({});
  const freshTimer = useRef(0);
  const wasActiveRef = useRef(false);

  const isFro = !!user && (user.role === 'fro' || user.role === 'worker');
  const hasActivity = !!data.has_activity;
  const ranges = data.ranges || [];
  const competitionLive = ranges.length > 0;
  const you = user?.id || null;

  // "NEW" pulse when competition first appears this session.
  useEffect(() => {
    if (hasActivity && !wasActiveRef.current) {
      setFresh(true);
      clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => setFresh(false), 12000);
    }
    wasActiveRef.current = hasActivity;
    return () => clearTimeout(freshTimer.current);
  }, [hasActivity]);

  if (!isFro) return null;
  const winnerKeyOf = (c) => `${c.slab_id}|${c.tier_key || ''}`;
  const winners = (data.champions || []).filter(c => !dismissedWinners[winnerKeyOf(c)]);
  const showHandle = !open && competitionLive;
  if (!open && !showHandle && winners.length === 0) return null;

  return (
    <>
      <style>{LEAD_CSS}</style>

      {winners.map((c, idx) => (
        <LeadWinnerCard
          key={winnerKeyOf(c)}
          champion={c}
          styleTop={74 + idx * 158}
          onClose={() => setDismissedWinners(p => ({ ...p, [winnerKeyOf(c)]: true }))}
        />
      ))}

      {open && <LeaderboardModal data={data} you={you} onClose={() => setOpen(false)} />}

      {showHandle && (
        <button
          type="button"
          title="Lead Incentive · open leaderboard"
          aria-label="Open Lead Incentive leaderboard"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 99980, cursor: 'pointer', fontFamily: 'inherit', overflow: 'visible',
            border: '2px solid #f59e0b', borderRight: 'none', outline: 'none',
            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 7,
            padding: '10px 8px 10px 10px', borderRadius: '15px 0 0 15px',
            background: 'linear-gradient(180deg, #b45309 0%, #d97706 60%, #f59e0b 100%)',
            color: '#fff', boxShadow: '-6px 2px 18px rgba(120,53,15,.4)',
            animation: 'lil-nudge 3.2s ease-in-out infinite',
            transition: 'filter .15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
        >
          {/* live pulse (glows brighter while "fresh") */}
          <span style={{
            position: 'absolute', top: -5, right: 5, width: 10, height: 10, borderRadius: '50%',
            background: '#dc2626', border: '1.5px solid #fff',
            boxShadow: fresh ? '0 0 8px 2px rgba(220,38,38,.8)' : 'none',
            animation: 'lil-pulse 1.2s linear infinite',
          }} />
          {/* trophy icon (line-style, like the dashboard's lucide icons) */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
          {/* the small arrow from the sketch (/ \ -> chevron) */}
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
            <path d="M3.5 2.5L9 8l-5.5 5.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  );
}