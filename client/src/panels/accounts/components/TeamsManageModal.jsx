import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/auth';
import { useTeams } from '../../../components/useTeams';

// Manage Teams dialog, opened from the button on the Salary & Advances tabs
// line. Same actions as the old inline card (add / rename / remove) but in a
// modal so the salary table keeps the full width. Team list comes from the
// shared useTeams cache; FRO counts are fetched here so each tag can show how
// many active FROs sit in it. Every team-list change dispatches the shared
// `teams-updated` window event, which the salary table listens to so renamed
// or removed teams refresh in place without a page reload.

const TEAM_STYLE = {
  UFS1: { bg: '#E7F3EC', fg: '#1f6f3f' },
  UFS2: { bg: '#EAF1FB', fg: '#2563eb' },
  UFS3: { bg: '#FDF2E3', fg: '#B45309' },
  UFS4: { bg: '#F3E8F8', fg: '#7C3AED' },
  'No Team': { bg: '#F3F4F6', fg: '#6b7280' },
};
const teamTs = (name) => TEAM_STYLE[name] || { bg: '#EEF1F5', fg: '#4B5563' };

const IconPencil = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
const IconTrash = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </svg>
);
const IconCheck = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const IconX = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const IconPlus = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function TeamsManageModal({ onClose }) {
  const { teams, saveTeams } = useTeams();
  const [fros, setFros] = useState(null);
  const [newTeam, setNewTeam] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/workers?status=all')
      .then(list => setFros(Array.isArray(list) ? list : []))
      .catch(() => setFros([]));
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !renaming && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, renaming, busy]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const notifyWorkers = () => window.dispatchEvent(new Event('teams-updated'));

  const activeFros = (fros || []).filter(w => !w.is_test && (w.department || '').trim().toLowerCase() === 'fro' && (w.employment_status || 'active') === 'active');
  const counts = {};
  activeFros.forEach(w => { const t = w.team || 'No Team'; counts[t] = (counts[t] || 0) + 1; });

  const addTeam = async () => {
    const name = String(newTeam || '').trim().toUpperCase();
    if (!name) return;
    if (teams.includes(name)) { setErr(`Team ${name} already exists.`); return; }
    setErr(''); setNewTeam(''); setBusy(true);
    try {
      await saveTeams([...teams, name]);
      flash(`Team ${name} added.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const renameTeam = async () => {
    const name = String(renameVal || '').trim().toUpperCase();
    if (!name || name === renaming) return;
    if (teams.includes(name)) { setErr(`Team ${name} already exists.`); return; }
    setErr('');
    const old = renaming;
    setBusy(true);
    try {
      await saveTeams(teams.map(t => (t === old ? name : t)));
      const affected = activeFros.filter(w => w.team === old);
      await Promise.all(affected.map(w => apiPut('/workers/' + w.id, { team: name }).catch(() => {})));
      setFros(prev => (prev || []).map(w => (w.team === old ? { ...w, team: name } : w)));
      setRenaming(null); setRenameVal('');
      notifyWorkers();
      flash(`Team ${old} renamed to ${name}.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const removeTeam = async (t) => {
    if (!window.confirm(`Remove team ${t}? Its FRO members will become "No Team".`)) return;
    setErr(''); setBusy(true);
    try {
      const affected = activeFros.filter(w => w.team === t);
      await Promise.all(affected.map(w => apiPut('/workers/' + w.id, { team: null }).catch(() => {})));
      setFros(prev => (prev || []).map(w => (w.team === t ? { ...w, team: null } : w)));
      await saveTeams(teams.filter(x => x !== t));
      notifyWorkers();
      flash(`Team ${t} removed.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const tfTag = {
    display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--line, #e5e7eb)',
    borderRadius: 10, padding: '6px 8px 6px 12px', fontSize: 13, fontWeight: 600, background: '#fff',
  };
  const tfBtn = {
    border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af',
    padding: '4px 6px', borderRadius: 6, lineHeight: 1, display: 'inline-flex',
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(17,24,39,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label="Manage Teams"
        style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 45px rgba(0,0,0,.22)', overflow: 'hidden' }}>

        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line, #f3f4f6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink, #111827)' }}>Manage Teams</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft, #6b7280)', marginTop: 2 }}>
              {teams.length} team{teams.length === 1 ? '' : 's'} · {activeFros.length} active FRO{activeFros.length === 1 ? '' : 's'} · renaming keeps FRO assignments
            </div>
          </div>
          <button className="tf-btn" onClick={onClose} disabled={busy} title="Close"
            style={{ ...tfBtn, color: '#6b7280', flexShrink: 0 }}><IconX /></button>
        </div>

        <div style={{ padding: '14px 20px', overflowY: 'auto' }}>
          {toast && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: '#B9EFCE', color: '#1B7A3D', fontSize: 13, fontWeight: 600 }}>{toast}</div>}
          {err && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: '#FBDBD6', color: '#B3392B', fontSize: 13 }}>{err}</div>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, minHeight: 34 }}>
            {teams.map(t => {
              const st = teamTs(t);
              return renaming === t ? (
                <span key={t} style={{ ...tfTag, borderColor: 'var(--sage, #5B6B4E)' }}>
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameTeam(); if (e.key === 'Escape') setRenaming(null); }}
                    placeholder="Team name"
                    style={{ width: 90, font: 'inherit', fontWeight: 700, border: 'none', outline: 'none', padding: 0, background: 'transparent', color: 'var(--ink, #111827)' }} />
                  <button className="tf-btn" onClick={renameTeam} disabled={busy} title="Save rename" style={{ ...tfBtn, color: '#1B7A3D' }}><IconCheck /></button>
                  <button className="tf-btn" onClick={() => setRenaming(null)} disabled={busy} title="Cancel" style={tfBtn}><IconX /></button>
                </span>
              ) : (
                <span key={t} style={tfTag}>
                  <span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 700, padding: '3px 10px' }}>{t}</span>
                  <small style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft, #6b7280)', whiteSpace: 'nowrap' }}>
                    {fros === null ? '…' : `${counts[t] || 0} FRO`}
                  </small>
                  <button className="tf-btn" onClick={() => { setRenaming(t); setRenameVal(t); }} disabled={busy} title="Rename team" style={tfBtn}><IconPencil /></button>
                  <button className="tf-btn" onClick={() => removeTeam(t)} disabled={busy} title="Remove team" style={{ ...tfBtn, color: '#dc2626' }}><IconTrash /></button>
                </span>
              );
            })}
            {teams.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-soft, #6b7280)' }}>No teams yet — add the first one below.</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newTeam}
              onChange={e => { setNewTeam(e.target.value); setErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') addTeam(); }}
              placeholder="New team name e.g. UCS5"
              style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--ink, #111827)' }} />
            <button className="btn btn-primary" onClick={addTeam} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconPlus /> {busy ? 'Saving…' : 'Add Team'}
            </button>
          </div>
        </div>

        <div style={{ padding: '11px 20px', background: 'var(--bg, #f9fafb)', borderTop: '1px solid var(--line, #f3f4f6)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-outline" onClick={onClose} disabled={busy}>Done</button>
        </div>
      </div>
    </div>
  );
}
