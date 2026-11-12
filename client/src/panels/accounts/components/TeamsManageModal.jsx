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
const IconUsers = () => (
  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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

  const tfBtn = {
    border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af',
    padding: '4px 6px', borderRadius: 6, lineHeight: 1, display: 'inline-flex',
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label="Manage Teams"
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line, #e5e7eb)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', color: '#4338ca', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconUsers />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink, #111827)' }}>Manage Teams</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft, #6b7280)', marginTop: 2 }}>
              {teams.length} team{teams.length === 1 ? '' : 's'} · {activeFros.length} active FRO{activeFros.length === 1 ? '' : 's'} — renaming keeps FRO assignments
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} title="Close" aria-label="Close"
            style={{ ...tfBtn, color: '#6b7280', flexShrink: 0, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, width: 30, height: 30, justifyContent: 'center' }}>
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {toast && <div style={{ padding: '9px 13px', borderRadius: 8, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: 12.5, fontWeight: 600 }}>{toast}</div>}
          {err && <div style={{ padding: '9px 13px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: 12.5 }}>{err}</div>}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft, #6b7280)' }}>Teams</span>
              <span style={{ fontSize: 11, color: 'var(--ink-soft, #6b7280)' }}>
                {fros === null ? 'Loading FRO counts…' : `${activeFros.length} FROs assigned`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {teams.map(t => {
                const st = teamTs(t);
                if (renaming === t) {
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #93c5fd', borderRadius: 10, padding: '8px 10px', background: '#eff6ff', minWidth: 0 }}>
                      <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameTeam(); if (e.key === 'Escape') setRenaming(null); }}
                        placeholder="Team name"
                        style={{ flex: 1, minWidth: 0, font: 'inherit', fontWeight: 800, fontSize: 12.5, border: 'none', outline: 'none', padding: 0, background: 'transparent', color: 'var(--ink, #111827)' }} />
                      <button type="button" onClick={renameTeam} disabled={busy} title="Save rename" style={{ ...tfBtn, color: '#1B7A3D' }}><IconCheck /></button>
                      <button type="button" onClick={() => setRenaming(null)} disabled={busy} title="Cancel" style={tfBtn}><IconX /></button>
                    </div>
                  );
                }
                const count = counts[t] || 0;
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '8px 10px', background: '#fff', minWidth: 0 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: st.bg, color: st.fg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {t.slice(-1)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div title={t} style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-soft, #6b7280)' }}>
                        {fros === null ? '…' : `${count} FRO${count === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <button type="button" onClick={() => { setRenaming(t); setRenameVal(t); }} disabled={busy} title="Rename team" style={tfBtn}><IconPencil /></button>
                    <button type="button" onClick={() => removeTeam(t)} disabled={busy} title="Remove team" style={{ ...tfBtn, color: '#dc2626' }}><IconTrash /></button>
                  </div>
                );
              })}
            </div>
            {teams.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft, #6b7280)', padding: '10px 0' }}>No teams yet — add the first one below.</div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft, #6b7280)', marginBottom: 6 }}>Add a team</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={newTeam}
                onChange={e => { setNewTeam(e.target.value); setErr(''); }}
                onKeyDown={e => { if (e.key === 'Enter') addTeam(); }}
                placeholder="New team name e.g. UCS5"
                style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--ink, #111827)', outline: 'none' }} />
              <button className="btn btn-primary" onClick={addTeam} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconPlus /> {busy ? 'Saving…' : 'Add Team'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid var(--line, #e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-soft, #6b7280)' }}>Changes apply immediately across salary and targets.</span>
          <button className="btn btn-sm btn-primary" onClick={onClose} disabled={busy}>Done</button>
        </div>
      </div>
    </div>
  );
}
