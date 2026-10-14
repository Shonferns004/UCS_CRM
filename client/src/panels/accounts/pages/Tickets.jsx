import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, X, ChevronDown, ArrowUpDown,
  Inbox, MessageSquare, RefreshCw, Plus, Trash2, Send,
  CheckCircle2, Circle,
} from 'lucide-react';
import { apiGet, apiPut, apiPost, apiDelete } from '../api/auth';
import { toast } from '../../../components/Toast';
import { deptLabel } from '../../../lib/labels';
import { routeFor, routeLabel } from '../../../lib/ticketRouting';
import { Avatar } from '../../../components/ui';
import { useRealtime } from '../../../hooks/useRealtime';

const DEPARTMENTS = ['accounts', 'developers', 'hr', 'fro', 'super_admin'];
const CATEGORIES = [
  { value: 'suspense', label: 'Suspense' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'receipt_issue', label: 'Receipt Issue' },
  { value: 'technical', label: 'Technical' },
  { value: 'hr_issue', label: 'HR Related' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'other', label: 'Other' },
];

// The queue is the accounts suspense/payment/receipt work plus anything the
// Super Admin sent (SA broadcasts raise the row with raised_by_panel
// 'super_admin', whether aimed at all panels or at accounts specifically) —
// so an SA instruction can never vanish from this board.
const ACCOUNTS_QUEUE_CATEGORIES = ['suspense', 'payment_issue', 'receipt_issue'];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const STATUS_META = {
  open:     { label: 'Open',     bg: '#fefce8', color: '#a16207' },
  resolved: { label: 'Resolved', bg: '#f0fdf4', color: '#16a34a' },
};

const PANEL_LABELS = {
  fro: 'FRO',
  accounts: 'Accounts',
  hr: 'HR',
  dev_panel: 'Developer',
  ngo_admin: 'Admin',
  event_head: 'Event Head',
  recruiter: 'Recruiter',
  super_admin: 'Super Admin',
  other: 'Other',
};

const PER_PAGE = 10;

const categoryLabel = (v) => CATEGORIES.find(c => c.value === v)?.label || v;
const ticketNo = (t) => `#TKT-${((t.id || '').replace(/-/g, '').slice(0, 8) || t.raised_by || '').toUpperCase()}`;

