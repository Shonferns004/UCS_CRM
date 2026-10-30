import { useState, useEffect, useRef } from 'react';
import { api, apiGet, apiPost } from '../api/auth';
import WhatsAppMessageList from './WhatsAppMessageList';

const ACCOUNT_COLORS = ['#0866FF', '#7B5CFA', '#0B6B3A', '#F97316', '#dc2626', '#0ea5e9'];

function accountColor(acc) {
  if (!acc) return '#6b7280';
  let h = 0;
  for (let i = 0; i < acc.length; i++) h = (h * 31 + acc.charCodeAt(i)) >>> 0;
  return ACCOUNT_COLORS[h % ACCOUNT_COLORS.length];
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString();
}

export default function WhatsAppChatWindow() {
  const [accounts, setAccounts] = useState([]);
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [selected, setSelected] = useState(null); // thread
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgError, setMsgError] = useState(null);
  const [msgAccountId, setMsgAccountId] = useState('all');
const [sendTextVal, setSendTextVal] = useState('');
const [sending, setSending] = useState(false);
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    apiGet('/whatsapp/accounts').then(d => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const loadThreads = async () => {
    setLoadingThreads(true);
    setLoadError(null);
    try {
      const qs = accountFilter !== 'all' ? `?accountId=${accountFilter}` : '';
      const data = await apiGet(`/whatsapp/chats${qs}`);
      setThreads(Array.isArray(data) ? data : []);
    } catch (e) {
      setThreads([]);
      setLoadError(e?.message || 'Failed to load chats');
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => { loadThreads(); }, [accountFilter]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let cancelled = false;
    setLoadingMsgs(true);
    setMsgError(null);
    (async () => {
      try {
        const qs = msgAccountId && msgAccountId !== 'all' ? `?accountId=${msgAccountId}` : '';
        const d = await apiGet(`/whatsapp/conversations/${selected.phone}${qs}`);
        if (cancelled) return;
        const msgs = Array.isArray(d?.messages) ? d.messages : [];
        setMessages(msgs);
      } catch (e) {
        if (!cancelled) { setMessages([]); setMsgError(e?.message || 'Failed'); }
      } finally {
        if (!cancelled) setLoadingMsgs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected, msgAccountId]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const filtered = threads.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.phone, t.lastMessage, t.accountName, t.project].some(v => String(v || '').toLowerCase().includes(q));
  });

const handleSelect = (t) => {
    setSelected(t);
    setMsgAccountId(t.accountId ? String(t.accountId) : 'all');
    setMobileShowChat(true);
  };

  const handleSend = async () => {
    if (!selected || !sendTextVal.trim()) return;
    setSending(true);
    try {
      await apiPost('/whatsapp/send-text', { to: selected.phone, text: sendTextVal.trim(), accountId: msgAccountId !== 'all' ? msgAccountId : selected.accountId });
      setSendTextVal('');
      const qs = msgAccountId && msgAccountId !== 'all' ? `?accountId=${msgAccountId}` : '';
      const dd = await apiGet(`/whatsapp/conversations/${selected.phone}${qs}`);
      setMessages(Array.isArray(dd?.messages) ? dd.messages : []);
    } catch (e) {
      alert(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await api('/upload', { method: 'POST', body: form, _prefix: 'ucs' });
      const url = up?.url;
      if (!url) throw new Error('Upload failed');
      const mediaType = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'document');
      await apiPost('/whatsapp/send-media', { to: selected.phone, mediaUrl: url, mediaType, accountId: msgAccountId !== 'all' ? msgAccountId : selected.accountId });
      // reload messages
      const qs = msgAccountId && msgAccountId !== 'all' ? `?accountId=${msgAccountId}` : '';
      const d = await apiGet(`/whatsapp/conversations/${selected.phone}${qs}`);
      setMessages(Array.isArray(d?.messages) ? d.messages : []);
    } catch (err) {
      alert(err?.message || 'Attachment send failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const exportToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = threads.filter(t => t.hasReply);
    const csv = ['Phone,Name,Account,RepliedAt,ReplyMessage']
      .concat(rows.map(t => `"${t.phone}","${String(t.recipientName || t.phone || '').replace(/"/g, '""')}","${t.accountName || ''}","${t.lastReplyAt || ''}","${(t.replyText || '').replace(/"/g, '""')}"`))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `whatsapp_replies_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', height: '60vh', minHeight: 450, maxHeight: '70vh', background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)', overflow: 'hidden', border: '1px solid #e5e7eb' }} className={mobileShowChat ? 'wa-mobile-chat' : ''}>
      {/* Left pane */}
      <div style={{ width: 340, minWidth: 280, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#f8fafc' }} className="wa-left-pane">
        <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
          <input
            placeholder="Search phone / message..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 34, padding: '0 10px', border: '1px solid #cbd0dc', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={exportToday} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd0dc', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⬇ Export replies</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setAccountFilter('all')} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #cbd0dc', background: accountFilter === 'all' ? '#0866FF' : '#fff', color: accountFilter === 'all' ? '#fff' : '#1C1E21', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>All</button>
            {accounts.map(a => (
              <button key={a.id} onClick={() => setAccountFilter(String(a.id))} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #cbd0dc', background: accountFilter === String(a.id) ? accountColor(a.name) : '#fff', color: accountFilter === String(a.id) ? '#fff' : '#1C1E21', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: accountColor(a.name) }} /> {a.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingThreads && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: 12, borderBottom: '1px solid #eef1f8' }}>
              <div style={{ height: 14, width: '60%', background: '#e5e7eb', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '80%', background: '#f1f5f9', borderRadius: 4 }} />
            </div>
          ))}
          {!loadingThreads && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              {loadError ? <span style={{ color: '#dc2626' }}>{loadError}</span> : <>No chats yet.<br />Send a bulk message or wait for replies.</>}
            </div>
          )}
          {filtered.map(t => {
            const isActive = selected && selected.phone === t.phone;
            const col = accountColor(t.accountName);
            return (
              <div key={t.phone} onClick={() => handleSelect(t)} style={{ padding: 12, borderBottom: '1px solid #eef1f8', cursor: 'pointer', background: isActive ? '#e8f0fe' : 'transparent', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: col, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {t.phone.slice(-2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1C1E21' }}>{t.phone}</span>
                    <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{timeAgo(t.lastAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#5B6070', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {t.replyText || t.lastMessage || (t.direction === 'outbound' ? 'Outbound message' : 'Inbound message')}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: col + '22', color: col, fontWeight: 600 }}>{t.accountName || t.project || '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right pane */}
      <div style={{ flex: 1, display: (!mobileShowChat && (typeof window !== 'undefined' && window.innerWidth < 768)) ? 'none' : 'flex', flexDirection: 'column', minWidth: 0, background: '#efeae2' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: 8 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Select a chat to view messages</div>
            <div style={{ fontSize: 12 }}>Choose a conversation from the list on the left.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setMobileShowChat(false)} style={{ display: 'none' }} className="wa-back-btn">← Back</button>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Chat — {selected.phone}</h3>
              <select value={msgAccountId} onChange={e => setMsgAccountId(e.target.value)} style={{ marginLeft: 'auto', height: 30, fontSize: 12, border: '1px solid #cbd0dc', borderRadius: 6, padding: '0 6px' }}>
                <option value="all">All NGOs</option>
                {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </select>
            </div>
            <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#efeae2' }}>
              <WhatsAppMessageList messages={messages} loading={loadingMsgs} error={msgError} />
            </div>
            <div style={{ padding: 12, borderTop: '2px solid #0866FF', background: '#fff', display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', position: 'sticky', bottom: 0, zIndex: 10 }}>
              <input type="file" ref={fileInputRef} onChange={handleAttach} style={{ display: 'none' }} accept="image/*,video/*,application/pdf" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #cbd0dc', background: '#fff', cursor: 'pointer', fontSize: 18, flexShrink: 0 }} title="Attach file">{uploading ? '...' : '📎'}</button>
              <input value={sendTextVal} onChange={e => setSendTextVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Type a reply here and press Enter..." style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid #cbd0dc', borderRadius: 8, fontSize: 14 }} />
              <button className="wa-btn wa-btn-primary" onClick={handleSend} disabled={sending || !sendTextVal.trim()} style={{ height: 40, padding: '0 16px', fontWeight: 700, flexShrink: 0 }}>{sending ? 'Sending...' : 'Send'}</button>
              <button className="wa-btn wa-btn-outline" onClick={() => { setSelected(null); setMobileShowChat(false); }} style={{ height: 40, flexShrink: 0 }}>Close</button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .wa-mobile-chat .wa-left-pane { display: none !important; }
        }
      `}</style>
    </div>
  );
}
