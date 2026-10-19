import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MegaphoneIcon, CheckIcon } from './chatIcons'
import { fullStamp } from './chatTime'
import { Lightbox } from './AttachmentPreview'

/**
 * The one-time notice popup.
 *
 * Purely presentational: it renders whatever notice it is handed and reports a
 * dismissal. Whether a notice has ever been dismissed is the server's answer
 * (chat_notice_views), never this component's — so a closed tab, a second
 * device or a reload cannot lose, or repeat, the acknowledgement.
 *
 * Deliberately not dismissible by clicking the backdrop: "seen once, never
 * again" is too permanent to trigger on a stray click. Escape and the close
 * button both count as a dismissal, because they are deliberate.
 */
export default function NoticePopup({ notice, onDismiss }) {
  const okRef = useRef(null)
  const [lightboxImg, setLightboxImg] = useState(null)

  useEffect(() => {
    okRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onDismiss])

  if (!notice) return null

  const from = [notice.conversation_title, notice.sender_name].filter(Boolean).join(' · ')
  const gallery =
    Array.isArray(notice.gallery) && notice.gallery.length
      ? notice.gallery
      : notice.attachment
        ? [notice.attachment]
        : []

  return (
    // `chat-scope` on the root: the host mounts this outside any chat page, so
    // the .chat-* design tokens have to be established here or every colour in
    // the dialog would resolve to nothing.
    <div className="chat-scope chat-overlay chat-notice-overlay">
      <div
        className="chat-dialog chat-notice-popup"
        role="alertdialog"
        aria-modal="true"
        aria-label={notice.notice_title || 'Notice'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-body chat-notice-popup-body">
          <div className="chat-notice-badge chat-notice-badge-lg">
            <MegaphoneIcon size={13} />
            <span>Notice</span>
          </div>

          {notice.notice_title && (
            <h3 className="chat-notice-popup-title" id="chat-notice-popup-title">
              {notice.notice_title}
            </h3>
          )}

          {from && (
            <div className="chat-notice-popup-from">
              {from}
              {notice.created_at && (
                <>
                  {' · '}
                  <time dateTime={notice.created_at} title={fullStamp(notice.created_at)}>
                    {fullStamp(notice.created_at)}
                  </time>
                </>
              )}
            </div>
          )}

          {notice.body && <p className="chat-notice-popup-text">{notice.body}</p>}

          {gallery.length > 0 && (
            <div className="chat-notice-gallery chat-notice-gallery-lg" data-count={Math.min(gallery.length, 4)}>
              {gallery.map((img, i) => (
                <button
                  key={img.url || i}
                  className="chat-notice-gallery-item"
                  onClick={() => setLightboxImg(img)}
                  style={{ border: 0, padding: 0, background: 'transparent', cursor: 'zoom-in' }}
                  
                  title={img.name || 'Open image'}
                >
                  <img
                    src={img.url}
                    alt={img.name || `${notice.notice_title || 'Notice'} image ${i + 1}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="chat-dialog-foot chat-notice-popup-foot">
          <button
            ref={okRef}
            type="button"
            className="chat-btn chat-btn-primary"
            onClick={onDismiss}
          >
            <CheckIcon size={15} />
            Got it
          </button>
        </div>

      </div>
    </div>
  )
}
