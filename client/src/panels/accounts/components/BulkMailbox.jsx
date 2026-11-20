import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { apiGet, apiGetBlob, apiPost } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';

// Inbound mailbox for the Bulk Email page, laid out like Gmail: search bar,
// folder rail, full-width message rows with attachment chips, pagination, a
// reading view that replaces the list, and an inline reply composer.
//
// Sent mail is mirrored from the campaign itself, so campaigns show up with
// their attachments without an IMAP round trip. Message HTML is untrusted, so
// it renders inside a sandboxed iframe.

const POLL_GRACE_MS = 30000;
const PAGE_SIZE = 50;
const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', Icon: Inbox },
  { id: 'Sent', label: 'Sent', Icon: Send },
];

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const diff = Date.now() - date.getTime();
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function formatFullDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortFile(name) {
  const text = String(name || 'file');
  return text.length > 28 ? `${text.slice(0, 16)}…${text.slice(-9)}` : text;
}

function initialsFor(value) {
  const text = String(value || '').trim();
  if (!text) return '?';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function senderLabel(message) {
  return message?.from_name || message?.from_email || 'Unknown sender';
}

function attachmentsOf(message) {
  return Array.isArray(message?.attachments) ? message.attachments : [];
}

function replySubjectFor(subject) {
  const text = String(subject || '').trim();
  if (!text) return 'Re: (no subject)';
  return /^re\s*:/i.test(text) ? text : `Re: ${text}`;
}

/**
 * Strip what a sandboxed iframe does not already neutralise, and block remote
 * images until the reader asks for them (tracking pixels).
 */
export function buildEmailDocument(html, { allowImages = false } = {}) {
  let body = String(html || '');
  body = body
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/<\s*\/\s*(script|iframe|object|embed|link|meta|base|form)\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  if (!allowImages) {
    body = body.replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
      const cleaned = String(attrs).replace(/\ssrc(set)?\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<img${cleaned} alt="Image blocked" style="border:1px dashed #cbd5e1;padding:6px;color:#64748b;font-size:11px;">`;
    });
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:0;background:#fff;}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;padding:16px;word-break:break-word;}
    img{max-width:100%;height:auto;}
    a{color:#0f766e;}
    table{max-width:100%;border-collapse:collapse;}
    blockquote{margin:8px 0;padding-left:10px;border-left:2px solid #e2e8f0;color:#64748b;}
  </style></head><body>${body}</body></html>`;
}

export default function BulkMailbox({ senders = [], defaultEmail = '' }) {
  const [mailbox, setMailbox] = useState(defaultEmail || '');
  const [folder, setFolder] = useState('INBOX');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [lastSynced, setLastSynced] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [allowImages, setAllowImages] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [replyBcc, setReplyBcc] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [replyFiles, setReplyFiles] = useState([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState(null);
  const [replyNotice, setReplyNotice] = useState(null);
  const lastAutoSyncRef = useRef(0);

  const isSent = folder === 'Sent';
  const mailboxOptions = useMemo(
    () => senders.map((sender) => sender.email).filter(Boolean),
    [senders],
  );

  useEffect(() => {
    if (mailbox || !mailboxOptions.length) return;
    const preferred = mailboxOptions.find((email) => email === defaultEmail) || mailboxOptions[0];
    setMailbox(preferred);
  }, [mailboxOptions, defaultEmail, mailbox]);

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!mailbox) return;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        email: mailbox,
        folder,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiGet(`/accounts/bulk-email/mailbox/messages?${params.toString()}`);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setTotal(Number(data?.total) || 0);
      setInboxTotal(Number(data?.inbox_total) || 0);
      setSentTotal(Number(data?.sent_total) || 0);
      setUnread(Number(data?.unread) || 0);
      setLastSynced(data?.last_synced_at || null);
      setError(data?.last_error || null);
    } catch (e) {
      setError(e?.message || 'Could not load the mailbox.');
      setMessages([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mailbox, folder, search, page]);

  useEffect(() => {
    if (!mailbox) return undefined;
    const timer = setTimeout(() => { loadMessages(); }, search.trim() ? 350 : 0);
    return () => clearTimeout(timer);
  }, [loadMessages, search]);

  useEffect(() => {
    if (!mailbox) return undefined;
    const timer = setInterval(() => { loadMessages({ silent: true }); }, POLL_GRACE_MS);
    return () => clearInterval(timer);
  }, [loadMessages]);

  // Sync once when a mailbox is opened/selected, so nobody has to press Sync.
  // The 60s guard keeps tab switches from hammering IMAP.
  useEffect(() => {
    if (!mailbox) return undefined;
    if (Date.now() - lastAutoSyncRef.current < 60000) return undefined;
    lastAutoSyncRef.current = Date.now();
    let cancelled = false;
    (async () => {
      try {
        const result = await apiPost('/accounts/bulk-email/mailbox/sync', { email: mailbox }, 120000);
        if (!cancelled && result?.error) setError(result.error);
        if (!cancelled) await loadMessages({ silent: true });
      } catch {
        // Keep whatever list is already on screen; the manual button still works.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailbox]);

  const pushToast = useCallback((row) => {
    const id = row?.id || Date.now();
    setToasts((prev) => {
      if (prev.some((toast) => toast.id === id)) return prev;
      return [...prev.slice(-2), { id, row }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 9000);
    loadMessages({ silent: true }).catch(() => {});
  }, [loadMessages]);

  // Backend broadcasts a db:change INSERT whenever the IMAP poll stores new
  // mail, so the list and the notification arrive without a manual refresh.
  useRealtime('email_messages', {
    event: 'INSERT',
    enabled: Boolean(mailbox),
    onInsert: (row) => {
      if (!row || row.folder !== 'INBOX') return;
      if (String(row.account_email || '').toLowerCase() !== String(mailbox || '').toLowerCase()) return;
      pushToast(row);
    },
  });

  const clearReply = () => {
    setReplyOpen(false);
    setReplyText('');
    setReplyTo('');
    setReplyCc('');
    setReplyBcc('');
    setReplySubject('');
    setShowCc(false);
    setShowBcc(false);
    setReplyFiles([]);
    setReplyError(null);
  };

  const resetView = () => {
    setSelectedId(null);
    setMessage(null);
    setAllowImages(false);
    setReplyNotice(null);
    clearReply();
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleSelectAll = () => setSelectedIds((prev) => (
    messages.length > 0 && prev.size === messages.length
      ? new Set()
      : new Set(messages.map((item) => item.id))
  ));

  const runBulk = async (action, ids) => {
    const list = Array.isArray(ids) && ids.length ? ids : Array.from(selectedIds);
    if (!list.length || bulkBusy) return;
    if (action === 'delete' && !window.confirm(
      `Delete ${list.length} message${list.length === 1 ? '' : 's'}? This also moves them to Trash on the mail server.`,
    )) return;

    setBulkBusy(true);
    setError(null);
    try {
      await apiPost('/accounts/bulk-email/mailbox/messages/bulk', { ids: list, action });
      clearSelection();
      if (action === 'delete' && selectedId && list.includes(selectedId)) resetView();
      await loadMessages({ silent: true });
    } catch (e) {
      setError(e?.message || 'Could not update the selected messages.');
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleRead = async (row) => {
    const read = !row.is_read;
    setMessages((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_read: read } : item)));
    try {
      await apiPost(`/accounts/bulk-email/mailbox/messages/${row.id}/read`, { read });
      setUnread((prev) => Math.max(0, prev + (read ? -1 : 1)));
    } catch (e) {
      setMessages((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_read: row.is_read } : item)));
      setError(e?.message || 'Could not change the read state.');
    }
  };

  const toggleStar = async (row) => {
    const starred = !row.is_starred;
    setMessages((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_starred: starred } : item)));
    setMessage((prev) => (prev && prev.id === row.id ? { ...prev, is_starred: starred } : prev));
    try {
      await apiPost('/accounts/bulk-email/mailbox/messages/bulk', {
        ids: [row.id],
        action: starred ? 'star' : 'unstar',
      });
    } catch (e) {
      setMessages((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_starred: row.is_starred } : item)));
      setMessage((prev) => (prev && prev.id === row.id ? { ...prev, is_starred: row.is_starred } : prev));
      setError(e?.message || 'Could not update the star.');
    }
  };

  const changeFolder = (next) => {
    if (next === folder) return;
    setFolder(next);
    setPage(1);
    setMessages([]);
    clearSelection();
    resetView();
  };

  const changeMailbox = (next) => {
    setMailbox(next);
    setPage(1);
    setMessages([]);
    clearSelection();
    resetView();
  };

  const openMessage = async (row) => {
    setSelectedId(row.id);
    setMessage(null);
    setLoadingMessage(true);
    setAllowImages(false);
    setError(null);
    setReplyNotice(null);
    clearReply();
    try {
      const data = await apiGet(`/accounts/bulk-email/mailbox/messages/${row.id}`);
      setMessage(data);
      setReplyTo(data.from_email || '');
      setReplySubject(replySubjectFor(data.subject));
      if (!isSent && !row.is_read) {
        setMessages((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_read: true } : item)));
        setUnread((prev) => Math.max(0, prev - 1));
        apiPost(`/accounts/bulk-email/mailbox/messages/${row.id}/read`, { read: true }).catch(() => {});
      }
    } catch (e) {
      setError(e?.message || 'Could not open this message.');
    } finally {
      setLoadingMessage(false);
    }
  };

  const runSync = async () => {
    if (!mailbox || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await apiPost('/accounts/bulk-email/mailbox/sync', { email: mailbox }, 180000);
      if (result?.error) setError(result.error);
      await loadMessages({ silent: true });
    } catch (e) {
      setError(e?.message || 'Could not sync this mailbox.');
    } finally {
      setSyncing(false);
    }
  };

  const downloadAttachment = async (attachment) => {
    if (!message || downloading !== null) return;
    setDownloading(attachment.index);
    try {
      const blob = await apiGetBlob(
        `/accounts/bulk-email/mailbox/messages/${message.id}/attachments/${attachment.index}`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setError(e?.message || 'Could not download this attachment.');
    } finally {
      setDownloading(null);
    }
  };

  const sendReply = async () => {
    if (!message || sendingReply) return;
    if (!replyText.trim()) { setReplyError('Write a reply first.'); return; }
    setSendingReply(true);
    setReplyError(null);
    try {
      const form = new FormData();
      form.append('text', replyText);
      form.append('to', replyTo.trim());
      form.append('subject', replySubject.trim());
      if (replyCc.trim()) form.append('cc', replyCc.trim());
      if (replyBcc.trim()) form.append('bcc', replyBcc.trim());
      replyFiles.forEach((file) => form.append('attachments', file));
      await apiPost(`/accounts/bulk-email/mailbox/messages/${message.id}/reply`, form, 180000);
      clearReply();
      setReplyNotice('Reply sent.');
      setSentTotal((prev) => prev + 1);
      setTimeout(() => setReplyNotice(null), 6000);
    } catch (e) {
      setReplyError(e?.message || 'Could not send the reply.');
    } finally {
      setSendingReply(false);
    }
  };

  if (!mailboxOptions.length) {
    return (
      <section className="be-card be-gmail-empty">
        <Inbox size={26} strokeWidth={1.6} aria-hidden="true" />
        <span>No sender email added yet. Add a sender to read its mailbox here.</span>
      </section>
    );
  }

  const attachments = attachmentsOf(message);
  const hasBodyHtml = Boolean(message?.body_html);
  const pageStart = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(page * PAGE_SIZE, total);
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;
  const initializing = !mailbox;

  return (
    <section className="be-gmail">
      <div className="be-gmail-topbar">
        <div className="be-gmail-tools">
          <input
            type="checkbox"
            className="be-gmail-check"
            checked={messages.length > 0 && selectedIds.size === messages.length}
            onChange={toggleSelectAll}
            aria-label="Select all messages"
            title="Select all"
          />
          <button
            type="button"
            className="be-gmail-icon"
            onClick={runSync}
            disabled={syncing}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={syncing ? 'be-spin' : undefined} />
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="be-gmail-selcount">{selectedIds.size} selected</span>
              <button
                type="button"
                className="be-gmail-icon"
                onClick={() => runBulk('read')}
                disabled={bulkBusy}
                title="Mark as read"
                aria-label="Mark as read"
              >
                <MailOpen size={15} />
              </button>
              <button
                type="button"
                className="be-gmail-icon"
                onClick={() => runBulk('unread')}
                disabled={bulkBusy}
                title="Mark as unread"
                aria-label="Mark as unread"
              >
                <Mail size={15} />
              </button>
              <button
                type="button"
                className="be-gmail-icon is-danger"
                onClick={() => runBulk('delete')}
                disabled={bulkBusy}
                title="Delete"
                aria-label="Delete"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>

        <label className="be-gmail-search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelection(); }}
            placeholder="Search mail"
            aria-label="Search mail"
          />
        </label>

        <div className="be-gmail-topbar-actions">
          <select
            className="be-gmail-mailbox"
            value={mailbox}
            onChange={(e) => changeMailbox(e.target.value)}
            aria-label="Mailbox"
          >
            {mailboxOptions.map((email) => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
        </div>

        <div className="be-gmail-pager-top">
          <span>{total ? `${pageStart}–${pageEnd} of ${total}` : '0 messages'}</span>
          <button
            type="button"
            onClick={() => { setPage((value) => Math.max(1, value - 1)); clearSelection(); }}
            disabled={!hasPrev || loading}
            aria-label="Previous page"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => { setPage((value) => value + 1); clearSelection(); }}
            disabled={!hasNext || loading}
            aria-label="Next page"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {error && (
        <div className="be-alert be-gmail-alert">
          <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="be-gmail-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="be-gmail-toast">
            <button
              type="button"
              className="be-gmail-toast-main"
              onClick={() => {
                openMessage(toast.row);
                setToasts((prev) => prev.filter((item) => item.id !== toast.id));
              }}
            >
              <span className="be-gmail-toast-icon"><Mail size={15} strokeWidth={2} aria-hidden="true" /></span>
              <span className="be-gmail-toast-text">
                <strong>{senderLabel(toast.row)}</strong>
                <span>{toast.row.subject || '(no subject)'}</span>
              </span>
            </button>
            <button
              type="button"
              className="be-gmail-toast-close"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss notification"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>

      <div className="be-gmail-body">
        <nav className="be-gmail-nav" aria-label="Mailbox folders">
          <div className="be-gmail-nav-label">Mailbox</div>
          {FOLDERS.map((item) => {
            const Icon = item.Icon;
            const count = item.id === 'INBOX' ? unread : sentTotal;
            return (
              <button
                key={item.id}
                type="button"
                className={`be-gmail-folder${folder === item.id ? ' is-active' : ''}`}
                onClick={() => changeFolder(item.id)}
              >
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
                {count > 0 && <span className="be-gmail-folder-count">{count}</span>}
              </button>
            );
          })}
          <div className="be-gmail-nav-foot">
            {inboxTotal} in inbox
            <br />
            {lastSynced ? `Synced ${formatWhen(lastSynced)}` : 'Not synced yet'}
          </div>
        </nav>

        <div className="be-gmail-content">
          {!selectedId && (
            <>
              <div className="be-gmail-list" role="list" aria-busy={loading || initializing}>
                {(loading || initializing) && (
                  <div className="be-gmail-loading">
                    <Loader2 size={22} className="be-spin" />
                    <span>Loading mailbox…</span>
                  </div>
                )}

                {!loading && !initializing && !messages.length && (
                  <div className="be-empty">
                    <Mail size={24} strokeWidth={1.6} aria-hidden="true" />
                    <span>
                      {search.trim()
                        ? 'No mail matches this search.'
                        : isSent
                          ? 'Nothing sent from this mailbox yet. Sent campaigns appear here.'
                          : 'No messages yet. Press Sync to check the inbox.'}
                    </span>
                  </div>
                )}

                {!loading && !initializing && messages.map((row) => {
                  const files = attachmentsOf(row);
                  return (
                    <div
                      key={row.id}
                      role="listitem"
                      tabIndex={0}
                      className={`be-gmail-row${row.is_read || isSent ? '' : ' is-unread'}${selectedIds.has(row.id) ? ' is-selected' : ''}`}
                      onClick={() => openMessage(row)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openMessage(row); }}
                    >
                      <input
                        type="checkbox"
                        className="be-gmail-check"
                        checked={selectedIds.has(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.subject || 'message'}`}
                      />
                      <button
                        type="button"
                        className={`be-gmail-star${row.is_starred ? ' is-on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleStar(row); }}
                        title={row.is_starred ? 'Unstar' : 'Star'}
                        aria-label={row.is_starred ? 'Unstar' : 'Star'}
                      >
                        <Star size={14} strokeWidth={2} fill={row.is_starred ? 'currentColor' : 'none'} />
                      </button>

                      <span className="be-gmail-sender">
                        {isSent
                          ? (row.to_name || row.to_email || 'Recipients')
                          : senderLabel(row)}
                      </span>
                      <span className="be-gmail-summary">
                        <span className="be-gmail-line">
                          <span className="be-gmail-subject">{row.subject || '(no subject)'}</span>
                          {row.snippet ? <span className="be-gmail-snippet"> - {row.snippet}</span> : null}
                        </span>
                        {files.length > 0 && (
                          <span className="be-gmail-chips">
                            {files.slice(0, 3).map((file) => (
                              <span key={file.index} className="be-gmail-chip">
                                <FileText size={11} strokeWidth={2} aria-hidden="true" />
                                {shortFile(file.filename)}
                              </span>
                            ))}
                            {files.length > 3 && (
                              <span className="be-gmail-chip">+{files.length - 3}</span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="be-gmail-time">{formatWhen(row.received_at)}</span>
                      <span className="be-gmail-row-actions">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRead(row); }}
                          title={row.is_read ? 'Mark as unread' : 'Mark as read'}
                          aria-label={row.is_read ? 'Mark as unread' : 'Mark as read'}
                        >
                          {row.is_read ? <Mail size={14} /> : <MailOpen size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); runBulk('delete', [row.id]); }}
                          title="Delete"
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {selectedId && (
            <div className="be-gmail-read">
              <div className="be-gmail-read-toolbar">
                <button type="button" className="be-gmail-back" onClick={resetView}>
                  <ArrowLeft size={14} strokeWidth={2} /> Back
                </button>
                {message?.campaign_id ? (
                  <span className="be-gmail-campaign">Campaign #{message.campaign_id}</span>
                ) : null}
                {message && (
                  <span className="be-gmail-read-tools">
                    <button
                      type="button"
                      className={`be-gmail-star${message.is_starred ? ' is-on' : ''}`}
                      onClick={() => toggleStar(message)}
                      title={message.is_starred ? 'Unstar' : 'Star'}
                      aria-label={message.is_starred ? 'Unstar' : 'Star'}
                    >
                      <Star size={15} strokeWidth={2} fill={message.is_starred ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => runBulk('delete', [message.id])}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              </div>

              {loadingMessage && (
                <div className="be-gmail-loading"><Loader2 size={22} className="be-spin" /><span>Opening…</span></div>
              )}

              {!loadingMessage && !message && (
                <div className="be-gmail-empty">
                  <AlertCircle size={22} strokeWidth={1.6} aria-hidden="true" />
                  <span>Could not open this message.</span>
                </div>
              )}

              {!loadingMessage && message && (
                <div className="be-gmail-read-scroll">
                  <h2 className="be-gmail-read-subject">{message.subject || '(no subject)'}</h2>

                  <div className="be-gmail-read-head">
                    <span className="be-gmail-avatar" aria-hidden="true">{initialsFor(senderLabel(message))}</span>
                    <div className="be-gmail-read-who">
                      <div>
                        <strong>{senderLabel(message)}</strong>
                        {message.from_email ? <span className="be-gmail-address"> &lt;{message.from_email}&gt;</span> : null}
                      </div>
                      <div className="be-gmail-address">
                        to {message.to_name
                          ? `${message.to_name}${message.to_email ? ` <${message.to_email}>` : ''}`
                          : (message.to_email || mailbox)}
                      </div>
                      {message.cc ? (
                        <div className="be-gmail-address">cc {message.cc}</div>
                      ) : null}
                    </div>
                    <span className="be-gmail-read-date">{formatFullDate(message.received_at)}</span>
                  </div>

                  {hasBodyHtml && !allowImages && (
                    <div className="be-gmail-read-actions">
                      <button type="button" className="be-link-btn" onClick={() => setAllowImages(true)}>
                        Load images
                      </button>
                    </div>
                  )}

                  {hasBodyHtml ? (
                    <iframe
                      key={`${message.id}-${allowImages ? 'img' : 'noimg'}`}
                      className="be-gmail-frame"
                      title={`Message: ${message.subject || 'email'}`}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={buildEmailDocument(message.body_html, { allowImages })}
                    />
                  ) : (
                    <pre className="be-gmail-text">{message.body_text || message.snippet || '(no text)'}</pre>
                  )}

                  {attachments.length > 0 && (
                    <div className="be-gmail-attachments">
                      <div className="be-gmail-attachments-label">
                        <Paperclip size={13} strokeWidth={2} aria-hidden="true" />
                        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
                      </div>
                      {attachments.map((file) => (
                        <button
                          key={file.index}
                          type="button"
                          className="be-gmail-attachment"
                          onClick={() => downloadAttachment(file)}
                          disabled={downloading !== null}
                        >
                          {downloading === file.index
                            ? <Loader2 size={14} className="be-spin" />
                            : <Paperclip size={14} />}
                          <span className="be-gmail-attachment-name">{file.filename}</span>
                          <span className="be-gmail-attachment-size">{formatBytes(file.size)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!isSent && (
                    <div className="be-gmail-reply">
                      {replyNotice && <div className="be-gmail-reply-notice">{replyNotice}</div>}

                      {!replyOpen ? (
                        <button
                          type="button"
                          className="be-gmail-reply-open"
                          onClick={() => { setReplyOpen(true); setReplyError(null); }}
                        >
                          <Reply size={15} strokeWidth={2} /> Reply
                        </button>
                      ) : (
                        <div className="be-gmail-composer">
                          <div className="be-gmail-composer-head">
                            <span>Reply</span>
                            <span className="be-gmail-composer-head-actions">
                              <button type="button" className="be-link-btn" onClick={() => setShowCc((v) => !v)}>
                                Cc
                              </button>
                              <button type="button" className="be-link-btn" onClick={() => setShowBcc((v) => !v)}>
                                Bcc
                              </button>
                              <button type="button" onClick={clearReply} aria-label="Close reply">
                                <X size={14} strokeWidth={2} />
                              </button>
                            </span>
                          </div>

                          <label className="be-gmail-composer-field">
                            <span>To</span>
                            <input
                              value={replyTo}
                              onChange={(e) => setReplyTo(e.target.value)}
                              placeholder="name@example.com"
                            />
                          </label>

                          {showCc && (
                            <label className="be-gmail-composer-field">
                              <span>Cc</span>
                              <input
                                value={replyCc}
                                onChange={(e) => setReplyCc(e.target.value)}
                                placeholder="cc@example.com, another@example.com"
                              />
                            </label>
                          )}

                          {showBcc && (
                            <label className="be-gmail-composer-field">
                              <span>Bcc</span>
                              <input
                                value={replyBcc}
                                onChange={(e) => setReplyBcc(e.target.value)}
                                placeholder="bcc@example.com"
                              />
                            </label>
                          )}

                          <label className="be-gmail-composer-field">
                            <span>Subject</span>
                            <input
                              value={replySubject}
                              onChange={(e) => setReplySubject(e.target.value)}
                              placeholder="Subject"
                            />
                          </label>

                          <textarea
                            className="be-gmail-composer-input"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your reply…"
                            rows={6}
                          />
                          <div className="be-gmail-composer-actions">
                            <label className="be-gmail-composer-attach" title="Attach files">
                              <Paperclip size={15} strokeWidth={2} />
                              <input
                                type="file"
                                multiple
                                hidden
                                onChange={(e) => setReplyFiles(Array.from(e.target.files || []))}
                              />
                            </label>
                            {replyFiles.length > 0 && (
                              <span className="be-gmail-composer-files">{replyFiles.length} file(s)</span>
                            )}
                            <button
                              type="button"
                              className="be-gmail-send"
                              onClick={sendReply}
                              disabled={sendingReply || !replyText.trim()}
                            >
                              {sendingReply
                                ? <><Loader2 size={14} className="be-spin" /> Sending…</>
                                : <><Send size={14} strokeWidth={2} /> Send</>}
                            </button>
                          </div>
                          {replyError && <div className="be-alert">{replyError}</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
