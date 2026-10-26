import { forwardRef } from 'react'

/* Event poster report — A4 portrait (794 × 1123 px), the "Being Sevak" style
   sheet: date band, headline band, 6-photo collage, title / description /
   tagline / date / venue block, quote + footer strip.

   Rendered off-screen and captured with html2canvas into a one-page A4 PDF
   (see exportPosterPdf in pages/EventReports.jsx). Only inline styles, plain
   <div>s with background-image, and inline <svg> are used so html2canvas
   reproduces it exactly (no clip-path / filter / object-fit). */

const SERIF = "Cambria, 'Times New Roman', Georgia, serif"

const NAVY = '#074a95'
const NAVY_DEEP = '#074a95'
const GOLD = '#f4d35e'
const YELLOW_LINE = '#d8c93c'

function Photo({ src }) {
  return (
    <div style={{
       width: '100%', height: '100%', boxSizing: 'border-box',
       border: '2px solid #fff',
       background: src ? `#222 url("${src}") center / cover no-repeat` : '#4a4890',
    }} />
  )
}

function SevakBano({ small, image }) {
  if (image) {
    return (
      <img src={image} alt="Sevak Bano" style={{
        height: small ? 42 : 62, width: 'auto', maxWidth: small ? 180 : 230,
        objectFit: 'contain', display: 'block', flexShrink: 0,
      }} />
    )
  }
  return (
    <div style={{
      display: 'inline-block', textAlign: 'center', transform: 'rotate(-3deg)',
      background: 'linear-gradient(90deg, #5db2ee, #2f8bd8)', borderRadius: 6,
      padding: small ? '3px 14px 2px' : '5px 18px 3px',
    }}>
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 900, fontSize: small ? 14 : 19, color: NAVY_DEEP, letterSpacing: 0.5, lineHeight: 1.1 }}>SEVAK BANO</div>
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: small ? 8 : 9.5, color: NAVY_DEEP, lineHeight: 1.1 }}>Serving Selfless Service</div>
    </div>
  )
}

function Logo({ url, size, ring = GOLD, plain = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: plain ? 'transparent' : '#fff', flexShrink: 0,
      border: plain ? 'none' : `3px solid ${ring}`, boxSizing: 'border-box', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url && <div style={{ width: plain ? '100%' : '82%', height: plain ? '100%' : '82%', background: `url("${url}") center / contain no-repeat` }} />}
    </div>
  )
}

function Flag() {
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 4 Q14 0 24 4 T44 4 V30 Q34 34 24 30 T2 30 Z" fill="#fff" />
      <path d="M2 4 Q14 0 24 4 T44 4 V12 Q34 16 24 12 T2 12 Z" fill="#ff9933" />
      <path d="M2 22 Q14 18 24 22 T44 22 V30 Q34 34 24 30 T2 30 Z" fill="#138808" />
      <circle cx="23" cy="17" r="3.6" fill="none" stroke="#1a3c94" strokeWidth="1" />
    </svg>
  )
}

