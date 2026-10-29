import { useState } from 'react';

export default function WhatsAppMessageList({ messages, loading, error }) {
  if (loading) return <p style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>Loading...</p>;
  if (error) return <p style={{ color: '#dc2626', padding: 12 }}>{error}</p>;
  if (!messages || !messages.length) return <p style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>No messages yet.</p>;
  return (
    <>
      {messages.map(m => (
        <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
          <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: 12, background: m.direction === 'outbound' ? '#dcf8c6' : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
            {m.direction === 'inbound' && m.project && <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 600 }}>{m.project.toUpperCase()}</div>}
            {m.message_type === 'image' && m.media_url && (
              <img src={m.media_url} alt="image" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6, display: 'block' }} />
            )}
            {m.template_header && m.template_header.format === 'IMAGE' && m.template_header.example?.header_handle?.[0] && (
              <img src={m.template_header.example.header_handle[0]} alt="header" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6, display: 'block' }} />
            )}
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body_text || (m.message_type === 'image' ? '' : `[${m.message_type}]`)}</div>
            {Array.isArray(m.template_buttons) && m.template_buttons.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.template_buttons.map((b, i) => (
                  <a key={i} href={b.url || '#'} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '6px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, color: '#0866FF', textDecoration: 'none', fontWeight: 600 }}>
                    {b.text || b.type}
                  </a>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <span>{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
              {m.direction === 'outbound' && <span>{m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : m.status === 'failed' ? '✗' : '✓'}</span>}
            </div>
            {m.failure_reason && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{m.failure_reason}</div>}
          </div>
        </div>
      ))}
    </>
  );
}
