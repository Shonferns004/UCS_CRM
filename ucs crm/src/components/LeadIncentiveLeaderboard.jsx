import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api/auth';
import { useRealtime } from '../hooks/useRealtime';
import { useUcs } from '../store';

const fmt = (n) => {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN');
};

const todayLocal = () => new Date().toISOString().slice(0, 10);

const LEAD_CSS = `
@keyframes lil-pop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
@keyframes lil-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes lil-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
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
      if (r && r.has_activity) setData(r);
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

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return { data, loading, reload: load };
}

// Big full-screen leaderboard popup: all ranges, ranked FROs, winner photos.
function LeaderboardModal({ data, you, onClose }) {
  const ranges = data.ranges || [];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <style>{LEAD_CSS}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 18,
        background: 'linear-gradient(160deg,#fffdf5 0%,#fff7e0 60%,#ffe9c2 100%)',
        border: '2px solid #f59e0b', boxShadow: '0 24px 60px rgba(0,0,0,.35)',
        animation: 'lil-pop .4s cubic-bezier(.22,1,.36,1)', position: 'relative',
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 3, padding: '16px 18px 12px', background: 'linear-gradient(160deg,#fffdf5,#fff3d6)', borderBottom: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--ink)' }}>🏆 Lead Incentive Leaderboard</div>
            <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 2 }}>
              First FRO to hit a range's Minimum Lead Amount (by verified time) wins that range.
            </div>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', width: 30, height: 30, borderRadius: 50, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }}>✕</div>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ranges.map(r => (
            <div key={r.slab_id} style={{ borderRadius: 14, border: '1.5px solid var(--line)', background: 'rgba(255,255,255,.85)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: 'linear-gradient(90deg,#fff3d6,#fef3c7)', borderBottom: '1px dashed #f59e0b88', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>{r.slab_label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b45309', background: '#fff', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: 999 }}>Min Lead ₹{fmt(r.min_lead_amount)}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a', background: '#fff', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 999 }}>₹{fmt(r.lead_rate)}/lead</span>
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
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: f.is_winner ? 800 : (isMe ? 800 : 600), color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.fro_name}{isMe ? ' (you)' : ''}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', flexShrink: 0 }}>{f.qualified_leads} ✓</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', width: 84, textAlign: 'right', flexShrink: 0 }}>₹{fmt(f.total_incentive)}</span>
                    </div>
                  );
                })}
                {(r.fros || []).length === 0 && (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>No FROs competing in this range yet</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 14px 18px', textAlign: 'center' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Keep collecting! 🔥</button>
        </div>
      </div>
    </div>
  );
}

// Sticky corner widget shown only once today's lead competition has activity.
// Tap the card to open the big leaderboard. Dismissible per session.
export default function LeadIncentiveLeaderboard() {
  const user = useUser();
  const { data } = useLeadIncentiveLeaderboard();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [fresh, setFresh] = useState(false);
  const freshTimer = useRef(0);
  const wasActiveRef = useRef(false);

  const isFro = !!user && (user.role === 'fro' || user.role === 'worker');
  const hasActivity = !!data.has_activity;

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
  if (!open && dismissed) return null;
  if (!open && !hasActivity) return null;

  const ranges = data.ranges || [];
  const you = user?.id || null;

  return (
    <>
      <style>{LEAD_CSS}</style>

      {open && <LeaderboardModal data={data} you={you} onClose={() => setOpen(false)} />}

      {!open && (
        <div style={{ position: 'fixed', right: 16, bottom: 96, zIndex: 99980, width: 'min(300px, calc(100vw - 32px))' }}>
          <div style={{ position: 'relative', cursor: 'pointer', animation: 'lil-rise .35s ease' }} onClick={() => setOpen(true)}>
            {fresh && (
              <div style={{ position: 'absolute', top: -8, right: -6, zIndex: 3, padding: '2px 9px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: .4, animation: 'lil-pulse 1.2s linear infinite' }}>🔴 LIVE</div>
            )}
            <div style={{
              borderRadius: 14, overflow: 'hidden', border: '2px solid #f59e0b', background: 'linear-gradient(150deg,#fffdf5,#fff3d6)',
              boxShadow: '0 14px 34px rgba(0,0,0,.22)',
            }}>
              <div style={{ padding: '10px 12px', background: 'linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)', color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 15 }}>🏆</span>
                <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Lead Incentive · {ranges.length} range{ranges.length > 1 ? 's' : ''} live
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fff', color: '#b45309', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>TODAY</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ranges.slice(0, 4).map(r => {
                  const leader = r.champion
                    ? { name: r.champion.fro_name, won: true }
                    : (r.fros && r.fros.length ? { name: r.fros[0].fro_name, won: false } : null);
                  return (
                    <div key={r.slab_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink)' }}>
                      <span style={{ fontWeight: 700, color: '#b45309', flexShrink: 0 }}>{r.slab_label}</span>
                      <span style={{ flex: 1, borderBottom: '1px dashed #fcd34d', opacity: .4 }} />
                      {leader ? (
                        <span style={{ fontSize: 11, fontWeight: leader.won ? 800 : 600, color: leader.won ? '#166534' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                          {leader.name}{leader.won ? ' 🏆' : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)' }}>—</span>
                      )}
                    </div>
                  );
                })}
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