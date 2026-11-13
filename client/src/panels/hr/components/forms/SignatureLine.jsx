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
//
// The ruled line is the border-bottom of the box, so the box has to be at least
// as tall as the signature image. It used to inherit the form's 15-22px line
// height while the image was allowed to be 44px tall: the image overflowed
// downward and printed BELOW its rule. Keep the box taller than maxHeight and
// bottom-align the image, which parks the signature on the line instead.
const SIG_MAX_HEIGHT = 44
const SIG_BOX_HEIGHT = SIG_MAX_HEIGHT + 4

export default function SignatureLine({ url, date, className = '', style }) {
  if (!url) {
    return <div className={className} style={style} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
      <div
        className={className}
        style={{
          ...style,
          height: SIG_BOX_HEIGHT,
          minHeight: SIG_BOX_HEIGHT,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          overflow: 'hidden',
        }}
      >
        <img
          src={url}
          alt="Volunteer signature"
          style={{ maxHeight: SIG_MAX_HEIGHT, maxWidth: '100%', display: 'block', objectFit: 'contain' }}
        />
      </div>
      {date && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
          Signed on {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      )}
    </div>
  )
}
