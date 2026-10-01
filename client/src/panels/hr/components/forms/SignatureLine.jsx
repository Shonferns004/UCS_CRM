// Volunteer signature block for the printable forms.
//
// The print pipeline serialises the preview DOM into a new window, so this must
// stay plain markup: an <img> is copied across intact, and it is a plain http(s)
// URL from S3 so no fetch or auth is involved.
//
// `url` arrives already gated by the caller — HRForms only passes a value when
// signature_status is 'signed', so a half-finished draft can never be printed
// onto a legal document. Callers should pass '' when there is nothing to show,
// which falls back to the blank ruled line.
export default function SignatureLine({ url, date, className = '', style }) {
  if (!url) {
    return <div className={className} style={style} />
  }
  return (
    <div className={className} style={style}>
      <img
        src={url}
        alt="Volunteer signature"
        style={{ maxHeight: 44, maxWidth: '100%', display: 'block', objectFit: 'contain' }}
      />
      {date && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
          Signed on {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      )}
    </div>
  )
}
