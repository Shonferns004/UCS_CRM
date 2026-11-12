import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, MessageSquareText, Phone, User, UserCheck, Tag, Inbox, Trash2, Search, ChevronDown } from 'lucide-react';
import { api } from '../../../api/auth';

const ACCOUNT_HUES = {
  bsct: '#2563eb',
  bsct2: '#2563eb',
  bsct3: '#2563eb',
  aflf: '#16a34a',
  aflf2: '#16a34a',
  mann: '#ec4899',
  mann2: '#ec4899',
};

function parseNotes(notes) {
  const text = String(notes || '');
  const message = text
    .split('\n')
    .filter((l) => !l.startsWith('[Template:') && !l.startsWith('[Account:'))
    .join('\n')
    .trim();
  const template = (text.match(/\[Template:\s*([^\]]+)\]/) || [])[1] || '';
  const account = (text.match(/\[Account:\s*([^\]]+)\]/) || [])[1] || 'unknown';
  return { message, template, account };
}

function accountHue(account) {
  const key = String(account || '').toLowerCase();
  return ACCOUNT_HUES[key] || '#64748b';
}

function ngoNameOf(account) {
  const key = String(account || '').toLowerCase();
  if (key.startsWith('bsct')) return 'BSCT';
  if (key.startsWith('aflf')) return 'AFLF';
  if (key.startsWith('mann')) return 'MANN';
  return account || 'Unknown';
}

