import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../../api/auth';
import { useUcs } from '../../../store';
import { useRealtime } from '../../../hooks/useRealtime';
import { useLeadIncentiveLeaderboard, RangeLeaderboard } from '../../../components/LeadIncentiveLeaderboard';

const fmt = (n) => {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN');
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LEAD_PAGE_CSS = `
@keyframes lp-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes lp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lp-pop-in { 0% { transform: scale(.7) translateY(30px); opacity: 0; } 70% { transform: scale(1.04); } 100% { transform: scale(1) translateY(0); opacity: 1; } }
@keyframes lp-celebrate { 0%,100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-12px) rotate(-8deg); } 75% { transform: translateY(-12px) rotate(8deg); } }
`;

function Avatar({ url, name, size = 44 }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [url]);
  const initials = String(name || 'W').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  if (url && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '3px solid #fbbf24', background: 'var(--bg)' }}>
        <img src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#166534,#22c55e)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 900, border: '3px solid #4ade80' }}>
      {initials}
    </div>
  );
}

function WinnerPopup({ champion, onClose }) {
  const me = useUcs();
  const isMe = me?.user && champion && String(champion.fro_id) === String(me.user.id);
  if (!champion) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(15,23,42,.66)', backdropFilter: 'blur(3px)', animation: 'lp-rise .2s ease' }}>
      <div style={{ width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(165deg,#fefce8,#fef3c7,#fde68a)', border: '3px solid #f59e0b', boxShadow: '0 24px 60px rgba(180,83,9,.45)', animation: 'lp-pop-in .45s cubic-bezier(.2,1.4,.4,1)' }}>
        <div style={{ padding: '18px 20px', textAlign: 'center', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 12, border: 'none', background: 'rgba(146,64,14,.12)', color: '#92400e', width: 28, height: 28, borderRadius: '50%', fontSize: 15, fontWeight: 900, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#92400e', letterSpacing: 1 }}>🏆 LEAD INCENTIVE WINNER 🏆</div>
          <div style={{ fontSize: 46, margin: '8px 0 4px', animation: 'lp-celebrate 1.2s ease-in-out infinite', display: 'inline-block' }}>🎉</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Avatar url={champion.photo_url} name={champion.fro_name} size={64} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#78350f' }}>{champion.fro_name}{isMe ? ' (you!)' : ''}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b45309', margin: '6px 0 2px' }}>
            {isMe
              ? '🎊 Congratulations! You won the range!'
              : `Won the ${champion.slab_label || 'range'}!`}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#78350f', marginTop: 8 }}>
            Hit ₹{fmt(champion.hit_amount)} — reward <span style={{ color: '#16a34a' }}>+₹{fmt(champion.lead_incentive)}</span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#dcfce7', border: '1px solid #86efac', fontSize: 11, fontWeight: 800, color: '#166534' }}>{champion.qualified_leads} qualified ✓</span>
          </div>
          <button onClick={onClose} style={{ marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 11, border: 'none', background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
            Awesome, got it! 🥳
          </button>
        </div>
      </div>
    </div>
  );
}

function useUser() {
  try {
    const u = useUcs();
    return u?.user || null;
  } catch { return null; }
}

function StatCard({ label, value, unit, color, icon }) {
  return (
    <div style={{ borderRadius: 14, border: '1.5px solid var(--line)', background: 'var(--card-bg)', padding: '12px 14px', boxShadow: '0 2px 10px rgba(0,0,0,.04)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4, display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: color || 'var(--ink)', marginTop: 4, whiteSpace: 'nowrap' }}>
        {unit}{fmt(value)}
      </div>
    </div>
  );
}

function HeroLive({ summary }) {
  const slab = summary?.slab;
  const rangeLabel = slab
    ? `₹${fmt(slab.min_amount)} – ₹${fmt(slab.max_amount)}`
    : 'your range';
  const target = Number(summary?.target) || 0;
  const collected = Number(summary?.total_amount) || 0;
  const pct = target > 0 ? Math.min(100, Math.max(0, collected / target * 100)) : 0;
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '2px solid #f59e0b', background: 'linear-gradient(135deg,#451a03,#b45309,#f59e0b)', boxShadow: '0 14px 34px rgba(180,83,9,.28)', animation: 'lp-rise .35s ease' }}>
      <div style={{ padding: '16px 18px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'lp-pulse 1s linear infinite' }} /> Lead Incentive · LIVE
          </span>
          <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,.18)', fontSize: 10.5, fontWeight: 800 }}>⏳ Today</span>
          {rangeLabel !== 'your range' && (
            <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,.18)', fontSize: 10.5, fontWeight: 800 }}>{rangeLabel}</span>
          )}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, margin: '12px 0 4px', lineHeight: 1.25 }}>
          🚨🔥 SIR KA LEAD INCENTIVE – LIMITED TIME ONLY! 🔥🚨
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ffe4b8', lineHeight: 1.6 }}>
          First FRO to hit their range's target wins that range! Start collecting now — every rupee counts. Let's go!
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
              <span style={{ color: '#ffe4b8' }}>My collection</span>
              <span style={{ color: '#fff' }}>₹{fmt(collected)} <span style={{ opacity: .75, fontWeight: 600 }}>/ ₹{fmt(target)}</span></span>
            </div>
            <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#fbbf24,#fde047)', borderRadius: 6, transition: 'width .5s ease' }} />
            </div>
          </div>
          <span style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(255,255,255,.16)', fontSize: 12, fontWeight: 800 }}>{summary.qualified_leads || 0} qualified ✓</span>
        </div>
      </div>
    </div>
  );
}

function HeroWaiting({ summary, ranges }) {
  const liveRangeCount = (ranges || []).length;
  return (
    <div style={{ borderRadius: 16, border: '1.5px dashed var(--line)', background: 'var(--card-bg)', padding: '18px', textAlign: 'center', animation: 'lp-rise .35s ease' }}>
      <div style={{ fontSize: 26 }}>🏆</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', margin: '6px 0 2px' }}>Lead Incentive</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
        {liveRangeCount > 0
          ? 'Your range hasn\u2019t started yet — the competition is live for other ranges. Keep collecting; your leads will count once your range starts!'
          : 'No lead ranges are live right now. Come back when Sir starts today\u2019s Lead Incentive competition!'}
      </div>
    </div>
  );
}

export default function LeadIncentive() {
  const user = useUser();
  const you = user?.id || null;
  const { data, loading } = useLeadIncentiveLeaderboard();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const debRef = useRef(0);
  const [popupChamp, setPopupChamp] = useState(null);
  const seenChipRef = useRef(new Set());

  useEffect(() => {
    const newChamp = (data.champions || []).find(c => !seenChipRef.current.has(String(c.fro_id) + '|' + c.slab_id));
    if (newChamp) {
      seenChipRef.current.add(String(newChamp.fro_id) + '|' + newChamp.slab_id);
      setPopupChamp(newChamp);
    }
  }, [data.champions]);

  const loadSummary = useCallback(async () => {
    try {
      const date = todayLocal();
      const r = await api(`/incentive/lead/my-summary?date=${date}`, { _prefix: 'ucs' });
      if (r) setSummary(r);
    } catch { /* not found / offline */ }
    finally { setSummaryLoading(false); }
  }, []);

  const reloadSoon = useCallback(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(loadSummary, 800);
  }, [loadSummary]);

  useRealtime('lead_champion_announcements', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon });
  useRealtime('incentive_slabs', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon });

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, 5000);
    return () => { clearInterval(t); clearTimeout(debRef.current); };
  }, [loadSummary]);

  const ranges = data.ranges || [];
  const live = !!summary?.is_live;
  const isChampion = !!summary?.is_champion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860, margin: '0 auto', padding: '4px 0 24px' }}>
      <style>{LEAD_PAGE_CSS}</style>

      <WinnerPopup champion={popupChamp} onClose={() => setPopupChamp(null)} />

      <div>
        <h3 style={{ margin: 0 }}>🏆 Lead Incentive</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          First FRO to hit their range's target (by verified time) wins that range + the bonus.
        </p>
      </div>

      {summaryLoading ? (
        <div style={{ borderRadius: 16, border: '1.5px dashed var(--line)', background: 'var(--card-bg)', padding: '22px', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>
          Loading lead incentive…
        </div>
      ) : live ? (
        <HeroLive summary={summary} />
      ) : (
        <HeroWaiting summary={summary} ranges={ranges} />
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, animation: 'lp-rise .35s ease' }}>
          <StatCard label="My Range" icon="🎯" value={summary.slab ? `₹${fmt(summary.slab.min_amount)} – ₹${fmt(summary.slab.max_amount)}` : '—'} />
          <StatCard label="Target" icon="📈" value={summary.target} unit="₹" />
          <StatCard label="Collected" icon="💰" value={summary.total_amount} unit="₹" color="#16a34a" />
          <StatCard label="Qualified Leads" icon="✅" value={summary.qualified_leads} />
          <StatCard label="Lead Incentive" icon="🔢" value={summary.lead_incentive} unit="₹" />
          <StatCard label="Slab Bonus" icon="🎁" value={summary.slab_bonus} unit="₹" color="#b45309" />
          <StatCard label="Champion Bonus" icon="🏆" value={summary.champion_bonus} unit="₹" color={isChampion ? '#d97706' : undefined} />
          <StatCard label="Total Incentive" icon="💵" value={summary.total_incentive} unit="₹" color="#b45309" />
        </div>
      )}

      {isChampion && (
        <div style={{ borderRadius: 14, padding: '12px 16px', background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', gap: 10, animation: 'lp-rise .35s ease' }}>
          <span style={{ fontSize: 26 }}>🏆</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#166534' }}>You are today's range champion!</div>
            <div style={{ fontSize: 12, color: '#15803d' }}>
              First to hit the range's target — ₹{fmt(summary.champion_bonus)} champion bonus added.
            </div>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 16, border: '1.5px solid var(--line)', background: 'var(--card-bg)', overflow: 'hidden', animation: 'lp-rise .35s ease' }}>
        <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)' }}>🏆 Live Ranges</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Range-wise leaderboard — first to hit the range's target wins</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: live ? '#dc2626' : 'var(--line)', color: live ? '#fff' : 'var(--ink-soft)', fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase' }}>
            {live ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'lp-pulse 1s linear infinite' }} /> : null}
            {live ? 'LIVE' : 'Not started'}
          </span>
        </div>
        <div style={{ padding: 12 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>Loading live ranges…</div>
          ) : (
            <RangeLeaderboard data={data} you={you} />
          )}
        </div>
      </div>

      {summary && (summary.leads || []).length > 0 && (
        <div style={{ borderRadius: 16, border: '1.5px solid var(--line)', background: 'var(--card-bg)', overflow: 'hidden', animation: 'lp-rise .35s ease' }}>
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)' }}>📋 My Verified Leads Today</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{summary.qualified_leads} of {summary.leads.length} leads collected today</div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {summary.leads.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'var(--bg)', border: '1.5px solid var(--line)' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: l.qualified ? '#16a34a' : 'var(--ink-soft)', flexShrink: 0 }}>{l.qualified ? '✓' : '✗'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.donor_name}{l.donor_mobile ? ` · ${l.donor_mobile}` : ''}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: l.qualified ? '#16a34a' : 'var(--ink-soft)', flexShrink: 0 }}>₹{fmt(l.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}