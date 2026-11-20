import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Inbox,
  LayoutTemplate,
  Mail,
  Paperclip,
  PenLine,
  RefreshCw,
  Send,
  Users,
  X,
} from 'lucide-react';
import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut } from '../api/auth';
import EmailBuilder from '../components/email-builder/EmailBuilder';
import BulkMailbox from '../components/BulkMailbox';
import { useRealtime } from '../../../hooks/useRealtime';
import './bulkEmail.css';

const SOURCES = [
  { value: 'donors', label: 'Donors' },
  { value: 'beneficiaries', label: 'Beneficiaries' },
  { value: 'all', label: 'Donors + Beneficiaries' },
  { value: 'manual', label: 'Manual emails' },
];

const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled', 'interrupted']);
const STATUS_LABEL = {
  queued: 'Queued',
  processing: 'Sending',
  completed: 'Completed',
  partial: 'Partially sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};

const TABS = [
  { id: 'bulk', label: 'Bulk Message', Icon: Send },
  { id: 'history', label: 'History', Icon: History },
  { id: 'templates', label: 'Templates', Icon: LayoutTemplate },
  { id: 'builder', label: 'Email Builder', Icon: PenLine },
  { id: 'mailbox', label: 'Mailbox', Icon: Inbox },
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENDER_STORAGE_KEY = 'bulkEmail.senderId';

// Bulk senders are no longer Gmail-only. A preset only prefills the SMTP
// server; every field stays editable so any provider can be used.
const SENDER_PROVIDERS = [
  {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    passwordLabel: 'App password',
    passwordPlaceholder: '16-character Google app password',
    hint: 'Google Account → Security → 2-Step Verification → App passwords.',
  },
  {
    id: 'hostinger',
    label: 'Hostinger email',
    host: 'smtp.hostinger.com',
    port: 465,
    passwordLabel: 'Mailbox password',
    passwordPlaceholder: 'Mailbox password (not an app password)',
    hint: 'Use the password set for this mailbox in hPanel → Emails. Port 465 (SSL), or 587 for STARTTLS.',
  },
  {
    id: 'custom',
    label: 'Other SMTP server',
    host: '',
    port: 587,
    passwordLabel: 'Password',
    passwordPlaceholder: 'SMTP password',
    hint: 'Copy the SMTP server, port and password from your email provider.',
  },
];

function providerPreset(id) {
  return SENDER_PROVIDERS.find((provider) => provider.id === id) || SENDER_PROVIDERS[0];
}

function providerFromHost(host) {
  const value = String(host || '').toLowerCase();
  if (!value) return 'custom';
  if (value.includes('gmail') || value.includes('googlemail')) return 'gmail';
  if (value.includes('hostinger')) return 'hostinger';
  return 'custom';
}

function defaultSenderForm() {
  const preset = SENDER_PROVIDERS[0];
  return {
    display_name: '',
    email: '',
    app_password: '',
    provider: preset.id,
    smtp_host: preset.host,
    smtp_port: preset.port,
  };
}

function parseManualEmails(value) {
  const found = String(value || '').match(EMAIL_RE) || [];
  const seen = new Set();
  const out = [];
  for (const raw of found) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: null });
  }
  return out;
}

