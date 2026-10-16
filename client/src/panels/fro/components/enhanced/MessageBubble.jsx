import { useState, useEffect } from 'react'
import MediaPreviewModal from './MediaPreviewModal'
import { API_BASE as apiBase } from '../../../../lib/apiBase'
import { istDateString } from '../../utils/time'
import { classifyDeliveryFailure } from '../../../../lib/whatsappErrorCodes'

// WhatsApp tick semantics, which agents rely on to know whether a donor has
// actually seen a message:
//   1 grey tick = handed to WhatsApp
//   2 grey ticks = delivered to the phone
//   2 blue ticks = opened by the donor
// The double tick is drawn as two overlapping chevrons; using one chevron for
// both delivered and read made the two states look identical.
const TICK_GREY = '#8696a0'
const TICK_BLUE = '#53bdeb'

function SingleTick({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" data-ticks="1">
      <polyline points="5,13 9.5,17.5 19,7" />
    </svg>
  )
}

function DoubleTick({ color }) {
  return (
    <svg width="18" height="16" viewBox="0 0 26 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" data-ticks="2">
      <polyline points="2,13 6.5,17.5 15,8" />
      <polyline points="9,14.5 11,17.5 20.5,7" />
    </svg>
  )
}

function MessageStatusIcon({ status }) {
  if (status === 'queued' || status === 'sending') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TICK_GREY} strokeWidth="2" strokeLinecap="round" data-ticks="clock" title="Sending">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12,7 12,12 15.5,14" />
      </svg>
    )
  }
  if (status === 'sent' || status === 'accepted') {
    return <span title="Sent ΓÇö handed to WhatsApp"><SingleTick color={TICK_GREY} /></span>
  }
  if (status === 'delivered') {
    return <span title="Delivered ΓÇö reached the donor's phone"><DoubleTick color={TICK_GREY} /></span>
  }
  if (status === 'read') {
    return <span title="Read ΓÇö opened by the donor"><DoubleTick color={TICK_BLUE} /></span>
  }
  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" data-ticks="failed" title="Not delivered">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="13" />
        <line x1="12" y1="16" x2="12" y2="16.5" />
      </svg>
    )
  }
  return null
}

function TimeDisplay({ ts }) {
  if (!ts) return null
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
}

function DateSeparator({ dateStr }) {
  if (!dateStr) return null
  const today = istDateString()
  const yesterday = istDateString(Date.now() - 86400000)
  let label
  if (dateStr === today) label = 'Today'
  else if (dateStr === yesterday) label = 'Yesterday'
  else label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px 0 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '4px 12px', borderRadius: 8 }}>
        {label}
      </div>
    </div>
  )
}

function getMessageDate(ts) {
  if (!ts) return null
  return istDateString(ts)
}

function shouldGroup(prev, curr) {
  if (!prev || !curr) return false
  const sameSender = prev.direction === curr.direction
  const closeTime = new Date(curr.created_at) - new Date(prev.created_at) < 600000
  return sameSender && closeTime
}

