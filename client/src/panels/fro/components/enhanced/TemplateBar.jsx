import { useState, useEffect } from 'react'
import { getTemplates as getTemplatesEnhanced, sendTemplateMessage as sendTemplateEnhanced, uploadMedia } from '../../api/whatsappEnhanced'
import { getTemplates as getTemplatesDirect, sendTemplateMessage as sendTemplateDirect } from '../../api/whatsappApi'

function getHeaderMediaType(template) {
  const header = template.components?.find(component => component.type === 'HEADER')
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(header?.format)) return header.format

  // Older records may not yet contain Meta's component metadata. These
  // templates are known to require a media header, so do not send them bare.
  const name = String(template.name || '').toLowerCase()
  if (name.includes('receipt')) return 'DOCUMENT'
  if (name.includes('quotation')) return 'IMAGE'
  return null
}

function TemplateParamsModal({ template, onClose, onSend }) {
  const [values, setValues] = useState({})
  const [headerFile, setHeaderFile] = useState(null)

  const bodyComponent = template.components?.find(c => c.type === 'BODY')
  const headerComponent = template.components?.find(c => c.type === 'HEADER')
  const headerText = headerComponent?.text || ''
  const bodyText = bodyComponent?.text || ''
  const placeholders = [...new Set((bodyText.match(/\{\{(\d+)\}\}/g) || [])
    .map(match => Number(match.replace(/\D/g, ''))))]
    .sort((a, b) => a - b)
  const hasMissingValue = placeholders.some(number => !values[number]?.trim())
  const headerMediaType = getHeaderMediaType(template)
  const needsHeaderFile = !!headerMediaType
  const canSend = !hasMissingValue && (!needsHeaderFile || !!headerFile)
  const acceptedFiles = headerMediaType === 'IMAGE' ? 'image/*' : headerMediaType === 'VIDEO' ? 'video/*' : 'application/pdf,.pdf,.doc,.docx'

  const handleSend = () => {
    if (!canSend) return
    // Keep the parameter positions intact. Removing blank values shifts all
    // later variables and can send a recipient the wrong information.
    const params = placeholders.map(number => values[number].trim())
    onSend(params, headerFile)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal template-params-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header template-params-modal__header">
          <h3>{template.name}</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body template-params-modal__body">
          {headerText && (
            <div style={{ marginBottom: 12, padding: 10, background: '#f3f4f6', borderRadius: 8, fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap' }}>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 11, color: '#374151' }}>Header:</strong>
              {headerText}
            </div>
          )}
          <div style={{ marginBottom: 16, padding: 10, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>
            <strong style={{ display: 'block', marginBottom: 4, fontSize: 11, color: '#16a34a' }}>Message preview:</strong>
            {bodyText}
          </div>
          {placeholders.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Fill in every required message variable:</div>
              {placeholders.map(number => (
                <div key={number} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 2 }}>Variable {`{{${number}}}`}</label>
                  <input
                    value={values[number] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [number]: e.target.value }))}
                    placeholder={`Enter a value for {{${number}}}`}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          )}
          {needsHeaderFile && (
            <label className="template-params-modal__upload">
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Attach header {headerMediaType.toLowerCase()}
              </span>
              <input className="template-params-modal__file-input" type="file" accept={acceptedFiles} onChange={event => setHeaderFile(event.target.files?.[0] || null)} />
              <span className="template-params-modal__file-name">
                {headerFile ? headerFile.name : `This template requires a ${headerMediaType.toLowerCase()} before it can be sent.`}
              </span>
            </label>
          )}
        </div>
        <div className="template-params-modal__footer">
          <button onClick={handleSend} disabled={!canSend} className="btn btn-primary" style={{ width: '100%', opacity: canSend ? 1 : .55, cursor: canSend ? 'pointer' : 'not-allowed' }}>
            Send Template
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TemplateBar({ conversationId, contactId, project, userId, onSent, agentToken }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const fetchFn = agentToken
      ? () => getTemplatesEnhanced(project, agentToken)
      : () => getTemplatesDirect(project)
    fetchFn()
      .then(data => setTemplates(data || []))
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false))
  }, [open, project, agentToken])

  const handleSend = async (template, params, headerFile = null) => {
    console.log('[TemplateBar] handleSend:', { conversationId, contactId, userId, agentToken: !!agentToken, templateName: template.name, params })
    if (sending || !conversationId || !contactId || !userId) {
      console.warn('[TemplateBar] BLOCKED — missing required props:', { sending, conversationId, contactId, userId })
      return
    }
    setSending(true)
    try {
      if (agentToken) {
        console.log('[TemplateBar] sending via enhanced (agentToken present)')
        let headerMediaUrl
        if (headerFile) {
          const upload = await uploadMedia(headerFile, agentToken)
          headerMediaUrl = upload.file_url || upload.url
          if (!headerMediaUrl) throw new Error('Header file upload did not return a URL')
        }
        await sendTemplateEnhanced(conversationId, template.name, params || [], agentToken, headerMediaUrl, headerFile?.name)
      } else {
        console.log('[TemplateBar] sending via direct (no agentToken)')
        await sendTemplateDirect(conversationId, contactId, template, params || [], userId)
      }
      console.log('[TemplateBar] send SUCCESS')
      onSent?.()
    } catch (err) {
      console.error('[TemplateBar] send FAILED:', err)
      alert('Failed to send template: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const requiresSetup = (template) => {
    const body = template.components?.find(component => component.type === 'BODY')
    return (body?.text || '').includes('{{') || !!getHeaderMediaType(template)
  }

  if (!conversationId || !contactId || !userId) return null

  return (
    <>
      <div style={{ borderTop: '1px solid #e5e7eb', background: '#fff' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            fontWeight: 600,
            color: '#6b7280',
          }}
        >
          <span>Templates</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {open && (
          <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {loading ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>Loading templates...</div>
            ) : templates.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>No templates available</div>
            ) : (
              templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    if (requiresSetup(tpl)) {
                      setActiveTemplate(tpl)
                    } else {
                      handleSend(tpl, [])
                    }
                  }}
                  disabled={sending || tpl.status !== 'approved'}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    background: tpl.status === 'approved' ? '#fff' : '#f3f4f6',
                    color: tpl.status === 'approved' ? '#374151' : '#9ca3af',
                    cursor: sending || tpl.status !== 'approved' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {tpl.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {activeTemplate && (
        <TemplateParamsModal
          template={activeTemplate}
          onClose={() => setActiveTemplate(null)}
          onSend={(params, headerFile) => handleSend(activeTemplate, params, headerFile)}
        />
      )}
    </>
  )
}
