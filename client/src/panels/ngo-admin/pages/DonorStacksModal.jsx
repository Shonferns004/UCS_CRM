import { useEffect, useMemo, useState, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/auth.js';


function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const ref = (typeof useRef !== 'undefined') ? useRef(null) : null;
  // fallback if useRef not imported
  useEffect(() => {
    if (!open) { setSearch(''); return; }
    const handler = (e) => { if (ref && ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const filtered = (options || []).filter(w =>
    !search || (w.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const selected = (options || []).find(w => String(w.id) === String(value));
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: '4px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: '#fff', border: '1px solid #e5e7eb', minHeight: 24 }}>
        <span style={{ color: selected ? 'inherit' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : (placeholder || '— unassigned —')}
        </span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 300, overflow: 'hidden', top: '100%', marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderBottom: '1px solid #e5e7eb' }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search FRO..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 10, fontFamily: 'inherit', background: 'transparent' }}
              autoFocus />
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            <div onClick={() => { onChange(''); setOpen(false); }}
              style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
              — unassigned —
            </div>
            {filtered.map(w => (
              <div key={w.id} onClick={() => { onChange(w.id); setOpen(false); }}
                style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer', background: String(w.id) === String(value) ? '#f0fdf4' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={e => e.currentTarget.style.background = String(w.id) === String(value) ? '#f0fdf4' : 'transparent'}>
                {w.name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px', fontSize: 10, color: '#64748b', textAlign: 'center' }}>No FROs match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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

  const station = target?.station;
  const ngoId = target?.ngoId;
  // Only active FROs, with search filter.
  const activeFros = (froWorkers || []).filter(w => w.is_active !== false && w.employment_status !== 'terminated');
  const filteredFros = froSearch.trim()
    ? activeFros.filter(w => (w.name || '').toLowerCase().includes(froSearch.toLowerCase()))
    : activeFros;

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
      setStacks(stacksArr);
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
  `;

  return (
    <>
    <style>{animCss}</style>
    <div className="modal-overlay" onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width:960, maxWidth:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:16, fontWeight:700 }}>Donor Stacks — {station}</h3>
          <button onClick={onClose} style={{ border:'none', background:'transparent', fontSize:22, cursor:'pointer', color:'#64748b', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px', overflow:'auto', flex:1, minHeight:0 }}>
          {/* Count bar */}
          <div style={{ display:'flex', gap:12, padding:'10px 12px', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:8, marginBottom:14, fontSize:12 }}>
            <div style={{ display:'flex', flexDirection:'column' }}><b style={{ fontSize:16 }}>{total}</b><span style={{ color:'#64748b', fontSize:10 }}>Total donors</span></div>
            <div style={{ display:'flex', flexDirection:'column' }}><b style={{ fontSize:16 }}>{inStacks}</b><span style={{ color:'#64748b', fontSize:10 }}>In stacks</span></div>
            <div style={{ display:'flex', flexDirection:'column' }}><b style={{ fontSize:16 }}>{remaining}</b><span style={{ color:'#64748b', fontSize:10 }}>Remaining (unstacked)</span></div>
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
                    {stacks.map(st => <option key={st.id} value={st.id}>{st.name} ({st.member_count || 0})</option>)}
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
                  {stacks.map(st => (
                    <div key={st.id} data-stack-id={st.id} onClick={() => { setActiveStackId(st.id); setSelectedStackId(st.id); }} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border: activeStackId === st.id ? '2px solid #16a34a' : '1px solid #e5e7eb', borderRadius:8, background: activeStackId === st.id ? '#f0fdf4' : '#fff', cursor:'pointer', transition:'all .15s' }}>
                      <div style={{ fontWeight:700, fontSize:13, minWidth:80 }}>{st.name}</div>
                      {/* Unassigned badge removed — dropdown already shows "— unassigned —" */}
                      <div style={{ fontSize:20, fontWeight:800, color:'#2563eb', minWidth:40, textAlign:'center' }}>{st.member_count || 0}</div>
                      <SearchableSelect
                        options={activeFros}
                        value={st.fro_worker_id || ''}
                        onChange={(val) => assignFro(st.id, val)}
                        placeholder="— unassigned —"
                      />
                      <button onClick={() => viewStack(st)} title={`View ${st.member_count || 0} donors`} style={{ padding:'5px 12px', fontSize:11, borderRadius:6, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>👁 View</button>
                      <button onClick={() => removeStack(st.id)} style={{ padding:'5px 10px', fontSize:11, borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', color:'#b91c1c', cursor:'pointer', fontWeight:600 }} title="Remove stack">✕</button>
                    </div>
                  ))}
                  <div onClick={async () => {
                    if (busy) return;
                    if (!ngoId) { setError('No NGO linked to this station'); return; }
                    setBusy(true);
                    try {
                      const nextNum = (stacks.length || 0) + 1;
                      const res = await apiPost('/ngo-admin/stacks', { ngo_id: ngoId, station, name: `Stack ${nextNum}`, stack_type: 'normal', donor_ids: [] });
                      // Optimistic update — don't wait for slow loadAll
                      const newStack = res?.stack || { id: res?.id, ngo_id: ngoId, station, name: `Stack ${nextNum}`, stack_type: 'normal', fro_worker_id: null, member_count: 0 };
                      setStacks(prev => [...prev, newStack]);
                      setCountMsg(`Created empty stack "Stack ${nextNum}"`);
                    } catch (e) { console.error('create stack failed:', e); setError(e?.message || 'Failed to create stack'); }
                    finally { setBusy(false); }
                  }} style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:12, border:'2px dashed #94a3b8', borderRadius:8, background:'#f8fafc', color:'#64748b', fontSize:12, cursor:'pointer', minHeight:44 }}>
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
    </div>
    </>
  );
}