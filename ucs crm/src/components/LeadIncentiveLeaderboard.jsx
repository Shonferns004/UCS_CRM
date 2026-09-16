import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api/auth';
import { useRealtime } from '../hooks/useRealtime';
import { useUcs } from '../store';
import { CoinsBag } from './AkiBanner';

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

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LEAD_CSS = `
@keyframes lil-pop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
@keyframes lil-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes lil-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lil-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
`;

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
      background: 'linear-gradient(135deg,#b45309,#f59e0b)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, border: '2px solid #fbbf24',
    }}>{initialsOf(name)}</div>
  );
}

// Shared hook: today's per-range leaderboard + realtime refresh.
export function useLeadIncentiveLeaderboard() {
  const [data, setData] = useState({ has_activity: false, ranges: [], champions: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const date = todayLocal();
      const r = await api(`/incentive/lead/leaderboard?date=${date}`, { _prefix: 'ucs' });
      if (r && Array.isArray(r.ranges)) setData(r);
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

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return { data, loading, reload: load };
}

// Reusable block: every live range with ranked FROs, winner photos + "you" highlight.
export function RangeLeaderboard({ data, you }) {
  const ranges = data.ranges || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ranges.map(r => (
        <div key={r.slab_id} style={{ borderRadius: 14, border: '1.5px solid var(--line)', background: 'rgba(255,255,255,.85)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', background: 'linear-gradient(90deg,#fff3d6,#fef3c7)', borderBottom: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>{r.slab_label}</span>
            <div style={{ flex: 1 }} />
            {r.champion ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 800, animation: 'lil-pulse 1.6s ease-in-out infinite' }}>
                🏆 {r.champion.fro_name} won
              </span>
            ) : (
              <span style={{ padding: '3px 10px', borderRadius: 999, background: '#ffedd5', color: '#c2410c', fontSize: 11, fontWeight: 800 }}>
                🏁 Running — no winner yet
              </span>
            )}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#fff', border: '1px solid #fde68a', fontSize: 11, fontWeight: 800, color: '#92400e' }}>
                🎯 Target ≤ ₹{fmt(r.min_lead_amount)} per lead
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#fff', border: '1px solid #86efac', fontSize: 11, fontWeight: 800, color: '#166534' }}>
                💰 Reward ₹{fmt(r.lead_rate)} / qualified lead
              </span>
            </div>
          </div>

          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(r.fros || []).map((f, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const isMe = you && f.fro_id === you;
              return (
                <div key={f.fro_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10,
                  background: f.is_winner ? '#dcfce7' : (isMe ? '#fff7ed' : 'transparent'),
                  border: isMe ? '1.5px solid #fdba74' : '1.5px solid transparent',
                }}>
                  <span style={{ width: 24, fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
                    {f.is_winner ? '🏆' : (medals[i] || <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{i + 1}</span>)}
                  </span>
                  <Avatar url={f.photo_url} name={f.fro_name} size={30} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 12.5, fontWeight: f.is_winner ? 800 : (isMe ? 800 : 600), color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.fro_name}{isMe ? ' (you)' : ''}
                      {f.is_winner ? ' 🏆' : ''}
                    </span>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ width: `${pctOf(f.total_amount, f.target)}%`, height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 4, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>{f.qualified_leads} qualified ✓</span>
                  {f.is_winner && (Number(f.lead_incentive) || 0) > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      🏆 Winner +₹{fmt(f.lead_incentive)}
                    </span>
                  )}
                </div>
              );
            })}
            {(r.fros || []).length === 0 && (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>No FROs competing in this range yet</div>
            )}
          </div>
        </div>
      ))}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <style>{LEAD_CSS}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 18,
        background: 'linear-gradient(160deg,#fffdf5 0%,#fff7e0 60%,#ffe9c2 100%)',
        border: '2px solid #f59e0b', boxShadow: '0 24px 60px rgba(0,0,0,.35)',
        animation: 'lil-pop .4s cubic-bezier(.22,1,.36,1)', position: 'relative',
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 4, padding: '14px 18px 12px', background: 'linear-gradient(135deg,#451a03,#b45309,#f59e0b)', borderBottom: '1px dashed #f59e0b88', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'lil-pulse 1s linear infinite' }} /> Lead Incentive · LIVE
            </span>
            <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,.18)', fontSize: 10.5, fontWeight: 800 }}>⏳ Today</span>
            <div style={{ flex: 1 }} />
            <div onClick={onClose} style={{ cursor: 'pointer', width: 30, height: 30, borderRadius: 50, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff' }}>✕</div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, margin: '10px 0 2px', lineHeight: 1.25 }}>
            🚨🔥 SIR KA LEAD INCENTIVE – LIMITED TIME ONLY! 🔥🚨
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ffe4b8', lineHeight: 1.5 }}>
            First FRO to hit their range's target wins that range! Start collecting now — every rupee counts. Let's go!
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <RangeLeaderboard data={data} you={you} />
        </div>

        <div style={{ padding: '0 14px 18px', textAlign: 'center' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Keep collecting! 🔥</button>
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
  const prize = Number(champion.lead_incentive) || Number(champion.total_incentive) || 0;
  return (
    <div style={{ position: 'fixed', top: styleTop || 74, right: 14, zIndex: 99984, width: 230, borderRadius: 14, overflow: 'hidden', border: '2px solid #f59e0b', background: 'linear-gradient(160deg,#fffdf5 0%,#fff3d6 100%)', boxShadow: '0 14px 34px rgba(0,0,0,.28)', animation: 'lil-rise .35s ease' }}>
      <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, cursor: 'pointer', width: 24, height: 24, borderRadius: 50, background: '#fff', border: '1.5px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#b45309', boxShadow: '0 2px 6px rgba(0,0,0,.18)' }}
        onClick={() => { setOpen(false); onClose && onClose(); }}>✕</div>
      {url && !err ? (
        <div style={{ height: 108, position: 'relative', overflow: 'hidden' }}>
          <img src={url} alt="Winner" onError={() => setErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#fde68a' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 48%, rgba(120,53,15,.6) 100%)' }} />
          <div style={{ position: 'absolute', right: 6, top: 6, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .4 }}>
            🏆 Winner · Today
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
            <div style={{ fontSize: 10, fontWeight: 800, color: '#b45309', letterSpacing: .5, textTransform: 'uppercase' }}>Today's Winner</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champion.fro_name || 'The Winner'}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Won ₹{fmt(prize)} 🎉</div>
          </div>
        </div>
      )}
      <div style={{ padding: '7px 10px', borderTop: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>Lead Incentive · {champion.slab_label}</span>
      </div>
    </div>
  );
}

// Sticky corner widget shown only while today's lead competition is live.
// Styled like "Sir ka Incentive": brand header, my progress + the running ranges.
// Tap the card to open the big leaderboard. Dismissible per session.
export default function LeadIncentiveLeaderboard() {
  const user = useUser();
  const { data } = useLeadIncentiveLeaderboard();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [dismissedWinners, setDismissedWinners] = useState({});
  const freshTimer = useRef(0);
  const wasActiveRef = useRef(false);

  const isFro = !!user && (user.role === 'fro' || user.role === 'worker');
  const hasActivity = !!data.has_activity;
  const ranges = data.ranges || [];
  const competitionLive = ranges.length > 0;
  const you = user?.id || null;

  // "NEW" pulse when competition first appears this session; reset dismissal too.
  useEffect(() => {
    if (hasActivity && !wasActiveRef.current) {
      setDismissed(false);
      setFresh(true);
      clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => setFresh(false), 12000);
    }
    wasActiveRef.current = hasActivity;
    return () => clearTimeout(freshTimer.current);
  }, [hasActivity]);

  if (!isFro) return null;
  const winners = (data.champions || []).filter(c => !dismissedWinners[c.slab_id]);
  const showWidget = !open && !dismissed && competitionLive;
  const showAnything = showWidget || winners.length > 0;
  if (!open && !showAnything) return null;

  // The logged-in FRO's own range + progress (leaderboard already carries target).
  let me = null;
  for (const r of ranges) {
    const m = (r.fros || []).find(f => f.fro_id === you);
    if (m) { me = { ...m, range: r }; break; }
  }
  const myPct = me ? pctOf(me.total_amount, me.target) : 0;

  return (
    <>
      <style>{LEAD_CSS}</style>

      {winners.map((c, idx) => (
        <LeadWinnerCard
          key={c.slab_id}
          champion={c}
          styleTop={74 + idx * 158}
          onClose={() => setDismissedWinners(p => ({ ...p, [c.slab_id]: true }))}
        />
      ))}

      {open && <LeaderboardModal data={data} you={you} onClose={() => setOpen(false)} />}

      {!open && showWidget && (
        <div style={{ position: 'fixed', right: 16, bottom: 96, zIndex: 99980, width: 'min(310px, calc(100vw - 32px))' }}>
          <div style={{ position: 'relative', cursor: 'pointer', animation: 'lil-rise .35s ease' }} onClick={() => setOpen(true)}>
            {fresh && (
              <div style={{ position: 'absolute', top: -8, right: -6, zIndex: 3, padding: '2px 9px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: .4, animation: 'lil-pulse 1.2s linear infinite' }}>🔴 NEW</div>
            )}
            <div style={{
              borderRadius: 16, overflow: 'hidden', border: '2px solid #f59e0b', background: 'linear-gradient(150deg,#fffdf5,#fff3d6)',
              boxShadow: '0 14px 34px rgba(0,0,0,.22)',
            }}>
              {/* Brand header */}
              <div style={{ padding: '10px 12px', background: 'linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)', color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 15 }}>🏆</span>
                <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Lead Incentive · {ranges.length} range{ranges.length > 1 ? 's' : ''} live
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 800, background: '#dc2626', color: '#fff', padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'lil-pulse 1s linear infinite' }} /> LIVE
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fff', color: '#b45309', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>TODAY</span>
              </div>

              <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11.5, fontWeight: 900, color: '#b45309', background: 'linear-gradient(90deg,#fff3d6,#ffe9c2)', borderBottom: '1px dashed #fcd34d', lineHeight: 1.4 }}>
                🚨🔥 SIR KA LEAD INCENTIVE – LIMITED TIME ONLY! 🔥🚨
              </div>

              <div style={{ padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {/* My progress — like Sir ka Incentive */}
                {me ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ animation: 'lil-bounce 2.6s ease-in-out infinite', flexShrink: 0 }}><CoinsBag size={44} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        My progress · {me.range.slab_label}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                        ₹{fmt(me.total_amount)} <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 700 }}>/ ₹{fmt(me.target)}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 6, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ width: `${myPct}%`, height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 6, transition: 'width .5s ease' }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: '#b45309', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{me.qualified_leads} qualified ✓</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', textAlign: 'center', padding: '2px 0' }}>
                    You're not in a live range yet — open the leaderboard to see the running FROs!
                  </div>
                )}

                {/* Live ranges snapshot */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {ranges.slice(0, 4).map(r => {
                    const leader = r.champion
                      ? { name: r.champion.fro_name, won: true }
                      : (r.fros && r.fros.length ? { name: r.fros[0].fro_name, won: false } : null);
                    return (
                      <div key={r.slab_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink)' }}>
                        <span style={{ fontWeight: 700, color: '#b45309', flexShrink: 0 }}>{r.slab_label}</span>
                        <span style={{ flex: 1, borderBottom: '1px dashed #fcd34d', opacity: .4 }} />
                        {leader ? (
                          <span style={{ fontSize: 11, fontWeight: leader.won ? 800 : 600, color: leader.won ? '#166534' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                            {leader.name}{leader.won ? ' 🏆' : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#c2410c', fontWeight: 700 }}>🏁 no lead</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 4, textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#b45309', background: '#fffdf5', border: '1.5px dashed #f59e0b', borderRadius: 9, padding: '5px 8px' }}>
              👆 Tap to view full leaderboard ▶
            </div>
            <div
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              title="Hide for today"
              style={{ position: 'absolute', top: 4, right: 6, cursor: 'pointer', width: 22, height: 22, borderRadius: 50, background: 'rgba(0,0,0,.16)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</div>
          </div>
        </div>
      )}
    </>
  );
}