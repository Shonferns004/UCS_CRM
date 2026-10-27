import React from 'react';

export default function TemplatePreview({ template }) {
  if (!template) return null;
  const header = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'HEADER');
  const body = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'BODY');
  const footer = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'FOOTER');
  const buttons = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'BUTTONS');

  return (
    <div style={{ background: '#e5ddd5', borderRadius: 12, padding: 12, maxWidth: 360 }}>
      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,.12)', overflow: 'hidden' }}>
        {header?.format === 'IMAGE' && header.example?.header_handle?.[0] && (
          <img src={header.example.header_handle[0]} alt="header" style={{ width: '100%', display: 'block' }} />
        )}
        {header?.format === 'TEXT' && header.text && (
          <div style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid #eee' }}>{header.text}</div>
        )}
        {header?.format === 'DOCUMENT' && (
          <div style={{ padding: 12, background: '#f4f6fb', borderBottom: '1px solid #eee', fontSize: 12 }}>📄 Document header</div>
        )}
        <div style={{ padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45, color: '#111B21' }}>
          {body?.text || ''}
        </div>
        {footer?.text && (
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#667781' }}>{footer.text}</div>
        )}
        {buttons?.buttons?.length > 0 && (
          <div style={{ borderTop: '1px solid #eee' }}>
            {buttons.buttons.map((b, i) => (
              <button key={i} type="button" style={{ width: '100%', padding: '10px', border: 'none', background: '#fff', color: '#008069', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderTop: i > 0 ? '1px solid #eee' : 'none' }}>
                {b.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#667781', marginTop: 6, textAlign: 'right' }}>Template preview</div>
    </div>
  );
}