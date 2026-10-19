import { useState, useEffect, useRef } from 'react'
import { getTemplates as getTemplatesEnhanced, sendTemplateMessage as sendTemplateEnhanced, uploadMedia } from '../../api/whatsappEnhanced'
import { getTemplates as getTemplatesDirect, sendTemplateMessage as sendTemplateDirect } from '../../api/whatsappApi'
import TemplatePreview, { buttonsOf, variableTokens } from './TemplatePreview'

const CATEGORY_STYLE = {
  MARKETING: { label: 'Marketing', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' },
  UTILITY: { label: 'Utility', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  AUTHENTICATION: { label: 'Authentication', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  OTP: { label: 'OTP', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  ACCOUNT_UPDATE: { label: 'Account update', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  ALERT_UPDATE: { label: 'Alert / update', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  APPOINTMENT_UPDATE: { label: 'Appointment update', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  PERSONAL_FINANCE_UPDATE: { label: 'Personal finance update', bg: '#fafaf9', color: '#44403c', border: '#e7e5e4' },
  TRANSPORTATION_UPDATE: { label: 'Transportation update', bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
  ISSUE_RESOLUTION: { label: 'Issue resolution', bg: '#fefce8', color: '#a16207', border: '#fef08a' },
}

// Languages the donors are likely to receive in. `code` is what Meta reports;
// `label` is what the agent sees.
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'hi_IN', label: 'हिन्दी (India)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'gu_IN', label: 'ગુજરાતી (India)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'mr_IN', label: 'मराठी (India)' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'pa_IN', label: 'ਪੰਜਾਬੀ (India)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'ar', label: 'العربية (Arabic)' },
]

const ALL = { code: '', label: 'All languages' }

function languageLabel(code) {
  if (!code) return 'Unknown'
  const exact = LANGUAGES.find(l => l.code === code)
  if (exact) return exact.label
  const base = String(code).split(/[-_]/)[0]
  const loose = LANGUAGES.find(l => l.code === base)
  return loose ? `${loose.label} (${code})` : code
}

function categoryInfo(category) {
  const key = String(category || '').toUpperCase()
  return CATEGORY_STYLE[key] || { label: category ? key.replace(/_/g, ' ') : 'Uncategorised', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' }
}

function getHeaderMediaType(template) {
  const header = template.components?.find(component => component.type === 'HEADER')
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(header?.format)) return header.format

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

  // Meta templates mix positional {{1}} with named {{name}} placeholders, so
  // collect both and keep whatever token each one actually uses. A variable can
  // also sit in a header or inside a dynamic URL button -- those are editable
  // too, otherwise the send would go out with the raw {{...}} in the link.
  // A variable can sit in more than one place (a body and a button link, say).
  // Collect each token once and remember every place it is used, so the agent
  // fills one field instead of two that must be kept in sync by hand.
  const bodyTokens = variableTokens(bodyText)
  const headerTokens = headerComponent?.format === 'TEXT' ? variableTokens(headerText) : []
  const buttonTokens = buttonsOf(template).flatMap((b) => variableTokens(b.url || ''))
  const placeholders = [...new Set([...headerTokens, ...bodyTokens, ...buttonTokens])]
  const usageOf = (name) => [
    headerTokens.includes(name) ? 'Header' : null,
    bodyTokens.includes(name) ? 'Message' : null,
    buttonTokens.includes(name) ? 'Button link' : null,
  ].filter(Boolean)
  const hasMissingValue = placeholders.some(name => !values[name]?.trim())
  const hasTemplateHeader = !!(template.headerFromTemplate && template.headerMediaUrl)

  const headerMediaType = getHeaderMediaType(template)
  const needsHeaderFile = !!headerMediaType
  // The backend caches the template's own approved header, so a send without
  // an upload still carries the picture the template was approved with -- the
  // button stays usable even when this browser has no cached copy yet.
  // Attaching a file only overrides it.
  const canSend = !hasMissingValue

  const previewMediaUrl = headerFile
    ? URL.createObjectURL(headerFile)
    : (template.headerMediaUrl || headerComponent?.example?.header_handle?.[0] || '')

  const acceptedFiles = headerMediaType === 'IMAGE' ? 'image/*' : headerMediaType === 'VIDEO' ? 'video/*' : 'application/pdf,.pdf,.doc,.docx'

  const handleSend = () => {
    if (!canSend) return
    // Send by position. Templates that use named variables need them passed as
    // an object instead, which the send endpoint already accepts.
    const usesNamed = placeholders.some(name => !/^\d+$/.test(name))
    const params = usesNamed
      ? placeholders.reduce((acc, name) => { acc[name] = values[name].trim(); return acc }, {})
      : placeholders.map(name => values[name].trim())
    onSend(params, headerFile)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal template-params-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header template-params-modal__header">
          <h3>{template.name}</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body template-params-modal__body" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {(() => { const c = categoryInfo(template.category); return (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                  {c.label}
                </span>
              ) })()}
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                {languageLabel(template.language)}
              </span>
              {buttonsOf(template).length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                  {buttonsOf(template).length} button{buttonsOf(template).length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {placeholders.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Fill in the variable{placeholders.length > 1 ? 's' : ''} — the message updates as you type
                </div>
                {placeholders.map(name => {
                  const where = usageOf(name)
                  return (
                    <div key={name} style={{ marginBottom: 9 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 2 }}>
                        {/^\d+$/.test(name) ? `Variable ${name}` : name.replace(/_/g, ' ')}
                        <span style={{ fontWeight: 400, color: '#9ca3af' }}> — used in {where.join(', ').toLowerCase()}</span>
                      </label>
                      <input
                        value={values[name] || ''}
                        onChange={e => setValues(prev => ({ ...prev, [name]: e.target.value }))}
                        placeholder={`Enter a value for {{${name}}}`}
                        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
                This template has no variables — it can be sent as it is.
              </div>
            )}

            {needsHeaderFile && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  Header {headerMediaType.toLowerCase()}
                </div>
                {hasTemplateHeader && !headerFile ? (
                  <div style={{ fontSize: 11, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                    The template&apos;s own {headerMediaType.toLowerCase()} will be sent as-is.
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                    A {headerMediaType.toLowerCase()} will be attached from the template automatically. Attach a different file only if you want to override it.
                  </div>
                )}
                <label className="template-params-modal__upload">
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Attach a different {headerMediaType.toLowerCase()} (optional)
                  </span>
                  <input
                    className="template-params-modal__file-input"
                    type="file"
                    accept={acceptedFiles}
                    onChange={event => setHeaderFile(event.target.files?.[0] || null)}
                  />
                  <span className="template-params-modal__file-name">
                    {headerFile ? headerFile.name : (hasTemplateHeader ? 'Using the template header' : 'Using the template header')}
                  </span>
                </label>
              </div>
            )}
          </div>

          <div style={{ flex: '0 0 auto' }}>
            <TemplatePreview
              template={template}
              values={values}
              mediaUrl={previewMediaUrl}
              mediaFormat={headerMediaType}
            />
          </div>
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

/**
 * Template library shown next to the composer mic button.
 * Templates come straight from Meta, grouped by the category Meta reports
 * (Marketing / Utility / ...) and filterable by language, so an approved
 * template shows up here as soon as it is approved in the WhatsApp Manager.
 */
export default function TemplateLibrary({ conversationId, contactId, project, userId, onSent, agentToken }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('')
  const [refreshedAt, setRefreshedAt] = useState(null)
  const rootRef = useRef(null)

  const load = () => {
    if (!project) return Promise.resolve()
    setLoading(true)
    const fetchFn = agentToken
      ? () => getTemplatesEnhanced(project, agentToken)
      : () => getTemplatesDirect(project)
    return fetchFn()
      .then(data => {
        setTemplates(data || [])
        setRefreshedAt(new Date())
      })
      .catch(err => { console.error('[TemplateLibrary] load failed:', err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [project, agentToken])

  // Close when clicking away, but not when the click lands inside the library
  // or in the params modal that opens from it.
  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setActiveTemplate(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleSend = async (template, params, headerFile = null) => {
    // Only the legacy direct path needs contactId/userId. Requiring them here
    // made the agent path bail out silently whenever either was missing, which
    // reads as "the button does nothing".
    if (sending) return
    if (!conversationId) {
      alert('Open a conversation first, then send the template.')
      return
    }
    if (!agentToken && (!contactId || !userId)) {
      alert('This session is missing its WhatsApp identity. Please sign in again.')
      return
    }
    setSending(true)
    try {
      if (agentToken) {
        let headerMediaUrl
        if (headerFile) {
          const upload = await uploadMedia(headerFile, agentToken)
          headerMediaUrl = upload.file_url || upload.url
          if (!headerMediaUrl) throw new Error('Header file upload did not return a URL')
        }
        await sendTemplateEnhanced(conversationId, template.name, params || [], agentToken, headerMediaUrl, headerFile?.name)
      } else {
        await sendTemplateDirect(conversationId, contactId, template, params || [], userId)
      }
      onSent?.()
    } catch (err) {
      console.error('[TemplateLibrary] send failed:', err)
      alert('Failed to send template: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const requiresSetup = (template) => {
    const body = template.components?.find(component => component.type === 'BODY')
    const header = template.components?.find(component => component.type === 'HEADER')
    const headerHasVars = header?.format === 'TEXT' && /\{\{/.test(header.text || '')
    return /\{\{/.test(body?.text || '') || headerHasVars || !!getHeaderMediaType(template)
  }

  const approved = useMemoApproved(templates)
  const visible = approved.filter(tpl => {
    if (language && tpl.language !== language) return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    const body = tpl.components?.find(c => c.type === 'BODY')?.text || ''
    return tpl.name.toLowerCase().includes(q) || body.toLowerCase().includes(q)
  })

  const grouped = visible.reduce((acc, tpl) => {
    const key = String(tpl.category || 'UNCATEGORISED')
    ;(acc[key] ||= []).push(tpl)
    return acc
  }, {})

  // Only offer language filters that actually have approved templates, so the
  // dropdown never shows a language the WABA has nothing approved in.
  const availableLanguages = LANGUAGES.filter(l =>
    approved.some(tpl => tpl.language === l.code)
  )

  // The agent path only needs the conversation; the legacy direct path also
  // needs the contact and user. Requiring all three here greyed out the icon
  // for reasons the agent could not see.
  const canUse = !!conversationId && (!!agentToken || (!!contactId && !!userId))

  return (
    <div ref={rootRef} className="template-library" style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setActiveTemplate(activeTemplate ? null : '__open__')}
        disabled={!canUse}
        title="Template library"
        className="wa-icon-btn"
        style={{ color: canUse ? '#027eb5' : undefined }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v4H4z" />
          <path d="M4 12h10" />
          <path d="M4 16h13" />
          <path d="M4 20h7" />
        </svg>
      </button>

      {activeTemplate && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 40,
          width: 360, maxWidth: '78vw', background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Template Library</div>
            <button
              onClick={load}
              title="Refresh from Meta"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 2, display: 'flex' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 11-3-6.7" /><polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>

          <div style={{ padding: '8px 12px', display: 'flex', gap: 6, borderBottom: '1px solid #f3f4f6' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search templates"
              style={{ flex: 1, minWidth: 0, padding: '5px 9px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
            />
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              style={{ fontSize: 12, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', maxWidth: 130 }}
            >
              <option value={ALL.code}>{ALL.label}</option>
              {availableLanguages.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '6px 8px' }}>
            {loading ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '10px 4px' }}>Loading templates...</div>
            ) : visible.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '10px 4px' }}>
                {approved.length === 0
                  ? 'No approved templates yet for this number.'
                  : 'No template matches this filter.'}
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => {
                const info = categoryInfo(cat)
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                      padding: '3px 6px', marginBottom: 4, borderRadius: 6,
                      background: info.bg, color: info.color, border: `1px solid ${info.border}`,
                    }}>
                      {info.label} ({items.length})
                    </div>
                    {items.map(tpl => {
                      const body = (tpl.components || []).find(c => c.type === 'BODY')?.text || ''
                      const snippet = body.replace(/\s+/g, ' ').trim()
                      const fmt = tpl.headerFormat || getHeaderMediaType(tpl)
                      return (
                      <button
                        key={`${tpl.id}-${tpl.language}`}
                        onClick={() => setActiveTemplate(tpl)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                          padding: '6px 8px', marginBottom: 2, border: 'none', background: 'transparent', borderRadius: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{tpl.name}</div>
                        {snippet && (
                          <div style={{
                            fontSize: 10.5, color: '#6b7280', marginTop: 1, lineHeight: 1.35,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {snippet}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                          {languageLabel(tpl.language)}
                          {fmt ? ` · ${String(fmt).toLowerCase()} header` : ''}
                          {tpl.headerFromTemplate ? ' · header included' : ''}
                        </div>
                      </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div style={{ padding: '6px 12px', borderTop: '1px solid #f3f4f6', fontSize: 10, color: '#9ca3af' }}>
            {approved.length} approved
            {refreshedAt ? ` · updated ${refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>
      )}

      {activeTemplate && activeTemplate !== '__open__' && (
        <TemplateParamsModal
          template={activeTemplate}
          onClose={() => setActiveTemplate(null)}
          onSend={(params, headerFile) => handleSend(activeTemplate, params, headerFile)}
        />
      )}
    </div>
  )
}

// Kept tiny and local so the component stays a plain function component.
function useMemoApproved(templates) {
  return templates.filter(tpl => String(tpl.status || '').toUpperCase() === 'APPROVED')
}
