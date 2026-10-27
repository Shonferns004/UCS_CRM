import React from 'react';

export default function TemplatePreview({ template }) {
  if (!template) return null;
  const header = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'HEADER');
  const body = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'BODY');
  const footer = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'FOOTER');
  const buttons = (template.components || []).find(c => String(c.type || '').toUpperCase() === 'BUTTONS');

  return (
    <div style={{ border: '1px solid #d1d7db', borderRadius: 12, background: '#fff', overflow: 'hidden', maxWidth: 360 }}>
      {header?.format === 'IMAGE' && header.example?.header_handle?.[0] && (
        <img src={header.example.header_handle[0]} alt="header" style={{ width: '100%', display: 'block' }} />
      )}
      {header?.format === 'TEXT' && header.text && (
        <div style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>{header.text}</div>
      )}
      <div style={{ padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
        {body?.text || ''}
      </div>
      {footer?.text && (
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#667781', borderTop: '1px solid #e5e7eb' }}>{footer.text}</div>
      )}
      {buttons?.buttons?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderTop: '1px solid #e5e7eb' }}>
          {buttons.buttons.map((b, i) => (
            <button key={i} type="button" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #008069', background: '#fff', color: '#008069', fontSize: 12, fontWeight: 600 }}>
              {b.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}