function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span className="tw-pill" style={{ background: m.bg, color: m.color }}>
      <span className="tw-dot" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export default function AccountsTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('open');
  const [sort, setSort] = useState('newest');
  const [visibleCount, setVisibleCount] = useState(PER_PAGE);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const [drawer, setDrawer] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [priorityDraft, setPriorityDraft] = useState('');
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [showRaise, setShowRaise] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deskLoading, setDeskLoading] = useState(false);
  const [form, setForm] = useState({ department: 'accounts', category: 'technical', subject: '', description: '', reference_id: '', priority: 'medium', desk_number: '', ngo: '' });
  const [formErrors, setFormErrors] = useState({});

  const drawerTicketRef = useRef(null);

  // Mirrors `drawer` so the realtime handlers below can read the open ticket
  // without being re-subscribed on every drawer change.
  useEffect(() => {
    drawerTicketRef.current = drawer ? { id: drawer.id } : null;
  }, [drawer]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setLoadError(null);
    try {
      const regularTickets = await apiGet('/tickets');
      const allTickets = (regularTickets || [])
        .map(t => ({ ...t, _source: 'regular' }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setTickets(allTickets.filter(t => ACCOUNTS_QUEUE_CATEGORIES.includes(t.category) || t.raised_by_panel === 'super_admin'));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setLoadError(err.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The open drawer keeps its own `replies` copy, so refreshing the list alone
  // would leave a reply that lands while the drawer is open invisible. Both
  // tables are broadcast on write, so refetch as soon as an event arrives
  // instead of waiting for the next manual refresh.
  const refreshOpenDrawer = useCallback(async () => {
    const open = drawerTicketRef.current;
    if (!open) return;
    try {
      const data = await apiGet(`/tickets/${open.id}`);
      setDrawer(prev => (prev ? { ...data, _source: 'regular' } : prev));
    } catch { /* keep the thread already on screen rather than blanking it */ }
  }, []);

  useRealtime('ticket_replies', {
    onInsert: (row) => {
      load(true);
      if (row?.ticket_id && String(row.ticket_id) === String(drawerTicketRef.current?.id)) refreshOpenDrawer();
    },
  });
  useRealtime('support_tickets', {
    onInsert: () => { load(true); refreshOpenDrawer(); },
    onUpdate: () => { load(true); refreshOpenDrawer(); },
    onDelete: () => { load(true); refreshOpenDrawer(); },
  });

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    const onDown = (e) => {
      if (e.key !== 'Escape') return;
      if (drawer) { setDrawer(null); return; }
      // Leave delete mode before closing anything else, so Escape always backs
      // the user out one step rather than getting stuck with no visible exit.
      if (selectMode) { setSelectMode(false); setSelectedIds([]); }
    };
    document.addEventListener('keydown', onDown);
    return () => document.removeEventListener('keydown', onDown);
  }, [drawer, selectMode]);

  const fetchMyAsset = async () => {
    setDeskLoading(true);
    try {
      const assets = await apiGet('/assets/my-assigned').catch(() => []);
      const asset = Array.isArray(assets) ? assets[0] : null;
      if (asset) {
        setForm(p => ({ ...p, desk_number: p.desk_number || asset.code || '', ngo: p.ngo || asset.location || '' }));
      }
    } catch (err) { /* silent */ }
    finally { setDeskLoading(false); }
  };

  useEffect(() => { fetchMyAsset(); }, []);

  const tabCounts = useMemo(() => {
    const count = (fn) => tickets.filter(fn).length;
    return {
      open: count(t => t.status === 'open'),
      resolved: count(t => t.status === 'resolved'),
    };
  }, [tickets]);

  const filtered = useMemo(() => {
    let list = tickets.filter(t => t.status === activeTab);
    if (debouncedSearch) {
      list = list.filter(t => {
        const hay = [
          t.subject, t.description,
          t.workers?.name, t.raised_by_name,
          deptLabel(t.department), categoryLabel(t.category),
          t.reference_id, ticketNo(t),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(debouncedSearch);
      });
    }
    list = [...list].sort((a, b) =>
      sort === 'newest'
        ? new Date(b.created_at) - new Date(a.created_at)
        : new Date(a.created_at) - new Date(b.created_at));
    return list;
  }, [tickets, activeTab, debouncedSearch, sort]);

  const pageItems = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > pageItems.length;

  useEffect(() => { setVisibleCount(PER_PAGE); }, [debouncedSearch, activeTab, sort]);

  const loadMore = () => setVisibleCount(c => c + PER_PAGE);

  const clearSearch = () => {
    setActiveTab('open');
    setSearch('');
    setDebouncedSearch('');
  };

  const markSelected = (t) => {
    setSelectedIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]);
  };

  const openDrawer = async (ticket) => {
    setDrawer(ticket);
    setStatusMenuOpen(false);
    setDrawerLoading(true);
    setStatusDraft(ticket.status);
    setPriorityDraft(ticket.priority || 'medium');
    setResolutionDraft(ticket.resolution || '');
    setReplyText('');
    try {
      const data = await apiGet(`/tickets/${ticket.id}`);
      setDrawer({ ...data, _source: 'regular' });
      setStatusDraft(data.status);
      setPriorityDraft(data.priority || 'medium');
      setResolutionDraft(data.resolution || '');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDrawerLoading(false);
    }
  };

  const saveDrawer = async () => {
    if (!drawer) return;
    if (statusDraft === 'resolved' && (!resolutionDraft || !resolutionDraft.trim())) {
      toast('Please provide a resolution note', 'warning');
      return;
    }
    setDrawerSaving(true);
    try {
      await apiPut(`/tickets/${drawer.id}`, {
        status: statusDraft,
        priority: priorityDraft,
        resolution: statusDraft === 'resolved' ? resolutionDraft.trim() : undefined,
      });
      toast('Ticket updated', 'success');
      const data = await apiGet(`/tickets/${drawer.id}`);
      setDrawer({ ...data, _source: 'regular' });
      setStatusDraft(data.status);
      setPriorityDraft(data.priority || 'medium');
      setResolutionDraft(data.resolution || '');
      load(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDrawerSaving(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !drawer) return;
    setSendingReply(true);
    try {
      await apiPost(`/tickets/${drawer.id}/reply`, { message: replyText.trim() });
      setReplyText('');
      const data = await apiGet(`/tickets/${drawer.id}`);
      setDrawer({ ...data, _source: 'regular' });
      load(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.bulk) {
        const ids = confirmDelete.ids || [];
        const results = await Promise.allSettled(ids.map(id => apiDelete(`/tickets/${id}`)));
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed) toast(`${ids.length - failed} deleted, ${failed} failed`, failed === ids.length ? 'error' : 'warning');
        else toast(`${ids.length} ticket${ids.length === 1 ? '' : 's'} deleted`, 'success');
        setDrawer(null);
        setConfirmDelete(null);
        setSelectMode(false);
        setSelectedIds([]);
        load(true);
        return;
      }
      await apiDelete(`/tickets/${confirmDelete.id}`);
      toast('Ticket deleted', 'success');
      if (drawer?.id === confirmDelete.id) setDrawer(null);
      setConfirmDelete(null);
      load(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleRaise = async () => {
    const errs = {};
    if (!form.subject.trim()) errs.subject = 'Subject is required';
    if (!form.desk_number.trim()) errs.desk_number = 'Desk Number is required';
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setFormErrors({});
    setSubmitting(true);
    try {
      const route = routeFor(form.category);
      const base = {
        subject: form.subject,
        description: form.description,
        category: form.category,
        priority: form.priority,
        reference_id: form.reference_id,
        desk_number: form.desk_number,
        ngo: form.ngo,
        raised_by_panel: 'accounts',
      };
      if (route.system === 'developer') {
        await apiPost('/developer-tickets', base);
      } else {
        await apiPost('/tickets', { ...base, department: route.department });
      }
      toast('Ticket submitted successfully', 'success');
      setShowRaise(false);
      setForm({ department: 'accounts', category: 'technical', subject: '', description: '', reference_id: '', priority: 'medium', desk_number: form.desk_number, ngo: form.ngo });
      load();
    } catch (err) { setFormErrors({ _general: err.message }); }
    finally { setSubmitting(false); }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderRow = (t) => {
    const count = typeof t.comment_count === 'number' ? t.comment_count : t.comment_count || 0;
    const isSelected = selectedIds.includes(t.id);
    const isDrawerOpen = drawer?.id === t.id;
    // In delete mode a tile click toggles selection instead of opening the drawer.
    const onTileClick = () => (selectMode ? markSelected(t) : openDrawer(t));

    return (
      <div key={t.id} className={`tw-row${isSelected ? ' is-selected' : ''}${isDrawerOpen ? ' is-open' : ''}${selectMode ? ' is-selecting' : ''}`} onClick={onTileClick}>
        <Avatar name={t.workers?.name || t.raised_by_name} size={38} />
        <div className="tw-row-main">
          <div className="tw-subject">{t.subject}</div>
          <div className="tw-submeta">
            <span className="tw-owner">{t.workers?.name || t.raised_by_name || 'Unknown'}</span>
            <span className="tw-sep">·</span>
            <span className="tw-dept">{deptLabel(t.department)}</span>
            <span className="tw-sep">·</span>
            <span className="tw-cat">{categoryLabel(t.category)}</span>
            <span className="tw-sep">·</span>
            <span className="tw-no">{ticketNo(t)}</span>
          </div>
        </div>
        <div className="tw-statuscol">
          <StatusPill status={t.status} />
        </div>
        <div className="tw-datecol">
          <span className="tw-date">{fmtDate(t.created_at)}</span>
          <span className="tw-comments"><MessageSquare size={12} /> {count}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="tw-workspace">
      <div className="tw-main">
        <div className="tw-header">
          <div className="tw-title-block">
            <h2 className="tw-title">Tickets</h2>
          </div>
          <div className="tw-header-actions">
            <span className={`tw-live${refreshing ? ' tw-live-working' : ''}`}>
              <span className="tw-live-dot" /> {refreshing ? 'Syncing…' : 'Live'}
              {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
            <button className="btn btn-sm" onClick={() => load()} title="Refresh">
              <RefreshCw size={13} />
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setShowRaise(true)}>
              <Plus size={14} /> Raise Ticket
            </button>
          </div>
        </div>

        <div className="tw-tabbar" role="tablist">
          <div className="tw-tabs">
            {[
              { key: 'open', label: 'Open' },
              { key: 'resolved', label: 'Resolved' },
            ].map(tab => (
              <button key={tab.key} className={`tw-tab${activeTab === tab.key ? ' active' : ''}`} onClick={() => { setActiveTab(tab.key); }}>
                {tab.label}
                <span className="tw-tab-count">{tabCounts[tab.key]}</span>
              </button>
            ))}
          </div>

          <div className="tw-tabbar-tools">
            <div className="tw-search">
              <Search size={13} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search subject, raised by, department, category, ticket ID…"
              />
              {search && <button className="tw-search-clear" onClick={() => setSearch('')}><X size={12} /></button>}
            </div>
            {selectMode ? (
              <div className="tw-bulkbar">
                <span className="tw-bulkcount">{selectedIds.length} selected</span>
                <button className="tw-filter-toggle" onClick={() => { setSelectMode(false); setSelectedIds([]); }}>Cancel</button>
                <button
                  className="tw-iconbtn tw-iconbtn-danger"
                  disabled={!selectedIds.length}
                  title={`Delete ${selectedIds.length || ''} selected`.trim()}
                  onClick={() => setConfirmDelete({ ids: selectedIds, bulk: true })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <button
                className="tw-iconbtn"
                onClick={() => { setSelectMode(true); setSelectedIds([]); }}
                disabled={!filtered.length}
                title="Select tickets to delete"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              className="tw-iconbtn"
              onClick={() => setSort(s => (s === 'newest' ? 'oldest' : 'newest'))}
              title={sort === 'newest' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
            >
              <ArrowUpDown size={15} />
            </button>
          </div>
        </div>

        <div className="tw-list">
          {loading ? (
            <div className="tw-skeletons">
              {Array.from({ length: PER_PAGE }).map((_, i) => (
                <div key={i} className="tw-skeleton tw-skel-row">
                  <div className="sk" style={{ width: 38, height: 38, borderRadius: '50%' }} />
                  <div className="tw-skel-lines">
                    <div className="sk" style={{ width: '60%', height: 13 }} />
                    <div className="sk" style={{ width: '40%', height: 11 }} />
                  </div>
                  <div className="sk" style={{ width: 52, height: 20, borderRadius: 10 }} />
                  <div className="sk" style={{ width: 80, height: 20, borderRadius: 10 }} />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="tw-empty">
              <div className="tw-empty-icon" style={{ color: '#dc2626' }}><Circle size={28} /></div>
              <p className="tw-empty-title">Couldn't load tickets</p>
              <p className="tw-empty-sub">{loadError}</p>
              <button className="btn btn-sm" onClick={() => load()}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="tw-empty">
              <div className="tw-empty-icon"><Inbox size={30} /></div>
              {debouncedSearch ? (
                <>
                  <p className="tw-empty-title">No matching tickets</p>
                  <p className="tw-empty-sub">Try adjusting your search.</p>
                  <button className="btn btn-sm btn-primary" onClick={clearSearch}>Clear search</button>
                </>
              ) : (
                <>
                  <p className="tw-empty-title">No tickets yet</p>
                  <p className="tw-empty-sub">New queue tickets raised by FRO will appear here automatically.</p>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowRaise(true)}><Plus size={14} /> Raise Ticket</button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="tw-listhead">
                <span className="tw-listhead-avatar" />
                <span className="tw-listhead-label">Ticket</span>
                <span className="tw-listhead-hide">Status</span>
                <span className="tw-listhead-date">Date</span>
              </div>
              <div className={`tw-rows${selectedIds.length ? ' has-selection' : ''}`}>
                {pageItems.map(t => renderRow(t))}
              </div>
            </>
          )}
        </div>

        {!loading && !loadError && filtered.length > 0 && (
          hasMore ? (
            <div className="tw-loadmore">
              <span className="tw-pageinfo">
                Showing <strong>{pageItems.length}</strong> of <strong>{filtered.length}</strong>
              </span>
              <button className="btn btn-sm" onClick={loadMore}>Load more</button>
            </div>
          ) : (
            <div className="tw-loadmore">
              <span className="tw-pageinfo">All <strong>{filtered.length}</strong> tickets shown</span>
            </div>
          )
        )}
      </div>

      {drawer && (
        <div className="tw-drawer">
          <div className="tw-drawer-inner">
            <div className="tw-drawer-head">
              <div className="tw-drawer-title-wrap">
                <button className="tw-iconbtn" onClick={() => setDrawer(null)} title="Close (Esc)"><X size={16} /></button>
              </div>
              <div className="tw-drawer-requester">
                <Avatar name={drawer.workers?.name || drawer.raised_by_name} size={32} />
                <div className="tw-drawer-requester-copy">
                  <div className="tw-drawer-name-row">
                    <strong>{drawer.workers?.name || drawer.raised_by_name || 'Unknown'}</strong>
                    <StatusPill status={drawer.status} />
                    <span className="tw-pill tw-pill-gray">{categoryLabel(drawer.category)}</span>
                  </div>
                  <span>{fmtDateTime(drawer.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="tw-drawer-body">
              <div className="tw-drawer-subject-block">
                {drawerLoading ? (
                  <div className="tw-skeleton" style={{ flexDirection: 'column' }}>
                    <div className="sk" style={{ height: 18, width: '80%' }} />
                  </div>
                ) : (
                  <h3 className="tw-drawer-subject">{drawer.subject}</h3>
                )}
              </div>
              {(drawer.ngo || drawer.reference_id) && (
                <div className="tw-drawer-context">
                  {drawer.ngo && <span>{drawer.ngo}</span>}
                  {drawer.reference_id && <span className="tw-mono">{drawer.reference_id}</span>}
                </div>
              )}

              {(statusDraft === 'resolved' || drawer.status === 'resolved') && (
                <div className="tw-resolution">
                  <span className="tw-fkey">Resolution note{statusDraft === 'resolved' ? ' (required)' : ''}</span>
                  <textarea
                    value={resolutionDraft}
                    onChange={e => setResolutionDraft(e.target.value)}
                    placeholder="Describe how this ticket was resolved…"
                    rows={3}
                    disabled={drawer.status === 'resolved' && statusDraft === 'resolved'}
                  />
                </div>
              )}

              {drawer.description && (
                <div className="tw-desc">
                  <span className="tw-fkey">Description</span>
                  <p>{drawer.description}</p>
                </div>
              )}

              <div className="tw-comments">
                <div className="tw-comments-head">
                  <span className="tw-fkey">Comments</span>
                  <span className="tw-comments-count">{drawer.replies?.length || 0}</span>
                </div>
                {!drawer.replies || drawer.replies.length === 0 ? (
                  <div className="tw-no-comments">
                    <MessageSquare size={18} />
                    <span>No comments yet.</span>
                  </div>
                ) : (
                  <div className="tw-replies">
                    {drawer.replies.map(r => (
                      <div key={r.id} className="tw-reply">
                        <Avatar name={r.sender_name} size={30} />
                        <div className="tw-reply-body">
                          <div className="tw-reply-meta">
                            <span className="tw-reply-name">{r.sender_name || (r.sender_type === 'user' ? 'Accounts' : 'FRO')}</span>
                            {r.sender_panel && <span className="tw-reply-panel">{PANEL_LABELS[r.sender_panel] || r.sender_panel}</span>}
                            <span className="tw-reply-time">{fmtDateTime(r.created_at)}</span>
                          </div>
                          <div className="tw-reply-text">{r.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="tw-add-comment">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); }}
                  />
                  <button className="btn btn-sm" onClick={handleReply} disabled={sendingReply || !replyText.trim()} title="Send (Ctrl/Cmd + Enter)">
                    {sendingReply ? '…' : <Send size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="tw-drawer-foot">
              <button className="btn btn-sm tw-delete-btn" onClick={() => setConfirmDelete(drawer)} disabled={drawerSaving}>
                <Trash2 size={14} /> Delete
              </button>
              <div className="tw-drawer-foot-right">
                {statusDraft !== drawer.status || priorityDraft !== drawer.priority || (statusDraft === 'resolved' && resolutionDraft.trim() !== drawer.resolution) ? (
                  <span className="tw-unsaved">Unsaved changes</span>
                ) : null}
                <div className="tw-status-control">
                  <button type="button" className="tw-status-current" onClick={saveDrawer} disabled={drawerSaving} title="Save ticket status">
                    <span>{STATUS_META[statusDraft]?.label || statusDraft}</span>
                    <CheckCircle2 size={14} />
                  </button>
                  <button type="button" className="tw-status-toggle" onClick={() => setStatusMenuOpen(open => !open)} disabled={drawerSaving} aria-label="Choose ticket status">
                    <ChevronDown size={14} className={statusMenuOpen ? 'is-open' : ''} />
                  </button>
                  {statusMenuOpen && (
                    <div className="tw-status-menu">
                      {Object.entries(STATUS_META).map(([value, meta]) => (
                        <button type="button" key={value} className={value === statusDraft ? 'active' : ''}
                          onClick={() => { setStatusDraft(value); setStatusMenuOpen(false); }}>
                          <span className="tw-status-menu-dot" style={{ background: meta.color }} />
                          {meta.label}
                          {value === statusDraft && <CheckCircle2 size={13} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRaise && (
        <div className="modal-overlay" onClick={() => setShowRaise(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h3>Raise a Ticket</h3>
              <button className="btn btn-sm btn-icon" onClick={() => setShowRaise(false)} style={{ padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              {formErrors._general && (
                <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                  {formErrors._general}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Department *
                  <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </label>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Category *
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginTop: 4 }}>→ Routed to: {routeLabel(form.category)}</div>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Desk Number *
                  <input value={form.desk_number} onChange={e => { setForm(p => ({ ...p, desk_number: e.target.value })); if (formErrors.desk_number) setFormErrors(p => { const n = { ...p }; delete n.desk_number; return n; }); }} placeholder={deskLoading ? 'Fetching your desk...' : 'Auto-filled from your desk'} style={formErrors.desk_number ? { borderColor: '#dc2626' } : undefined} />
                  {formErrors.desk_number && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{formErrors.desk_number}</div>}
                </label>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  NGO
                  <input value={form.ngo} onChange={e => setForm(p => ({ ...p, ngo: e.target.value }))} placeholder={deskLoading ? 'Fetching...' : 'Auto-filled from your desk'} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Priority
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Reference ID (optional)
                  <input value={form.reference_id} onChange={e => setForm(p => ({ ...p, reference_id: e.target.value }))} placeholder="Payment/suspense ID" />
                </label>
              </div>
              <label className="field" style={{ marginBottom: 12 }}>
                Subject *
                <input value={form.subject} onChange={e => { setForm(p => ({ ...p, subject: e.target.value })); if (formErrors.subject) setFormErrors(p => { const n = { ...p }; delete n.subject; return n; }); }}
                  placeholder="Brief title of the issue"
                  style={formErrors.subject ? { borderColor: '#dc2626' } : undefined} />
                {formErrors.subject && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{formErrors.subject}</div>}
              </label>
              <label className="field" style={{ marginBottom: 12 }}>
                Description
                <div style={{ position: 'relative' }}>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the issue in detail..." maxLength={200} rows={4} style={{ padding: '10px 12px', paddingRight: 56, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, fontWeight: 600, color: form.description.length > 180 ? '#dc2626' : 'var(--ink-soft)' }}>
                    {form.description.length}/200
                  </span>
                </div>
              </label>
            </div>
            <div className="modal-foot" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowRaise(false)}
                style={{ padding: '8px 20px', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s' }}
                onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleRaise} disabled={submitting}
                style={{ padding: '8px 20px', fontSize: 12, borderRadius: 6 }}>
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>{confirmDelete.bulk ? `Delete ${confirmDelete.ids.length} ticket${confirmDelete.ids.length === 1 ? '' : 's'}?` : 'Delete ticket?'}</h3>
              <button className="btn btn-sm btn-icon" onClick={() => setConfirmDelete(null)} style={{ padding: 4 }}>
                <X size={15} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink)', margin: 0 }}>
                {confirmDelete.bulk ? (
                  <>This will permanently delete <strong>{confirmDelete.ids.length} ticket{confirmDelete.ids.length === 1 ? '' : 's'}</strong> along with all of their comments. This action cannot be undone.</>
                ) : (
                  <>This will permanently delete <strong>{confirmDelete.subject}</strong> along with all of its comments. This action cannot be undone.</>
                )}
              </p>
            </div>
            <div className="modal-foot" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', fontSize: 12 }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDelete} style={{ padding: '8px 16px', fontSize: 12, background: '#dc2626', borderColor: '#dc2626' }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
