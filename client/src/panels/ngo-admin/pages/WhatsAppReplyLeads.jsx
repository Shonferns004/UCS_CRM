import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, MessageSquareText, Phone, User, Tag, Inbox, Trash2, Search, Plus, CheckCircle2, Sparkles, Mail, Megaphone } from 'lucide-react';
import { api } from '../../../api/auth';

const ACCOUNT_HUES = {
  bsct: '#2563eb', bsct2: '#2563eb', bsct3: '#2563eb',
  aflf: '#16a34a', aflf2: '#16a34a',
  mann: '#ec4899', mann2: '#ec4899',
};

const SUGGESTION = {
  interested: { label: 'Interested', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  review: { label: 'Review', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  low: { label: 'Low', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
};

function parseNotes(notes) {
  const text = String(notes || '');
  const message = text
    .split('\n')
    // Keep [Button: ...] / [Reply: ...]: that is the actual answer. Only
    // bookkeeping tags are hidden.
    .filter((l) => !/^\[(Template|Account|Lead|Meta Lead|Platform|Campaign|Form):/i.test(l.trim()))
    .join('\n')
    .trim();
  const template = (text.match(/\[Template:\s*([^\]]+)\]/i) || [])[1] || '';
  const account = (text.match(/\[Account:\s*([^\]]+)\]/i) || [])[1] || 'unknown';
  const platform = (text.match(/\[Platform:\s*([^\]]+)\]/i) || [])[1] || '';
  const campaign = (text.match(/\[Campaign:\s*([^\]]+)\]/i) || [])[1] || '';
  const form = (text.match(/\[Form:\s*([^\]]+)\]/i) || [])[1] || '';
  return { message, template, account, platform, campaign, form };
}

const isMetaLead = (lead) => lead?.source === 'Meta Lead Ad';

const platformOf = (lead) => {
  const fromColumn = String(lead?.meta_platform || '').toLowerCase();
  if (fromColumn) return fromColumn;
  const fromNotes = parseNotes(lead?.notes).platform.toLowerCase();
  if (fromNotes) return fromNotes;
  return isMetaLead(lead) ? 'meta' : 'whatsapp';
};

const platformMeta = (platform, sourceKey) => {
  const p = String(platform || '').toLowerCase();
  if (sourceKey === 'email' || p.includes('email')) return { label: 'Email', color: '#7c3aed', bg: '#ede9fe' };
  if (p.includes('instagram') || p === 'ig') return { label: 'Instagram', color: '#C13584', bg: '#fce7f3' };
  if (sourceKey === 'meta' || p.includes('facebook') || p === 'fb' || p === 'meta') {
    return { label: 'Facebook', color: '#0866FF', bg: '#e7f0ff' };
  }
  return { label: 'WhatsApp', color: '#128C7E', bg: '#dcfce7' };
};

function ngoNameOf(account) {
  const key = String(account || '').toLowerCase();
  if (key.startsWith('bsct')) return 'BSCT';
  if (key.startsWith('aflf')) return 'AFLF';
  if (key.startsWith('mann')) return 'MANN';
  if (!key || key === 'unknown') return 'Unmapped';
  return account || 'Unmapped';
}

const accountHue = (ngo) => ACCOUNT_HUES[String(ngo || '').toLowerCase()] || '#64748b';