function initialsFor(value) {
  const text = String(value || '').trim();
  if (!text) return '?';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

export default function BulkEmail() {
  const [source, setSource] = useState('donors');
  const [search, setSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
const [mediaFiles, setMediaFiles] = useState([]);
const [mediaError, setMediaError] = useState(null);
const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [activeTab, setActiveTab] = useState('bulk');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '' });
  const [builderTemplateId, setBuilderTemplateId] = useState(null);
  const [htmlBody, setHtmlBody] = useState('');
  const pollTimer = useRef(null);

  // Sender mailbox picker (bulk_email_senders)
  const [senders, setSenders] = useState([]);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [senderId, setSenderId] = useState('');
  const [showSenderForm, setShowSenderForm] = useState(false);
  const [showSenderList, setShowSenderList] = useState(false);
  const [senderForm, setSenderForm] = useState(defaultSenderForm);
  const [editingSenderId, setEditingSenderId] = useState(null);
  const [senderSaving, setSenderSaving] = useState(false);
  const [senderError, setSenderError] = useState(null);
  const [senderNotice, setSenderNotice] = useState(null);
  const [senderTest, setSenderTest] = useState(null);
  const [showSenderPassword, setShowSenderPassword] = useState(false);
  const [mailboxUnread, setMailboxUnread] = useState(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const loadSenders = useCallback(async () => {
    setSendersLoading(true);
    try {
      const data = await apiGet('/accounts/bulk-email/senders');
      const list = Array.isArray(data?.senders) ? data.senders : Array.isArray(data) ? data : [];
      setSenders(list);
      setSenderId((prev) => {
        const saved = String(prev || (typeof localStorage !== 'undefined' ? localStorage.getItem(SENDER_STORAGE_KEY) : '') || '');
        const match = list.find((sender) => String(sender.id) === saved);
        return match ? String(match.id) : (list[0] ? String(list[0].id) : '');
      });
    } catch (e) {
      setSenderError(e?.message || 'Could not load sender emails.');
    } finally {
      setSendersLoading(false);
    }
  }, []);

  useEffect(() => { loadSenders(); }, [loadSenders]);

  useEffect(() => {
    if (senderId) localStorage.setItem(SENDER_STORAGE_KEY, senderId);
  }, [senderId]);

  const selectedSender = useMemo(
    () => senders.find((sender) => String(sender.id) === String(senderId)) || null,
    [senders, senderId],
  );

  const senderPreset = providerPreset(senderForm.provider);

  // Unread mail badge on the Mailbox tab. Refetched when the tab changes so
  // reading inside the mailbox clears it instead of leaving a stale number.
  useEffect(() => {
    const email = selectedSender?.email || senders[0]?.email;
    if (!email) { setMailboxUnread(0); return undefined; }
    let cancelled = false;
    apiGet(`/accounts/bulk-email/mailbox/messages?email=${encodeURIComponent(email)}&limit=1`)
      .then((data) => { if (!cancelled) setMailboxUnread(Number(data?.unread) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSender, senders, activeTab]);

  useRealtime('email_messages', {
    event: 'INSERT',
    onInsert: (row) => {
      if (!row || row.folder !== 'INBOX') return;
      setMailboxUnread((prev) => prev + 1);
    },
  });

  const handleExcelUpload = async (file) => {
    if (!file) return;
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!rows.length) throw new Error('No data rows found in the Excel file.');
      const emails = [];
      for (const row of rows) {
        let email = '';
        for (const [key, value] of Object.entries(row || {})) {
          const k = String(key || '').toLowerCase();
          const v = String(value || '').trim();
          if (!email && (k.includes('email') || /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v))) {
            email = v;
          }
        }
        if (email) emails.push(email);
      }
      if (!emails.length) throw new Error('No email addresses found in the Excel file.');
      const unique = [...new Set(emails.map((e) => e.toLowerCase()))];
      setSource('manual');
      setManualText((prev) => {
        const existing = prev ? prev.trim() : '';
        const next = unique.join('\n');
        return existing ? `${existing}\n${next}` : next;
      });
    } catch (e) {
      setError(e?.message || 'Could not read the Excel file.');
    }
  };

  const manualRecipients = useMemo(() => parseManualEmails(manualText), [manualText]);

  const htmlPreview = useMemo(() => {
    if (!htmlBody) return '';
    return htmlBody
      .replace(/\{\{\s*name\s*\}\}/gi, 'Sample Donor')
      .replace(/\{\{\s*email\s*\}\}/gi, 'donor@example.com');
  }, [htmlBody]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await apiGet('/accounts/bulk-email/logs?limit=25');
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (e) {
      setLogsError(e?.message || 'Could not load send history.');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplateError(null);
    try {
      const data = await apiGet('/accounts/bulk-email/templates');
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (e) {
      setTemplateError(e?.message || 'Could not load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const applyCampaignLog = useCallback((log) => {
    setProgress((prev) => ({
      ...prev,
      status: log.status,
      total: log.total_recipients || 0,
      sent: log.sent_count || 0,
      failed: log.failed_count || 0,
      processed: log.processed_count || 0,
    }));
  }, []);

  const pollCampaign = useCallback((id) => {
    stopPolling();
    const tick = async () => {
      try {
        const data = await apiGet(`/accounts/bulk-email/logs/${id}`);
        applyCampaignLog(data);
        if (TERMINAL_STATUSES.has(data.status)) {
          setResult({
            sent: data.sent_count || 0,
            total: data.total_recipients || 0,
            failed: data.failed_count || 0,
            skipped: 0,
            status: data.status,
            log_id: data.id,
            results: (data.recipients || []).map((r) => ({
              email: r.email,
              ok: r.ok === true ? true : r.ok === false ? false : null,
              error: r.error || null,
            })),
          });
          setSending(false);
          await loadLogs();
          return;
        }
      } catch (e) {
        setError(e?.message || 'Could not load campaign progress.');
        setSending(false);
        return;
      }
      pollTimer.current = setTimeout(tick, 3000);
    };
    tick();
  }, [applyCampaignLog, loadLogs, stopPolling]);

useEffect(() => () => {
  mediaFiles.forEach((m) => m.preview && URL.revokeObjectURL(m.preview));
}, [mediaFiles]);

  useEffect(() => {
    if (source === 'manual') {
      setRecipients(manualRecipients);
      setSelected(new Set(manualRecipients.map((r) => r.email)));
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ source, limit: '500' });
        if (search.trim()) params.set('search', search.trim());
        const data = await apiGet(`/accounts/bulk-email/recipients?${params.toString()}`);
        if (cancelled) return;
        const list = Array.isArray(data?.recipients) ? data.recipients : [];
        setRecipients(list);
        setSelected(new Set(list.map((r) => r.email)));
      } catch (e) {
        if (cancelled) return;
        setRecipients([]);
        setSelected(new Set());
        setError(e?.message || 'Could not load recipients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, search, manualRecipients]);

  const toggle = (email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(recipients.map((r) => r.email)));
  const clearAll = () => setSelected(new Set());

const pickMedia = (files) => {
  const list = Array.from(files || []);
  if (!list.length) return;
  const accepted = [];
  let err = null;
  for (const file of list) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isImage && !isVideo && !isPdf) { err = 'Only image, video, or PDF files are allowed.'; continue; }
    if (file.size > 20 * 1024 * 1024) { err = 'Each attachment must be 20 MB or smaller.'; continue; }
    accepted.push({ file, preview: isImage || isVideo || isPdf ? URL.createObjectURL(file) : null });
  }
  if (err) setMediaError(err);
  else setMediaError(null);
  if (accepted.length) setMediaFiles((prev) => [...prev, ...accepted]);
};

const removeMedia = (index) => {
  setMediaFiles((prev) => {
    const next = [...prev];
    const removed = next.splice(index, 1)[0];
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    return next;
  });
};

const clearMedia = () => {
  setMediaFiles((prev) => {
    prev.forEach((m) => m.preview && URL.revokeObjectURL(m.preview));
    return [];
  });
  setMediaError(null);
};

const loadTemplateMedia = async (template) => {
  clearMedia();
  if (!template?.has_attachment && !(template?.attachment_count > 0)) return;
  try {
    const meta = await apiGet(`/accounts/bulk-email/templates/${template.id}/attachments`);
    const list = Array.isArray(meta?.attachments) ? meta.attachments : [];
    const files = [];
    for (const a of list) {
      const blob = await apiGetBlob(`/accounts/bulk-email/templates/${template.id}/attachments/${a.id}`);
      const file = new File([blob], a.filename || 'attachment', { type: a.contentType || blob.type || 'application/octet-stream' });
      files.push({ file, preview: (a.contentType || '').startsWith('image/') || (a.contentType || '').startsWith('video/') ? URL.createObjectURL(blob) : null });
    }
    // Fallback for legacy single-attachment templates not yet migrated.
    if (!files.length && template?.has_attachment) {
      const blob = await apiGetBlob(`/accounts/bulk-email/templates/${template.id}/attachment`);
      const file = new File([blob], template.attachment_name || 'attachment', { type: template.attachment_type || blob.type || 'application/octet-stream' });
      files.push({ file, preview: URL.createObjectURL(blob) });
    }
    setMediaFiles(files);
    setMediaError(null);
  } catch (e) {
    setMediaError(e?.message || 'Could not load the template attachments.');
  }
};

  const applyTemplateById = async (id) => {
    setSelectedTemplateId(id);
    const summary = templates.find((t) => String(t.id) === String(id));
    if (!summary) {
      setHtmlBody('');
      return;
    }
    try {
      const template = summary.has_design || summary.has_html
        ? await apiGet(`/accounts/bulk-email/templates/${summary.id}`)
        : summary;
      setSubject(template.subject || '');
      setBody(template.body || '');
      setHtmlBody(template.has_design ? (template.html || '') : '');
      loadTemplateMedia(template);
    } catch (e) {
      setError(e?.message || 'Could not load the template.');
    }
  };

  const applyTemplate = (id) => {
    if (!id) {
      setSelectedTemplateId('');
      setHtmlBody('');
      return;
    }
    applyTemplateById(id);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) { setTemplateError('Template name is required.'); return; }
    if (!subject.trim() || !body.trim()) { setTemplateError('Write a subject and body before saving a template.'); return; }
    setTemplateSaving(true);
    setTemplateError(null);
    try {
const form = new FormData();
form.append('name', templateName.trim());
form.append('subject', subject.trim());
form.append('body', body);
mediaFiles.forEach((m) => form.append('attachments', m.file));
if (!mediaFiles.length) form.append('remove_attachments', 'true');
      const created = await apiPost('/accounts/bulk-email/templates', form, 300000);
      setTemplateName('');
      setShowTemplateForm(false);
      await loadTemplates();
      if (created?.id) setSelectedTemplateId(String(created.id));
    } catch (e) {
      setTemplateError(e?.message || 'Could not save template.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const removeTemplate = async (id) => {
    if (!id) return;
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiDelete(`/accounts/bulk-email/templates/${id}`);
      if (String(selectedTemplateId) === String(id)) {
        setSelectedTemplateId('');
        setHtmlBody('');
      }
      if (String(builderTemplateId) === String(id)) setBuilderTemplateId(null);
      if (String(editingTemplateId) === String(id)) cancelTemplateEdit();
      await loadTemplates();
    } catch (e) {
      setTemplateError(e?.message || 'Could not delete template.');
    }
  };

  const editTemplate = (template) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name || '',
      subject: template.subject || '',
      body: template.body || '',
    });
    setTemplateError(null);
  };

  const cancelTemplateEdit = () => {
    setEditingTemplateId(null);
    setTemplateForm({ name: '', subject: '', body: '' });
    setTemplateError(null);
  };

  const saveTemplateForm = async () => {
    const name = templateForm.name.trim();
    const templateSubject = templateForm.subject.trim();
    const templateBody = templateForm.body;
    if (!name) { setTemplateError('Template name is required.'); return; }
    if (!templateSubject) { setTemplateError('Template subject is required.'); return; }
    if (!templateBody.trim()) { setTemplateError('Template body is required.'); return; }

    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const form = new FormData();
      form.append('name', name);
      form.append('subject', templateSubject);
      form.append('body', templateBody);

      if (editingTemplateId) {
        await apiPut(`/accounts/bulk-email/templates/${editingTemplateId}`, form);
      } else {
        await apiPost('/accounts/bulk-email/templates', form, 300000);
      }
      cancelTemplateEdit();
      await loadTemplates();
    } catch (e) {
      setTemplateError(e?.message || 'Could not save template.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const useTemplate = async (template) => {
    setSelectedTemplateId(String(template.id));
    try {
      const full = template.has_design || template.has_html
        ? await apiGet(`/accounts/bulk-email/templates/${template.id}`)
        : template;
      setSubject(full.subject || '');
      setBody(full.body || '');
      setHtmlBody(full.has_design ? (full.html || '') : '');
      loadTemplateMedia(full);
    } catch (e) {
      setError(e?.message || 'Could not load the template.');
    }
    setActiveTab('bulk');
  };

  const openTemplateInBuilder = (template) => {
    setBuilderTemplateId(template ? String(template.id) : null);
    setActiveTab('builder');
  };

  const clearHtmlTemplate = () => {
    setHtmlBody('');
    setSelectedTemplateId('');
  };

  const resetSenderForm = () => {
    setSenderForm(defaultSenderForm());
    setEditingSenderId(null);
    setShowSenderPassword(false);
    setSenderError(null);
    setShowSenderForm(false);
  };

  const startEditSender = (sender) => {
    setEditingSenderId(sender.id);
    setSenderForm({
      display_name: sender.display_name || '',
      email: sender.email || '',
      app_password: '',
      provider: providerFromHost(sender.smtp_host),
      smtp_host: sender.smtp_host || 'smtp.gmail.com',
      smtp_port: sender.smtp_port || 465,
    });
    setShowSenderPassword(false);
    setSenderError(null);
    setSenderNotice(null);
    setShowSenderForm(true);
  };

  const addSender = async () => {
    const email = senderForm.email.trim();
    const password = senderForm.app_password;
    const host = senderForm.smtp_host.trim().toLowerCase();
    const port = Number(senderForm.smtp_port);
    const preset = providerPreset(senderForm.provider);
    const isEdit = Boolean(editingSenderId);
    setSenderNotice(null);
    setSenderError(null);

    if (!email) { setSenderError('Email address is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setSenderError('Enter a valid email address.'); return; }
    if (!isEdit && !password.trim()) { setSenderError(`${preset.passwordLabel} is required.`); return; }
    if (!host) { setSenderError('SMTP server is required.'); return; }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setSenderError('Enter a valid SMTP port, for example 465 or 587.');
      return;
    }

    setSenderSaving(true);
    try {
      const payload = {
        display_name: senderForm.display_name.trim(),
        email,
        smtp_host: host,
        smtp_port: port,
      };
      // A blank password on edit means "keep the current one".
      if (password.trim()) payload.app_password = password;

      const saved = isEdit
        ? await apiPut(`/accounts/bulk-email/senders/${editingSenderId}`, payload)
        : await apiPost('/accounts/bulk-email/senders', payload, 120000);

      setSenderForm(defaultSenderForm());
      setEditingSenderId(null);
      setShowSenderPassword(false);
      setShowSenderForm(false);
      await loadSenders();
      if (saved?.id) setSenderId(String(saved.id));
      setSenderNotice(
        saved?.verified === false
          ? `Sender saved, but the login could not be verified. ${saved?.verify_message || ''}`.trim()
          : isEdit
            ? 'Sender updated and login verified.'
            : 'Sender added and login verified.',
      );
    } catch (e) {
      setSenderError(e?.message || `Could not ${isEdit ? 'update' : 'add'} the sender.`);
    } finally {
      setSenderSaving(false);
    }
  };

  const testSenderLogin = async (sender) => {
    setSenderTest({ id: sender.id, status: 'testing', message: '' });
    try {
      const result = await apiPost(`/accounts/bulk-email/senders/${sender.id}/test`, {}, 120000);
      setSenderTest({
        id: sender.id,
        status: result?.ok ? 'ok' : 'fail',
        message: result?.message || (result?.ok ? 'Login verified.' : 'Login failed.'),
      });
    } catch (e) {
      setSenderTest({ id: sender.id, status: 'fail', message: e?.message || 'Login check failed.' });
    }
  };

  const removeSender = async (sender) => {
    if (!window.confirm(`Delete sender "${sender.email}"? Campaigns already sent from it stay in history.`)) return;
    setSenderNotice(null);
    setSenderError(null);
    try {
      await apiDelete(`/accounts/bulk-email/senders/${sender.id}`);
      if (String(editingSenderId) === String(sender.id)) resetSenderForm();
      await loadSenders();
      setSenderNotice('Sender removed.');
    } catch (e) {
      setSenderError(e?.message || 'Could not delete the sender.');
    }
  };

  const send = async () => {
    const chosen = recipients.filter((r) => selected.has(r.email));
    if (!senderId) { setError('Select a sender email before sending.'); return; }
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!body.trim() && !htmlBody) { setError('Message body is required.'); return; }
    if (!chosen.length) { setError('Select at least one recipient.'); return; }

    setSending(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const form = new FormData();
form.append('sender_id', senderId);
form.append('subject', subject.trim());
form.append('text', body);
if (htmlBody) form.append('html', htmlBody);
form.append('source', source);
form.append('recipients', JSON.stringify(chosen));
mediaFiles.forEach((m) => form.append('attachments', m.file));

      // The server queues the campaign and replies immediately, then sends in
      // the background. Poll its progress instead of holding one long request
      // open (which used to time out after 5 minutes).
      const data = await apiPost('/accounts/bulk-email/send', form, 300000);
      setProgress({
        status: data.status || 'queued',
        total: data.total || chosen.length,
        sent: 0,
        failed: 0,
        processed: 0,
      });
      if (data.skipped > 0) {
        setProgress((prev) => (prev ? { ...prev, skipped: data.skipped } : prev));
      }
      await loadLogs();
      pollCampaign(data.log_id);
    } catch (e) {
      setError(e?.message || 'Could not send the campaign.');
      setSending(false);
    }
  };

  const resumeCampaign = async (id) => {
    setError(null);
    try {
      await apiPost(`/accounts/bulk-email/logs/${id}/resume`, {});
      setActiveTab('bulk');
      setSending(true);
      setResult(null);
      setProgress({ status: 'processing', total: 0, sent: 0, failed: 0, processed: 0 });
      pollCampaign(id);
    } catch (e) {
      setError(e?.message || 'Could not resume the campaign.');
    }
  };

  const cancelCampaign = async (id) => {
    try {
      await apiPost(`/accounts/bulk-email/logs/${id}/cancel`, {});
      await loadLogs();
    } catch (e) {
      setLogsError(e?.message || 'Could not cancel the campaign.');
    }
  };

  const openLog = async (log) => {
    setSelectedLog({ ...log, recipients: [], loading: true });
    try {
      const data = await apiGet(`/accounts/bulk-email/logs/${log.id}`);
      setSelectedLog(data);
    } catch (e) {
      setSelectedLog(null);
      setLogsError(e?.message || 'Could not load this log.');
    }
  };

  const failed = result?.results?.filter((r) => r.ok === false) || [];
  const progressPercent = progress && progress.total
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : 0;
  const campaignRunning = Boolean(progress) && !TERMINAL_STATUSES.has(progress.status);
  const resultTone = result
    ? (['cancelled', 'failed', 'interrupted', 'partial'].includes(result.status) || failed.length ? 'warn' : 'ok')
    : 'ok';
  const historyStats = useMemo(() => {
    let sent = 0;
    let failedCount = 0;
    for (const log of logs) {
      sent += Number(log.sent_count || 0);
      failedCount += Number(log.failed_count || 0);
    }
    return { campaigns: logs.length, sent, failed: failedCount };
  }, [logs]);

  return (
    <div className="be-page">
      <div className="be-head">
        <div className="be-head-main">
          <span className="be-head-icon" aria-hidden="true">
            <Mail size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h1>Bulk Email</h1>
            <p>Send one message to donors, beneficiaries, or a manual list of email addresses.</p>
          </div>
        </div>
        <span className={`be-head-status${campaignRunning ? ' is-running' : ''}`}>
          <span className="be-head-dot" aria-hidden="true" />
          {campaignRunning ? (STATUS_LABEL[progress?.status] || 'Sending') : 'Ready to send'}
        </span>
      </div>

      <div className="be-tabs" role="tablist" aria-label="Bulk email sections">
        {TABS.map((t) => {
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`be-tab${activeTab === t.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={15} strokeWidth={2} aria-hidden="true" />
              <span>{t.label}</span>
              {t.id === 'mailbox' && mailboxUnread > 0 && (
                <span className="be-tab-badge">{mailboxUnread > 99 ? '99+' : mailboxUnread}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && <div className="be-alert">{error}</div>}

      {activeTab === 'bulk' && campaignRunning && (
        <div className="be-progress">
          <div className="be-progress-head">
            <div className="be-progress-title">
              <span className="be-progress-pulse" aria-hidden="true" />
              <strong>{STATUS_LABEL[progress.status] || 'Sending'}…</strong>
            </div>
            <span className="be-progress-pct">{progressPercent}%</span>
          </div>
          <div className="be-progress-track">
            <div className="be-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="be-progress-meta">
            <span className="be-progress-chip">Processed <strong>{progress.processed}</strong> / {progress.total}</span>
            <span className="be-progress-chip be-status-ok">Sent {progress.sent}</span>
            <span className="be-progress-chip be-status-fail">Failed {progress.failed}</span>
            <span className="be-progress-chip">Queued {Math.max(0, progress.total - progress.processed)}</span>
            {progress.skipped > 0 && <span className="be-progress-chip">Skipped {progress.skipped} (unsubscribed)</span>}
          </div>
          <div className="be-progress-note">
            Emails send in batches of 5 with a short pause to stay within Gmail limits.
            This can take a few minutes and keeps running if you leave this page.
          </div>
        </div>
      )}

      {activeTab === 'bulk' && result && (
        <div className={`be-result${resultTone === 'warn' ? ' has-failures' : ''}`}>
          <div className="be-result-main">
            <span className="be-result-icon" aria-hidden="true">
              {resultTone === 'warn' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            </span>
            <div>
              <strong>
                {result.status === 'cancelled'
                  ? 'Campaign cancelled'
                  : result.status === 'interrupted'
                    ? 'Campaign interrupted'
                    : result.status === 'failed'
                      ? 'Campaign failed'
                      : result.status === 'partial'
                        ? 'Campaign finished with some failures'
                        : 'Campaign complete'}
              </strong>
              <span className="be-result-meta">
                Sent {result.sent} of {result.total}. Failed {result.failed}.
                {result.skipped > 0 ? ` Skipped ${result.skipped} unsubscribed.` : ''}
              </span>
            </div>
          </div>
          {failed.length > 0 && (
            <ul>
              {failed.map((r) => (
                <li key={r.email}><strong>{r.email}</strong> - {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'bulk' && (
      <div className="be-grid">
        <section className="be-card">
          <div className="be-card-head">
            <span className="be-step" aria-hidden="true">1</span>
            <div className="be-card-head-text">
              <h2>Recipients</h2>
              <p>Pick a source or paste addresses manually.</p>
            </div>
          </div>

          <div className="be-row">
            <label className="be-field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <span>Source</span>
              <select className="be-select" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {source !== 'manual' && (
              <label className="be-field" style={{ flex: '2 1 240px', marginBottom: 0 }}>
                <span>Search</span>
                <input
                  className="be-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email or phone"
                />
              </label>
            )}
          </div>

          {source === 'manual' && (
            <div className="be-field" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>Email addresses</span>
              <textarea
                className="be-textarea"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'one@example.com\ntwo@example.com'}
              />
              <div className="be-manual-foot">
                <label className="be-upload-inline">
                  <FileSpreadsheet size={15} strokeWidth={2} aria-hidden="true" />
                  Upload Excel / CSV
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={(e) => { handleExcelUpload(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
                <span className="be-hint-inline">Excel/CSV with an "Email" column.</span>
                <span className={`be-detected-count${manualRecipients.length ? ' has-items' : ''}`}>
                  {manualRecipients.length} detected
                </span>
              </div>
            </div>
          )}

          <div className="be-recipient-head">
            <div className="be-recipient-count">
              <Users size={15} strokeWidth={2} aria-hidden="true" />
              <span>
                {loading ? 'Loading recipients…' : <><strong>{recipients.length}</strong> recipients</>}
              </span>
            </div>
            <div className="be-recipient-actions">
              <span className={`be-selected-chip${selected.size ? ' has-selection' : ''}`}>{selected.size} selected</span>
              <button type="button" className="be-btn-ghost" onClick={selectAll} disabled={!recipients.length}>Select all</button>
              <button type="button" className="be-btn-ghost" onClick={clearAll} disabled={!selected.size}>Clear</button>
            </div>
          </div>

          <div className="be-recipient-list">
            {loading && <div className="be-empty">Loading recipients…</div>}
            {!loading && !recipients.length && (
              <div className="be-empty">
                <Mail size={26} strokeWidth={1.6} aria-hidden="true" />
                <span>No recipients with email addresses found.</span>
              </div>
            )}
            {!loading && recipients.map((r) => (
              <label key={r.email} className={`be-recipient${selected.has(r.email) ? ' is-selected' : ''}`}>
                <input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} />
                <span className="be-recipient-avatar" aria-hidden="true">{initialsFor(r.name || r.email)}</span>
                <span className="be-recipient-text">
                  <span className="be-recipient-name">{r.name || r.email}</span>
                  {r.name ? <span className="be-recipient-email">{r.email}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="be-card">
          <div className="be-card-head">
            <span className="be-step" aria-hidden="true">2</span>
            <div className="be-card-head-text">
              <h2>Message</h2>
              <p>Write the email and add optional attachments.</p>
            </div>
          </div>

          <div className="be-sender">
            <div className="be-sender-head">
              <span className="be-sender-label">Send from</span>
              {!sendersLoading && (
                <div className="be-sender-links">
                  <button
                    type="button"
                    className="be-link-btn"
                    onClick={() => {
                      if (showSenderForm) {
                        resetSenderForm();
                      } else {
                        setSenderForm(defaultSenderForm());
                        setEditingSenderId(null);
                        setShowSenderForm(true);
                      }
                      setSenderError(null);
                      setSenderNotice(null);
                    }}
                  >
                    {showSenderForm ? 'Close' : '+ Add sender'}
                  </button>
                  {senders.length > 0 && (
                    <button type="button" className="be-link-btn" onClick={() => setShowSenderList((v) => !v)}>
                      {showSenderList ? 'Hide list' : `Manage (${senders.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {sendersLoading ? (
              <select className="be-select" disabled>
                <option>Loading senders…</option>
              </select>
            ) : senders.length === 0 ? (
              <div className="be-sender-empty">
                <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                <span>No sender email added yet. Add one to send bulk email.</span>
                <button
                  type="button"
                  className="be-btn-small"
                  onClick={() => { setShowSenderForm(true); setSenderError(null); setSenderNotice(null); }}
                >
                  + Add sender
                </button>
              </div>
            ) : (
              <select
                className="be-select"
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
              >
                <option value="">Select a sender email…</option>
                {senders.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.email}{sender.display_name ? ` — ${sender.display_name}` : ''}
                  </option>
                ))}
              </select>
            )}

            {senders.length > 0 && (
              <div className="be-hint" style={{ margin: '6px 0 0' }}>
                The campaign is sent from the selected account.
              </div>
            )}

            {senderError && <div className="be-alert" style={{ margin: '10px 0 0' }}>{senderError}</div>}
            {senderNotice && <div className="be-sender-notice">{senderNotice}</div>}

            {showSenderList && senders.length > 0 && (
              <div className="be-sender-list">
                {senders.map((sender) => {
                  const test = senderTest?.id === sender.id ? senderTest : null;
                  return (
                    <div key={sender.id} className="be-sender-row">
                      <div className="be-sender-row-text">
                        <strong>{sender.email}</strong>
                        <span>
                          {sender.display_name || 'No display name'} · {sender.smtp_host || 'smtp.gmail.com'}:{sender.smtp_port || 465} · Password ••••••••
                        </span>
                      </div>
                      <div className="be-sender-row-actions">
                        <button type="button" className="be-link-btn" onClick={() => startEditSender(sender)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="be-link-btn"
                          onClick={() => testSenderLogin(sender)}
                          disabled={test?.status === 'testing'}
                        >
                          {test?.status === 'testing' ? 'Testing…' : 'Test'}
                        </button>
                        <button type="button" className="be-link-btn be-danger-link" onClick={() => removeSender(sender)}>
                          Delete
                        </button>
                      </div>
                      {test && test.status !== 'testing' && (
                        <div className={`be-sender-test ${test.status === 'ok' ? 'is-ok' : 'is-fail'}`}>{test.message}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showSenderForm && (
              <div className="be-sender-form">
                {editingSenderId && (
                  <div className="be-hint" style={{ margin: '0 0 8px' }}>
                    Editing {senderForm.email}. Leave the password blank to keep the current one.
                  </div>
                )}
                <label className="be-field">
                  <span>Email provider</span>
                  <select
                    className="be-select"
                    value={senderForm.provider}
                    onChange={(e) => {
                      const preset = providerPreset(e.target.value);
                      setSenderForm((prev) => ({
                        ...prev,
                        provider: preset.id,
                        smtp_host: preset.host || prev.smtp_host,
                        smtp_port: preset.port,
                      }));
                    }}
                  >
                    {SENDER_PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <div className="be-row">
                  <label className="be-field" style={{ flex: '1 1 200px' }}>
                    <span>Display name (optional)</span>
                    <input
                      className="be-input"
                      value={senderForm.display_name}
                      onChange={(e) => setSenderForm((p) => ({ ...p, display_name: e.target.value }))}
                      placeholder="Being Sevak Charitable Trust"
                    />
                  </label>
                  <label className="be-field" style={{ flex: '1 1 220px' }}>
                    <span>Email address</span>
                    <input
                      className="be-input"
                      type="email"
                      value={senderForm.email}
                      onChange={(e) => setSenderForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@example.com"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <div className="be-row">
                  <label className="be-field" style={{ flex: '2 1 220px' }}>
                    <span>SMTP server</span>
                    <input
                      className="be-input"
                      value={senderForm.smtp_host}
                      onChange={(e) => setSenderForm((p) => ({ ...p, smtp_host: e.target.value }))}
                      placeholder="smtp.hostinger.com"
                      autoComplete="off"
                    />
                  </label>
                  <label className="be-field" style={{ flex: '0 1 130px' }}>
                    <span>Port</span>
                    <input
                      className="be-input"
                      type="number"
                      min="1"
                      max="65535"
                      value={senderForm.smtp_port}
                      onChange={(e) => setSenderForm((p) => ({ ...p, smtp_port: e.target.value }))}
                      placeholder="465"
                    />
                  </label>
                </div>
                <label className="be-field">
                  <span>
                    {senderPreset.passwordLabel}{editingSenderId ? ' (blank = keep current)' : ''}
                    <button type="button" className="be-link-btn" onClick={() => setShowSenderPassword((v) => !v)}>
                      {showSenderPassword ? 'Hide' : 'Show'}
                    </button>
                  </span>
                  <input
                    className="be-input"
                    type={showSenderPassword ? 'text' : 'password'}
                    value={senderForm.app_password}
                    onChange={(e) => setSenderForm((p) => ({ ...p, app_password: e.target.value }))}
                    placeholder={editingSenderId ? 'Leave blank to keep the current password' : senderPreset.passwordPlaceholder}
                    autoComplete="new-password"
                  />
                </label>
                <div className="be-hint" style={{ margin: '-4px 0 10px' }}>
                  {senderPreset.hint}
                </div>
                <div className="be-sender-form-actions">
                  <button type="button" className="be-btn-small" onClick={addSender} disabled={senderSaving}>
                    {senderSaving ? 'Saving…' : editingSenderId ? 'Update sender' : 'Save sender'}
                  </button>
                  <button type="button" className="be-link-btn" onClick={resetSenderForm}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="be-template-bar">
            <label className="be-field" style={{ flex: 1, marginBottom: 0 }}>
              <span>Ready-made template</span>
              <select
                className="be-select"
                value={selectedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                disabled={templatesLoading}
              >
                <option value="">{templatesLoading ? 'Loading templates...' : 'Choose a template...'}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <div className="be-template-actions">
              <button type="button" className="be-link-btn" onClick={() => setShowTemplateForm((v) => !v)}>
                Save current
              </button>
              {selectedTemplateId && (
                <button type="button" className="be-link-btn be-danger-link" onClick={() => removeTemplate(selectedTemplateId)}>
                  Delete
                </button>
              )}
            </div>
          </div>

          {showTemplateForm && (
            <div className="be-template-save">
              <input
                className="be-input"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
              />
              <button type="button" className="be-btn-small" onClick={saveTemplate} disabled={templateSaving}>
                {templateSaving ? 'Saving...' : 'Save template'}
              </button>
              <button type="button" className="be-link-btn" onClick={() => { setShowTemplateForm(false); setTemplateName(''); }}>
                Cancel
              </button>
            </div>
          )}

          {templateError && <div className="be-alert">{templateError}</div>}

          <label className="be-field">
            <span>Subject <em className="be-counter">{subject.length} chars</em></span>
            <input
              className="be-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. An update from Being Sevak"
            />
          </label>

          {htmlBody ? (
            <div className="be-html-active">
              <div className="be-html-active-head">
                <span><strong>HTML template selected</strong> — the designed email will be sent.</span>
                <button type="button" className="be-link-btn" onClick={clearHtmlTemplate}>Use plain text</button>
              </div>
              <iframe className="be-html-preview" title="Selected HTML template preview" srcDoc={htmlPreview} sandbox="" />
              <div className="be-hint" style={{ margin: 0, padding: '8px 11px', borderTop: '1px solid var(--line)' }}>
                Plain-text version is generated automatically from this template and sent with the email.
              </div>
            </div>
          ) : (
            <label className="be-field">
              <span>Body</span>
              <textarea
                className="be-textarea is-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
              />
            </label>
          )}

<div className="be-field">
  <span>Attachments (optional, multiple)</span>
  <label className="be-upload">
    <input
      type="file"
      accept="image/*,video/*,application/pdf,.pdf"
      multiple
      hidden
      onChange={(e) => { pickMedia(e.target.files); e.target.value = ''; }}
    />
    <span className="be-upload-plus">+</span>
    <span className="be-upload-text">
      Add image, video or PDF
      <small>Max 20 MB each, up to 10 files</small>
    </span>
  </label>
</div>

{mediaError && <div className="be-alert">{mediaError}</div>}

{mediaFiles.length > 0 && (
  <div style={{ fontSize: 11, color: '#5B6070', marginBottom: 4 }}>
    Total: {(mediaFiles.reduce((s, m) => s + m.file.size, 0) / (1024 * 1024)).toFixed(1)} MB
  </div>
)}

{mediaFiles.length > 0 && (
  <div className="be-media-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
    {mediaFiles.map((m, idx) => (
      <div key={idx} className="be-media-preview" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
        {m.preview && (m.file.type.startsWith('video/') ? (
          <video src={m.preview} style={{ width: 64, height: 48, objectFit: 'cover' }} />
        ) : m.file.type === 'application/pdf' || /\.pdf$/i.test(m.file.name || '') ? (
          <iframe src={m.preview} title="PDF preview" style={{ width: 64, height: 48, border: '1px solid var(--line)' }} />
        ) : (
          <img src={m.preview} alt="Attachment preview" style={{ width: 64, height: 48, objectFit: 'cover' }} />
        ))}
        <div className="be-media-meta" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file.name}</span>
          <button type="button" className="be-link-btn" onClick={() => removeMedia(idx)}>Remove</button>
        </div>
      </div>
    ))}
  </div>
)}

          <div className="be-tokens">
            <span className="be-tokens-label">Personalize</span>
            <code>{'{{Name}}'}</code>
            <code>{'{{Email}}'}</code>
            <span className="be-tokens-hint">in the subject or body</span>
          </div>

          <div className="be-send-bar">
            <div className="be-send-summary">
              <div className="be-send-count-text">
                <span className="be-send-count">{selected.size}</span>
                <span>recipient{selected.size === 1 ? '' : 's'} selected</span>
              </div>
{(selectedSender || htmlBody || mediaFiles.length > 0) && (
  <div className="be-send-tags">
    {selectedSender && <span className="be-tag"><Mail size={12} strokeWidth={2} /> From {selectedSender.email}</span>}
    {htmlBody && <span className="be-tag"><LayoutTemplate size={12} strokeWidth={2} /> HTML design</span>}
    {mediaFiles.length > 0 && <span className="be-tag"><Paperclip size={12} strokeWidth={2} /> {mediaFiles.length} attachment{mediaFiles.length === 1 ? '' : 's'}</span>}
                </div>
              )}
            </div>
            <button
              type="button"
              className="be-send"
              onClick={send}
              disabled={sending || !senderId || !subject.trim() || (!body.trim() && !htmlBody) || selected.size === 0}
            >
              {sending ? <><span className="be-spinner" />Sending…</> : <><Send size={16} strokeWidth={2} /> Send to {selected.size} recipient{selected.size === 1 ? '' : 's'}</>}
            </button>
          </div>
        </section>
      </div>
      )}

      {activeTab === 'history' && (
      <section className="be-card be-history">
        <div className="be-history-head">
          <div>
            <h2>Send history</h2>
            <p className="be-section-sub">Most recent {logs.length} campaign{logs.length === 1 ? '' : 's'}.</p>
          </div>
          <button type="button" className="be-btn-ghost" onClick={loadLogs} disabled={logsLoading}>
            <RefreshCw size={14} strokeWidth={2} className={logsLoading ? 'be-icon-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="be-stats">
          <div className="be-stat">
            <span className="be-stat-icon"><History size={17} strokeWidth={2} /></span>
            <div><strong>{historyStats.campaigns}</strong><span>Campaigns</span></div>
          </div>
          <div className="be-stat is-ok">
            <span className="be-stat-icon"><CheckCircle2 size={17} strokeWidth={2} /></span>
            <div><strong>{historyStats.sent}</strong><span>Emails sent</span></div>
          </div>
          <div className="be-stat is-fail">
            <span className="be-stat-icon"><AlertCircle size={17} strokeWidth={2} /></span>
            <div><strong>{historyStats.failed}</strong><span>Failed</span></div>
          </div>
        </div>

        {logsError && <div className="be-alert">{logsError}</div>}

        <div className="be-history-scroll">
          <table className="be-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Subject</th>
                <th>Source</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Sent</th>
                <th style={{ textAlign: 'right' }}>Failed</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                  <td className="be-table-subject">
                    {log.subject}
                    {log.sender_email ? <span className="be-table-from">From {log.sender_email}</span> : null}
                  </td>
                  <td>{SOURCE_LABEL[log.source] || log.source || '-'}</td>
                  <td>
                    <span className={`be-status-badge be-status-${log.status || 'completed'}`}>
                      {STATUS_LABEL[log.status] || log.status || 'Completed'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{log.total_recipients}</td>
                  <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{log.sent_count}</td>
                  <td style={{ textAlign: 'right', color: log.failed_count > 0 ? '#b91c1c' : 'var(--ink-soft)', fontWeight: 700 }}>{log.failed_count}</td>
                  <td>{log.created_by || '-'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="be-link-btn" onClick={() => openLog(log)}>View</button>
                    {log.status === 'processing' || log.status === 'queued' ? (
                      <button type="button" className="be-link-btn be-danger-link" onClick={() => cancelCampaign(log.id)}>Cancel</button>
                    ) : log.status !== 'completed' && Number(log.total_recipients || 0) > Number(log.sent_count || 0) ? (
                      <button type="button" className="be-link-btn" onClick={() => resumeCampaign(log.id)}>Resume</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!logsLoading && logs.length === 0 && (
                <tr><td colSpan="9" className="be-table-empty">No campaigns sent yet.</td></tr>
              )}
              {logsLoading && (
                <tr><td colSpan="9" className="be-table-empty">Loading history...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeTab === 'templates' && (
        <div className="be-template-page">
          <section className="be-card">
            <div className="be-history-head">
              <div>
                <h2>{editingTemplateId ? 'Edit template' : 'Add template'}</h2>
                <p className="be-section-sub">Reusable subjects, bodies and attachments.</p>
              </div>
              <div className="be-template-actions">
                <button type="button" className="be-link-btn" onClick={() => openTemplateInBuilder(null)}>Open builder</button>
                {editingTemplateId && (
                  <button type="button" className="be-link-btn" onClick={cancelTemplateEdit}>Cancel edit</button>
                )}
              </div>
            </div>

            {templateError && <div className="be-alert">{templateError}</div>}

            <div className="be-row">
              <label className="be-field" style={{ flex: '1 1 240px' }}>
                <span>Template name</span>
                <input
                  className="be-input"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Donation Thank You"
                />
              </label>
              <label className="be-field" style={{ flex: '1 1 240px' }}>
                <span>Subject</span>
                <input
                  className="be-input"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Email subject"
                />
              </label>
            </div>

            <label className="be-field">
              <span>Body</span>
              <textarea
                className="be-textarea is-body"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Write the template..."
              />
            </label>

            <button type="button" className="be-send" onClick={saveTemplateForm} disabled={templateSaving}>
              {templateSaving ? 'Saving...' : editingTemplateId ? 'Update template' : 'Save template'}
            </button>
          </section>

          <section className="be-card" style={{ marginTop: 16 }}>
            <div className="be-history-head">
              <div>
                <h2>Saved templates</h2>
                <p className="be-section-sub">{templates.length} template{templates.length === 1 ? '' : 's'} available.</p>
              </div>
              <button type="button" className="be-btn-ghost" onClick={loadTemplates} disabled={templatesLoading}>
                <RefreshCw size={14} strokeWidth={2} className={templatesLoading ? 'be-icon-spin' : ''} />
                Refresh
              </button>
            </div>

            {templatesLoading ? (
              <div className="be-empty">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="be-empty">No templates yet.</div>
            ) : (
              <div className="be-history-scroll">
                <table className="be-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Subject</th>
                      <th>Type</th>
                      <th>Attachments</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id}>
                        <td className="be-table-subject">{t.name}</td>
                        <td>{t.subject}</td>
                        <td>{t.has_design ? 'HTML' : 'Simple'}</td>
                        <td>{(t.attachment_count || (t.has_attachment ? 1 : 0)) > 0 ? `${t.attachment_count || 1} file${(t.attachment_count || 1) === 1 ? '' : 's'}${Array.isArray(t.attachment_names) && t.attachment_names.length ? ` (${t.attachment_names.join(', ')})` : (t.attachment_name ? ` (${t.attachment_name})` : '')}` : '-'}</td>
                        <td>{t.updated_at ? new Date(t.updated_at).toLocaleString() : '-'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" className="be-link-btn" onClick={() => useTemplate(t)}>Use</button>
                          {t.has_design ? (
                            <button type="button" className="be-link-btn" onClick={() => openTemplateInBuilder(t)}>Edit design</button>
                          ) : (
                            <button type="button" className="be-link-btn" onClick={() => editTemplate(t)}>Edit</button>
                          )}
                          <button type="button" className="be-link-btn be-danger-link" onClick={() => removeTemplate(t.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'builder' && (
        <EmailBuilder
          templateId={builderTemplateId}
          onCancel={() => setActiveTab('templates')}
          onSaved={async (saved) => {
            await loadTemplates();
            setBuilderTemplateId(saved?.id ? String(saved.id) : null);
            setActiveTab('templates');
          }}
        />
      )}

      {activeTab === 'mailbox' && (
        <BulkMailbox senders={senders} defaultEmail={selectedSender?.email || ''} />
      )}

      {selectedLog && (
        <div className="be-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="be-modal" onClick={(e) => e.stopPropagation()}>
            <div className="be-modal-head">
              <div className="be-modal-head-text">
                <h3>{selectedLog.subject}</h3>
                <div className="be-modal-sub">
                  {selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleString() : ''}
                  {selectedLog.created_by ? ` · ${selectedLog.created_by}` : ''}
                  {selectedLog.sender_email ? ` · From ${selectedLog.sender_email}` : ''}
                  {selectedLog.status && (
                    <span className={`be-status-badge be-status-${selectedLog.status}`}>
                      {STATUS_LABEL[selectedLog.status] || selectedLog.status}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="be-modal-close" onClick={() => setSelectedLog(null)} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="be-modal-body">
              <div className="be-modal-stats">
                <div className="be-modal-stat">
                  <span>Total</span>
                  <strong>{selectedLog.total_recipients}</strong>
                </div>
                <div className="be-modal-stat is-ok">
                  <span>Sent</span>
                  <strong>{selectedLog.sent_count}</strong>
                </div>
                <div className="be-modal-stat is-fail">
                  <span>Failed</span>
                  <strong>{selectedLog.failed_count}</strong>
                </div>
              </div>
              {selectedLog.loading ? (
                <div className="be-empty">Loading recipients...</div>
              ) : (
                <div className="be-modal-list">
                  {(selectedLog.recipients || []).map((r) => (
                    <div key={r.email} className="be-modal-row">
                      <span className="be-recipient-name">{r.email}</span>
                      <span className={r.ok === true ? 'be-status-ok' : r.ok === false ? 'be-status-fail' : 'be-status-pending'}>
                        {r.ok === true ? 'Sent' : r.ok === false ? 'Failed' : 'Pending'}
                      </span>
                      {r.ok === false && <span className="be-modal-error">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
