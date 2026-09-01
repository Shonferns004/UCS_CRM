import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut, apiPost } from '../api/auth';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_STYLE = {
  Sunday: { bg: '#FDF2E3', fg: '#B45309' },
  Monday: { bg: '#E7F3EC', fg: '#1f6f3f' },
  Tuesday: { bg: '#EAF1FB', fg: '#2563eb' },
  Wednesday: { bg: '#F3E8F8', fg: '#7C3AED' },
  Thursday: { bg: '#FEE2E2', fg: '#DC2626' },
  Friday: { bg: '#ECFDF5', fg: '#059669' },
  Saturday: { bg: '#F0F9FF', fg: '#0284C7' },
};
const ds = (day) => DAY_STYLE[day] || { bg: '#EEF1F5', fg: '#4B5563' };

const fmt = (n) => (n === Infinity ? '∞' : Number(n).toLocaleString('en-IN'));

const Ic = ({ d, size = 14, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}><path d={d} /></svg>
);
const IcPencil = () => <Ic d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />;
const IcTrash = () => <Ic d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />;
const IcCheck = () => <Ic d="M20 6 9 17l-5-5" />;
const IcX = () => <Ic d="M18 6 6 18M6 6l12 12" />;
const IcPlus = () => <Ic d="M12 5v14M5 12h14" />;
const IcReset = () => <Ic d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />;
const IcSave = () => <Ic d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />;
const IcChip = () => <Ic d="M7 21h10v-1H7zM8 3v18h8V3zM10 7h4" />;

// Decorative "sticker" bag of coins (SVG, no external image needed)
const CoinsBag = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.12))' }}>
    {/* sack */}
    <path d="M28 58 C28 30 60 22 60 22 C60 22 92 30 92 58 L92 88 C92 96 86 100 78 100 L42 100 C34 100 28 96 28 88 Z" fill="#c9a227" stroke="#8a6f1f" strokeWidth="3" />
    {/* sack tie */}
    <rect x="50" y="18" width="20" height="10" rx="3" fill="#e3b93f" stroke="#8a6f1f" strokeWidth="2" />
    {/* coins spilling */}
    <circle cx="32" cy="98" r="8" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    <circle cx="24" cy="92" r="7" fill="#ffd166" stroke="#b8860b" strokeWidth="2" />
    <circle cx="40" cy="94" r="7" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    <circle cx="16" cy="86" r="6" fill="#ffd166" stroke="#b8860b" strokeWidth="2" />
    <circle cx="48" cy="90" r="6" fill="#f4d35e" stroke="#b8860b" strokeWidth="2" />
    {/* rupee marks on coins */}
    <text x="30" y="102" fontSize="9" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="23" y="95" fontSize="8" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="39" y="97" fontSize="8" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    <text x="16" y="89" fontSize="7" fill="#8a6f1f" fontWeight="700" textAnchor="middle">₹</text>
    {/* sparkle */}
    <path d="M86 18 L89 26 L97 29 L89 32 L86 40 L83 32 L75 29 L83 26 Z" fill="#ffd166" stroke="#c9a227" strokeWidth="1" />
  </svg>
);

