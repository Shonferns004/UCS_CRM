import { useState, useEffect, useCallback } from 'react';
import { useUcs } from '../../../store';
import { useRealtime } from '../../../hooks/useRealtime';
import {
  getBugs, getBugStats, getBugAssignees, getBugHistory, createBug, updateBug, deleteBug, uploadScreenshot,
} from '../api/bugs';
import { toast } from '../components/Toast';

const STATUSES = [
  { key: 'reported', label: 'Reported' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ready_for_test', label: 'Ready for Test' },
  { key: 'reopened', label: 'Reopened' },
  { key: 'closed', label: 'Closed' },
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITY_COLORS = {
  low: { bg: '#f3f4f6', color: '#6b7280' },
  medium: { bg: '#fefce8', color: '#d97706' },
  high: { bg: '#fff7ed', color: '#ea580c' },
  critical: { bg: '#fef2f2', color: '#dc2626' },
};

const STATUS_META = {
  reported: { label: 'Reported', bg: '#eef2ff', color: '#4338ca' },
  in_progress: { label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
  ready_for_test: { label: 'Ready for Test', bg: '#fefce8', color: '#a16207' },
  reopened: { label: 'Reopened', bg: '#fff1f2', color: '#be123c' },
  closed: { label: 'Closed', bg: '#ecfdf5', color: '#15803d' },
  fixed: { label: 'Ready for Test', bg: '#fefce8', color: '#a16207' },
};

const TYPES = ['bug', 'feature', 'task', 'improvement', 'story'];
const TYPE_META = {
  bug: { label: 'Bug', color: '#dc2626' },
  feature: { label: 'Feature', color: '#16a34a' },
  task: { label: 'Task', color: '#2563eb' },
  improvement: { label: 'Improvement', color: '#7c3aed' },
  story: { label: 'Story', color: '#0891b2' },
};

function BugIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
    </svg>
  );
}

function TypeIcon({ type, size = 14 }) {
  if (type === 'bug' || !TYPE_META[type]) {
    return <span style={{ color: TYPE_META.bug.color, display: 'inline-flex' }}><BugIcon size={size} /></span>;
  }
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (type === 'task') return (<svg {...common} style={{ color: TYPE_META.task.color }}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>);
  if (type === 'improvement') return (<svg {...common} style={{ color: TYPE_META.improvement.color }}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>);
  if (type === 'story') return (<svg {...common} style={{ color: TYPE_META.story.color }}><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>);
  return (<svg {...common} style={{ color: TYPE_META.feature.color }}><path d="M12 3l2.6 5.6L20 9.4l-4 3.9.95 5.7L12 16.9 7.05 19l.95-5.7L4 9.6l5.4-.6z" /></svg>);
}

const typeMeta = (t) => TYPE_META[t] || TYPE_META.bug;

const statusLabel = (s) => (s ? (STATUS_META[s]?.label || s) : '—');

function historyText(h) {
  if (h.field === 'status') {
    return <span>Status <b>{statusLabel(h.from_value)}</b> → <b>{statusLabel(h.to_value)}</b></span>;
  }
  if (h.field === 'assignee') {
    return <span>Assignee <b>{h.from_value || 'Unassigned'}</b> → <b>{h.to_value || 'Unassigned'}</b></span>;
  }
  if (h.field === 'type') {
    return <span>Type <b>{TYPE_META[h.from_value]?.label || h.from_value}</b> → <b>{TYPE_META[h.to_value]?.label || h.to_value}</b></span>;
  }
  return <span>{h.note || h.field || 'Update'}</span>;
}

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
  const [typeFilter, setTypeFilter] = useState('');
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
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Create form
  const [cf, setCf] = useState({
    title: '', description: '', steps: '', expected_result: '', actual_result: '',
    module: 'Other', type: 'bug', severity: 'medium', environment: '', screenshot_url: '',
  });
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [bugsList, st, asg] = await Promise.all([
        getBugs({
          search: search || '',
          type: typeFilter || '',
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
  }, [search, typeFilter, sevFilter, modFilter, assFilter]);

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
  const normStatus = (s) => (s === 'fixed' ? 'ready_for_test' : s);
  const statusCount = (key) => visibleBugs.filter(b => normStatus(b.status) === key).length;
  const criticalCount = visibleBugs.filter(b => b.severity === 'critical').length;

  const openCreate = () => {
    setCf({
      title: '', description: '', steps: '', expected_result: '', actual_result: '',
      module: 'Other', type: 'bug', severity: 'medium', environment: '', screenshot_url: '',
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

  const openDetail = (bug) => {
    setShowDetail(bug);
    setHistory([]);
    setLoadingHistory(true);
    getBugHistory(bug.id)
      .then(rows => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  };

  const STATUS_TOAST = {
    in_progress: 'Moved to In Progress',
    ready_for_test: 'Sent for testing — reassigned to the reporter',
    closed: 'Bug closed',
    reopened: 'Bug reopened — sent back to the developer',
    reported: 'Moved back to Reported',
  };

  const quickStatus = (bug, status) => {
    if (!status || status === bug.status) return;
    const prev = bug.status;
    setBugs(bs => bs.map(x => x.id === bug.id ? { ...x, status } : x));
    updateBug(bug.id, { status }).then(() => {
      toast(STATUS_TOAST[status] || 'Status updated', 'success');
      loadAll(true);
    }).catch(err => {
      toast(err.message || 'Failed to update status', 'error');
      setBugs(bs => bs.map(x => x.id === bug.id ? { ...x, status: prev } : x));
    });
  };

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

  const doSaveDetail = async () => {
    if (!showDetail) return;
    setSaving(true);
    try {
      const { id, ...rest } = showDetail;
      await updateBug(id, {
        status: rest.status,
        assigned_to: rest.assigned_to || null,
        severity: rest.severity,
        type: rest.type || 'bug',
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
      <style>{`
        .jira-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
        .jira-input, .jira-select { padding:7px 10px; font-size:12px; border:1px solid var(--line); border-radius:6px; background:#fff; color:var(--ink); font-family:inherit; outline:none; }
        .jira-input:focus, .jira-select:focus { border-color:#6366f1; box-shadow:0 0 0 2px rgba(99,102,241,.12); }
        .jira-table-wrap { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#fff; }
        .jira-table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .jira-table thead th { text-align:left; padding:9px 12px; background:#f7f8fa; color:#5b6472; font-weight:700; font-size:10.5px; letter-spacing:.04em; text-transform:uppercase; border-bottom:1px solid var(--line); white-space:nowrap; }
        .jira-table tbody td { padding:10px 12px; border-bottom:1px solid #eef0f3; vertical-align:middle; color:var(--ink); }
        .jira-table tbody tr { cursor:pointer; transition:background .1s; }
        .jira-table tbody tr:hover { background:#f5f8ff; }
        .jira-table tbody tr:last-child td { border-bottom:none; }
        .jira-summary { font-weight:600; color:#1f2937; }
        .jira-key { font-weight:700; color:#6b7280; font-variant-numeric:tabular-nums; }
        .jira-type { display:inline-flex; align-items:center; gap:5px; font-weight:600; font-size:12px; white-space:nowrap; }
        .jira-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600; white-space:nowrap; font-family:inherit; }
        .jira-badge { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:9px; background:#fff; border:1px solid var(--line); }
        .jira-stat-num { font-size:20px; font-weight:800; color:#111827; }
        .jira-stat-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
        .jira-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.5); backdrop-filter:blur(3px); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; animation:jiraFade .15s ease; }
        @keyframes jiraFade { from{opacity:0} to{opacity:1} }
        @keyframes jiraPop { from{opacity:0; transform:translateY(14px) scale(.98)} to{opacity:1; transform:none} }
        .jira-modal { width:min(720px,100%); max-height:90vh; display:flex; flex-direction:column; background:#fff; border-radius:14px; box-shadow:0 24px 70px rgba(2,6,23,.35); overflow:hidden; animation:jiraPop .18s cubic-bezier(.2,.8,.3,1); }
        .jira-modal-head { display:flex; align-items:center; gap:11px; padding:14px 16px; border-bottom:1px solid var(--line); background:#fff; flex-shrink:0; }
        .jira-modal-body { padding:18px; overflow-y:auto; }
        .jira-modal-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; border-top:1px solid var(--line); background:#fafbfc; }
        .jira-field { display:flex; flex-direction:column; gap:5px; }
        .jira-label { font-size:11px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#64748b; }
        .jira-control { width:100%; padding:9px 11px; font-size:13px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); font-family:inherit; outline:none; transition:border-color .12s, box-shadow .12s; box-sizing:border-box; }
        .jira-control:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.14); }
        textarea.jira-control { resize:vertical; line-height:1.5; }
        .jira-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        .jira-detail-cols { display:grid; grid-template-columns:1fr 240px; gap:22px; align-items:start; }
        @media (max-width:640px){ .jira-grid{grid-template-columns:1fr;} .jira-detail-cols{grid-template-columns:1fr;} }
        .jira-side { display:flex; flex-direction:column; gap:12px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; padding:14px; align-self:start; }
        .jira-kv { font-size:12.5px; color:var(--ink); }
        .jira-issue-key { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:6px; background:#eef2ff; color:#4338ca; font-weight:700; font-size:12px; }
        .jira-hint { font-size:11px; color:#94a3b8; }
        .jira-x { border:none; background:transparent; font-size:20px; line-height:1; cursor:pointer; color:#94a3b8; padding:2px 6px; border-radius:6px; transition:background .12s,color .12s; }
        .jira-x:hover { background:#f1f5f9; color:#334155; }
        .jira-history { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); }
        .jira-timeline { list-style:none; margin:12px 0 0; padding:0; display:flex; flex-direction:column; gap:13px; }
        .jira-timeline li { display:flex; gap:11px; }
        .jira-tl-dot { flex:none; width:9px; height:9px; border-radius:50%; background:#6366f1; margin-top:4px; box-shadow:0 0 0 3px #eef2ff; }
        .jira-tl-body { flex:1; }
      `}</style>

      {/* Toolbar header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <BugIcon size={16} />
          </span>
          Bug Tracker
          <span style={{ fontWeight: 400, fontSize: 11, color: refreshing ? '#2563eb' : '#16a34a' }}>
            ● {refreshing ? 'Syncing…' : 'Live'} {lastUpdated ? '· ' + lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {!canSeeAllBugs && (
            <span style={{ fontWeight: 400, fontSize: 11, color: '#6b7280' }}>
              Showing your bugs + unassigned
            </span>
          )}
        </h3>
        <button className="btn btn-sm btn-primary" onClick={openCreate}>+ Create Bug</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        {STATUSES.map(s => (
          <div key={s.key} className="jira-badge">
            <span className="jira-stat-num">{statusCount(s.key)}</span>
            <span className="jira-stat-lbl">{s.label}</span>
          </div>
        ))}
        <div className="jira-badge">
          <span className="jira-stat-num" style={{ color: '#dc2626' }}>{criticalCount}</span>
          <span className="jira-stat-lbl">Critical</span>
        </div>
      </div>

      {/* Filters */}
      <div className="jira-toolbar">
        <input className="jira-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search issues..." style={{ flex: '0 0 220px' }} />
        <select className="jira-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
        <select className="jira-select" value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
          <option value="">All Priorities</option>
          {SEVERITIES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
        </select>
        <select className="jira-select" value={modFilter} onChange={e => setModFilter(e.target.value)}>
          <option value="">All Modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="jira-select" value={assFilter} onChange={e => setAssFilter(e.target.value)}>
          <option value="">All Assignees</option>
          <option value="null">Unassigned</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
        </select>
        {(search || typeFilter || sevFilter || modFilter || assFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter(''); setSevFilter(''); setModFilter(''); setAssFilter(''); }} className="btn btn-sm">Clear</button>
        )}
        <button onClick={() => loadAll(true)} className="btn btn-sm" style={{ marginLeft: 'auto' }}>Refresh</button>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{visibleBugs.length} issue{visibleBugs.length === 1 ? '' : 's'}</span>
      </div>

      {/* Issue list */}
      <div className="jira-table-wrap">
        <table className="jira-table">
          <thead>
            <tr>
              <th style={{ width: 104 }}>Type</th>
              <th style={{ width: 72 }}>Key</th>
              <th>Summary</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 112 }}>Priority</th>
              <th style={{ width: 110 }}>Module</th>
              <th style={{ width: 150 }}>Assignee</th>
              <th style={{ width: 150 }}>Reporter</th>
              <th style={{ width: 88 }}>Created</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 26, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
            ) : visibleBugs.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 26, textAlign: 'center', color: '#9ca3af' }}>No bugs found</td></tr>
            ) : visibleBugs.map(bug => {
              const sm = STATUS_META[bug.status] || STATUS_META.reported;
              const pm = SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.low;
              return (
                <tr key={bug.id} onClick={() => openDetail(bug)}>
                  <td>
                    <span className="jira-type" style={{ color: (TYPE_META[bug.type] || TYPE_META.bug).color }}>
                      <TypeIcon type={bug.type} size={13} />
                      {(TYPE_META[bug.type] || TYPE_META.bug).label}
                    </span>
                  </td>
                  <td className="jira-key">#{bug.id}</td>
                  <td>
                    <div className="jira-summary">{bug.title}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      {bug.status === 'ready_for_test' && bug.fixed_at && <span style={{ fontSize: 10, color: '#a16207' }}>Awaiting test · {fmtAgo(bug.fixed_at)}</span>}
                      {bug.reopen_count > 0 && <span style={{ fontSize: 10, color: '#be123c', fontWeight: 700 }}>Reopened {bug.reopen_count}×</span>}
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <select
                      className="jira-pill"
                      value={bug.status === 'fixed' ? 'ready_for_test' : bug.status}
                      onChange={e => quickStatus(bug, e.target.value)}
                      style={{ background: sm.bg, color: sm.color, border: 'none', cursor: 'pointer' }}
                    >
                      {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className="jira-pill" style={{ background: pm.bg, color: pm.color }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l7 8h-4v7h-6v-7H5z"/></svg>
                      {bug.severity}
                    </span>
                  </td>
                  <td>{bug.module || '—'}</td>
                  <td>{bug.assigned_name ? <span style={{ color: '#2563eb', fontWeight: 600 }}>{bug.assigned_name}</span> : <span style={{ color: '#9ca3af' }}>Unassigned</span>}</td>
                  <td>{bug.reported_by_name || '—'}</td>
                  <td style={{ color: '#6b7280' }}>{fmtAgo(bug.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button title="Delete bug" onClick={() => deleteCard(bug.id)} style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }} onMouseEnter={e => e.currentTarget.style.color = '#dc2626'} onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="jira-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="jira-modal" onClick={e => e.stopPropagation()}>
            <div className="jira-modal-head">
              <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BugIcon size={17} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Create Bug</div>
                <div className="jira-hint">Report a defect for the development team</div>
              </div>
              <button className="jira-x" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="jira-modal-body">
              <div className="jira-field" style={{ marginBottom: 14 }}>
                <label className="jira-label">Summary *</label>
                <input className="jira-control" value={cf.title} onChange={e => setCf({ ...cf, title: e.target.value })} placeholder="Short, descriptive title" autoFocus />
              </div>
              <div className="jira-grid" style={{ marginBottom: 14 }}>
                <div className="jira-field">
                  <label className="jira-label">Type</label>
                  <select className="jira-control" value={cf.type} onChange={e => setCf({ ...cf, type: e.target.value })}>
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                  </select>
                </div>
                <div className="jira-field">
                  <label className="jira-label">Module</label>
                  <select className="jira-control" value={cf.module} onChange={e => setCf({ ...cf, module: e.target.value })}>
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="jira-field">
                  <label className="jira-label">Priority</label>
                  <select className="jira-control" value={cf.severity} onChange={e => setCf({ ...cf, severity: e.target.value })} style={{ textTransform: 'capitalize' }}>
                    {SEVERITIES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                  </select>
                </div>
                <div className="jira-field">
                  <label className="jira-label">Assignee</label>
                  <select className="jira-control" value={cf.assigned_to} onChange={e => setCf({ ...cf, assigned_to: e.target.value })}>
                    <option value="">Unassigned</option>
                    {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
                  </select>
                </div>
              </div>
              <div className="jira-field" style={{ marginBottom: 14 }}>
                <label className="jira-label">Description</label>
                <textarea className="jira-control" rows={3} value={cf.description} onChange={e => setCf({ ...cf, description: e.target.value })} placeholder="What went wrong?" />
              </div>
              <div className="jira-field" style={{ marginBottom: 14 }}>
                <label className="jira-label">Steps to Reproduce</label>
                <textarea className="jira-control" rows={3} value={cf.steps} onChange={e => setCf({ ...cf, steps: e.target.value })} placeholder={"1. Go to...\n2. Click...\n3. See..."} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="jira-field">
                  <label className="jira-label">Expected Result</label>
                  <textarea className="jira-control" rows={2} value={cf.expected_result} onChange={e => setCf({ ...cf, expected_result: e.target.value })} />
                </div>
                <div className="jira-field">
                  <label className="jira-label">Actual Result</label>
                  <textarea className="jira-control" rows={2} value={cf.actual_result} onChange={e => setCf({ ...cf, actual_result: e.target.value })} />
                </div>
              </div>
              <div className="jira-field" style={{ marginBottom: 14 }}>
                <label className="jira-label">Environment</label>
                <input className="jira-control" value={cf.environment} onChange={e => setCf({ ...cf, environment: e.target.value })} placeholder="Browser / device / version" />
              </div>
              <div className="jira-field">
                <label className="jira-label">Screenshot</label>
                <input type="file" accept="image/*" onChange={onPickImage} style={{ fontSize: 12 }} />
                {imgPreview && <img src={imgPreview} alt="preview" style={{ marginTop: 8, maxWidth: 260, maxHeight: 170, borderRadius: 8, border: '1px solid var(--line)' }} />}
              </div>
            </div>
            <div className="jira-modal-foot">
              <span className="jira-hint">* Required field</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowCreate(false)} className="btn btn-sm">Cancel</button>
                <button onClick={create} disabled={submitting || uploading} className="btn btn-sm btn-primary">{submitting ? 'Creating...' : 'Create Bug'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="jira-modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="jira-modal" style={{ width: 'min(880px,100%)' }} onClick={e => e.stopPropagation()}>
            <div className="jira-modal-head">
              <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BugIcon size={17} />
              </span>
              <span className="jira-issue-key">#{showDetail.id}</span>
              {(() => { const sm = STATUS_META[showDetail.status] || STATUS_META.reported; return (
                <span className="jira-pill" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
              ); })()}
              <div style={{ flex: 1 }} />
              <button className="jira-x" onClick={() => setShowDetail(null)}>×</button>
            </div>
            <div className="jira-modal-body">
              <div className="jira-detail-cols">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="jira-field">
                    <label className="jira-label">Summary</label>
                    <input className="jira-control" value={showDetail.title} onChange={e => setShowDetail({ ...showDetail, title: e.target.value })} />
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Description</label>
                    <textarea className="jira-control" rows={3} value={showDetail.description || ''} onChange={e => setShowDetail({ ...showDetail, description: e.target.value })} placeholder="Add a description..." />
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Steps to Reproduce</label>
                    <textarea className="jira-control" rows={3} value={showDetail.steps || ''} onChange={e => setShowDetail({ ...showDetail, steps: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="jira-field">
                      <label className="jira-label">Expected</label>
                      <textarea className="jira-control" rows={2} value={showDetail.expected_result || ''} onChange={e => setShowDetail({ ...showDetail, expected_result: e.target.value })} />
                    </div>
                    <div className="jira-field">
                      <label className="jira-label">Actual</label>
                      <textarea className="jira-control" rows={2} value={showDetail.actual_result || ''} onChange={e => setShowDetail({ ...showDetail, actual_result: e.target.value })} />
                    </div>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Resolution</label>
                    <textarea className="jira-control" rows={2} value={showDetail.resolution || ''} onChange={e => setShowDetail({ ...showDetail, resolution: e.target.value })} placeholder="How was it fixed?" />
                  </div>
                  {showDetail.screenshot_url && (
                    <div className="jira-field">
                      <label className="jira-label">Attachment</label>
                      <img src={showDetail.screenshot_url} alt="screenshot" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: '1px solid var(--line)' }} />
                    </div>
                  )}
                </div>
                <aside className="jira-side">
                  <div className="jira-field">
                    <label className="jira-label">Type</label>
                    <select className="jira-control" value={showDetail.type || 'bug'} onChange={e => setShowDetail({ ...showDetail, type: e.target.value })}>
                      {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                    </select>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Status</label>
                    <select className="jira-control" value={showDetail.status === 'fixed' ? 'ready_for_test' : showDetail.status} onChange={e => setShowDetail({ ...showDetail, status: e.target.value })}>
                      {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Assignee</label>
                    <select className="jira-control" value={showDetail.assigned_to || ''} onChange={e => setShowDetail({ ...showDetail, assigned_to: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {assignees.map(a => <option key={a.id} value={a.id}>{a.name || a.login_id}</option>)}
                    </select>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Priority</label>
                    <select className="jira-control" value={showDetail.severity} onChange={e => setShowDetail({ ...showDetail, severity: e.target.value })} style={{ textTransform: 'capitalize' }}>
                      {SEVERITIES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                    </select>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Module</label>
                    <select className="jira-control" value={showDetail.module || 'Other'} onChange={e => setShowDetail({ ...showDetail, module: e.target.value })}>
                      {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Reporter</label>
                    <div className="jira-kv">{showDetail.reported_by_name || '—'}</div>
                  </div>
                  <div className="jira-field">
                    <label className="jira-label">Created</label>
                    <div className="jira-kv">{showDetail.created_at ? new Date(showDetail.created_at).toLocaleString('en-IN') : '—'}</div>
                  </div>
                  {showDetail.fixed_at && (
                    <div className="jira-field">
                      <label className="jira-label">Fixed</label>
                      <div className="jira-kv" style={{ color: '#16a34a' }}>{new Date(showDetail.fixed_at).toLocaleString('en-IN')}</div>
                    </div>
                  )}
                </aside>
              </div>
              <div className="jira-history">
                <label className="jira-label">History</label>
                {loadingHistory ? (
                  <div className="jira-hint" style={{ marginTop: 8 }}>Loading history...</div>
                ) : history.length === 0 ? (
                  <div className="jira-hint" style={{ marginTop: 8 }}>No history yet.</div>
                ) : (
                  <ul className="jira-timeline">
                    {history.map(h => (
                      <li key={h.id}>
                        <span className="jira-tl-dot" />
                        <div className="jira-tl-body">
                          <div className="jira-kv">{historyText(h)}</div>
                          <div className="jira-hint">
                            {h.actor_name || 'System'} · {h.created_at ? new Date(h.created_at).toLocaleString('en-IN') : ''}{h.note ? ' · ' + h.note : ''}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="jira-modal-foot">
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