function MediaFromMeta({ mediaId, mimeType }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const token = (() => { try { return localStorage.getItem('ucs_token') } catch { return null } })()
    ;(async () => {
      try {
        const res = await fetch(`${apiBase}/fro/whatsapp/media/${encodeURIComponent(mediaId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (cancelled || !res.ok) { setLoading(false); return }
        const blob = await res.blob()
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob))
      } catch (e) { console.error('Error:', e.message); } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [mediaId])

  if (loading) return <div style={{ padding: 8, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>Loading media...</div>
  if (!blobUrl) return null
  return <MediaContent url={blobUrl} mimeType={mimeType} />
}

function typeToMime(messageType) {
  if (messageType === 'image') return 'image/jpeg'
  if (messageType === 'video') return 'video/mp4'
  if (messageType === 'audio') return 'audio/ogg'
  if (messageType === 'document') return 'application/pdf'
  return ''
}

function MediaContent({ url, mimeType, messageType, name, onPreview }) {
  if (!url) return null
  const mime = mimeType || typeToMime(messageType) || ''
  const handlePreview = () => onPreview?.({ url, mimeType, messageType, name })

  if (mime.startsWith('image/')) {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', maxWidth: 300, margin: '4px 0' }}>
        <img src={url} alt="" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, cursor: 'pointer' }} onClick={handlePreview} />
      </div>
    )
  }
  if (mime.startsWith('video/')) {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', maxWidth: 300, margin: '4px 0' }}>
        <video src={url} controls style={{ width: '100%', display: 'block', borderRadius: 8 }} onClick={handlePreview} />
      </div>
    )
  }
  if (mime.startsWith('audio/')) {
    return (
      <div style={{ borderRadius: 8, maxWidth: 300, minWidth: 220, margin: '4px 0', padding: 8, background: '#e8f5e9', border: '1px solid #c8e6c9' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#2e7d32', marginBottom: 4 }}>≡ƒÄ╡ Audio</div>
        <audio src={url} controls style={{ width: '100%', height: 40 }} />
      </div>
    )
  }
  return (
    <div onClick={handlePreview} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#f3f4f6', cursor: 'pointer', color: '#374151', fontSize: 12, fontWeight: 600, margin: '4px 0', maxWidth: 300 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || url.split('/').pop()}</span>
    </div>
  )
}

function MediaPlaceholder({ messageType }) {
  const icon = messageType === 'audio' ? '≡ƒÄ╡' : messageType === 'video' ? '≡ƒÄ¼' : messageType === 'image' ? '≡ƒû╝∩╕Å' : messageType === 'document' ? '≡ƒôä' : messageType === 'sticker' ? '≡ƒÅ╖∩╕Å' : '≡ƒôÄ'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#f3f4f6', margin: '4px 0', fontSize: 12, color: '#6b7280' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{messageType || 'media'}</span>
    </div>
  )
}

const MEDIA_TYPES = ['audio', 'video', 'image', 'document', 'sticker', 'media']

/** Renders WhatsApp's *bold* inside template text. */
function TemplateBody({ text }) {
  return String(text || '').split(/(\*[^*\n]+\*)/g).map((chunk, i) =>
    chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2
      ? <strong key={i}>{chunk.slice(1, -1)}</strong>
      : <span key={i}>{chunk}</span>,
  )
}

/**
 * A template message is stored with the content the donor actually received
 * (header media, body with its variables filled, footer, buttons) so the thread
 * reads the same way as the WhatsApp thread. Older rows only kept the template
 * name, so they fall back to showing that.
 */
function TemplateMessage({ message }) {
  const meta = message.template_params
  // NOTE: isSummary is a boolean. Reading `isSummary?.footer` would always be
  // undefined because you cannot reach a property through a boolean, which
  // silently dropped the footer, the header text and the template name.
  const isSummary = !!(meta && typeof meta === 'object' && meta.kind === 'whatsapp_template')
  const headerUrl = message.media_url
  const format = (isSummary ? meta.headerFormat : message.media_mime_type) || ''
  const body = isSummary ? meta.body : message.body_text
  const buttons = isSummary ? (meta.buttons || []) : []
  const footer = isSummary ? meta.footer : null
  const headerText = isSummary ? meta.headerText : null
  const templateName = isSummary ? meta.name : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {headerUrl && String(format).toUpperCase() === 'IMAGE' && (
        <img
          src={headerUrl}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none' }}
          style={{ width: '100%', maxWidth: 260, display: 'block', borderRadius: 8 }}
        />
      )}
      {headerUrl && String(format).toUpperCase() === 'VIDEO' && (
        <video src={headerUrl} controls playsInline style={{ width: '100%', maxWidth: 260, display: 'block', borderRadius: 8 }} />
      )}
      {headerUrl && String(format).toUpperCase() === 'DOCUMENT' && (
        <a
          href={headerUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#f5f6f6', borderRadius: 8, textDecoration: 'none', color: '#111827' }}
        >
          <span style={{ fontSize: 20 }}>≡ƒôä</span>
          <span style={{ fontSize: 12 }}>Document</span>
        </a>
      )}
      {headerText && (
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', whiteSpace: 'pre-wrap' }}>
          <TemplateBody text={headerText} />
        </div>
      )}
      {body && (
        <div style={{ fontSize: 13.5, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          <TemplateBody text={body} />
        </div>
      )}
      {footer && (
        <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{footer}</div>
      )}
      {buttons.map((button, i) => (
        <div
          key={`tpl-btn-${i}`}
          style={{
            borderTop: '1px solid #e9edef', marginTop: 4, paddingTop: 8, paddingBottom: 2,
            textAlign: 'center', fontSize: 13, fontWeight: 500,
            color: button.kind === 'URL' ? '#027eb5' : '#111827',
          }}
        >
          {button.url
            ? <a href={button.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{button.label || button.url}</a>
            : (button.label || '')}
        </div>
      ))}
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
        Template{templateName ? ` ┬╖ ${templateName}` : ''}
      </div>
    </div>
  )
}

export function MessageBubble({ message, isFirst, isLast, isGroup, onContextMenu, onRetry }) {
  const [preview, setPreview] = useState(null)
  const isOutbound = message.direction === 'outbound'
  const isTemplate = message.message_type === 'template'
  const isMediaType = MEDIA_TYPES.includes(message.message_type)
  // Template messages carry their own layout, so the generic media/text paths
  // below must not also run for them.
  const text = (isMediaType || isTemplate) ? '' : (message.body_text || message.body || '')
  const hasMedia = !isTemplate && !!(message.media_url || message.media_id || isMediaType)
  const extraMedias = message.template_params?.filter?.((p, i) => i > 0) || []
  const allMedias = message.media_url ? [{ url: message.media_url, mimeType: message.media_mime_type, messageType: message.message_type, name: message.body_text || '' }, ...extraMedias] : []

  const bubbleStyle = {
    maxWidth: '75%',
    padding: hasMedia && !text ? '4px 4px 6px 4px' : '6px 10px 6px 10px',
    borderRadius: 8,
    background: isOutbound ? '#dcfce7' : '#f3f4f6',
    borderBottomRightRadius: isOutbound ? (isLast ? 4 : 8) : 8,
    borderBottomLeftRadius: isOutbound ? 8 : (isLast ? 4 : 8),
    borderTopRightRadius: isOutbound ? (isFirst ? 8 : 4) : 8,
    borderTopLeftRadius: isOutbound ? 8 : (isFirst ? 8 : 4),
    position: 'relative',
    wordBreak: 'break-word',
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOutbound ? 'flex-end' : 'flex-start',
        marginBottom: isGroup ? 2 : 6,
        padding: '0 12px',
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, message) }}
    >
      <div style={bubbleStyle}>
        {isTemplate ? (
          <TemplateMessage message={message} />
        ) : (
          <>
        {hasMedia && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allMedias.length > 0 ? allMedias.map((m, i) => (
              <div key={i} style={{ maxWidth: i === 0 && allMedias.length === 1 ? '100%' : 'calc(50% - 2px)' }}>
                <MediaContent url={m.url || m.media_url} mimeType={m.mimeType || m.media_mime_type} messageType={m.messageType || m.message_type} name={m.name || ''} onPreview={setPreview} />
              </div>
            )) : message.media_id ? (
              <MediaFromMeta mediaId={message.media_id} mimeType={message.media_mime_type || typeToMime(message.message_type)} />
            ) : (
              <MediaPlaceholder messageType={message.message_type} />
            )}
          </div>
        )}
        {text && (
          <div style={{ fontSize: 13, lineHeight: 1.45, color: '#111827', whiteSpace: 'pre-wrap', padding: hasMedia ? '2px 6px 0' : 0 }}>
            {text}
          </div>
        )}
          </>
        )}
        {/* Timestamp and delivery ticks apply to every outbound message kind,
            templates included -- an agent needs the same read/delivered signal
            for a template as for a typed reply. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2, padding: (text || (!hasMedia && !isTemplate)) ? 0 : '0 4px' }}>
          <span style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1 }}>
            <TimeDisplay ts={message.created_at} />
          </span>
          {isOutbound && (
            <span title={message.status === 'failed' ? (message.failure_reason || 'WhatsApp could not deliver this message') : message.status}>
              <MessageStatusIcon status={message.status} />
            </span>
          )}
        </div>
        {isOutbound && message.status === 'failed' && (() => {          // 131047 and friends cannot be fixed by resending identical text, so the
          // Retry button is replaced with the reason instead of offering a dead end.
          const failure = classifyDeliveryFailure(message.failure_reason)
          return (
          <div style={{ marginTop: 4, padding: '0 4px', borderTop: '1px solid #fecaca' }}>
            <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 4, lineHeight: 1.35 }}>
              Not delivered{message.failure_reason ? `: ${message.failure_reason}` : ''}
            </div>
            {failure.retryable ? (
              onRetry && (
                <button
                  onClick={() => onRetry(message)}
                  style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: '#b91c1c', background: '#fff', border: '1px solid #fca5a5', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
                  Retry
                </button>
              )
            ) : (
              <div style={{ marginTop: 4, fontSize: 10, color: '#92400e', lineHeight: 1.35 }}>
                <strong>{failure.title}</strong> {failure.hint}
              </div>
            )}
          </div>
          )
        })()}
      </div>
      {preview && <MediaPreviewModal {...preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

export function MessageList({ messages, onContextMenu, messagesContainerRef, messagesEndRef, onRetry }) {
  if (!messages) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading messages...</div>
      </div>
    )
  }
  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#d1d5db">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
          <path d="M11 7h2v4h-2zm0 6h2v2h-2z"/>
        </svg>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>No messages yet</div>
        <div style={{ fontSize: 11, color: '#d1d5db' }}>Send a message to start the conversation</div>
      </div>
    )
  }

  const elements = []
  let lastDate = null
  let lastMsg = null

  messages.forEach((msg, i) => {
    const date = getMessageDate(msg.created_at)
    if (date && date !== lastDate) {
      elements.push(<DateSeparator key={`d-${date}`} dateStr={date} />)
      lastDate = date
    }
    const groupWithPrev = shouldGroup(lastMsg, msg)
    const groupWithNext = shouldGroup(msg, messages[i + 1])
    const isFirstInGroup = !groupWithPrev
    const isLastInGroup = !groupWithNext

    elements.push(
      <MessageBubble
        key={msg.id || i}
        message={msg}
        isFirst={isFirstInGroup}
        isLast={isLastInGroup}
        isGroup={groupWithPrev || groupWithNext}
        onContextMenu={onContextMenu}
        onRetry={onRetry}
      />
    )
    lastMsg = msg
  })

  return (
    <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {elements}
      <div ref={messagesEndRef} />
    </div>
  )
}
