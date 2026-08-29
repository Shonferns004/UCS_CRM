import { useEffect, useRef } from 'react';

const PROJECT_COLORS = { bsct: '#2563eb', aflf: '#dc2626', mann: '#7c3aed' };
const PROJECT_LABELS = { bsct: 'BSCT', aflf: 'AFLF', mann: 'MANN' };

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const MAX_VISIBLE = 5;

export default function SuspenseToast({ entries, onDismiss, onNavigate }) {
  const timersRef = useRef(new Map());

  useEffect(() => {
    entries.forEach(t => {
      if (!timersRef.current.has(t._toastId)) {
        const timer = setTimeout(() => onDismiss(t._toastId), 8000);
        timersRef.current.set(t._toastId, timer);
      }
    });
    return () => {};
  }, [entries, onDismiss]);

  useEffect(() => {
    const current = new Set(entries.map(t => t._toastId));
    for (const [id, timer] of timersRef.current) {
      if (!current.has(id)) { clearTimeout(timer); timersRef.current.delete(id); }
    }
  }, [entries]);

  const visible = entries.slice(-MAX_VISIBLE);

  return (
    <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', pointerEvents:'none' }}>
      <style>{`
        @keyframes suspense-toast-in {
          from { opacity:0; transform: translateY(-110%); }
          to { opacity:1; transform: translateY(0); }
        }
        @keyframes suspense-toast-out {
          from { opacity:1; transform: translateY(0); }
          to { opacity:0; transform: translateY(-110%); }
        }
      `}</style>
      {visible.map((t, i) => {
        const idx = visible.length - 1 - i;
        const scale = 1 - idx * 0.04;
        const offsetY = idx * 14;
        const w = 380 - idx * 30;
        const prj = (t.project_id || '').toLowerCase();
        const accent = PROJECT_COLORS[prj] || '#6b7280';
        const prjLabel = PROJECT_LABELS[prj] || (prj || 'N/A').toUpperCase();
        const srcName = t.bank_audit_sources?.name || '';
        const amt = Number(t.amount || 0).toLocaleString('en-IN');
        const payer = t.payer_name || 'Unknown';
        const time = relativeTime(t.created_at);

        return (
          <div
            key={t._toastId}
            onClick={onNavigate}
            style={{
              pointerEvents:'auto',
              cursor:'pointer',
              width: w,
              marginBottom: idx === 0 ? 0 : -60,
              transform: `scale(${scale}) translateY(${offsetY}px)`,
              zIndex: 10 - idx,
              position:'relative',
              transition: 'transform 0.35s cubic-bezier(.4,0,.2,1), width 0.35s cubic-bezier(.4,0,.2,1)',
              animation: 'suspense-toast-in 0.4s cubic-bezier(.4,0,.2,1) forwards',
            }}
          >
            <div style={{
              background:'#fff',
              borderRadius:12,
              boxShadow: idx === 0 ? '0 8px 32px rgba(0,0,0,0.14)' : '0 4px 16px rgba(0,0,0,0.08)',
              overflow:'hidden',
              borderLeft: `4px solid ${accent}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px 6px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:accent, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:600, color:'#1a1a2e', letterSpacing:0.3 }}>New Suspense Entry</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(t._toastId); }}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:2, display:'flex', color:'#9ca3af', transition:'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color='#374151'}
                  onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ padding:'0 14px 12px' }}>
                <div style={{ fontSize:20, fontWeight:700, color:'#1a1a2e', marginBottom:4 }}>
                  {'\u20B9'}{amt}
                </div>
                <div style={{ fontSize:14, fontWeight:500, color:'#374151', marginBottom:6 }}>
                  {payer}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#6b7280', flexWrap:'wrap' }}>
                  {srcName && <span>{srcName}</span>}
                  {srcName && <span style={{ color:'#d1d5db' }}>·</span>}
                  <span style={{ fontWeight:600, color:accent }}>{prjLabel}</span>
                  <span style={{ color:'#d1d5db' }}>·</span>
                  <span>{time}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
