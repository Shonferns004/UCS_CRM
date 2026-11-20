import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { apiGet, apiGetBlob, apiPost } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';

// Inbound mailbox for the Bulk Email page, laid out like Gmail: search bar,
// folder rail, full-width message rows with attachment chips, and a reading
// view that replaces the list. Sent mail is mirrored from the campaign itself,
// so campaigns show up with their attachments without an IMAP round trip.
//
// Message HTML is untrusted, so it renders inside a sandboxed iframe.

const POLL_GRACE_MS = 30000;
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
  const [mailbox, setMailbox] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState([]);
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
      const params = new URLSearchParams({ email: mailbox, folder, limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiGet(`/accounts/bulk-email/mailbox/messages?${params.toString()}`);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
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
  }, [mailbox, folder, search]);

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

  const resetView = () => {
    setSelectedId(null);
    setMessage(null);
    setAllowImages(false);
  };

  const changeFolder = (next) => {
    if (next === folder) return;
    setFolder(next);
    setMessages([]);
    resetView();
  };

  const changeMailbox = (next) => {
    setMailbox(next);
    setMessages([]);
    resetView();
  };

  const openMessage = async (row) => {
    setSelectedId(row.id);
    setMessage(null);
    setLoadingMessage(true);
    setAllowImages(false);
    setError(null);
    try {
      const data = await apiGet(`/accounts/bulk-email/mailbox/messages/${row.id}`);
      setMessage(data);
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

  return (
    <section className="be-gmail">
      <div className="be-gmail-topbar">
        <label className="be-gmail-search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          <button type="button" className="be-gmail-sync" onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 size={14} className="be-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing…' : 'Sync'}
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
            <div className="be-gmail-list" role="list">
              {loading && (
                <div className="be-empty"><Loader2 size={20} className="be-spin" /><span>Loading mailbox…</span></div>
              )}

              {!loading && !messages.length && (
                <div className="be-empty">
                  <Mail size={24} strokeWidth={1.6} aria-hidden="true" />
                  <span>
                    {isSent
                      ? 'Nothing sent from this mailbox yet. Sent campaigns appear here.'
                      : 'No messages yet. Press Sync to check the inbox.'}
                  </span>
                </div>
              )}

              {!loading && messages.map((row) => {
                const files = attachmentsOf(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="listitem"
                    className={`be-gmail-row${row.is_read || isSent ? '' : ' is-unread'}`}
                    onClick={() => openMessage(row)}
                  >
                    <span className="be-gmail-sender">
                      {isSent ? (row.to_email || 'Recipients') : senderLabel(row)}
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
                  </button>
                );
              })}
            </div>
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
              </div>

              {loadingMessage && (
                <div className="be-gmail-empty"><Loader2 size={20} className="be-spin" /><span>Opening…</span></div>
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
                      <div className="be-gmail-address">to {message.to_email || mailbox}</div>
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