const EventPosterReport = forwardRef(function EventPosterReport({
  title = '',            // headline in the white box (also the blue band if `headline` is empty)
  headline = '',         // blue band text; defaults to `title`
  date,                  // 'YYYY-MM-DD'
  description = '',
  venue = '',
  tagline = '',          // small boxed line under the description
  slogan = '',           // bold line in the white footer, above the Sevak Bano strip
  footerQuote = '',      // big navy quote in the white footer
  reportNo = '',         // number shown in the footer hexagon
  brandName = 'Being Sevak',
  brandSub = 'Charitable Trust',
  teamMembers = [],      // optional small "Team:" line (hidden when empty)
  photos = [],           // up to 6 image URLs / data URLs
  logoUrl = '/logo/beingsevak-logo.png',
  partnerLogoUrl = '',   // "Volunteer Partner" badge, hidden when empty
  sevakBanoImage = '',   // image replaces the "SEVAK BANO" text box when set
  brandImage = '',       // image replaces the footer brand text when set
}, ref) {
  const d = date ? new Date(`${String(date).slice(0, 10)}T00:00:00`) : null
  const valid = d && !Number.isNaN(d.getTime())
  const day = valid ? d.getDate() : ''
  const month = valid ? d.toLocaleString('en', { month: 'long' }) : ''
  const year = valid ? d.getFullYear() : ''
  const topDate = valid ? `DATE:- ${day} ${month.toUpperCase()}, ${year}.` : 'DATE:-'
  const slots = Array.from({ length: 6 }, (_, i) => photos[i] || '')
  const team = (Array.isArray(teamMembers) ? teamMembers : []).map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
  const bandText = String(headline || title || '').toUpperCase()
  const boxTitle = String(title || headline || '').toUpperCase()

  return (
    <div ref={ref} style={{
      width: 794, height: 1123, boxSizing: 'border-box', background: '#fff', padding: 12,
      fontFamily: SERIF, overflow: 'hidden',
    }}>
      <div style={{ height: '100%', background: NAVY, boxSizing: 'border-box', padding: '16px 16px 14px', display: 'flex', flexDirection: 'column' }}>

        {/* Date band */}
        <div style={{
          height: 90, boxSizing: 'border-box', background: NAVY, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 14px 0 8px',
          borderTop: `3px solid ${YELLOW_LINE}`, borderBottom: `3px solid ${YELLOW_LINE}`, flexShrink: 0,
        }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 33, letterSpacing: 0.5 }}>{topDate}</div>
          <Logo url={logoUrl} size={84} plain />
        </div>

        {/* Blue headline band + white strip */}
        <div style={{ marginTop: 14, flexShrink: 0, background: '#fff' }}>
          <div style={{
            height: 48, background: 'linear-gradient(180deg, #3d9be0, #1b78c4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 12px', overflow: 'hidden',
          }}>
           <div style={{ color: GOLD, fontWeight: 900, fontSize: bandText.length > 46 ? 21 : 25, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{bandText}</div>
           </div>
         </div>

        {/* Photo collage 3 × 2 */}
        <div style={{
           flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr',
           margin: 0, background: 'transparent',
        }}>
          {slots.map((s, i) => <Photo key={i} src={s} />)}
        </div>

        {/* Title / description block */}
        <div style={{ flexShrink: 0, padding: '12px 4px 0', position: 'relative', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Logo url={logoUrl} size={76} plain />
            <div style={{
              flex: 1, background: '#fff', boxShadow: `0 0 0 2px ${NAVY}, 0 0 0 4px #222`, margin: '0 6px',
              padding: '6px 10px', color: '#222', fontWeight: 900, fontSize: boxTitle.length > 46 ? 17 : 20, letterSpacing: 0.3,
            }}>{boxTitle}</div>
            <div style={{ width: 76, height: 76, flexShrink: 0, textAlign: 'center' }}>
              {partnerLogoUrl && (
                <>
                  <div style={{ width: 52, height: 48, margin: '0 auto', background: `url("${partnerLogoUrl}") center / contain no-repeat` }} />
                  <div style={{ fontSize: 6.5, color: '#fff', fontWeight: 700 }}>VOLUNTEER PARTNER</div>
                </>
              )}
            </div>
          </div>

          <div style={{ color: '#fff', fontSize: 15.2, lineHeight: 1.42, padding: '8px 22px 0', minHeight: 66, maxHeight: 88, overflow: 'hidden' }}>
            {description}
          </div>

          {tagline && (
            <div style={{
              display: 'inline-block', marginTop: 10, background: '#fff', boxShadow: `0 0 0 2px ${NAVY}, 0 0 0 3.5px #222`,
              color: '#222', fontWeight: 900, fontSize: 13, letterSpacing: 0.3, padding: '4px 16px',
            }}>{String(tagline).toUpperCase()}</div>
          )}

          <div style={{ position: 'relative', marginTop: 6, minHeight: 66 }}>
            <div style={{ position: 'absolute', left: 0, top: 0 }}><Flag /></div>
            <div style={{ position: 'absolute', right: 0, top: 0 }}><SevakBano image={sevakBanoImage} /></div>
            <div style={{ color: '#fff', fontSize: 17, marginTop: 34 }}>VENUE : {venue || '—'}</div>
            {team.length > 0 && (
              <div style={{ color: '#dfe3ff', fontSize: 11.5, marginTop: 4, padding: '0 90px' }}>Team: {team.join(', ')}</div>
            )}
          </div>
        </div>

        {/* White footer strip */}
        <div style={{ flexShrink: 0, margin: '12px 0 0', background: '#fff', padding: '12px 18px 10px', textAlign: 'center' }}>
          {footerQuote && (
            <div style={{ color: NAVY_DEEP, fontWeight: 900, fontSize: 23, letterSpacing: 0.4, lineHeight: 1.15 }}>{`"${String(footerQuote).toUpperCase()}"`}</div>
          )}
          {slogan && (
            <div style={{ color: NAVY_DEEP, fontWeight: 900, fontSize: 20, letterSpacing: 0.5, lineHeight: 1.15 }}>{String(slogan).toUpperCase()}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <SevakBano small image={sevakBanoImage} />
            <div style={{ flex: 1, height: 3, background: NAVY }} />
            {reportNo !== '' && reportNo != null && (
              <svg width="62" height="56" viewBox="0 0 62 56" xmlns="http://www.w3.org/2000/svg">
                <polygon points="16,3 46,3 60,28 46,53 16,53 2,28" fill={NAVY} stroke="#7a78c8" strokeWidth="2" />
                <text x="31" y="35" textAnchor="middle" fontFamily="Cambria, 'Times New Roman', serif" fontWeight="700" fontSize="22" fill="#fff">{String(reportNo)}</text>
              </svg>
            )}
            <div style={{ flex: 1, height: 3, background: NAVY }} />
            {brandImage ? (
              <img src={brandImage} alt={brandName} style={{ height: 46, width: 'auto', maxWidth: 230, objectFit: 'contain', marginLeft: 20, display: 'block' }} />
            ) : (
              <div style={{ textAlign: 'right', lineHeight: 1, marginLeft: 20 }}>
                <div style={{ color: NAVY_DEEP, fontWeight: 900, fontSize: 17, letterSpacing: 0.5 }}>{brandName.toUpperCase()}</div>
                <div style={{ color: NAVY_DEEP, fontWeight: 700, fontSize: 9, marginTop: 3 }}>{brandSub}</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
})

export default EventPosterReport
