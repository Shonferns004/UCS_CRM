import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, MessageSquareText, Phone, User, Tag, Inbox, Trash2, Search, Plus, CheckCircle2, Sparkles, Mail } from 'lucide-react';
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

const platformMeta = (platform) => {
  const p = String(platform || '').toLowerCase();
  if (p.includes('instagram')) return { label: 'Instagram', color: '#C13584', bg: '#fce7f3' };
  if (p.includes('facebook') || p === 'meta') return { label: 'Meta', color: '#0866FF', bg: '#e7f0ff' };
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

export default function WhatsAppReplyLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // inbox = reply not on a station yet · queue = already placed
  const [tab, setTab] = useState('inbox');
  const [view, setView] = useState('reply'); // 'reply' | 'crm'
  const [crmLeads, setCrmLeads] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState('');
  const [crmSource, setCrmSource] = useState('Bulk Email');
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

  useEffect(() => { if (view === 'crm') loadCrm(); }, [view]);

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
      const data = await api('/ngo-admin/ss-leads');
      setLeads(Array.isArray(data) ? data : (data?.data || []));
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const inboxLeads = leads.filter((l) => !l.in_station);
  const queueLeads = leads.filter((l) => l.in_station);
  const aiPending = leads.filter((l) => !l.in_station && !l.ai_at).length;

  const ngoGroups = useMemo(() => {
    const s = new Set(leads.map((l) => ngoNameOf(l.account_ngo || parseNotes(l.notes).account)));
    return ['all', ...Array.from(s)];
  }, [leads]);

  const tabLeads = tab === 'queue' ? queueLeads : inboxLeads;
  const filtered = tabLeads.filter((l) => {
    if (filter !== 'all' && ngoNameOf(l.account_ngo || parseNotes(l.notes).account) !== filter) return false;
    if (platformFilter !== 'all') {
      const platform = platformOf(l);
      if (platformFilter === 'meta') {
        if (!isMetaLead(l)) return false;
      } else if (platformFilter === 'whatsapp') {
        if (isMetaLead(l)) return false;
      } else if (!platform.includes(platformFilter)) {
        return false;
      }
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(l.name || '').toLowerCase().includes(q) || String(l.phone || '').includes(q);
  });

  const addToStation = async (lead) => {
    setAdding(lead.id);
    setError(''); setNotice('');
    try {
      const res = await api(`/ngo-admin/ss-leads/${lead.id}/add`, { method: 'POST', body: JSON.stringify({}) });
      setLeads((prev) => prev.map((l) => (
        l.id === lead.id
          ? {
            ...l,
            in_station: true,
            placed_station: res.station || l.suggested_station,
            placed_fro_name: res.fro_name || l.station_owner_name || null,
            placed_status: 'pending',
          }
          : l
      )));
      setNotice(res.message || 'Added to station');
    } catch (e) {
      setError(e?.message || 'Could not add this lead');
    } finally {
      setAdding(null);
    }
  };

  const runAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setError(''); setNotice('');
    try {
      const res = await api('/ngo-admin/ss-leads/ai-batch', {
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
    if (!window.confirm('Delete this lead? It will also be removed from its SS station queue.')) return;
    setDeleting(leadId);
    setError(''); setNotice('');
    try {
      await api(`/leads/${leadId}`, { method: 'DELETE' });
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
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
        <span title={isAi ? `Model: ${s?.model || 'AI'}` : 'Rule-based score (no model call)'}
          style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: .3, padding: '1px 4px', borderRadius: 4, background: isAi ? '#111827' : 'rgba(0,0,0,.07)', color: isAi ? '#fff' : meta.color }}>
          {isAi ? 'AI' : 'RULES'}
        </span>
      </span>
    );
  };

  if (view === 'crm') {
    const statusStyle = (s) => {
      const k = String(s || '').toLowerCase();
      if (k === 'new') return { color: '#1d4ed8', bg: '#e7efff' };
      if (k === 'replied') return { color: '#0d9488', bg: '#ccfbf1' };
      if (k === 'contacted' || k === 'in progress') return { color: '#b45309', bg: '#fef3c7' };
      if (k === 'converted' || k === 'won') return { color: '#15803d', bg: '#dcfce7' };
      if (k === 'lost' || k === 'closed') return { color: '#be123c', bg: '#ffe4e6' };
      return { color: '#475569', bg: '#eef2f7' };
    };
    const withEmail = crmLeads.filter((l) => l.email).length;
    const initials = (name, email) => {
      const src = String(name || email || '?').trim();
      const parts = src.split(/\s+/).filter(Boolean);
      return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
    };

    return (
      <div style={{ padding: '20px 24px', maxWidth: 1200 }}>
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--sage)', color: '#fff', flexShrink: 0 }}>
                <Mail size={21} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Email Leads</h3>
                  <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: '#e7efff', color: '#1d4ed8' }}>{crmLeads.length}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)', marginTop: 2 }}>
                  Contacts created from bulk email campaigns.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)' }}>
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input value={crmQuery} onChange={(e) => setCrmQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadCrm(); }} placeholder="Search name / email / phone…"
                  style={{ border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', minWidth: 200, color: 'var(--ink, #0f172a)' }} />
              </div>
              <button onClick={pollReplies} disabled={pollingReplies}
                title="Check the sender inbox for replies to bulk email campaigns"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--sage)', background: pollingReplies ? 'var(--bg, #fff)' : 'var(--sage)', fontSize: 12, fontWeight: 700, color: pollingReplies ? 'var(--ink-soft, #64748b)' : '#fff', cursor: pollingReplies ? 'default' : 'pointer', opacity: pollingReplies ? .8 : 1 }}>
                <Mail size={13} /> {pollingReplies ? 'Checking…' : 'Poll replies'}
              </button>
              <button onClick={loadCrm} disabled={crmLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, color: 'var(--ink, #0f172a)', cursor: crmLoading ? 'default' : 'pointer', opacity: crmLoading ? .7 : 1 }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => setView('reply')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft, #64748b)', cursor: 'pointer' }}>
              <MessageSquareText size={13} /> WA Reply Leads
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--sage)', background: 'var(--sage)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'default' }}>
              <Mail size={13} /> Email Leads
            </button>
          </div>
        </div>

        {crmError && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{crmError}</div>}

        {pollNotice && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 12.5, fontWeight: 600 }}>{pollNotice}</div>}

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
                    const st = statusStyle(l.status);
                    const noteText = String(l.notes || '')
                      .replace(/^Bulk email campaign #\d+:[^\n]*\n*/i, '')
                      .replace(/\s+/g, ' ')
                      .trim();
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--line, #f1f5f9)', background: i % 2 ? '#fbfcfd' : '#fff' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: '#e7efff', color: '#1d4ed8', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                              {initials(l.name, l.email)}
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
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200 }}>
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--sage)', color: '#fff', flexShrink: 0 }}>
              <Inbox size={21} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>WA Reply Leads</h3>
                <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: '#e7efff', color: '#1d4ed8' }}>{leads.length}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)', marginTop: 2 }}>
                WhatsApp replies and Meta lead ads. <b>Add to station</b> drops a lead into SS-BSCT / SS-AFLF / SS-MANN for the FRO to pick up.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)' }}>
              <Search size={14} style={{ color: '#94a3b8' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or number…"
                style={{ border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', minWidth: 180, color: 'var(--ink, #0f172a)' }} />
            </div>
            <button onClick={runAi} disabled={aiBusy || aiPending === 0}
              title={aiPending === 0 ? 'Every reply in the inbox is already scored' : 'Score the next 12 replies with the AI model'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--sage)', background: aiPending > 0 ? 'var(--sage)' : 'var(--bg, #fff)', color: aiPending > 0 ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12, fontWeight: 700, cursor: aiBusy || aiPending === 0 ? 'default' : 'pointer', opacity: aiBusy ? .7 : 1 }}>
              <Sparkles size={14} />
              {aiBusy ? 'AI scoring…' : `Run AI (${aiPending})`}
            </button>
            <button onClick={load} disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer', color: 'var(--ink, #0f172a)', opacity: loading ? .7 : 1 }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--sage)', background: 'var(--sage)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'default' }}>
              <Inbox size={13} /> WA Reply Leads
            </button>
            <button onClick={() => setView('crm')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft, #64748b)', cursor: 'pointer' }}>
              <Mail size={13} /> Email Leads
            </button>
          </div>
          <span style={{ width: 1, height: 22, background: 'var(--line, #e2e8f0)' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'inbox', label: 'Inbox', count: inboxLeads.length },
              { key: 'queue', label: 'In Queue', count: queueLeads.length },
            ].map((t) => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: `1px solid ${active ? '#0f172a' : 'var(--line, #e2e8f0)'}`, background: active ? '#0f172a' : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                  {t.key === 'inbox' ? <Inbox size={13} style={{ opacity: .85 }} /> : <CheckCircle2 size={13} style={{ opacity: .85 }} />}
                  {t.label}
                  <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.22)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, color: '#94a3b8', marginRight: 2 }}>NGO</span>
          {ngoGroups.map((a) => {
            const active = filter === a;
            const hue = a === 'all' ? '#0f172a' : accountHue(a);
            const count = a === 'all' ? tabLeads.length : tabLeads.filter((l) => ngoNameOf(l.account_ngo || parseNotes(l.notes).account) === a).length;
            return (
              <button key={a} onClick={() => setFilter(a)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999, border: `1px solid ${active ? hue : 'var(--line, #e2e8f0)'}`, background: active ? hue : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                {a === 'all' ? 'All NGOs' : a}
                <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, color: '#94a3b8', marginRight: 2, minWidth: 44 }}>Source</span>
          {[
            { key: 'all', label: 'All sources' },
            { key: 'meta', label: 'Meta' },
            { key: 'facebook', label: 'Facebook' },
            { key: 'instagram', label: 'Instagram' },
            { key: 'whatsapp', label: 'WhatsApp' },
          ].map((s) => {
            const active = platformFilter === s.key;
            const count = s.key === 'all'
              ? tabLeads.length
              : tabLeads.filter((l) => {
                if (s.key === 'meta') return isMetaLead(l);
                if (s.key === 'whatsapp') return !isMetaLead(l);
                return platformOf(l).includes(s.key);
              }).length;
            return (
              <button key={s.key} onClick={() => setPlatformFilter(s.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? '#0866FF' : 'var(--line, #e2e8f0)'}`, background: active ? '#0866FF' : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                {s.label}
                <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 12.5, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{tab === 'queue' ? 'In Queue' : 'Inbox'}</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>{filtered.length} lead{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {loading && (
          <div style={{ padding: 40, fontSize: 13, color: 'var(--ink-soft, #64748b)', textAlign: 'center' }}>
            <RefreshCw size={20} style={{ opacity: .5, marginBottom: 8 }} /> Loading leads…
          </div>
        )}
        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-soft, #64748b)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#eef2f7', margin: '0 auto 12px' }}>
              <MessageSquareText size={24} style={{ color: '#94a3b8' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>{tab === 'queue' ? 'Nothing in a station yet' : 'No leads in the inbox'}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{tab === 'queue' ? 'Leads you add will show here with their station.' : 'WhatsApp replies and Meta lead ads will show up here automatically.'}</div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line, #e2e8f0)', background: '#f8fafc' }}>
                  {['Contact', 'Reply', 'Suggestion', 'Station', 'Received', ''].map((h) => (
                    <th key={h} style={{ textAlign: h === '' ? 'right' : 'left', padding: '11px 16px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5, color: '#64748b', fontWeight: 800 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, rowIdx) => {
                  const { message, template, account, campaign, form } = parseNotes(l.notes);
                  const ngo = ngoNameOf(l.account_ngo || account);
                  const hue = accountHue(ngo);
                  const platform = platformMeta(platformOf(l));
                  const metaLead = isMetaLead(l);
                  const ngoLabel = ngo;
                  const nameSrc = String(l.name || l.phone || '?').trim();
                  const nameParts = nameSrc.split(/\s+/).filter(Boolean);
                  const ini = (nameParts.length > 1 ? nameParts[0][0] + nameParts[1][0] : nameSrc.slice(0, 2)).toUpperCase();
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--line, #f1f5f9)', background: rowIdx % 2 ? '#fbfcfd' : '#fff', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${hue}1a`, color: hue, fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{ini}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>{l.name || '—'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft, #64748b)', marginTop: 2 }}>
                              <Phone size={11} style={{ opacity: .5 }} />
                              {formatPhone(l.phone)}
                              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: hue, background: `${hue}1a` }}>{ngoLabel}</span>
                              {metaLead && (
                                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: platform.color, background: platform.bg }}>{platform.label}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--ink, #0f172a)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message || '—'}</div>
                        {template && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 8px', borderRadius: 6, background: 'var(--line, #f1f5f9)', fontSize: 10.5, color: 'var(--ink-soft, #64748b)', maxWidth: '100%' }}>
                            <Tag size={10} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template}</span>
                          </div>
                        )}
                        {metaLead && (campaign || form) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {campaign && (
                              <span title="Meta campaign" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#e7f0ff', color: '#0866FF', fontSize: 10.5, fontWeight: 700, maxWidth: 260 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign}</span>
                              </span>
                            )}
                            {form && (
                              <span title="Lead form" style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--line, #f1f5f9)', color: 'var(--ink-soft, #64748b)', fontSize: 10.5, fontWeight: 700 }}>Form: {form}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{suggestionPill(l.suggestion)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>
                        {l.in_station ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, color: '#15803d' }}>✓ {l.placed_station}</span>
                            <span style={{ fontSize: 11 }}>{l.placed_fro_name || 'No FRO owner yet'}</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 700 }}>{l.suggested_station || '—'}</span>
                            <span style={{ fontSize: 11 }}>{l.station_owner_name || 'No FRO owner yet'}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-soft, #64748b)', whiteSpace: 'nowrap' }}>{formatTime(l.created_at)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {l.in_station ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: '#15803d', whiteSpace: 'nowrap' }}>
                              <CheckCircle2 size={13} /> Already in station
                            </span>
                          ) : !l.suggested_station && metaLead ? (
                            <span title="Map this Meta lead form to an NGO in Accounts → WhatsApp Center → Meta Ads"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: '#fff7ed', color: '#c2410c', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                              Map form first
                            </span>
                          ) : (
                            <button onClick={() => addToStation(l)} disabled={adding === l.id}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, border: 'none', background: 'var(--sage)', color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: adding === l.id ? 'default' : 'pointer', opacity: adding === l.id ? .6 : 1, whiteSpace: 'nowrap' }}>
                              <Plus size={13} />
                              {adding === l.id ? 'Adding…' : `Add to ${l.suggested_station || 'station'}`}
                            </button>
                          )}
                          <button onClick={() => remove(l.id)} disabled={deleting === l.id}
                            title="Delete lead (also removes it from the SS station)"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, opacity: deleting === l.id ? .5 : 1 }}>
                            <Trash2 size={13} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
