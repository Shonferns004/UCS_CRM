import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/auth';
import { useTeams } from '../../../components/useTeams';
import { Dropdown } from '../../../components/ui';

const TEAM_STYLE = {
  UFS1: { bg: '#E7F3EC', fg: '#1f6f3f' },
  UFS2: { bg: '#EAF1FB', fg: '#2563eb' },
  UFS3: { bg: '#FDF2E3', fg: '#B45309' },
  UFS4: { bg: '#F3E8F8', fg: '#7C3AED' },
  'No Team': { bg: '#F3F4F6', fg: '#6b7280' },
};
const ts = (name) => TEAM_STYLE[name] || { bg: '#EEF1F5', fg: '#4B5563' };
const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return p.length ? p.slice(0, 2).map((w) => w[0].toUpperCase()).join('') : '?';
};
const Pill = ({ name }) => (
  <span className="pill" style={{ background: ts(name).bg, color: ts(name).fg, fontWeight: 700, padding: '3px 10px' }}>{name}</span>
);

const Ic = ({ d, size = 14, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d={d} />
  </svg>
);
const IcPencil = () => <Ic d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />;
const IcTrash = () => <Ic d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />;
const IcCheck = () => <Ic d="M20 6 9 17l-5-5" />;
const IcX = () => <Ic d="M18 6 6 18M6 6l12 12" />;
const IcPlus = () => <Ic d="M12 5v14M5 12h14" />;
const IcSearch = () => <Ic d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16m10 18-4.35-4.35" size={15} />;
const IcUsers = () => <Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />;

export default function Teams() {
  const { teams, saveTeams } = useTeams();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkTeam, setBulkTeam] = useState('');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    apiGet('/workers?status=all')
      .then(list => setWorkers(list || []))
      .catch(e => setErr(e.message || 'Failed to load workers'))
      .finally(() => setLoading(false));
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const activeFros = workers.filter(w => !w.is_test && (w.department || '').trim().toLowerCase() === 'fro' && (w.employment_status || 'active') === 'active');
  const counts = {};
  activeFros.forEach(w => { const t = w.team || 'No Team'; counts[t] = (counts[t] || 0) + 1; });
  const noTeamCount = counts['No Team'] || 0;

  const filteredFros = activeFros.filter(w => {
    if (teamFilter === 'No Team' ? !!(w.team || '').trim() : teamFilter && (w.team || '') !== teamFilter) return false;
    const q = String(search || '').trim().toLowerCase();
    if (!q) return true;
    const emp = (w.employee_id || '').replace(/\D/g, '');
    return (w.name || '').toLowerCase().includes(q) || (w.email || '').toLowerCase().includes(q) || emp.includes(q);
  });

  const addTeam = async () => {
    const name = String(newTeam || '').trim().toUpperCase();
    if (!name) return;
    if (teams.includes(name)) { setErr(`Team ${name} already exists.`); return; }
    setErr(''); setNewTeam('');
    try {
      const next = await saveTeams([...teams, name]);
      flash(`Team ${name} added.`);
      setBulkTeam('');
      return next;
    } catch (e) { setErr(e.message); }
  };

  const renameTeam = async () => {
    const name = String(renameVal || '').trim().toUpperCase();
    if (!name || name === renaming) return;
    if (teams.includes(name)) { setErr(`Team ${name} already exists.`); return; }
    setErr('');
    const old = renaming;
    try {
      await saveTeams(teams.map(t => t === old ? name : t));
      const affected = activeFros.filter(w => w.team === old);
      await Promise.all(affected.map(w => apiPut('/workers/' + w.id, { team: name }).catch(() => {})));
      setWorkers(prev => prev.map(w => w.team === old ? { ...w, team: name } : w));
      setRenaming(null); setRenameVal('');
      if (teamFilter === old) setTeamFilter(name);
      flash(`Team ${old} renamed to ${name}.`);
    } catch (e) { setErr(e.message); }
  };

  const removeTeam = async (t) => {
    if (!window.confirm(`Remove team ${t}? Its FRO members will become "No Team".`)) return;
    setErr('');
    try {
      const affected = activeFros.filter(w => w.team === t);
      await Promise.all(affected.map(w => apiPut('/workers/' + w.id, { team: null }).catch(() => {})));
      setWorkers(prev => prev.map(w => w.team === t ? { ...w, team: null } : w));
      await saveTeams(teams.filter(x => x !== t));
      if (teamFilter === t) setTeamFilter('');
      flash(`Team ${t} removed.`);
    } catch (e) { setErr(e.message); }
  };

  const setWorkerTeam = async (w, val) => {
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, team: val || null } : w));
    try { await apiPut('/workers/' + w.id, { team: val || null }); }
    catch (e) { setErr(e.message); }
  };

  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(prev => prev.size === filteredFros.length ? new Set() : new Set(filteredFros.map(w => w.id)));
  };

  const doBulkAssign = async () => {
    const ids = [...selected];
    if (!bulkTeam || ids.length === 0) return;
    setErr('');
    try {
      await Promise.all(ids.map(id => apiPut('/workers/' + id, { team: bulkTeam }).catch(() => {})));
      setWorkers(prev => prev.map(w => selected.has(w.id) ? { ...w, team: bulkTeam } : w));
      setSelected(new Set());
      flash(`Assigned ${ids.length} FRO(s) to ${bulkTeam}.`);
    } catch (e) { setErr(e.message); }
  };

  const overview = [...teams.map(t => ({ key: t, label: t, count: counts[t] || 0 })), ...(noTeamCount > 0 ? [{ key: 'No Team', label: 'No Team', count: noTeamCount }] : [])];

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{`
        @keyframes tfFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .rp-card { animation: tfFade .35s ease both; }
        .tf-tag { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px 6px 12px; font-size: 13px; font-weight: 600; background: #fff; }
        .tf-tag small { font-size: 11px; font-weight: 600; color: var(--ink-soft); }
        .tf-btn { border: none; background: transparent; cursor: pointer; color: #9ca3af; padding: 4px 6px; border-radius: 6px; line-height: 1; display: inline-flex; align-items: center; }
        .tf-btn:hover { background: #f3f4f6; color: #374151; }
        .tf-row td { border-top: 1px solid var(--line); }
        .tf-row:hover td { background: #f9fafb; }
        .tf-tile { cursor: pointer; transition: box-shadow .15s ease, border-color .15s ease, transform .15s ease; }
        .tf-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,.08); }
      `}</style>

      {toast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}
      {err && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{err}</div>
      )}

      <div className="rp-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Teams</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
            {teams.length} teams · {activeFros.length} active FROs · test members excluded
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pill" style={{ background: '#EAF1FB', color: '#2563eb', fontWeight: 700, padding: '5px 12px' }}>{teams.length} Teams</span>
          <span className="pill" style={{ background: '#E7F3EC', color: '#1f6f3f', fontWeight: 700, padding: '5px 12px' }}>{activeFros.length} Active FROs</span>
        </div>
      </div>

      <div className="rp-card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Team Overview</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Click a team to filter the assignment table below</span>
        </div>
        {loading ? (
          <div className="empty" style={{ padding: 32, fontSize: 13, color: 'var(--ink-soft)' }}>Loading teams…</div>
        ) : overview.length === 0 ? (
          <div className="empty" style={{ padding: 32, fontSize: 13, color: 'var(--ink-soft)' }}>No teams yet — add one below to get started.</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '4px 0' }}>
            {overview.map(t => {
              const st = ts(t.label);
              const pct = activeFros.length ? Math.round((t.count / activeFros.length) * 100) : 0;
              const active = teamFilter === t.key;
              return (
                <div key={t.key} className="stat-card tf-tile" onClick={() => setTeamFilter(active ? '' : t.key)}
                  style={{ width: 200, maxWidth: '100%', boxSizing: 'border-box', border: active ? '2px solid var(--sage)' : undefined }}>
                  <div className="stat-icon" style={{ background: st.bg, color: st.fg }}>
                    {t.label === 'No Team' ? '—' : t.label.slice(-1)}
                  </div>
                  <div className="stat-info">
                    <div className="stat-lbl" style={{ fontSize: 12 }}>{t.label}</div>
                    <div className="stat-num" style={{ fontSize: 20 }}>{t.count}</div>
                    <div className="stat-sub">{pct}% of active FROs</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card rp-card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Manage Teams</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Shown in every team dropdown · renaming keeps FRO assignments</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {teams.map(t => {
            const st = ts(t);
            return renaming === t ? (
              <span key={t} className="tf-tag" style={{ borderColor: 'var(--sage)' }}>
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { e.key === 'Enter' && renameTeam(); e.key === 'Escape' && setRenaming(null); }}
                  placeholder="Team name"
                  style={{ width: 90, font: 'inherit', fontWeight: 700, border: 'none', outline: 'none', padding: 0, background: 'transparent', color: 'var(--ink)' }} />
                <button className="tf-btn" onClick={renameTeam} title="Save rename" style={{ color: '#1B7A3D' }}><IcCheck /></button>
                <button className="tf-btn" onClick={() => setRenaming(null)} title="Cancel"><IcX /></button>
              </span>
            ) : (
              <span key={t} className="tf-tag">
                <span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 700, padding: '3px 10px' }}>{t}</span>
                <small>{counts[t] || 0} FRO</small>
                <button className="tf-btn" onClick={() => { setRenaming(t); setRenameVal(t); }} title="Rename team"><IcPencil /></button>
                <button className="tf-btn" onClick={() => removeTeam(t)} title="Remove team" style={{ color: '#dc2626' }}><IcTrash /></button>
              </span>
            );
          })}
          {teams.length === 0 && !loading && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No teams yet.</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={newTeam}
            onChange={e => { setNewTeam(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && addTeam()}
            placeholder="New team name e.g. UFS5"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, fontWeight: 600, minWidth: 200 }} />
          <button className="btn btn-primary" onClick={addTeam} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcPlus /> Add Team
          </button>
        </div>
      </div>

      <div className="card rp-card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Assign FRO to Team</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IcUsers size={13} /> {activeFros.length} active FROs
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 10, top: 9, color: '#9ca3af', display: 'inline-flex' }}><IcSearch /></span>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(new Set()); }}
              placeholder="Search FRO by name, email or emp ID"
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <Dropdown value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setSelected(new Set()); }}
            options={[{ value: '', label: 'All teams' }, { value: 'No Team', label: 'No Team' }, ...teams.map(t => ({ value: t, label: t }))]}
            style={{ minWidth: 130 }} />
          {search && (
            <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>
          )}
          {teamFilter && (
            <button className="btn btn-sm" onClick={() => setTeamFilter('')}>Clear filter</button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', alignSelf: 'center' }}>{filteredFros.length} shown</span>
        </div>

        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: '#F3FBF6', border: '1px solid #B9EFCE' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B7A3D' }}>{selected.size} selected</span>
            <Dropdown value={bulkTeam} onChange={e => setBulkTeam(e.target.value)}
              style={{ minWidth: 130 }}
              options={[{ value: '', label: 'Assign to team…' }, ...teams.map(t => ({ value: t, label: t }))]} />
            <button className="btn btn-primary btn-sm" onClick={doBulkAssign} disabled={!bulkTeam}>Assign</button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {loading ? (
          <div className="empty" style={{ padding: 40 }}>Loading FROs…</div>
        ) : activeFros.length === 0 ? (
          <div className="empty" style={{ padding: 40, color: 'var(--ink-soft)', fontSize: 13 }}>No active FRO workers found.</div>
        ) : filteredFros.length === 0 ? (
          <div className="empty" style={{ padding: 40, color: 'var(--ink-soft)', fontSize: 13 }}>No FROs match the current filters.</div>
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 640, width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                  <th style={{ padding: '9px 12px', width: 36 }}><input type="checkbox" checked={selected.size === filteredFros.length && filteredFros.length > 0} onChange={toggleAll} /></th>
                  <th style={{ padding: '9px 12px' }}>FRO</th>
                  <th style={{ padding: '9px 12px' }}>Emp ID</th>
                  <th style={{ padding: '9px 12px' }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {filteredFros.map(w => {
                  const st = ts(w.team || 'No Team');
                  return (
                    <tr key={w.id} className="tf-row">
                      <td style={{ padding: '9px 12px' }}>
                        <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggleRow(w.id)} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: st.bg, color: st.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{initials(w.name)}</div>
                          <span style={{ fontWeight: 600 }}>{w.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{w.employee_id ? w.employee_id.replace(/\D/g, '') : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {w.team ? <Pill name={w.team} /> : <span style={{ color: '#9ca3af', fontSize: 12 }}>No Team</span>}
                          <Dropdown value={w.team || ''} onChange={e => setWorkerTeam(w, e.target.value)}
                            style={{ minWidth: 96 }}
                            options={[{ value: '', label: 'No Team' }, ...teams.map(t => ({ value: t, label: t }))]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
