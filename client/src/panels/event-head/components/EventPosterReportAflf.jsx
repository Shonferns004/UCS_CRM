import { forwardRef } from 'react'

/* Event poster report — AFLF (Ashray For Life Foundation) style.
   A4 portrait (794 × 1123 px): logo + headline, 5-photo collage (3 + 2),
   slogan / red distribution line / date pill, contact footer.

   Same props as EventPosterReport so renderPosterCanvas can swap templates.
   Only inline styles, <div> background-image and inline <svg> are used so
   html2canvas reproduces it exactly (no clip-path / filter / object-fit). */

const SERIF = "'Merriweather', Cambria, 'Times New Roman', Georgia, serif"

const FRAME = '#2a7fc4'
const NAVY = '#1a3fa8'
const RED = '#f20f1c'

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'
}

/* One rounded photo frame. Empty slot shows the sky + hills placeholder. */
function Frame({ src, w, h }) {
  return (
    <div style={{
      width: w, height: h, boxSizing: 'border-box', borderRadius: 28,
      border: `6px solid ${FRAME}`, overflow: 'hidden', position: 'relative', flexShrink: 0,
      background: src ? `#cfe9fb url("${src}") center / cover no-repeat` : 'linear-gradient(180deg, #bfe4fb, #eaf6fe)',
    }}>
      {!src && (
        <svg width="100%" height="100%" viewBox="0 0 100 150" preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d="M0 118 Q35 104 100 122 V150 H0 Z" fill="#c4de86" />
          <path d="M0 132 Q45 112 100 130 V150 H0 Z" fill="#87a300" />
        </svg>
      )}
    </div>
  )
}

function Icon({ children }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}>{children}</svg>
  )
}

function ContactItem({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      {icon}
      <span style={{ fontWeight: 800, fontSize: 12.5, color: '#111' }}>{text}</span>
    </div>
  )
}

