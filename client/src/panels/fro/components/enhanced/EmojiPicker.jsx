import { useState, useRef, useEffect } from 'react'

// Emoji picker for the message composer.
//
// SCOPE: WhatsApp only. Every style here is an inline style object, matching
// MessageComposer.jsx and the rest of components/enhanced/. Nothing here touches
// a global stylesheet, a theme variable or a shared component, so no other CRM
// page can be affected.
//
// NO DEPENDENCY. An emoji-picker package would pull in its own stylesheet and
// its own portal, both of which land outside the composer and are exactly the
// kind of global blast radius this panel is not allowed to have. The set below
// is a plain array of unicode code points.
//
// The chosen emoji is INSERTED at the caret rather than appended, so an agent
// mid-sentence gets "Good m" -> "Good morning 🙏" rather than having to rewrite
// the line. If the textarea is not mounted or has no selection API, it falls
// back to appending -- the picker still works, just less precisely.

const EMOJI_GROUPS = [
  {
    name: 'Smileys',
    emoji: [
      '\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F606}',
      '\u{1F605}', '\u{1F923}', '\u{1F602}', '\u{1F642}', '\u{1F643}',
      '\u{1F609}', '\u{1F60A}', '\u{1F607}', '\u{1F970}', '\u{1F60D}',
      '\u{1F929}', '\u{1F618}', '\u{1F617}', '\u{1F61A}', '\u{1F619}',
      '\u{1F972}', '\u{1F60B}', '\u{1F61B}', '\u{1F61C}', '\u{1F92A}',
      '\u{1F61C}', '\u{1F921}', '\u{1F479}', '\u{1F47B}', '\u{1F480}',
    ],
  },
  {
    name: 'Gestures',
    emoji: [
      '\u{1F44B}', '\u{1F44C}', '\u{1F44D}', '\u{1F44E}', '\u{1F44F}',
      '\u{1F450}', '\u{1F91D}', '\u{1F64C}', '\u{1F64F}', '\u{1F64C}',
      '\u{1F44F}\u{1F3FB}', '\u{1F4AA}', '\u{1F595}', '\u{1F446}',
    ],
  },
  {
    name: 'Hearts & symbols',
    emoji: [
      '\u{2764}\u{FE0F}', '\u{1F9E1}', '\u{1F49B}', '\u{1F49C}', '\u{1F49A}',
      '\u{1F498}', '\u{1F49D}', '\u{1F496}', '\u{1F497}', '\u{1F493}',
      '\u{1F49E}', '\u{1F495}', '\u{1F49F}', '\u{2728}', '\u{1F31F}',
      '\u{2B50}', '\u{1F4AF}', '\u{2705}', '\u{274C}', '\u{26A0}',
    ],
  },
  {
    name: 'Useful',
    emoji: [
      '\u{1F44D}\u{1F4CB}', '\u{1F4DE}', '\u{1F4F1}', '\u{1F4DD}', '\u{1F4C8}',
      '\u{1F4CA}', '\u{1F4CC}', '\u{1F4CE}', '\u{1F4D6}', '\u{1F4C5}',
      '\u{1F6E0}\u{FE0F}', '\u{1F3E0}', '\u{1F3D5}\u{FE0F}', '\u{1F4B0}',
      '\u{1F49F}', '\u{1F4CC}',
    ],
  },
]

// Flat list for the search box.
const ALL_EMOJI = EMOJI_GROUPS.flatMap(g => g.emoji)

const TRIGGER_CHARS = [':']

export default function EmojiPicker({ textareaRef, onInsert, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(0)
  const wrapRef = useRef(null)

  // Close on an outside click. Without this the panel would sit over the thread
  // until the agent clicked something else, which reads as a stuck overlay.
  useEffect(() => {
    if (!open) return undefined
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const insert = (emoji) => {
    const el = textareaRef?.current
    if (!el) { onInsert(emoji); setOpen(false); return }

    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + emoji + el.value.slice(end)

    onInsert(next)

    // Put the caret after the emoji so the agent can keep typing.
    requestAnimationFrame(() => {
      try {
        el.focus()
        const caret = start + emoji.length
        el.setSelectionRange(caret, caret)
      } catch {
        el.focus()
      }
    })
    setOpen(false)
  }

  // Typing ':' opens the picker with the search focused -- the shortcut every
  // agent already expects from every other chat tool.
  useEffect(() => {
    const el = textareaRef?.current
    if (!el || disabled) return undefined
    const onInput = () => {
      const upto = el.value.slice(0, el.selectionStart ?? 0)
      const lastChar = upto[upto.length - 1]
      if (TRIGGER_CHARS.includes(lastChar) && !/\s$/.test(upto.slice(0, -1))) {
        setOpen(true)
        setQuery('')
      }
    }
    el.addEventListener('input', onInput)
    return () => el.removeEventListener('input', onInput)
  }, [textareaRef, disabled])

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? EMOJI_GROUPS.map(g => ({ ...g, emoji: g.emoji.filter(e => e.includes(needle)) }))
      .filter(g => g.emoji.length > 0)
    : EMOJI_GROUPS

  const visibleGroups = query ? filtered : [filtered[tab]].filter(Boolean)

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => { setOpen(o => !o); setQuery('') }}
        disabled={disabled}
        aria-label="Emoji"
        title="Emoji"
        style={{ border: 'none', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', padding: '6px 4px', color: '#6b7280', opacity: disabled ? 0.5 : 1 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            width: 268,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.14)',
            zIndex: 40,
            overflow: 'hidden',
            fontSize: 13,
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search emoji"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 10px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {!query && (
            <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.name}
                  onClick={() => setTab(i)}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `1px solid ${tab === i ? '#25D366' : '#e5e7eb'}`,
                    background: tab === i ? '#dcfce7' : '#fff',
                    color: tab === i ? '#15803d' : '#6b7280',
                  }}
                >
                  {g.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          <div style={{ maxHeight: 180, overflowY: 'auto', padding: 6 }}>
            {visibleGroups.length === 0 ? (
              <div style={{ padding: '14px 8px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                No emoji match “{query}”
              </div>
            ) : visibleGroups.map(g => (
              <div key={g.name}>
                {!query && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: .4, padding: '4px 4px 2px' }}>
                    {g.name}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
                  {g.emoji.map((e, i) => (
                    <button
                      key={`${g.name}-${i}`}
                      onClick={() => insert(e)}
                      title={e}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 19,
                        lineHeight: '30px',
                        borderRadius: 6,
                        padding: 0,
                      }}
                      onMouseEnter={e2 => { e2.currentTarget.style.background = '#f3f4f6' }}
                      onMouseLeave={e2 => { e2.currentTarget.style.background = 'transparent' }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '5px 8px', borderTop: '1px solid #f1f5f9', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
            {ALL_EMOJI.length} emoji · type <b>:</b> to search · Esc to close
          </div>
        </div>
      )}
    </div>
  )
}