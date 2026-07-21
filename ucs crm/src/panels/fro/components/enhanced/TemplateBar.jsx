import { useState, useEffect } from 'react'
import { getTemplates, sendTemplateMessage } from '../../api/whatsappSupabase'

function TemplateParamsModal({ template, onClose, onSend }) {
  const [values, setValues] = useState({})

  const extractPlaceholders = (text) => {
    const matches = text.match(/\{\{(\d+)\}\}/g) || []
    return [...new Set(matches.map(m => parseInt(m.replace(/\D/g, ''))))]
  }

  const headerText = template.components?.find(c => c.type === 'HEADER')?.text || ''
  const bodyText = template.components?.find(c => c.type === 'BODY')?.text || ''
  const placeholders = [...new Set([...extractPlaceholders(headerText), ...extractPlaceholders(bodyText)])]

  const handleSend = () => {
    const params = placeholders.map(n => values[n] || '').filter(Boolean)
    onSend(params)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{template.name}</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ padding: 16 }}>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Fill in the parameters:</div>
              {placeholders.map(n => (
                <div key={n} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 2 }}>Parameter {n}</label>
                  <input
                    value={values[n] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [n]: e.target.value }))}
                    placeholder={`Value for {{${n}}}`}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          )}
          <button onClick={handleSend} className="btn btn-primary" style={{ width: '100%' }}>
            Send Template
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TemplateBar({ conversationId, contactId, project, userId, onSent }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getTemplates(project)
      .then(data => setTemplates(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, project])

  const handleSend = async (template, params) => {
    if (sending || !conversationId || !contactId || !userId) return
    setSending(true)
    try {
      await sendTemplateMessage(conversationId, contactId, template, params || [], userId)
      onSent?.()
    } catch (err) {
      alert('Failed to send template: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const hasParams = (template) => {
    const components = template.components || []
    return components.some(c => (c.text || '').includes('{{'))
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
                    if (hasParams(tpl)) {
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
          onSend={(params) => handleSend(activeTemplate, params)}
        />
      )}
    </>
  )
}