const EventPosterReportAflf = forwardRef(function EventPosterReportAflf({
  title = '',            // big heading (e.g. "ANNUAL CARD 2026")
  headline = '',         // optional; used instead of title when set
  date,                  // 'YYYY-MM-DD'
  description = '',      // purana prop; slogan khali ho to yahi dikhega
  slogan = '',           // black line (e.g. "Clothes Distributed with Care and Compassion")
  distribution = '',     // red line (e.g. "Clothes with Compassion.")
  venue = '',
  tagline = '',          // purana prop; distribution khali ho to yahi dikhega
  photos = [],           // up to 5 image URLs / data URLs
  logoUrl = '',          // AFLF logo; text fallback when empty
  phone = '+91 9930028300',
  instagram = 'aflf_official',
  website = 'www.aflf.ngo',
  facebook = 'aflf_official',
  email = 'ashrayforlifefoundation@gmail.com',
  regdAddress = 'Regd. Address:- Office No 9, New Rupali Building, opp. New Link Road, CHS, Evershine Nagar, Malad West, Mumbai, Maharashtra 400064.',
  officeAddress = 'Office Address :- A-002, Hinal Heritage, Sardar Vallabhbhai Patel Rd, Near Jain Digambar temple, Borivali (West), Mumbai, Maharashtra 400092.',
}, ref) {
  const d = date ? new Date(`${String(date).slice(0, 10)}T00:00:00`) : null
  const valid = d && !Number.isNaN(d.getTime())
  const day = valid ? d.getDate() : ''
  const month = valid ? d.toLocaleString('en', { month: 'long' }) : ''
  const year = valid ? d.getFullYear() : ''

  const heading = String(headline || title || '').toUpperCase()
  const slots = Array.from({ length: 5 }, (_, i) => photos[i] || '')
  const sloganText = String(slogan || description || '')
  const distText = String(distribution || tagline || '')
  const descLen = sloganText.length

  return (
    <div ref={ref} style={{
      width: 794, height: 1123, boxSizing: 'border-box', padding: 8, fontFamily: SERIF, overflow: 'hidden',
      background: 'linear-gradient(135deg, #0b4fb3 0%, #2b8fd6 55%, #5fdcec 100%)',
    }}>
      <div style={{
        height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'linear-gradient(180deg, #ffffff 0%, #f3f8fd 45%, #bcd5ee 100%)',
      }}>

        {/* Logo + headline */}
        <div style={{ height: 150, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '10px 14px 0 14px' }}>
          <div style={{ width: 175, height: 110, flexShrink: 0, marginRight: 10 }}>
            {logoUrl ? (
              <div style={{ width: '100%', height: '100%', background: `url("${logoUrl}") center / contain no-repeat` }} />
            ) : (
              <div style={{ color: NAVY, fontWeight: 900, fontSize: 22, lineHeight: 1.1, paddingTop: 20 }}>
                Ashray<div style={{ fontSize: 12, color: '#d4a800' }}>FOUNDATION</div>
              </div>
            )}
          </div>
          <div style={{
            flex: 1, color: '#000', fontWeight: 900, letterSpacing: -1, whiteSpace: 'nowrap', textAlign: 'right',
            fontSize: heading.length > 22 ? 34 : heading.length > 16 ? 42 : 50,
            textShadow: '2px 2px 0 rgba(0,0,0,0.25)',
          }}>{heading}</div>
        </div>

        {/* Photo collage: 3 on top, 2 below */}
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {slots.slice(0, 3).map((s, i) => <Frame key={i} src={s} w={208} h={318} />)}
          </div>
          <div style={{ display: 'flex', gap: 56 }}>
            {slots.slice(3, 5).map((s, i) => <Frame key={i} src={s} w={182} h={278} />)}
          </div>
        </div>

        {/* Slogan + distribution */}
        <div style={{ flexShrink: 0, padding: '10px 26px 0' }}>
          <div style={{
            color: '#000', fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.5, overflow: 'hidden', maxHeight: 78,
            fontSize: descLen > 70 ? 22 : descLen > 46 ? 27 : 30,
          }}>{sloganText}</div>
          {distText && (
            <div style={{
              color: RED, fontWeight: 900, letterSpacing: -0.5, marginTop: 8, lineHeight: 1.1,
              fontSize: distText.length > 30 ? 28 : 38,
            }}>{distText}</div>
          )}
        </div>

        {/* Date pill + venue */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', margin: '12px 0 12px' }}>
          <div style={{
            height: 52, boxSizing: 'border-box', background: '#fff', border: '3px solid #111', borderLeft: 'none',
            borderRadius: '0 30px 30px 0', padding: '0 34px 0 30px', display: 'flex', alignItems: 'center',
            color: NAVY, fontWeight: 900, fontSize: 29, whiteSpace: 'nowrap',
          }}>
            {valid ? (
              <span>{day}<sup style={{ fontSize: 15, verticalAlign: 'top', position: 'relative', top: -2 }}>{ordinal(day)}</sup>{` ${month}, ${year}`}</span>
            ) : <span>—</span>}
          </div>
          {venue && (
            <div style={{ flex: 1, paddingLeft: 14, paddingRight: 20, color: '#111', fontWeight: 800, fontSize: 13, lineHeight: 1.25 }}>
              VENUE: {String(venue).toUpperCase()}
            </div>
          )}
        </div>

        {/* Contact footer */}
        <div style={{
          flexShrink: 0, margin: '0 4px 6px', boxSizing: 'border-box', background: '#fff',
          border: '2px solid #1e56b8', borderRadius: '26px 26px 0 0', padding: '9px 10px 6px', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <ContactItem icon={<Icon><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></Icon>} text={phone} />
            <ContactItem icon={<Icon><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" /></Icon>} text={instagram} />
            <ContactItem icon={<Icon><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>} text={website} />
            <ContactItem icon={<Icon><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M15 8h-2a2 2 0 0 0-2 2v11M9 13h6" /></Icon>} text={facebook} />
            <ContactItem icon={<Icon><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 7l9 6 9-6" /></Icon>} text={email} />
          </div>
          <div style={{ borderTop: '1px solid #1e56b8', marginTop: 6, paddingTop: 5, color: '#111', fontWeight: 700, fontSize: 10.5, lineHeight: 1.35 }}>
            <div>{regdAddress}</div>
            <div>{officeAddress}</div>
          </div>
        </div>

      </div>
    </div>
  )
})

export default EventPosterReportAflf