import { useEffect, useMemo, useState, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/auth.js';


function SelectOption({ selected, muted, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <div role="option" aria-selected={selected} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, color: muted ? '#64748b' : '#0f172a', background: hover ? '#f1f5f9' : (selected ? '#eff6ff' : 'transparent'), transition: 'background .12s' }}>
      {children}
      {selected && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) { setSearch(''); return undefined; }
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // Flip upwards when there is not enough room below inside the modal.
      setDropUp(window.innerHeight - rect.bottom < 240 && rect.top > 240);
    }
    setOpen(!open);
  };

  const list = options || [];
  const filtered = list.filter(w => !search || (w.name || '').toLowerCase().includes(search.toLowerCase()));
  const selected = list.find(w => String(w.id) === String(value));

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 130 }}>
      <button type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 7px', minHeight: 28, borderRadius: 6, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', background: '#fff', border: open ? '1px solid #2563eb' : '1px solid #dbe3ec', boxShadow: open ? '0 0 0 2px rgba(37,99,235,.12)' : 'none', transition: 'border-color .15s, box-shadow .15s' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: selected ? 600 : 400, color: selected ? '#0f172a' : '#94a3b8' }}>
          {selected ? selected.name : (placeholder || 'Unassigned')}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, ...(dropUp ? { bottom: '100%', marginBottom: 3 } : { top: '100%', marginTop: 3 }), background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 10px 28px rgba(15,23,42,.16)', zIndex: 400, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderBottom: '1px solid #eef2f7', background: '#f8fafc' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search FRO…" autoFocus
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 11.5, fontFamily: 'inherit', color: '#0f172a' }} />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                style={{ border: 'none', background: '#e2e8f0', color: '#475569', width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
          <div role="listbox" style={{ maxHeight: 160, overflowY: 'auto', padding: 3 }}>
            <SelectOption selected={!value} muted onClick={() => { onChange(''); setOpen(false); }}>
              <span style={{ flex: 1 }}>Unassigned</span>
            </SelectOption>
            {filtered.map(w => (
              <SelectOption key={w.id} selected={String(w.id) === String(value)} onClick={() => { onChange(w.id); setOpen(false); }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
              </SelectOption>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px 6px', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>No FROs match “{search}”</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// Stacks must always render in numeric order (Stack 1, 2, 3 … 10) and never
// re-order after an assignment refresh. Extract the trailing number so
// "Stack 10" sorts after "Stack 9" (a plain string sort would put it first).
function stackNumber(name) {
  const m = String(name || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function sortStacks(list) {
  return [...(list || [])].sort((a, b) => {
    const na = stackNumber(a?.name);
    const nb = stackNumber(b?.name);
    if (na !== nb) return na - nb;
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true });
  });
}

function formatHistoryDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function DonorStacksModal({ target, froWorkers = [], onClose, onGranted }) {
  const [tab, setTab] = useState('normal');
  const [donors, setDonors] = useState([]);
  const [stacks, setStacks] = useState([]);
  const [stackedDonorMap, setStackedDonorMap] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [newStackName, setNewStackName] = useState('');
  const [selectedStackId, setSelectedStackId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState('all'); // all | pending | dispositioned
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [countMsg, setCountMsg] = useState(null);
  const [detailStack, setDetailStack] = useState(null);
  const [activeStackId, setActiveStackId] = useState('');
  const [detailMembers, setDetailMembers] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFilter, setDetailFilter] = useState('all'); // all | pending
  const [tempGrants, setTempGrants] = useState([]);
  const [froSearch, setFroSearch] = useState('');
  const [historyStack, setHistoryStack] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const station = target?.station;
  const ngoId = target?.ngoId;
  // Only active FROs, with search filter.
  const activeFros = (froWorkers || []).filter(w => w.is_active !== false && w.employment_status !== 'terminated');
  const filteredFros = froSearch.trim()
    ? activeFros.filter(w => (w.name || '').toLowerCase().includes(froSearch.toLowerCase()))
    : activeFros;

  // Render order is derived, never stored — so an assignment refresh can never
  // shuffle the stack rows around. Always Stack 1 → Stack 2 → … → Stack 10.
  const orderedStacks = useMemo(() => sortStacks(stacks), [stacks]);
  const nextStackNumber = useMemo(
    () => orderedStacks.reduce((max, st) => Math.max(max, stackNumber(st.name) === Number.MAX_SAFE_INTEGER ? 0 : stackNumber(st.name)), 0) + 1,
    [orderedStacks],
  );

  const loadAll = async () => {
    // NOTE: do NOT setLoading(true) here on refresh — it blanks the whole modal
    // body ("Loading…") and reads as the modal closing/reopening. Only the
    // initial mount uses the loading flag (set in the mount effect below).
    try {
      const [allRes, stacksRes, grantsRes] = await Promise.all([
        apiGet(`/ngo-admin/donors-by-station?station=${encodeURIComponent(station)}&ngo_id=${ngoId}`).catch(() => []),
        apiGet(`/ngo-admin/stacks?station=${encodeURIComponent(station)}&ngo_id=${ngoId}`).catch(() => []),
        apiGet(`/ngo-admin/temporary-access?station=${encodeURIComponent(station)}`).catch(() => []),
      ]);
      const grantsArr = Array.isArray(grantsRes) ? grantsRes : (grantsRes?.assignments || grantsRes?.grants || []);
      const stacksArr = Array.isArray(stacksRes) ? stacksRes : (stacksRes?.stacks || []);
      setDonors(Array.isArray(allRes) ? allRes : (allRes?.donors || []));
      setStacks(sortStacks(stacksArr));
      setTempGrants(grantsArr);
      // Fetch members in background to build stackedDonorMap (non-blocking).
      (async () => {
        const memberMap = {};
        await Promise.all(stacksArr.map(async (st) => {
          try {
            const m = await apiGet(`/ngo-admin/stacks/${st.id}/members`);
            for (const mem of (m?.members || [])) memberMap[mem.donor_id] = st.name;
          } catch { /* ignore */ }
        }));
        setStackedDonorMap(memberMap);
      })();
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (station) loadAll(); }, [station, ngoId]);
  useEffect(() => { if (!ngoId) setError('No NGO linked to this station. Select an NGO first.'); }, [ngoId]);

  const currentDonors = donors.filter(d => {
    const isStacked = !!stackedDonorMap[d.donor_id || d.id];
    const isPending = d.status === 'pending' || d.status === null || d.status === '';
    if (listFilter === 'unstacked' && isStacked) return false;
    if (listFilter === 'dispositioned' && (isPending || isStacked)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (d.name || d.donor_name || '').toLowerCase().includes(q) || (d.mobile_number || d.donor_mobile || '').includes(q);
  });

  const inStacks = stacks.reduce((s, st) => s + (st.member_count || 0), 0);
  const total = donors.length;
  const remaining = total - inStacks;

  const toggleSelect = (donor) => {
    const id = donor.donor_id || donor.id;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === currentDonors.length) setSelected(new Set());
    else setSelected(new Set(currentDonors.map(d => d.donor_id || d.id)));
  };

  const addToStack = async () => {
    if (selected.size === 0) { setError('Select at least one donor'); return; }
    const n = selected.size;
    const rows = [...document.querySelectorAll('#donorList .donor-row')].filter(r => r.querySelector('input')?.checked);
    rows.forEach(r => r.classList.add('removing'));
    const stackSelect = document.getElementById('stackSelect');
    const targetStackId = stackSelect?.value || (stacks.length > 0 ? stacks[0].id : null);
    const targetEl = targetStackId ? document.querySelector(`[data-stack-id="${targetStackId}"]`) : document.querySelector('.stack');
    if (targetEl) {
      rows.forEach(r => {
        const rect = r.getBoundingClientRect();
        const tok = document.createElement('div');
        tok.className = 'flying-card';
        tok.textContent = r.querySelector('.name')?.textContent || '';
        tok.style.left = rect.left + 'px';
        tok.style.top = rect.top + 'px';
        tok.style.opacity = '1';
        document.body.appendChild(tok);
        const srect = targetEl.getBoundingClientRect();
        requestAnimationFrame(() => {
          tok.style.left = (srect.left + srect.width/2 - 40) + 'px';
          tok.style.top = (srect.top + srect.height/2 - 10) + 'px';
          tok.style.opacity = '0.3';
          tok.style.transform = 'scale(0.6)';
        });
        setTimeout(() => tok.remove(), 600);
      });
    }
    let stackId = selectedStackId;
    // Optimistic: bump stack count immediately
    if (stackId) {
      setStacks(prev => prev.map(st => st.id === stackId ? { ...st, member_count: (st.member_count || 0) + n } : st));
    }
    setBusy(true);
    try {
      if (!stackId) {
        setError('Select a stack first (or create one via "+ New empty stack" in Stacks tab)');
        setBusy(false);
        return;
      }
      await apiPost(`/ngo-admin/stacks/${stackId}/members`, { donor_ids: [...selected] });
      setCountMsg(`Added ${n} donors to stack`);
      // Pulse the target stack box (visual feedback).
      if (targetEl) { targetEl.classList.add('zuup'); setTimeout(() => targetEl.classList.remove('zuup'), 500); }

      // Wait for flying-card animation to finish, then refresh data via React state
      // (no DOM manipulation — React handles count bar + stack counts).
      await loadAll();
      setSelected(new Set());
    } catch (e) { console.error('addToStack failed:', e); setError(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const removeStack = async (stackId) => {
    if (!window.confirm('Remove this stack? Members return to unassigned pool.')) return;
    setBusy(true);
    try {
      await apiDelete(`/ngo-admin/stacks/${stackId}`);
      // Optimistic update — don't wait for slow loadAll
      setStacks(prev => prev.filter(s => s.id !== stackId));
      setCountMsg('Stack removed');
    } catch (e) { setError(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const assignFro = async (stackId, froId) => {
    if (froId === undefined || froId === null) return;
    setBusy(true);
    // Optimistic update: immediately reflect the new FRO in the UI.
    const selectedFro = froWorkers.find(w => String(w.id) === String(froId));
    setStacks(prev => prev.map(st => st.id === stackId
      ? { ...st, fro_worker_id: froId || null, fro_name: froId ? (selectedFro?.name || null) : null }
      : st
    ));
    try {
      await apiPost(`/ngo-admin/stacks/${stackId}/assign-fro`, { fro_worker_id: froId || null });
      setCountMsg(froId ? 'Stack assigned to FRO' : 'Stack unassigned');
      onGranted?.();
      // Background refresh to sync with server (non-blocking).
      loadAll().catch(() => {});
    } catch (e) { setError(e?.message || 'Failed'); loadAll().catch(() => {}); }
    finally { setBusy(false); }
  };

  const viewStack = async (st) => {
    setDetailStack(st);
    setDetailMembers([]);
    setDetailLoading(true);
    try {
      const res = await apiGet(`/ngo-admin/stacks/${st.id}/members`);
      setDetailMembers(Array.isArray(res?.members) ? res.members : []);
    } catch (e) { setError(e?.message || 'Failed to load members'); }
    finally { setDetailLoading(false); }
  };

  const removeMember = async (stackId, donorId) => {
    setBusy(true);
    setDetailLoading(true); // spinner in drawer
    // Optimistic: decrement stack count immediately
    setStacks(prev => prev.map(st => st.id === stackId ? { ...st, member_count: Math.max(0, (st.member_count || 0) - 1) } : st));
    // Optimistic: remove donor from stackedDonorMap so it becomes unstacked instantly
    setStackedDonorMap(prev => { const m = { ...prev }; delete m[donorId]; return m; });
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ''}/ngo-admin/stacks/${stackId}/members?donor_ids=${donorId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ucs_token')}` },
      });
      // Re-fetch ONLY the drawer members (no full loadAll — avoids modal refresh feel).
      const res = await apiGet(`/ngo-admin/stacks/${stackId}/members`);
      setDetailMembers(Array.isArray(res?.members) ? res.members : []);
      setCountMsg('Donor removed — now selectable in the All donors list');
      // NO loadAll here: donors array unchanged (donor was already in it, just greyed).
      // stackedDonorMap already updated optimistically → donor shows selectable instantly.
    } catch (e) {
      console.error('removeMember failed:', e);
      setError(e?.message || 'Failed');
    } finally { setBusy(false); setDetailLoading(false); }
  };

  const closeDetail = () => { setDetailStack(null); setDetailMembers([]); };

  const openHistory = async (st) => {
    setHistoryStack(st);
    setHistoryRows([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await apiGet(`/ngo-admin/stacks/${st.id}/fro-history`);
      setHistoryRows(Array.isArray(res?.history) ? res.history : []);
    } catch (e) {
      setHistoryError(e?.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => { setHistoryStack(null); setHistoryRows([]); setHistoryError(null); };

  const animCss = `
    @keyframes slideIn { from { transform:translateX(-20px); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes zuup { 0%{transform:scale(1) translateY(0) rotate(0deg)} 25%{transform:scale(1.2) translateY(-12px) rotate(-3deg)} 50%{transform:scale(1.1) translateY(-6px) rotate(2deg)} 75%{transform:scale(1.05) translateY(-2px) rotate(-1deg)} 100%{transform:scale(1) translateY(0) rotate(0deg)} }
    @keyframes countBump { 0%{transform:scale(1)} 50%{transform:scale(1.4);color:#16a34a} 100%{transform:scale(1)} }
    .donor-row.anim { animation: slideIn .3s ease; }
    .stack.zuup { animation: zuup .5s cubic-bezier(.2,.8,.2,1); }
    .count.bump { animation: countBump .4s ease; }
    .donor-row.removing { opacity:0; transform:translateX(-30px); height:0; padding:0; margin:0; border:none; overflow:hidden; transition:all .3s ease; }
    .flying-card { position:fixed; pointer-events:none; z-index:999; background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; border:1px solid #1d4ed8; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:600; box-shadow:0 6px 20px rgba(37,99,235,.4); transition: all .5s cubic-bezier(.2,.9,.3,1); display:flex; align-items:center; gap:6px; }
    .flying-card::after { content:'→'; font-size:14px; font-weight:800; }
    .stack-row { transition: border-color .15s, box-shadow .15s, background .15s; }
    .stack-row:not(.active):hover { border-color:#c7d2fe !important; box-shadow:0 2px 10px rgba(15,23,42,.07); }
    .stack-action { width:28px; height:28px; padding:0; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; border:1px solid #e2e8f0; background:#fff; color:#475569; transition: background .15s, border-color .15s, color .15s, transform .15s; flex-shrink:0; }
    .stack-action:hover { transform:translateY(-1px); }
    .stack-action.view { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
    .stack-action.view:hover { background:#dbeafe; }
    .stack-action.history { background:#f8fafc; border-color:#e2e8f0; color:#475569; }
    .stack-action.history:hover { background:#f1f5f9; color:#0f172a; }
    .stack-action.remove { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
    .stack-action.remove:hover { background:#fee2e2; }
    .new-stack-tile { transition: border-color .15s, background .15s, color .15s; }
    .new-stack-tile:hover { border-color:#2563eb !important; background:#eff6ff !important; color:#1d4ed8 !important; }
    .modal-close { width:30px; height:30px; border-radius:50%; border:none; background:transparent; color:#64748b; cursor:pointer; font-size:17px; display:flex; align-items:center; justify-content:center; transition:background .15s, color .15s; line-height:1; }
    .modal-close:hover { background:#f1f5f9; color:#0f172a; }
  `;

  return (
    <>
    <style>{animCss}</style>
    <div className="modal-overlay" onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width:960, maxWidth:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ padding:'15px 20px', borderBottom:'1px solid #edf1f5', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff' }}>
          <div>
            <h3 style={{ fontSize:15.5, fontWeight:700, color:'#0f172a' }}>Donor Stacks — {station}</h3>
            <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Group donors into stacks and assign each stack to an FRO.</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ padding:'16px 20px', overflow:'auto', flex:1, minHeight:0 }}>
          {/* Count bar */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10, marginBottom:14 }}>
            <div style={{ padding:'9px 12px', borderRadius:9, background:'#f8fafc', border:'1px solid #e8eef5' }}>
              <div style={{ fontSize:17, fontWeight:800, color:'#0f172a', lineHeight:1.15 }}>{total}</div>
              <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>Total donors</div>
            </div>
            <div style={{ padding:'9px 12px', borderRadius:9, background:'#eff6ff', border:'1px solid #dbeafe' }}>
              <div style={{ fontSize:17, fontWeight:800, color:'#1d4ed8', lineHeight:1.15 }}>{inStacks}</div>
              <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>In stacks</div>
            </div>
            <div style={{ padding:'9px 12px', borderRadius:9, background:'#fffbeb', border:'1px solid #fde68a' }}>
              <div style={{ fontSize:17, fontWeight:800, color:'#b45309', lineHeight:1.15 }}>{remaining}</div>
              <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>Remaining (unstacked)</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, borderBottom:'1px solid #e5e7eb', marginBottom:14 }}>
            <button onClick={() => setTab('normal')} style={{ padding:'8px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, fontWeight:600, color: tab==='normal' ? '#2563eb' : '#64748b', borderBottom: tab==='normal' ? '2px solid #2563eb' : '2px solid transparent' }}>All donors</button>
            <button onClick={() => setTab('stacks')} style={{ padding:'8px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, fontWeight:600, color: tab==='stacks' ? '#2563eb' : '#64748b', borderBottom: tab==='stacks' ? '2px solid #2563eb' : '2px solid transparent' }}>Stacks ({stacks.length})</button>
          </div>

          {error && <div style={{ color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 10px', fontSize:12.5, marginBottom:10 }}>{error}</div>}
          {countMsg && <div style={{ color:'#166534', background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:6, padding:'8px 10px', fontSize:12.5, marginBottom:10 }}>{countMsg}</div>}

          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--ink-soft)' }}>Loading…</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 44px 1fr', gap:0 }}>
              {/* LEFT: donor list */}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
                  <input type="text" placeholder="Search donor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex:1, minWidth:180, padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12 }} />
                <select value={listFilter} onChange={e => setListFilter(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #e5e7eb', fontSize:11, background:'#fff' }}>
                  <option value="all">All ({donors.length})</option>
                  <option value="unstacked">Unstacked ({donors.filter(d => !stackedDonorMap[d.donor_id || d.id]).length})</option>
                  <option value="dispositioned">Dispositioned ({donors.filter(d => d.status && d.status !== 'pending' && d.status !== '' && d.status !== null).length})</option>
                </select>
                  <button onClick={toggleAll} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', fontSize:11, cursor:'pointer' }}>
                    {selected.size === currentDonors.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <select value={selectedStackId} onChange={e => setSelectedStackId(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #e5e7eb', fontSize:11 }}>
                    <option value="">Select stack…</option>
                    {orderedStacks.map(st => <option key={st.id} value={st.id}>{st.name} ({st.member_count || 0})</option>)}
                  </select>
                </div>
                <div id="donorList" style={{ border:'1px solid #e5e7eb', borderRadius:8, maxHeight:420, overflow:'auto' }}>
                  {currentDonors.length === 0 ? (
                    <div style={{ padding:24, textAlign:'center', color:'#64748b' }}>No donors</div>
                  ) : currentDonors.map(d => (
                    <div key={d.id} className="donor-row" style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid #f1f5f9', fontSize:12.5, opacity: stackedDonorMap[d.donor_id || d.id] ? 0.45 : 1, background: stackedDonorMap[d.donor_id || d.id] ? '#f1f5f9' : 'transparent' }}>
                      <input type="checkbox" disabled={!!stackedDonorMap[d.donor_id || d.id]} checked={selected.has(d.donor_id || d.id)} onChange={() => toggleSelect(d)} />
                      <span style={{ flex:1, fontWeight:500, opacity: stackedDonorMap[d.donor_id || d.id] ? 0.5 : 1 }}>{d.name || d.donor_name}</span>
                      <span style={{ color:'#64748b', fontSize:11 }}>{d.station} · {d.status}</span>
                      {stackedDonorMap[d.donor_id || d.id] && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'#bbf7d0', color:'#166534', fontWeight:600 }}>in {stackedDonorMap[d.donor_id || d.id]}</span>}
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background: d.batch_type === 'high_tier' ? '#fef3c7' : '#e2e8f0', color: d.batch_type === 'high_tier' ? '#92400e' : '#334155' }}>
                        {d.batch_type || 'normal'}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'#64748b', marginTop:6 }}>
                  Showing {currentDonors.length} donors (all)
                </div>
                {/* Move button removed — functionality moved to middle arrow. */}
              </div>

              {/* MIDDLE: arrow */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToStack(); }} disabled={busy || selected.size === 0}
                  style={{ width:36, height:36, borderRadius:'50%', border:'2px solid #2563eb', background: (busy || selected.size === 0) ? '#93c5fd' : '#2563eb', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, cursor: (busy || selected.size === 0) ? 'not-allowed' : 'pointer', opacity: (busy || selected.size === 0) ? 0.5 : 1 }}>
                  →
                </button>
              </div>

              {/* RIGHT: stacks */}
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>Stacks</div>
                {/* Per-stack FRO search is inside each stack row below. */}
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {orderedStacks.map(st => {
                    const active = activeStackId === st.id;
                    return (
                      <div key={st.id} data-stack-id={st.id} onClick={() => { setActiveStackId(st.id); setSelectedStackId(st.id); }}
                        className={`stack-row${active ? ' active' : ''}`}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 9px', border: active ? '1px solid #86efac' : '1px solid #e5e7eb', borderRadius:8, background: active ? '#f0fdf4' : '#fff', cursor:'pointer', boxShadow: active ? '0 0 0 3px rgba(22,163,74,.10)' : undefined }}>
                        <div style={{ fontWeight:700, fontSize:12, color:'#0f172a', minWidth:58, whiteSpace:'nowrap' }}>{st.name}</div>
                        <div title={`${st.member_count || 0} donors in this stack`} style={{ fontSize:14, fontWeight:800, color:'#2563eb', minWidth:34, textAlign:'center', padding:'2px 5px', borderRadius:6, background: active ? '#fff' : '#f8fafc', border:'1px solid #eef2f7' }}>{st.member_count || 0}</div>
                        <SearchableSelect
                          options={activeFros}
                          value={st.fro_worker_id || ''}
                          onChange={(val) => assignFro(st.id, val)}
                          placeholder="Unassigned"
                        />
                        <button className="stack-action view" onClick={() => viewStack(st)} title={`View ${st.member_count || 0} donors`} aria-label={`View donors in ${st.name}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button className="stack-action history" onClick={(e) => { e.stopPropagation(); openHistory(st); }} title="Assignment history" aria-label={`Assignment history for ${st.name}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 3-6.7" />
                            <polyline points="3 4 3 9 8 9" />
                            <polyline points="12 7 12 12 15.5 14" />
                          </svg>
                        </button>
                        <button className="stack-action remove" onClick={() => removeStack(st.id)} title="Remove stack" aria-label={`Remove ${st.name}`}>✕</button>
                      </div>
                    );
                  })}
                  <div onClick={async () => {
                    if (busy) return;
                    if (!ngoId) { setError('No NGO linked to this station'); return; }
                    setBusy(true);
                    try {
                      const nextNum = nextStackNumber;
                      const res = await apiPost('/ngo-admin/stacks', { ngo_id: ngoId, station, name: `Stack ${nextNum}`, stack_type: 'normal', donor_ids: [] });
                      // Optimistic update — don't wait for slow loadAll
                      const newStack = res?.stack || { id: res?.id, ngo_id: ngoId, station, name: `Stack ${nextNum}`, stack_type: 'normal', fro_worker_id: null, member_count: 0 };
                      setStacks(prev => sortStacks([...prev, newStack]));
                      setCountMsg(`Created empty stack "Stack ${nextNum}"`);
                    } catch (e) { console.error('create stack failed:', e); setError(e?.message || 'Failed to create stack'); }
                    finally { setBusy(false); }
                  }} className="new-stack-tile" style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:10, border:'2px dashed #cbd5e1', borderRadius:8, background:'#f8fafc', color:'#64748b', fontSize:11.5, fontWeight:600, cursor:'pointer', minHeight:38 }}>
                    + New empty stack
                  </div>

                  {/* Temp Access Grants (revoke from here) */}
                  {tempGrants.length > 0 && (
                    <div style={{ marginTop:10, padding:'10px 12px', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>Temp Access Grants on {station} ({tempGrants.filter(g => g.status === 'ACTIVE' || g.status === 'SCHEDULED').length})</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {tempGrants.filter(g => g.status === 'ACTIVE' || g.status === 'SCHEDULED').map(g => (
                          <span key={g.id} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, background:'#eff6ff', border:'1px solid #bfdbfe', fontSize:10.5, fontWeight:600, color:'#1d4ed8' }}>
                            {g.working_fro_name || 'FRO'} · {g.scope_type === 'STATION_HIGH_TIER' ? 'HT' : g.scope_type === 'STATION_NORMAL' ? 'Normal' : 'All'}
                            {g.allowed_count ? ` · ${g.allowed_count}` : ''}
                            <button onClick={async () => {
                              if (!window.confirm(`Revoke ${g.working_fro_name || 'this FRO'}'s access to ${station}?`)) return;
                              try {
                                await apiPost(`/ngo-admin/temporary-access/${g.id}/revoke`, { reason: 'Revoked from stacks modal' });
                                await loadAll();
                                setCountMsg('Grant revoked');
                              } catch (e) { setError(e?.message || 'Failed'); }
                            }} style={{ border:'none', background:'transparent', color:'#b91c1c', cursor:'pointer', fontWeight:800, fontSize:11, padding:0, marginLeft:2 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid #e5e7eb', display:'flex', gap:8, justifyContent:'flex-end', background:'#f8fafc' }}>
          <button onClick={onClose} style={{ padding:'8px 14px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>Close</button>
        </div>
      </div>

      {/* Detail overlay */}
      {detailStack && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000 }} onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:600, maxWidth:'95vw', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 70px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3 style={{ fontSize:16, fontWeight:700 }}>{detailStack.name} — {detailStack.member_count || 0} donors</h3>
              <button onClick={closeDetail} style={{ border:'none', background:'transparent', fontSize:20, cursor:'pointer', color:'#64748b' }}>✕</button>
            </div>
            <div style={{ padding:'16px 20px', overflow:'auto', flex:1 }}>
              {detailLoading ? (
                <div style={{ textAlign:'center', padding:24, color:'#64748b' }}>Loading…</div>
              ) : detailMembers.length === 0 ? (
                <div style={{ textAlign:'center', padding:24, color:'#64748b' }}>No members</div>
              ) : (
                <>
                <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                  <button onClick={() => setDetailFilter('all')} style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid #e5e7eb', background: detailFilter==='all' ? '#2563eb' : '#fff', color: detailFilter==='all' ? '#fff' : '#334155', cursor:'pointer' }}>All ({detailMembers.length})</button>
                  <button onClick={() => setDetailFilter('pending')} style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid #e5e7eb', background: detailFilter==='pending' ? '#2563eb' : '#fff', color: detailFilter==='pending' ? '#fff' : '#334155', cursor:'pointer' }}>Pending ({detailMembers.filter(m => m.donor_status === 'pending').length})</button>
                </div>
                <div style={{ border:'1px solid #e5e7eb', borderRadius:8 }}>
                  {detailMembers.filter(m => detailFilter === 'all' || m.donor_status === 'pending').map(m => (
                    <div key={m.donor_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid #f1f5f9', fontSize:12.5 }}>
                      <span style={{ flex:1, fontWeight:500 }}>{m.donor_name || `Donor ${m.donor_id}`}</span>
                      <span style={{ color:'#64748b', fontSize:11 }}>{m.mobile_number || ''}</span>
                      <button onClick={() => removeMember(detailStack.id, m.donor_id)} disabled={busy}
                        style={{ padding:'2px 8px', fontSize:10, borderRadius:4, border:'1px solid #fecaca', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }}>
                        ✕ Remove
                      </button>
                    </div>
                  ))}
                </div>
                </>
              )}
              <div style={{ fontSize:11, color:'#64748b', marginTop:6 }}>Showing {detailMembers.filter(m => detailFilter === 'all' || m.donor_status === 'pending').length} of {detailStack.member_count || 0}</div>
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid #e5e7eb', display:'flex', gap:8, justifyContent:'flex-end', background:'#f8fafc' }}>
              <button onClick={closeDetail} style={{ padding:'8px 14px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* FRO assignment history overlay */}
      {historyStack && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10001 }} onClick={closeHistory}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:540, maxWidth:'95vw', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 70px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:700 }}>{historyStack.name} — Assignment history</h3>
                <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                  Currently: {historyStack.fro_name || 'unassigned'}
                </div>
              </div>
              <button onClick={closeHistory} style={{ border:'none', background:'transparent', fontSize:20, cursor:'pointer', color:'#64748b', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'16px 20px', overflow:'auto', flex:1 }}>
              {historyError && (
                <div style={{ color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 10px', fontSize:12, marginBottom:10 }}>{historyError}</div>
              )}
              {historyLoading ? (
                <div style={{ textAlign:'center', padding:24, color:'#64748b' }}>Loading…</div>
              ) : historyRows.length === 0 ? (
                <div style={{ textAlign:'center', padding:28, color:'#64748b' }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>🕘</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#334155' }}>No assignment history yet</div>
                  <div style={{ fontSize:11.5, marginTop:4 }}>
                    Whenever this stack is assigned or reassigned to an FRO, it will be recorded here.
                  </div>
                </div>
              ) : (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:8 }}>
                  {historyRows.map(row => {
                    const isOpen = !row.unassigned_at;
                    return (
                      <div key={row.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderBottom:'1px solid #f1f5f9' }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background: isOpen ? '#dcfce7' : '#f1f5f9', color: isOpen ? '#166534' : '#64748b', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, fontWeight:600 }}>
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.fro_name || 'Unknown FRO'}</span>
                            {isOpen && <span style={{ fontSize:9.5, padding:'1px 6px', borderRadius:999, background:'#dcfce7', color:'#166534', fontWeight:700 }}>CURRENT</span>}
                          </div>
                          <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                            Assigned {formatHistoryDate(row.assigned_at)}
                          </div>
                          <div style={{ fontSize:11, color:'#64748b' }}>
                            {row.unassigned_at
                              ? `${row.unassigned_reason === 'reassigned' ? 'Reassigned' : 'Unassigned'} ${formatHistoryDate(row.unassigned_at)}`
                              : 'Still assigned'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid #e5e7eb', display:'flex', gap:8, justifyContent:'flex-end', background:'#f8fafc' }}>
              <button onClick={closeHistory} style={{ padding:'8px 14px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}