function formatPhone(p) {
  const s = String(p || '').replace(/[^0-9]/g, '');
  return s.length === 12 && s.startsWith('91') ? `+${s}` : s;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Bulk-email campaign contacts carry their own free-form status, so give it the
// same pill palette the station queues use instead of inventing a second one.
function emailStatusStyle(status) {
  const k = String(status || '').toLowerCase();
  if (k === 'new') return { color: '#1d4ed8', bg: '#e7efff' };
  if (k === 'replied') return { color: '#0d9488', bg: '#ccfbf1' };
  if (k === 'contacted' || k === 'in progress') return { color: '#b45309', bg: '#fef3c7' };
  if (k === 'converted' || k === 'won') return { color: '#15803d', bg: '#dcfce7' };
  if (k === 'lost' || k === 'closed') return { color: '#be123c', bg: '#ffe4e6' };
  return { color: '#475569', bg: '#eef2f7' };
}

function initialsOf(name, email) {
  const src = String(name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
}

export default function WhatsAppReplyLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [source, setSource] = useState('whatsapp');
  const [ngoFilter, setNgoFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState('inbox');
  // Bulk-email campaigns live in the normal leads table, not the station queue,
  // so that tab has its own loader, search and reply poll.
  const [crmLeads, setCrmLeads] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState('');
  const [crmQuery, setCrmQuery] = useState('');
  const [pollingReplies, setPollingReplies] = useState(false);
  const [pollNotice, setPollNotice] = useState('');

  const loadCrm = async () => {
    setCrmLoading(true);
    setCrmError('');
    try {
      const params = new URLSearchParams();
      params.set('source', 'Bulk Email');
      if (crmQuery.trim()) params.set('search', crmQuery.trim());
      params.set('limit', '200');
      const qs = params.toString();
      const data = await api(`/leads${qs ? '?' + qs : ''}`, { _prefix: 'ucs' });
      setCrmLeads(Array.isArray(data) ? data : (data?.data || []));
    } catch (e) {
      setCrmError(e?.message || 'Failed to load leads');
      setCrmLeads([]);
    } finally {
      setCrmLoading(false);
    }
  };

  useEffect(() => { if (source === 'email') loadCrm(); }, [source]);

  const pollReplies = async () => {
    setPollingReplies(true);
    setPollNotice('');
    try {
      const res = await api('/accounts/bulk-email/replies/poll', { method: 'POST', body: JSON.stringify({}), timeout: 120000 });
      setPollNotice(res?.message || 'Replies checked.');
      await loadCrm();
    } catch (e) {
      setPollNotice(e?.message || 'Could not check replies.');
    } finally {
      setPollingReplies(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/ngo-admin/leads');
      setLeads(Array.isArray(data) ? data : (data?.data || []));
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sourceKeyOf = (lead) => {
    if (lead?.source_key) return lead.source_key;
    if (isMetaLead(lead)) return 'meta';
    return String(lead?.source || '').toLowerCase().includes('email') ? 'email' : 'whatsapp';
  };

  const ngoOfLead = (lead) => ngoNameOf(lead.account_ngo || parseNotes(lead.notes).account);

  const counts = useMemo(() => {
    const bySource = { whatsapp: 0, meta: 0, email: 0 };
    const byNgo = { whatsapp: {}, meta: {}, email: {} };
    for (const lead of leads) {
      const key = sourceKeyOf(lead);
      bySource[key] += 1;
      const ngo = ngoOfLead(lead);
      byNgo[key][ngo] = (byNgo[key][ngo] || 0) + 1;
    }
    return { bySource, byNgo };
  }, [leads]);

  const sourceLeads = leads.filter((lead) => sourceKeyOf(lead) === source);
  const inboxLeads = sourceLeads.filter((lead) => !lead.in_station);
  const queueLeads = sourceLeads.filter((lead) => lead.in_station);
  const aiPending = sourceLeads.filter((lead) => !lead.in_station && !lead.ai_at).length;

  const shown = (tab === 'queue' ? queueLeads : inboxLeads).filter((lead) => {
    if (ngoFilter !== 'all' && ngoOfLead(lead) !== ngoFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(lead.name || '').toLowerCase().includes(q) || String(lead.phone || '').includes(q);
  });

  const addToStation = async (lead) => {
    setAdding(lead.id);
    setError(''); setNotice('');
    try {
      const res = await api(`/ngo-admin/leads/${lead.id}/add`, { method: 'POST', body: JSON.stringify({}) });
      setLeads((prev) => prev.map((item) => (
        item.id === lead.id
          ? {
            ...item,
            in_station: true,
            placed_station: res.station || item.suggested_station,
            placed_fro_name: res.fro_name || item.station_owner_name || null,
            placed_status: 'pending',
          }
          : item
      )));
      setNotice(res.message || 'Added to station');
    } catch (e) {
      setError(e?.message || 'Could not add this lead');
    } finally {
      setAdding(null);
    }
  };

  const addAllShown = async () => {
    if (bulkBusy || !shown.length) return;
    setBulkBusy(true);
    setError(''); setNotice('');
    try {
      const ids = shown.slice(0, 50).map((lead) => lead.id);
      const res = await api('/ngo-admin/leads/bulk-station', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      await load();
      setNotice(`Added ${res.placed || 0} lead(s) to station`
        + (res.already ? ` · ${res.already} already placed` : '')
        + (res.failed ? ` · ${res.failed} failed` : ''));
    } catch (e) {
      setError(e?.message || 'Bulk add failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const runAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setError(''); setNotice('');
    try {
      const res = await api('/ngo-admin/leads/ai-batch', {
        method: 'POST',
        body: JSON.stringify({ limit: 12 }),
      });
      await load();
      setNotice(
        `AI scored ${res.scored || 0} lead(s)`
        + (res.failed ? ` · ${res.failed} failed` : '')
        + (res.remaining ? ` · ${res.remaining} left — run again` : ' · all scored'),
      );
    } catch (e) {
      setError(e?.message || 'AI scoring failed');
    } finally {
      setAiBusy(false);
    }
  };

  const remove = async (leadId) => {
    if (!window.confirm('Delete this lead? It will also be removed from its station queue.')) return;
    setDeleting(leadId);
    setError(''); setNotice('');
    try {
      await api(`/leads/${leadId}`, { method: 'DELETE' });
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      setNotice('Lead deleted');
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const suggestionPill = (s) => {
    const meta = SUGGESTION[s?.label] || SUGGESTION.low;
    const isAi = s?.source === 'ai';
    return (
      <span
        title={Array.isArray(s?.reasons) && s.reasons.length ? s.reasons.join(' · ') : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, whiteSpace: 'nowrap' }}
      >
        <Sparkles size={11} />
        {meta.label}
        <span style={{ fontWeight: 700, opacity: .7 }}>{s?.score ?? 0}%</span>
        <span
          title={isAi ? `Model: ${s?.model || 'AI'}` : 'Rule-based score (no model call)'}
          style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: .3, padding: '1px 4px', borderRadius: 4, background: isAi ? '#111827' : 'rgba(0,0,0,.07)', color: isAi ? '#fff' : meta.color }}
        >
          {isAi ? 'AI' : 'RULES'}
        </span>
      </span>
    );
  };

  const SOURCES = [
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquareText, color: '#128C7E' },
    { key: 'meta', label: 'Meta', icon: Megaphone, color: '#0866FF' },
    { key: 'email', label: 'Email', icon: Mail, color: '#7c3aed' },
  ];
  const NGOS = [
    { key: 'all', label: 'All NGOs' },
    { key: 'BSCT', label: 'B · BSCT', color: '#2563eb' },
    { key: 'AFLF', label: 'A · AFLF', color: '#16a34a' },
    { key: 'MANN', label: 'M · MANN', color: '#ec4899' },
  ];

  const activeSource = SOURCES.find((item) => item.key === source) || SOURCES[0];
  const isEmail = source === 'email';
  const withEmail = crmLeads.filter((l) => l.email).length;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280 }}>
      <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--sage)', color: '#fff', flexShrink: 0 }}>
              <Inbox size={20} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 2px' }}>Leads Hub</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>
                WhatsApp, Meta and Email leads in one queue. Each source has its own station per NGO — the station's FRO picks the lead up.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEmail ? (
              <>
                <button
                  onClick={pollReplies}
                  disabled={pollingReplies}
                  title="Check the sender inbox for replies to bulk email campaigns"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sage)', background: pollingReplies ? 'var(--bg, #fff)' : 'var(--sage)', color: pollingReplies ? 'var(--ink-soft, #64748b)' : '#fff', fontSize: 12, fontWeight: 700, cursor: pollingReplies ? 'default' : 'pointer', opacity: pollingReplies ? .8 : 1 }}
                >
                  <Mail size={14} /> {pollingReplies ? 'Checking…' : 'Poll replies'}
                </button>
                <button
                  onClick={loadCrm}
                  disabled={crmLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, cursor: crmLoading ? 'default' : 'pointer', color: 'var(--ink, #0f172a)', opacity: crmLoading ? .7 : 1 }}
                >
                  <RefreshCw size={14} style={{ transform: crmLoading ? 'rotate(360deg)' : 'none', transition: 'transform .8s linear' }} />
                  Refresh
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={runAi}
                  disabled={aiBusy || aiPending === 0}
                  title={aiPending === 0 ? 'Every inbox lead is already scored' : 'Score the next 12 leads with the AI model'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sage)', background: aiPending > 0 ? 'var(--sage)' : 'var(--bg, #fff)', color: aiPending > 0 ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12, fontWeight: 700, cursor: aiBusy || aiPending === 0 ? 'default' : 'pointer', opacity: aiBusy ? .7 : 1 }}
                >
                  <Sparkles size={14} />
                  {aiBusy ? 'AI scoring…' : `Run AI (${aiPending})`}
                </button>
                <button
                  onClick={load}
                  disabled={loading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink, #0f172a)' }}
                >
                  <RefreshCw size={14} style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform .8s linear' }} />
                  Refresh
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {SOURCES.map((item) => {
          const Icon = item.icon;
          const active = source === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { setSource(item.key); setNgoFilter('all'); setTab('inbox'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 12, border: `1px solid ${active ? item.color : 'var(--line, #e2e8f0)'}`, background: active ? item.color : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}
            >
              <Icon size={15} style={{ opacity: .9 }} />
              {item.label}
              <span style={{ minWidth: 20, padding: '0 6px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>
                {counts.bySource[item.key] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {isEmail ? (
        <>
          {crmError && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{crmError}</div>}

          {pollNotice && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 12.5, fontWeight: 600 }}>{pollNotice}</div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)' }}>
              <Search size={14} style={{ color: '#94a3b8' }} />
              <input value={crmQuery} onChange={(e) => setCrmQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadCrm(); }} placeholder="Search name / email / phone…"
                style={{ border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', minWidth: 200, color: 'var(--ink, #0f172a)' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>
              Contacts created by bulk email campaigns.
            </span>
          </div>

          {crmLoading && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              <RefreshCw size={22} style={{ opacity: .5, marginBottom: 8 }} /> Loading email leads…
            </div>
          )}

          {!crmLoading && crmLeads.length === 0 && (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#eef2f7', margin: '0 auto 12px' }}>
                <Mail size={24} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>No email leads yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Leads captured from bulk email campaigns will appear here.</div>
            </div>
          )}

          {!crmLoading && crmLeads.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line, #e2e8f0)', background: '#f8fafc' }}>
                      {['Lead', 'Email', 'Phone', 'Source', 'Status', 'Reply / Notes', 'Created'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5, color: '#64748b', fontWeight: 800 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crmLeads.map((l, i) => {
                      const st = emailStatusStyle(l.status);
                      const noteText = String(l.notes || '')
                        .replace(/^Bulk email campaign #\d+:[^\n]*\n*/i, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--line, #f1f5f9)', background: i % 2 ? '#fbfcfd' : '#fff' }}>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: '#e7efff', color: '#1d4ed8', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                                {initialsOf(l.name, l.email)}
                              </div>
                              <span style={{ fontWeight: 700, color: 'var(--ink, #0f172a)' }}>{l.name || '—'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            {l.email ? <a href={`mailto:${l.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{l.email}</a> : '—'}
                          </td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>{l.phone || '—'}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#eef2f7', color: '#374151' }}>{l.source || '—'}</span>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: st.color, background: st.bg, textTransform: 'capitalize' }}>{l.status || '—'}</span>
                          </td>
                          <td style={{ padding: '11px 14px', maxWidth: 280 }}>
                            {noteText ? (
                              <span title={noteText} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: 12 }}>
                                {noteText.length > 70 ? `${noteText.slice(0, 70)}…` : noteText}
                              </span>
                            ) : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: '#475569' }}>{l.created_at ? new Date(l.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line, #e2e8f0)', fontSize: 11.5, color: '#64748b', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span>{crmLeads.length} lead{crmLeads.length === 1 ? '' : 's'}</span>
                <span>{withEmail} with email</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {NGOS.map((item) => {
              const active = ngoFilter === item.key;
              const count = item.key === 'all' ? sourceLeads.length : (counts.byNgo[source][item.key] || 0);
              const color = item.color || 'var(--ink-soft, #64748b)';
              return (
                <button
                  key={item.key}
                  onClick={() => setNgoFilter(item.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? color : 'var(--line, #e2e8f0)'}`, background: active ? `${color}14` : 'transparent', color: active ? color : 'var(--ink-soft, #64748b)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  {item.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />}
                  {item.label}
                  <span style={{ fontWeight: 800, opacity: .75 }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'inbox', label: 'Inbox', count: inboxLeads.length },
              { key: 'queue', label: 'On station', count: queueLeads.length },
            ].map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: `1px solid ${active ? 'var(--sage)' : 'var(--line, #e2e8f0)'}`, background: active ? 'var(--sage)' : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {item.key === 'inbox' ? <Inbox size={13} style={{ opacity: .8 }} /> : <CheckCircle2 size={13} style={{ opacity: .8 }} />}
                  {item.label}
                  <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{item.count}</span>
                </button>
              );
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)' }}>
                <Search size={14} style={{ color: 'var(--ink-soft, #64748b)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or phone"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 190, color: 'var(--ink, #0f172a)' }}
                />
              </div>
              {tab === 'inbox' && shown.length > 0 && (
                <button
                  onClick={addAllShown}
                  disabled={bulkBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--sage)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: bulkBusy ? 'default' : 'pointer', opacity: bulkBusy ? .7 : 1 }}
                >
                  <Plus size={14} />
                  {bulkBusy ? 'Adding…' : `Add all shown (${Math.min(shown.length, 50)})`}
                </button>
              )}
            </div>
          </div>

          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>}
          {notice && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 10, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{notice}</div>}

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Lead', 'Source', 'Reply / answers', 'NGO', 'Station', 'AI', 'Actions'].map((heading) => (
                      <th key={heading} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)', borderBottom: '1px solid var(--line, #e2e8f0)' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((lead) => {
                    const ngo = ngoOfLead(lead);
                    const leadSource = sourceKeyOf(lead);
                    const platform = platformMeta(platformOf(lead), leadSource);
                    const station = lead.placed_station || lead.suggested_station;
                    const owner = lead.placed_fro_name || lead.station_owner_name;
                    const noOwner = tab === 'inbox' && lead.suggested_station && !lead.station_owner_name;
                    return (
                      <tr key={lead.id} style={{ borderTop: '1px solid var(--line, #f1f5f9)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: accountHue(ngo) }} />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--ink, #0f172a)' }}>{lead.name || formatPhone(lead.phone) || '—'}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Phone size={11} /> {formatPhone(lead.phone) || '—'}
                                <span style={{ opacity: .45 }}>·</span>
                                {formatTime(lead.created_at)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: platform.color, background: platform.bg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                            {leadSource === 'whatsapp' ? <MessageSquareText size={11} /> : leadSource === 'meta' ? <Megaphone size={11} /> : <Mail size={11} />}
                            {platform.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: 300 }}>
                          <div style={{ color: 'var(--ink, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {parseNotes(lead.notes).message || '—'}
                          </div>
                          {parseNotes(lead.notes).campaign && (
                            <div style={{ fontSize: 10.5, color: 'var(--ink-soft, #64748b)', marginTop: 2 }}>
                              <Tag size={10} /> {parseNotes(lead.notes).campaign.slice(0, 28)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: accountHue(ngo), background: `${accountHue(ngo)}14`, border: `1px solid ${accountHue(ngo)}33`, padding: '2px 8px', borderRadius: 999 }}>
                            {ngo}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--ink, #0f172a)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{station || '—'}</div>
                          {owner
                            ? <div style={{ fontSize: 10.5, color: 'var(--ink-soft, #64748b)' }}><User size={10} /> {owner}</div>
                            : noOwner ? <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>No owner assigned</div> : null}
                        </td>
                        <td style={{ padding: '10px 14px' }}>{suggestionPill(lead.suggestion)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {tab === 'inbox' ? (
                            <button
                              onClick={() => addToStation(lead)}
                              disabled={adding === lead.id}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--sage)', background: 'var(--sage)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: adding === lead.id ? 'default' : 'pointer', opacity: adding === lead.id ? .7 : 1 }}
                            >
                              <Plus size={12} />
                              {adding === lead.id ? 'Adding…' : 'Add to station'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>On station</span>
                          )}
                          <button
                            onClick={() => remove(lead.id)}
                            disabled={deleting === lead.id}
                            title="Delete lead"
                            style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: deleting === lead.id ? 'default' : 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!shown.length && (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft, #64748b)' }}>
                        {loading ? 'Loading leads…' : tab === 'inbox' ? 'Inbox is clear for this filter.' : 'Nothing on station for this filter yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line, #f1f5f9)', background: '#f8fafc', fontSize: 11, color: 'var(--ink-soft, #64748b)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>{shown.length} shown · {tab === 'inbox' ? inboxLeads.length : queueLeads.length} in this queue</span>
              <span>Stations: {activeSource.label} → B/A/M-{activeSource.label}-Leads</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