export default function IncentiveSetup() {
  const [slabs, setSlabs] = useState(null);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null); // { day, index }
  const [editVal, setEditVal] = useState({ min: '', max: '', incentive: '' });

  const [newVal, setNewVal] = useState({}); // day -> { min, max, incentive }

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await apiGet('/incentive/aki-config');
      setSlabs(data?.slabs || {});
      setRules(data?.rules || {});
    } catch (e) {
      setErr(e.message || 'Failed to load incentive config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalSlabs = useCallback(() => {
    if (!slabs) return 0;
    return DAY_NAMES.reduce((sum, d) => sum + (slabs[d]?.length || 0), 0);
  }, [slabs]);

  const totalDays = useCallback(() => (slabs ? DAY_NAMES.filter(d => (slabs[d] || []).length > 0).length : 0), [slabs]);

  const topIncentive = useCallback(() => {
    if (!slabs) return 0;
    let max = 0;
    for (const d of DAY_NAMES) {
      for (const r of slabs[d] || []) max = Math.max(max, Number(r.incentive) || 0);
    }
    return max;
  }, [slabs]);

  // Banner "Aaj Ka Incentive" helpers (common for all FROs)
  const now = new Date();
  const todayDayName = DAY_NAMES[now.getDay()];
  const todayLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  const todayShort = todayDayName;
  const todayRanges = (slabs && slabs[todayDayName]) || [];
  const topRangeMin = () => {
    const top = [...todayRanges].sort((a, b) => b.incentive - a.incentive)[0];
    return top ? top.min : 0;
  };

  const startEdit = (day, index, r) => {
    setEditing({ day, index });
    setEditVal({ min: r.min == null ? '' : String(r.min), max: r.max === Infinity || r.max == null ? '' : String(r.max), incentive: String(r.incentive) });
  };

  const saveEdit = () => {
    if (!editing) return;
    const { day, index } = editing;
    const list = [...(slabs[day] || [])];
    const min = editVal.min !== '' ? Number(editVal.min) : null;
    const max = editVal.max !== '' ? Number(editVal.max) : Infinity;
    const incentive = Number(editVal.incentive);
    if (min == null || Number.isNaN(incentive) || max != null && Number.isNaN(max)) { setErr('Enter a valid min, max and incentive.'); return; }
    setErr('');
    list[index] = { min, max, incentive };
    setSlabs(prev => ({ ...prev, [day]: list }));
    setEditing(null);
  };

  const removeSlab = (day, index) => {
    const list = (slabs[day] || []).filter((_, i) => i !== index);
    setSlabs(prev => ({ ...prev, [day]: list }));
    if (editing && editing.day === day && editing.index === index) setEditing(null);
  };

  const addSlab = (day) => {
    const v = newVal[day] || {};
    const min = v.min !== '' && v.min != null ? Number(v.min) : null;
    const max = v.max !== '' && v.max != null ? Number(v.max) : Infinity;
    const incentive = v.incentive != null && v.incentive !== '' ? Number(v.incentive) : null;
    if (min == null || incentive == null || Number.isNaN(min) || Number.isNaN(incentive)) { setErr(`Enter min, max and incentive for ${day}.`); return; }
    setErr('');
    const list = [...(slabs[day] || []), { min, max, incentive }].sort((a, b) => a.min - b.min);
    setSlabs(prev => ({ ...prev, [day]: list }));
    setNewVal(prev => ({ ...prev, [day]: { min: '', max: '', incentive: '' } }));
  };

  const setInput = (key, value) => setEditVal(prev => ({ ...prev, [key]: value }));

  const persistSlabs = async () => {
    await apiPut('/incentive/aki-slabs', { slabs });
  };

  const saveAll = async () => {
    setSaving(true);
    setErr('');
    try {
      await persistSlabs();
      flash('Incentive settings saved.');
    } catch (e) {
      setErr(e.message || 'Failed to save incentive settings');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!window.confirm('Reset all AKI slabs and incentive rules to system defaults?')) return;
    setSaving(true);
    setErr('');
    try {
      const data = await apiPost('/incentive/aki-config/reset', {});
      setSlabs(data?.slabs || {});
      setRules(data?.rules || {});
      flash('Reset to defaults.');
    } catch (e) {
      setErr(e.message || 'Failed to reset config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{`
        @keyframes icFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .ic-card { animation: icFade .35s ease both; }
        .ic-tag { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px 6px 12px; font-size: 13px; font-weight: 600; background: #fff; }
        .ic-btn { border: none; background: transparent; cursor: pointer; color: #9ca3af; padding: 4px 6px; border-radius: 6px; line-height: 1; display: inline-flex; align-items: center; }
        .ic-btn:hover { background: #f3f4f6; color: #374151; }
        .ic-input { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; font-weight: 600; width: 74px; box-sizing: border-box; }
        .ic-input:focus { outline: none; border-color: var(--sage); box-shadow: 0 0 0 3px var(--sage-soft); }
        .ic-day-head { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; }
      `}</style>

      {toast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}
      {err && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{err}</div>
      )}

      {/* Banner hero — Aaj Ka Incentive */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ gridColumn: '1 / -1', border: '2px solid #5B6B4E', background: 'linear-gradient(135deg, #EAF1FB 0%, #E7F3EC 55%, #FDF2E3 100%)', padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="stat-icon" style={{ background: '#5B6B4E', color: '#fff', width: 46, height: 46, borderRadius: 12 }}>
                <IcChip size={24} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Aaj Ka Incentive (AKI)</h1>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, fontWeight: 600 }}>📅 Date : {todayLabel}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {['BSCT', 'AFLF', 'MANN'].map(n => (
                    <span key={n} className="pill" style={{ background: '#fff', color: '#5B6B4E', fontWeight: 700, padding: '3px 10px', fontSize: 12, border: '1px solid #5B6B4E33' }}>{n}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <CoinsBag />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="pill" style={{ background: '#5B6B4E', color: '#fff', fontWeight: 700, padding: '6px 14px', fontSize: 13 }}>{todayShort} slabs</span>
                  <span className="pill" style={{ background: '#fff', color: 'var(--ink)', fontWeight: 700, padding: '6px 14px', fontSize: 13 }}>{totalSlabs()} total slabs</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Top incentive ₹{topIncentive().toLocaleString('en-IN')} at ₹{topRangeMin().toLocaleString('en-IN')}+</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 18, borderTop: '1px dashed #5B6B4E44', paddingTop: 16 }}>
            {['BSCT', 'AFLF', 'MANN'].map(n => (
              <div key={n}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#5B6B4E', marginBottom: 6 }}>{n} · {todayShort} Ranges</div>
                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #5B6B4E22' }}>
                  {todayRanges.length === 0 ? (
                    <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>Loading…</div>
                  ) : todayRanges.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 10px', background: i % 2 ? '#ffffff88' : '#5B6B4E0c', fontSize: 12 }}>
                      <span style={{ color: 'var(--ink)' }}>₹{fmt(r.min)}{r.max === Infinity ? '+' : `–${fmt(r.max)}`}</span>
                      <span style={{ fontWeight: 800, color: '#B45309', whiteSpace: 'nowrap' }}>₹{Number(r.incentive).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, textAlign: 'center', fontStyle: 'italic', fontSize: 13, color: '#5B6B4E', fontWeight: 600, borderTop: '1px dashed #5B6B4E44', paddingTop: 12 }}>
            ✨ “Har roz jeeto, har roz badho — aaj ka collection aaj hi kamaao!” ✨
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 18 }}>
        {[
          { label: 'Total AKI Slabs', value: totalSlabs().toLocaleString('en-IN'), color: '#5B6B4E', icon: <><path d="M7 21h10v-1H7zM8 3v18h8V3zM10 7h4" /></> },
          { label: 'Days Configured', value: `${totalDays()} / 7`, color: '#16a34a', icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
          { label: 'Top Incentive', value: `₹${topIncentive().toLocaleString('en-IN')}`, color: '#e67e22', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></> },
          { label: 'Monthly Overage %', value: `${rules?.monthlyIncentivePercent ?? '—'}%`, color: '#3b82f6', icon: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.color, color: '#fff' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
            </div>
            <div className="stat-info">
              <div className="stat-lbl">{s.label}</div>
              <div className="stat-num" style={{ color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="empty" style={{ padding: 48, color: 'var(--ink-soft)', fontSize: 13 }}>Loading incentive configuration…</div>
      ) : (
        <>
          {/* Daily AKI slabs */}
          <div className="card ic-card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Daily AKI Slabs</h3>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Set collection amount slabs → incentive per day · the last slab's max as ∞ is the top bracket</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {DAY_NAMES.map(day => {
                const list = slabs[day] || [];
                const st = ds(day);
                const nv = newVal[day] || { min: '', max: '', incentive: '' };
                const rTopMax = list.some(r => r.max === Infinity);
                return (
                  <div key={day} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: st.bg, borderBottom: '1px solid var(--line)' }}>
                      <div className="ic-day-head" style={{ color: st.fg }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.fg, display: 'inline-block' }} />
                        <span style={{ fontSize: 13 }}>{day}</span>
                      </div>
                      <span className="pill" style={{ background: '#fff', color: st.fg, fontWeight: 700, padding: '2px 8px', fontSize: 11 }}>{list.length} slabs</span>
                    </div>

                    <div style={{ padding: 10 }}>
                      {/* Header row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 58px', gap: 6, padding: '0 2px 6px', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                        <span>Min (₹)</span>
                        <span>Max (₹)</span>
                        <span>Incentive</span>
                        <span style={{ textAlign: 'right' }}>Act</span>
                      </div>

                      {/* Slab rows */}
                      {list.length === 0 && (
                        <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>No slabs yet — add one below.</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {list.map((r, index) => (
                          editing?.day === day && editing?.index === index ? (
                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 58px', gap: 6, alignItems: 'center', padding: '6px 8px', background: '#F3FBF6', border: '1px solid var(--sage)', borderRadius: 8 }}>
                              <input className="ic-input" style={{ width: '100%' }} value={editVal.min} onChange={e => setInput('min', e.target.value)} placeholder="e.g. 3750" />
                              <input className="ic-input" style={{ width: '100%' }} value={editVal.max} onChange={e => setInput('max', e.target.value)} placeholder="e.g. 6999" />
                              <input className="ic-input" style={{ width: '100%' }} value={editVal.incentive} onChange={e => setInput('incentive', e.target.value)} placeholder="e.g. 200" />
                              <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                <button className="ic-btn" onClick={saveEdit} title="Save" style={{ color: '#1B7A3D', background: '#B9EFCE' }}><IcCheck size={14} /></button>
                                <button className="ic-btn" onClick={() => setEditing(null)} title="Cancel" style={{ background: '#FBDBD6', color: '#B3392B' }}><IcX size={14} /></button>
                              </div>
                            </div>
                          ) : (
                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 58px', gap: 6, alignItems: 'center', padding: '6px 8px', background: '#f9fafb', border: '1px solid var(--line)', borderRadius: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>₹{fmt(r.min)}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.max === Infinity ? '∞' : `₹${fmt(r.max)}`}</span>
                              <span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 700, padding: '2px 8px', justifySelf: 'start' }}>₹{Number(r.incentive).toLocaleString('en-IN')}</span>
                              <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                <button className="ic-btn" onClick={() => startEdit(day, index, r)} title="Edit slab"><IcPencil size={14} /></button>
                                <button className="ic-btn" onClick={() => removeSlab(day, index)} title="Remove slab" style={{ color: '#dc2626' }}><IcTrash size={14} /></button>
                              </div>
                            </div>
                          )
                        ))}
                      </div>

                      {/* Add form */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Add slab</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                          <input type="number" className="ic-input" style={{ width: '100%' }} value={nv.min} placeholder="Min" onChange={e => setNewVal(prev => ({ ...prev, [day]: { ...prev[day], min: e.target.value } }))} />
                          <input type="number" className="ic-input" style={{ width: '100%' }} value={nv.max} placeholder={rTopMax ? 'Max' : '∞ (top)'} onChange={e => setNewVal(prev => ({ ...prev, [day]: { ...prev[day], max: e.target.value } }))} />
                          <input type="number" className="ic-input" style={{ width: '100%' }} value={nv.incentive} placeholder="Incentive" onChange={e => setNewVal(prev => ({ ...prev, [day]: { ...prev[day], incentive: e.target.value } }))} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => addSlab(day)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%' }}>
                          <IcPlus size={14} /> Add slab
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incentive rules — view only (logic is not dynamic) */}
          <div className="card ic-card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Incentive Rules</h3>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Fixed calculation rules · shown for reference, not editable</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, padding: '6px 0' }}>
              {[
                { label: 'Monthly incentive over target', value: '10%' },
                { label: 'AKI payout (existing member)', value: '50%' },
                { label: 'AKI payout (new joiner)', value: '100%' },
                { label: 'New-joiner cutoff', value: '3 months' },
              ].map(rule => (
                <div key={rule.label} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: '#f9fafb' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.3px' }}>{rule.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#5B6B4E', marginTop: 4 }}>{rule.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <span className="ic-rlbl" style={{ display: 'block', marginBottom: 8 }}>Auto monthly target multipliers (× salary by months employed)</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[1, 2.5, 3].map((m, i) => (
                  <span key={i} className="pill" style={{ background: '#E7F3EC', color: '#1f6f3f', fontWeight: 700, padding: '5px 12px', fontSize: 13 }}>
                    {m}× <span style={{ fontWeight: 500, fontSize: 11, color: '#4B5563' }}>mo {i + 1}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="card ic-card" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={resetAll} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcReset size={14} /> Reset to defaults
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{totalSlabs()} slabs · 10% overage rule</span>
            <button className="btn btn-primary" onClick={saveAll} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcSave size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