function formatPhone(p) {
  const s = String(p || '');
  return s.length === 12 && s.startsWith('91') ? `+${s}` : s;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function FroSelect({ fros, disabled, onAssign, label = 'Select FRO' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches = fros.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(f.name || '').toLowerCase().includes(q) || String(f.login_id || '').toLowerCase().includes(q);
  });

  const pick = (f) => {
    setOpen(false);
    setQuery('');
    onAssign(f.id);
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, color: 'var(--ink, #0f172a)', cursor: disabled ? 'default' : 'pointer', outline: 'none' }}>
        <span>{disabled ? 'Assigning…' : label}</span>
        <ChevronDown size={14} style={{ opacity: .5 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20, width: 240, background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--line, #e2e8f0)' }}>
            <Search size={14} style={{ opacity: .5, flexShrink: 0 }} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search FRO…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: '100%', color: 'var(--ink, #0f172a)' }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {matches.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>No FRO found</div>
            ) : matches.map((f) => (
              <button key={f.id} type="button" onClick={() => pick(f)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--ink, #0f172a)', borderBottom: '1px solid var(--line, #f1f5f9)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--line, #f1f5f9)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {f.name || f.login_id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WhatsAppReplyLeads() {
  const [leads, setLeads] = useState([]);
  const [fros, setFros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState('all');
  // 'inbox' = reply leads waiting to be assigned, 'assigned' = already handed
  // to an FRO. Assigning a lead moves it out of the inbox into the other tab.
  const [tab, setTab] = useState('inbox');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [l, f] = await Promise.all([
        api('/leads?source=WhatsApp Bulk Reply'),
        api('/ngo-admin/fro-workers'),
      ]);
      setLeads(Array.isArray(l) ? l : (l?.data || []));
      setFros(Array.isArray(f) ? f : (f?.data || []));
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const ngoGroups = useMemo(() => {
    const s = new Set(leads.map((l) => ngoNameOf(parseNotes(l.notes).account)));
    return ['all', ...Array.from(s)];
  }, [leads]);

  const assignedLeads = leads.filter((l) => l.status === 'assigned');
  const inboxLeads = leads.filter((l) => l.status !== 'assigned');
  const tabLeads = tab === 'assigned' ? assignedLeads : inboxLeads;
  const filtered = filter === 'all' ? tabLeads : tabLeads.filter((l) => ngoNameOf(parseNotes(l.notes).account) === filter);

  const assign = async (leadId, froId) => {
    if (!froId) return;
    setAssigning(leadId);
    setError('');
    try {
      await api(`/leads/${leadId}`, { method: 'PUT', body: JSON.stringify({ recruiter_id: froId, status: 'assigned' }) });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: 'assigned', recruiter_id: froId } : l)));
    } catch (e) {
      setError(e?.message || 'Assign failed');
    } finally {
      setAssigning(null);
    }
  };

  const remove = async (leadId) => {
    if (!window.confirm('Delete this lead?')) return;
    setDeleting(leadId);
    setError('');
    try {
      await api(`/leads/${leadId}`, { method: 'DELETE' });
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const statusPill = (s) => {
    const label = s === 'assigned' ? 'Assigned' : s === 'new' ? 'New' : (s || 'New');
    const color = s === 'assigned' ? '#16a34a' : '#b45309';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color, background: `${color}1a` }}>
        {label}
      </span>
    );
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200 }}>
      {/* Header */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--sage)', color: '#fff', flexShrink: 0 }}>
              <Inbox size={20} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 2px' }}>WhatsApp Reply Leads</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>
                Replies to bulk WhatsApp templates become leads here — assign them to an FRO to follow up.
              </div>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink, #0f172a)' }}>
            <RefreshCw size={14} style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform .8s linear' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Inbox / Assigned tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'inbox', label: 'Inbox', count: inboxLeads.length },
          { key: 'assigned', label: 'Assigned', count: assignedLeads.length },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, border: `1px solid ${active ? 'var(--sage)' : 'var(--line, #e2e8f0)'}`, background: active ? 'var(--sage)' : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
              {t.key === 'inbox' && <Inbox size={13} style={{ opacity: .8 }} />}
              {t.key === 'assigned' && <UserCheck size={13} style={{ opacity: .8 }} />}
              {t.label}
              <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* NGO filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {ngoGroups.map((a) => {
          const active = filter === a;
          const hue = a === 'all' ? '#0f172a' : accountHue(a);
          const count = a === 'all' ? tabLeads.length : tabLeads.filter((l) => ngoNameOf(parseNotes(l.notes).account) === a).length;
          return (
            <button key={a} onClick={() => setFilter(a)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: `1px solid ${active ? hue : 'var(--line, #e2e8f0)'}`, background: active ? hue : 'var(--bg, #fff)', color: active ? '#fff' : 'var(--ink-soft, #64748b)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
              {a === 'all' ? 'All NGOs' : a.toUpperCase()}
              <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: active ? 'rgba(255,255,255,.25)' : 'var(--line, #e2e8f0)', color: active ? '#fff' : 'var(--ink-soft, #64748b)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <div className="card">
        <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{tab === 'assigned' ? 'Assigned' : 'Inbox'}</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>{filtered.length} lead{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {loading && <div style={{ padding: 28, fontSize: 13, color: 'var(--ink-soft, #64748b)', textAlign: 'center' }}>Loading leads…</div>}
        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft, #64748b)' }}>
            <MessageSquareText size={32} style={{ opacity: .35, marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>{tab === 'assigned' ? 'No assigned leads yet' : 'No reply leads yet'}</div>
            <div style={{ fontSize: 12 }}>{tab === 'assigned' ? 'Leads you assign to an FRO will move here from the inbox.' : 'Bulk template replies will show up here automatically.'}</div>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line, #e2e8f0)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>Contact</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>Message</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>Account</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>Received</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--ink-soft, #64748b)' }}>{tab === 'assigned' ? 'Assigned FRO' : 'Assign to FRO'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const { message, template, account } = parseNotes(l.notes);
                  const hue = accountHue(account);
                  const assigned = l.status === 'assigned';
                  const froName = (l.workers && l.workers.name) || (fros.find((f) => String(f.id) === String(l.recruiter_id)) || {}).name || '—';
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--line, #e2e8f0)', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                          <User size={13} style={{ opacity: .5 }} />
                          {l.name || '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft, #64748b)', marginTop: 3 }}>
                          <Phone size={11} style={{ opacity: .5 }} />
                          {formatPhone(l.phone)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--ink, #0f172a)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message || '—'}</div>
                        {template && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 8px', borderRadius: 6, background: 'var(--line, #f1f5f9)', fontSize: 10.5, color: 'var(--ink-soft, #64748b)', maxWidth: '100%' }}>
                            <Tag size={10} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: hue, background: `${hue}1a`, letterSpacing: .3 }}>
                            {ngoNameOf(account)}
                          </span>
                          {/* <span style={{ fontSize: 10.5, color: 'var(--ink-soft, #64748b)' }}>{account}</span> */}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-soft, #64748b)', whiteSpace: 'nowrap' }}>{formatTime(l.created_at)}</td>
                      <td style={{ padding: '12px 16px' }}>{statusPill(l.status)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {assigned ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                                <UserCheck size={12} />
                                {froName}
                              </span>
                              <FroSelect fros={fros} label="Reassign" disabled={assigning === l.id} onAssign={(froId) => assign(l.id, froId)} />
                            </div>
                          ) : (
                            <FroSelect fros={fros} disabled={assigning === l.id} onAssign={(froId) => assign(l.id, froId)} />
                          )}
                          <button onClick={() => remove(l.id)} disabled={deleting === l.id}
                            title="Delete lead"
                            style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line, #e2e8f0)', background: 'var(--bg, #fff)', color: '#dc2626', cursor: 'pointer', opacity: deleting === l.id ? .5 : 1 }}>
                            <Trash2 size={14} />
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
