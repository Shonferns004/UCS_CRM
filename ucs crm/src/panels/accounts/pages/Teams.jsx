import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/auth';
import { useTeams } from '../../../components/useTeams';
import { Dropdown } from '../../../components/ui';

const TEAM_STYLE = {
  UFS1: { bg: '#E7F3EC', fg: '#1f6f3f' },
  UFS2: { bg: '#EAF1FB', fg: '#2563eb' },
  UFS3: { bg: '#FDF2E3', fg: '#B45309' },
  UFS4: { bg: '#F3E8F8', fg: '#7C3AED' },
};
const ts = (name) => TEAM_STYLE[name] || { bg: '#EEF1F5', fg: '#4B5563' };
const Pill = ({ name }) => (
  <span className="pill" style={{ background: ts(name).bg, color: ts(name).fg, fontWeight: 700, padding: '3px 10px' }}>{name}</span>
);

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

  const activeFros = workers.filter(w => (w.department || '').trim().toLowerCase() === 'fro' && (w.employment_status || 'active') === 'active');
  const counts = {};
  activeFros.forEach(w => { counts[w.team] = (counts[w.team] || 0) + 1; });

  const filteredFros = activeFros.filter(w => {
    if (teamFilter && (w.team || '') !== teamFilter) return false;
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
      flash(`Team ${t} removed.`);
    } catch (e) { setErr(e.message); }
  };

  const setWorkerTeam = async (w, val) => {
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, team: val || null } : x));
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

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{`
        @keyframes tfFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .tf-card { animation: tfFade .3s ease both; }
        .tf-tag { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px 6px 12px; font-size: 13px; font-weight: 600; background: #fff; }
        .tf-tag small { font-size: 11px; font-weight: 600; color: var(--ink-soft); }
        .tf-btn { border: none; background: transparent; cursor: pointer; color: #6b7280; padding: 3px 5px; border-radius: 6px; line-height: 1; }
        .tf-btn:hover { background: #f3f4f6; }
      `}</style>

      {toast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}
      {err && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{err}</div>
      )}

      {/* Manage teams */}
      <div className="card rp-card tf-card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Manage Teams</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Shown in every team dropdown; FROs carry the team's name (renaming keeps their assignment).</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {teams.map(t => {
            const st = ts(t);
            return renaming === t ? (
              <span key={t} className="tf-tag" style={{ borderColor: '#5B6B4E' }}>
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { e.key === 'Enter' && renameTeam(); e.key === 'Escape' && setRenaming(null); }}
                  style={{ width: 90, font: 'inherit', fontWeight: 700, border: 'none', outline: 'none', padding: 0, background: 'transparent', color: 'var(--ink)' }} />
                <button className="tf-btn" onClick={renameTeam} title="Save rename" style={{ color: '#1B7A3D' }}>✓</button>
                <button className="tf-btn" onClick={() => setRenaming(null)} title="Cancel">✕</button>
              </span>
            ) : (
              <span key={t} className="tf-tag">
                <Pill name={t} />
                <small>{counts[t] || 0} FRO</small>
                <button className="tf-btn" onClick={() => { setRenaming(t); setRenameVal(t); }} title="Rename team">✏️</button>
                <button className="tf-btn" onClick={() => removeTeam(t)} title="Remove team" style={{ color: '#dc2626' }}>🗑</button>
              </span>
            );
          })}
          {teams.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No teams yet.</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={newTeam}
            onChange={e => { setNewTeam(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && addTeam()}
            placeholder="New team name e.g. UFS5"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, fontWeight: 600, minWidth: 200 }} />
          <button className="btn btn-primary" onClick={addTeam} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Team
          </button>
        </div>
      </div>

      {/* Assign FROs */}
      <div className="card rp-card tf-card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Assign FRO to Team</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{activeFros.length} active FROs</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: 10 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
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
          <div className="empty" style={{ padding: 40, color: 'var(--ink-soft)', fontSize: 13 }}>No FROs match the search.</div>
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', background: '#f9fafb' }}>
                  <th style={{ padding: '9px 12px', width: 36 }}><input type="checkbox" checked={selected.size === filteredFros.length && filteredFros.length > 0} onChange={toggleAll} /></th>
                  <th style={{ padding: '9px 12px' }}>FRO</th>
                  <th style={{ padding: '9px 12px' }}>Emp ID</th>
                  <th style={{ padding: '9px 12px' }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {filteredFros.map(w => (
                  <tr key={w.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggleRow(w.id)} />
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{w.name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{w.employee_id ? w.employee_id.replace(/\D/g, '') : '—'}</td>
                    <td style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {w.team ? <Pill name={w.team} /> : <span style={{ color: '#9ca3af', fontSize: 12 }}>No Team</span>}
                      <Dropdown value={w.team || ''} onChange={e => setWorkerTeam(w, e.target.value)}
                        style={{ minWidth: 96 }}
                        options={[{ value: '', label: 'No Team' }, ...teams.map(t => ({ value: t, label: t }))]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}