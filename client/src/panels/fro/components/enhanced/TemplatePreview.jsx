import { useState } from 'react'

/**
 * Approximation of how WhatsApp renders an approved template, so an agent can
 * see the whole thing -- header media, body with its variables, footer and
 * buttons -- before sending, the same way the WhatsApp Manager previews it.
 *
 * Variables the agent has not filled yet are shown highlighted rather than
 * blank, because a gap in the middle of the text hides what the donor will
 * actually read.
 */

function componentOf(template, type) {
  if (!Array.isArray(template?.components)) return null
  return template.components.find((c) => c && c.type === type) || null
}

/** Meta returns both shapes depending on the template's age. */
export function buttonsOf(template) {
  const buttons = []
  const container = componentOf(template, 'BUTTONS')
  for (const button of container?.buttons ?? []) {
    buttons.push({
      kind: String(button.type ?? '').toUpperCase(),
      label: String(button.text ?? ''),
      url: button.url ?? null,
      index: buttons.length,
    })
  }
  for (const component of template?.components ?? []) {
    if (!String(component?.type ?? '').startsWith('BUTTON')) continue
    const parameter = (component.parameters ?? []).find((p) => p?.url) ?? {}
    buttons.push({
      kind: String(component.sub_type ?? '').toUpperCase(),
      label: String(parameter.text ?? component.text ?? ''),
      url: parameter.url ?? component.url ?? null,
      index: Number.isInteger(component.index) ? component.index : buttons.length,
    })
  }
  return buttons
}

export function variableTokens(text) {
  return [...new Set((String(text ?? '').match(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g) || [])
    .map((t) => t.replace(/[{}\s]/g, '')))]
}

function renderText(text, values = {}) {
  const parts = []
  const pattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g
  let last = 0
  let match
  while ((match = pattern.exec(String(text ?? ''))) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    const token = match[1]
    const filled = String(values[token] ?? '').trim()
    parts.push({ token, text: filled || `{{${token}}}` })
    last = match.index + match[0].length
  }
  if (last < String(text ?? '').length) parts.push({ text: text.slice(last) })
  return parts
}

/** WhatsApp renders *bold* inside template text; keep that in the preview. */
function TextWithBold({ text, values }) {
  const parts = renderText(text, values)
  return parts.map((part, index) => {
    if (part.token) {
      const filled = String(values?.[part.token] ?? '').trim()
      return filled ? (
        <span key={index} style={{ background: '#dcfce7', borderRadius: 3, padding: '0 2px' }}>{filled}</span>
      ) : (
        <span key={index} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '0 3px', fontWeight: 600 }}>
          {`{{${part.token}}}`}
        </span>
      )
    }
    return (
      <span key={index}>
        {String(part.text).split(/(\*[^*\n]+\*)/g).map((chunk, j) =>
          chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2
            ? <strong key={j}>{chunk.slice(1, -1)}</strong>
            : <span key={j}>{chunk}</span>
        )}
      </span>
    )
  })
}

export default function TemplatePreview({ template, values = {}, mediaUrl, mediaFormat }) {
  if (!template) return null

  const header = componentOf(template, 'HEADER')
  const body = componentOf(template, 'BODY')
  const footer = componentOf(template, 'FOOTER')
  const headerFormat = String(header?.format ?? '').toUpperCase()
  const buttons = buttonsOf(template)
  const previewUrl = mediaUrl || header?.example?.header_handle?.[0] || ''

  return (
    <div style={{ maxWidth: 300 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
        WhatsApp preview
      </div>

      <div style={{ background: '#e5ddd5', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{
          background: '#fff', borderRadius: 8, maxWidth: 280, overflow: 'hidden',
          boxShadow: '0 1px 1px rgba(0,0,0,.16)', padding: 0,
        }}>
          {previewUrl && headerFormat === 'IMAGE' && (
            <img src={previewUrl} alt="" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
          )}
          {previewUrl && headerFormat === 'VIDEO' && (
            <video src={previewUrl} controls playsInline style={{ width: '100%', display: 'block', maxHeight: 220 }} />
          )}
          {headerFormat === 'DOCUMENT' && (
            <a
              href={previewUrl || undefined}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#f5f6f6', borderBottom: '1px solid #e9edef', textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: 22 }}>📄</span>
              <span style={{ fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {header?.example?.filename || 'Document'}
              </span>
            </a>
          )}

          <div style={{ padding: headerFormat === 'DOCUMENT' ? '8px 10px 4px' : '8px 10px 4px' }}>
            {headerFormat === 'TEXT' && header?.text && (
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 3, whiteSpace: 'pre-wrap' }}>
                <TextWithBold text={header.text} values={values} />
              </div>
            )}
            <div style={{ fontSize: 13.5, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              <TextWithBold text={body?.text || ''} values={values} />
            </div>
            {footer?.text && (
              <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 4 }}>{footer.text}</div>
            )}
          </div>

      {buttons.map((button, i) => {
        // A dynamic URL button shows the value the agent typed, so the preview
        // matches what the recipient will actually tap.
        const resolvedUrl = String(button.url || '').replace(
          /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
          (match, token) => String(values?.[token] ?? '').trim() || match,
        )
        const href = resolvedUrl && !resolvedUrl.includes('{{') ? resolvedUrl : null
        return (
          <div key={`b-${button.index}-${i}`} style={{
            borderTop: '1px solid #e9edef', padding: '9px 12px', textAlign: 'center',
            fontSize: 13, fontWeight: 500,
            color: button.kind === 'URL' ? '#027eb5' : '#111827',
          }}>
            {href
              ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{button.label || resolvedUrl}</a>
              : (button.label || button.url || 'Button')}
          </div>
        )
      })}

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 10px 5px' }}>
            <span style={{ fontSize: 10.5, color: '#667781' }}>12:04 PM ✓✓</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 6 }}>
        Preview is an approximation. WhatsApp renders the final message on the donor&apos;s phone.
      </div>
    </div>
  )
}
