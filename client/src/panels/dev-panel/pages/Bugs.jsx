import { useState, useEffect, useCallback } from 'react';
import { useUcs } from '../../../store';
import { useRealtime } from '../../../hooks/useRealtime';
import {
  getBugs, getBugStats, getBugAssignees, createBug, updateBug, deleteBug, uploadScreenshot,
} from '../api/bugs';
import { toast } from '../components/Toast';

const STATUSES = [
  { key: 'reported', label: 'Reported' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'fixed', label: 'Fixed' },
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITY_COLORS = {
  low: { bg: '#f3f4f6', color: '#6b7280' },
  medium: { bg: '#fefce8', color: '#d97706' },
  high: { bg: '#fff7ed', color: '#ea580c' },
  critical: { bg: '#fef2f2', color: '#dc2626' },
};

const MODULES = ['FRO', 'Accounts', 'Dev Panel', 'Chat', 'Recruiter', 'HR', 'NGO Admin', 'Social', 'Other'];

const REFRESH_MS = 30000;

export default function Bugs() {
  const { user } = useUcs();
  const [bugs, setBugs] = useState([]);
  const [stats, setStats] = useState({ reported: 0, in_progress: 0, fixed: 0, critical: 0 });
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [modFilter, setModFilter] = useState('');
  const [assFilter, setAssFilter] = useState('');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create form
  const [cf, setCf] = useState({
    title: '', description: '', steps: '', expected_result: '', actual_result: '',
    module: 'Other', severity: 'medium', environment: '', screenshot_url: '',
  });
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');

  // Drag state
  const [dragId, setDragId] = useState(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [bugsList, st, asg] = await Promise.all([
        getBugs({
          search: search || '',
          severity: sevFilter || '',
          module: modFilter || '',
          assigned_to: assFilter || '',
        }).catch(() => []),
        getBugStats().catch(() => ({ reported: 0, in_progress: 0, fixed: 0, by_severity: { critical: 0 } })),
        getBugAssignees().catch(() => []),
      ]);
      setBugs(Array.isArray(bugsList) ? bugsList : []);
      setStats({
        reported: st.reported || 0,
        in_progress: st.in_progress || 0,
        fixed: st.fixed || 0,
        critical: st.by_severity?.critical || 0,
      });
      setAssignees(Array.isArray(asg) ? asg : []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('load bugs', e);
      setBugs([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [search, sevFilter, modFilter, assFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime
  useRealtime('bugs', {
    onInsert: (row) => setBugs(b => [row, ...(Array.isArray(b) ? b : []).filter(x => x.id !== row.id)]),
    onUpdate: (row) => setBugs(b => (Array.isArray(b) ? b.map(x => x.id === row.id ? row : x) : b)),
    onDelete: (row) => setBugs(b => (Array.isArray(b) ? b.filter(x => x.id !== row.id) : b)),
    enabled: true,
  });

  // Fallback poll
  useEffect(() => {
    const id = setInterval(() => loadAll(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  const canSeeAllBugs = ['super_admin', 'admin'].includes(String(user?.role || '').toLowerCase());
  const visibleBug = (b) => canSeeAllBugs
    || !b.assigned_to
    || String(b.assigned_to) === String(user?.id)
    || String(b.reported_by_id) === String(user?.id);

  const visibleBugs = bugs.filter(visibleBug);
  const columns = {
    reported: visibleBugs.filter(b => b.status === 'reported'),
    in_progress: visibleBugs.filter(b => b.status === 'in_progress'),
    fixed: visibleBugs.filter(b => b.status === 'fixed'),
  };
  const criticalCount = visibleBugs.filter(b => b.severity === 'critical').length;

  const openCreate = () => {
    setCf({
      title: '', description: '', steps: '', expected_result: '', actual_result: '',
      module: 'Other', severity: 'medium', environment: '', screenshot_url: '', assigned_to: '',
    });
    setImgFile(null);
    setImgPreview('');
    setShowCreate(true);
  };

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  const uploadIfNeeded = async () => {
    if (!imgFile) return cf.screenshot_url || '';
    setUploading(true);
    try {
      const url = await uploadScreenshot(imgFile);
      return url || '';
    } catch (e) {
      toast(e.message || 'Upload failed', 'error');
      return '';
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!cf.title.trim()) { toast('Title required', 'error'); return; }
    setSubmitting(true);
    try {
      const url = await uploadIfNeeded();
      await createBug({ ...cf, title: cf.title.trim(), screenshot_url: url || cf.screenshot_url || null, assigned_to: cf.assigned_to || null });
      toast('Bug reported', 'success');
      setShowCreate(false);
      await loadAll(true);
    } catch (e) {
      toast(e.message || 'Failed to report bug', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCard = async (id) => {
    if (!window.confirm('Delete this bug?')) return;
    try {
      await deleteBug(id);
      setBugs(bs => bs.filter(b => b.id !== id));
      toast('Bug deleted', 'success');
    } catch (e) {
      toast(e.message || 'Delete failed', 'error');
    }
  };

  const startDrag = (id) => (e) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch {}
    const card = e.currentTarget.closest('.bug-card');
    if (card) e.dataTransfer.setDragImage(card, 18, 14);
  };

  const dropTo = (status) => (e) => {
    e.preventDefault();
    if (!dragId) return;
    const b = bugs.find(x => x.id === dragId);
    if (!b || b.status === status) { setDragId(null); return; }
    // optimistic
    setBugs(bs => bs.map(x => x.id === dragId ? { ...x, status } : x));
    setDragId(null);
    updateBug(dragId, { status }).catch(err => {
      toast(err.message || 'Failed to move bug', 'error');
      // revert
      setBugs(bs => bs.map(x => x.id === dragId ? { ...x, status: b.status } : x));
    });
  };

  const allowDrop = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const fmtAgo = (d) => {
    if (!d) return '';
    const ts = new Date(d).getTime();
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const day = Math.floor(h / 24);
    return day + 'd ago';
  };

  const isDevOrAdmin = user?.role === 'super_admin' || user?.role === 'developers' || user?.role === 'tester' || user?.department?.includes('develop');

  const doSaveDetail = async () => {
    if (!showDetail) return;
    setSaving(true);
    try {
      const { id, ...rest } = showDetail;
      await updateBug(id, {
        status: rest.status,
        assigned_to: rest.assigned_to || null,
        severity: rest.severity,
        module: rest.module,
        resolution: rest.resolution || null,
        title: rest.title,
        description: rest.description || null,
        steps: rest.steps || null,
        expected_result: rest.expected_result || null,
        actual_result: rest.actual_result || null,
      });
      toast('Saved', 'success');
      setShowDetail(null);
      await loadAll(true);
    } catch (e) {
      toast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDeleteDetail = async () => {
    if (!showDetail) return;
    if (!confirm('Delete this bug?')) return;
    setDeleting(true);
    try {
      await deleteBug(showDetail.id);
      toast('Deleted', 'success');
      setShowDetail(null);
      await loadAll(true);
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
          Testing / Bugs
          <span style={{ fontWeight: 400, fontSize: 11, color: refreshing ? '#2563eb' : '#16a34a', marginLeft: 10, verticalAlign: 'middle' }}>
            ● {refreshing ? 'Syncing…' : 'Live'} {lastUpdated ? '· ' + lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {!canSeeAllBugs && (
            <span style={{ fontWeight: 400, fontSize: 11, color: '#6b7280', marginLeft: 10, verticalAlign: 'middle' }}>
              Showing your bugs + unassigned
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Critical: <strong style={{ color: '#dc2626' }}>{criticalCount}</strong></span>
          <button className="btn btn-sm btn-primary" onClick={openCreate}>+ Report Bug</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        {STATUSES.map(s => (
          <div key={s.key} style={{ padding: '10px 14px', borderRadius: 8, background: '#fff', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{columns[s.key].length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bugs..." style={{ padding: '7px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }} />
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={{ padding: '7px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <option value="">All Severity</option>
          {SEVERITIES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
        </select>
        <select value={modFilter} onChange={e => setModFilter(e.target.value)} style={{ padding: '7px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <option value="">All Module</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={assFilter} onChange={e => setAssFilter(e.target.value)} style={{ padding: '7px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <option value="">All Assignees</option>
          <option value="null">Unassigned</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
        </select>
        {(search || sevFilter || modFilter || assFilter) && (
          <button onClick={() => { setSearch(''); setSevFilter(''); setModFilter(''); setAssFilter(''); }} className="btn btn-sm">Clear</button>
        )}
        <button onClick={() => loadAll(true)} className="btn btn-sm" style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      {/* Board */}
      <div className="bug-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, alignItems: 'start' }}>
        {STATUSES.map(col => (
          <div key={col.key} className={`bug-col bug-col-${col.key}`} onDragOver={allowDrop} onDrop={dropTo(col.key)} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, minHeight: 120 }}>
            <div className="bug-col-head" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>
              <span>{col.label}</span>
              <span className="bug-col-count" style={{ padding: '1px 8px', borderRadius: 999, background: '#f3f4f6', color: '#374151' }}>{columns[col.key].length}</span>
            </div>
            {loading ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 10 }}>Loading...</div> : (columns[col.key].length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 10 }}>No bugs</div> : null)}
            {columns[col.key].map(bug => (
              <div key={bug.id} className="bug-card" draggable onDragStart={startDrag(bug.id)} onDragEnd={() => setDragId(null)} onClick={() => setShowDetail(bug)} style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: '3px solid #6366f1', borderRadius: 10, padding: 10, marginBottom: 9, cursor: 'pointer', boxShadow: dragId === bug.id ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                  <span draggable style={{ cursor: 'grab', color: '#cbd5e1', fontSize: 15, lineHeight: 1, userSelect: 'none', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>⠿</span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{bug.title}</div>
                  <button title="Delete bug" onClick={e => { e.stopPropagation(); deleteCard(bug.id); }} style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }} onMouseEnter={e => e.currentTarget.style.color = '#dc2626'} onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ padding: '1px 6px', borderRadius: 999, background: SEVERITY_COLORS[bug.severity]?.bg || '#f3f4f6', color: SEVERITY_COLORS[bug.severity]?.color || '#6b7280' }}>{bug.severity}</span>
                  {bug.module && <span style={{ padding: '1px 6px', borderRadius: 999, background: '#eef2ff', color: '#4338ca' }}>{bug.module}</span>}
                  {bug.status === 'fixed' && bug.fixed_at && <span style={{ color: '#16a34a', fontWeight: 700 }}>Fixed · {fmtAgo(bug.fixed_at)}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{bug.reported_by_name || '—'} · {fmtAgo(bug.created_at)}</div>
                {bug.assigned_name && <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}>Assigned: {bug.assigned_name}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(680px, calc(100% - 20px))', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div className="modal-head" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Report a Bug</h3>
              <button onClick={() => setShowCreate(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Title *</span>
                <input value={cf.title} onChange={e => setCf({ ...cf, title: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Module</span>
                  <select value={cf.module} onChange={e => setCf({ ...cf, module: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Severity</span>
                  <select value={cf.severity} onChange={e => setCf({ ...cf, severity: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    {SEVERITIES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Assign To</span>
                  <select value={cf.assigned_to} onChange={e => setCf({ ...cf, assigned_to: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <option value="">Unassigned</option>
                    {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
                  </select>
                </label>
              </div>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Description</span>
                <textarea rows={3} value={cf.description} onChange={e => setCf({ ...cf, description: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Steps to reproduce</span>
                <textarea rows={3} value={cf.steps} onChange={e => setCf({ ...cf, steps: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Expected result</span>
                  <textarea rows={2} value={cf.expected_result} onChange={e => setCf({ ...cf, expected_result: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
                </label>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Actual result</span>
                  <textarea rows={2} value={cf.actual_result} onChange={e => setCf({ ...cf, actual_result: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
                </label>
              </div>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Environment (browser/device)</span>
                <input value={cf.environment} onChange={e => setCf({ ...cf, environment: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Screenshot</span>
                <input type="file" accept="image/*" onChange={onPickImage} />
                {imgPreview && <img src={imgPreview} alt="preview" style={{ marginTop: 6, maxWidth: 240, maxHeight: 160, borderRadius: 8, border: '1px solid var(--line)' }} />}
              </label>
            </div>
            <div className="modal-foot" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowCreate(false)} className="btn btn-sm">Cancel</button>
              <button onClick={create} disabled={submitting || uploading} className="btn btn-sm btn-primary">{submitting ? 'Reporting...' : 'Report Bug'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, calc(100% - 20px))', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div className="modal-head" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, flex: 1, marginRight: 8 }}>{showDetail.title}</h3>
              <button onClick={() => setShowDetail(null)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: SEVERITY_COLORS[showDetail.severity]?.bg || '#f3f4f6', color: SEVERITY_COLORS[showDetail.severity]?.color || '#6b7280' }}>Severity: {showDetail.severity}</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#4338ca' }}>Module: {showDetail.module || '—'}</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#374151' }}>Status: {showDetail.status}</span>
                <span style={{ color: '#6b7280' }}>Reporter: {showDetail.reported_by_name || '—'} · {new Date(showDetail.created_at).toLocaleString('en-IN')}</span>
                {showDetail.fixed_at && <span style={{ color: '#16a34a', fontWeight: 700 }}>Fixed {new Date(showDetail.fixed_at).toLocaleString('en-IN')}</span>}
              </div>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Title</span>
                <input value={showDetail.title} onChange={e => setShowDetail({ ...showDetail, title: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Description</span>
                <textarea rows={3} value={showDetail.description || ''} onChange={e => setShowDetail({ ...showDetail, description: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Steps</span>
                <textarea rows={3} value={showDetail.steps || ''} onChange={e => setShowDetail({ ...showDetail, steps: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Expected</span>
                  <textarea rows={2} value={showDetail.expected_result || ''} onChange={e => setShowDetail({ ...showDetail, expected_result: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
                </label>
                <label className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Actual</span>
                  <textarea rows={2} value={showDetail.actual_result || ''} onChange={e => setShowDetail({ ...showDetail, actual_result: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Status</span>
                  <select value={showDetail.status} onChange={e => setShowDetail({ ...showDetail, status: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <option value="reported">Reported</option>
                    <option value="in_progress">In Progress</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Assign To</span>
                  <select value={showDetail.assigned_to || ''} onChange={e => setShowDetail({ ...showDetail, assigned_to: e.target.value || null })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <option value="">Unassigned</option>
                    {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Severity</span>
                  <select value={showDetail.severity} onChange={e => setShowDetail({ ...showDetail, severity: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span>Module</span>
                  <select value={showDetail.module || 'Other'} onChange={e => setShowDetail({ ...showDetail, module: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>Resolution (when fixed)</span>
                <textarea rows={2} value={showDetail.resolution || ''} onChange={e => setShowDetail({ ...showDetail, resolution: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
              {showDetail.screenshot_url && (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>Screenshot</div>
                  <img src={showDetail.screenshot_url} alt="screenshot" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, border: '1px solid var(--line)' }} />
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={doDeleteDetail} disabled={deleting} className="btn btn-sm" style={{ color: '#dc2626', borderColor: '#fecaca' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowDetail(null)} className="btn btn-sm">Cancel</button>
                <button onClick={doSaveDetail} disabled={saving} className="btn btn-sm btn-primary">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
