export function MediaPreview({ url, mimeType, name }) {
  if (!url) return null

  const mime = mimeType || ''
  const ext = (name || url).split('.').pop()?.toLowerCase()

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', maxWidth: 300, margin: '4px 0' }}>
        <img src={url} alt={name || 'Media'} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
    )
  }

  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', maxWidth: 300, margin: '4px 0' }}>
        <video src={url} controls style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      </div>
    )
  }

  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext)) {
    return (
      <div style={{ borderRadius: 8, maxWidth: 300, margin: '4px 0', padding: 8, background: '#f3f4f6' }}>
        <audio src={url} controls style={{ width: '100%' }} />
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: '#f3f4f6',
        textDecoration: 'none',
        color: '#374151',
        fontSize: 12,
        fontWeight: 600,
        margin: '4px 0',
        maxWidth: 300,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || url.split('/').pop()}</span>
    </a>
  )
}

export function MediaUploadPreview({ file, onRemove }) {
  if (!file) return null

  const url = URL.createObjectURL(file)

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  const isAudio = file.type.startsWith('audio/')

  const handleRemove = () => {
    URL.revokeObjectURL(url)
    onRemove()
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', margin: '4px 0' }}>
      {isImage && (
        <img src={url} alt={file.name} style={{ maxHeight: 120, borderRadius: 8, display: 'block' }} />
      )}
      {isVideo && (
        <video src={url} style={{ maxHeight: 120, borderRadius: 8 }} controls />
      )}
      {isAudio && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{file.name}</span>
        </div>
      )}
      {!isImage && !isVideo && !isAudio && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{file.name}</span>
        </div>
      )}
      <button
        onClick={handleRemove}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: 'none',
          background: '#ef4444',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}
