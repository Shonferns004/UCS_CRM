import {
  formatIndianCurrency,
  amountInWords,
  getFormattedDate,
  formatReceiptDate,
} from '../services/pdfGenerator'

const beingSevakLogo = '/receipt-assets/beingsevaklogo.jpeg'
const beingSevakName = '/receipt-assets/logo3.jpeg'
const beingSevakStamp = '/receipt-assets/beingsevakstamp.png'

const ACCENT = '#0082ad'

function formatAmount(amount) {
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function ReceiptTemplate_BeingSevak({ donor, index, signature }) {
  const formattedDate = formatReceiptDate(donor['Receipt Date'])
  const amount = Number(donor['Amount']) || 0

  if (donor._dataMissing) {
    return (
      <div
        data-receipt-sheet
        data-pdf-width="900"
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          background: '#fff',
          padding: '40px',
          border: '2px solid #00a3da',
          color: '#222',
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          lineHeight: '1.6',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#c0392b', marginTop: '100px' }}>
          DATA MISSING
        </div>
        <div style={{ fontSize: '20px', marginTop: '20px', color: '#666' }}>
          Receipt for <b>{donor['Donor Name'] || 'Unknown'}</b> could not be generated due to missing mandatory fields.
        </div>
        <div style={{ fontSize: '18px', marginTop: '30px', color: '#999' }}>
          Receipt No.: {donor['Receipt No.'] || 'N/A'}
        </div>
      </div>
    )
  }

  return (
    <div data-receipt-sheet data-pdf-width="900" style={{ maxWidth: '900px', margin: 'auto', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* ===== TOP SECTION: Thank You Letter ===== */}
      <div style={{ background: '#fff', border: `2px solid ${ACCENT}`, borderRadius: '10px', padding: '22px', marginBottom: '20px' }}>

        {/* Header */}
        <div style={{ width: '100%', display: 'table', borderBottom: `2px solid ${ACCENT}`, paddingBottom: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'table-cell', width: '90px', verticalAlign: 'top' }}>
            <img crossOrigin="anonymous" src={beingSevakLogo} alt="Trust Logo" style={{ width: '80px', height: 'auto', display: 'block', marginTop: '11px', marginLeft: '10px' }} />
          </div>
          <div style={{ display: 'table-cell', textAlign: 'center', verticalAlign: 'middle', padding: '0 10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: ACCENT, marginBottom: '5px', lineHeight: '1.2' }}>
              We Rise By Lifting Others
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
              <span style={{ fontWeight: 800, fontSize: '22px' }}></span> <span style={{ fontWeight: 800, fontSize: '22px' }}></span>Being Sevak Charitable Trust
            </div>
            <div style={{ fontSize: '11px', color: '#000', lineHeight: '1.3', textAlign: 'center' }}>
              Charity Commissioner (Reg.) No: E-31948 &nbsp;|&nbsp;
              Income Tax Exempted Under 80G No: AACTB6422FF20214
            </div>
          </div>
        </div>

        {/* Title Bar */}
        <div style={{ width: '100%', display: 'table', tableLayout: 'fixed', marginTop: '12px', border: `2px solid ${ACCENT}`, borderRadius: '6px', background: '#eaf8ff', padding: '10px 0' }}>
          <div style={{ display: 'table-cell', verticalAlign: 'middle', width: '25%', fontSize: '13px', color: '#333', fontWeight: 500, textAlign: 'left', paddingLeft: '12px' }}>
            Receipt No:<strong> {donor['Receipt No.']}</strong>
          </div>
          <div style={{ display: 'table-cell', verticalAlign: 'middle', width: '50%', textAlign: 'center', fontWeight: 700, color: ACCENT, letterSpacing: '1px', fontSize: '16px' }}>
            80G CERTIFICATE OF DONATION
          </div>
          <div style={{ display: 'table-cell', verticalAlign: 'middle', width: '25%', fontSize: '13px', color: '#333', fontWeight: 500, textAlign: 'right', paddingRight: '12px' }}>
            Date: <strong>{formattedDate}</strong>
          </div>
        </div>

        {/* Body */}
        <div style={{ marginTop: '18px', fontSize: '14px', lineHeight: '1.7', color: '#222' }}>
          <p><strong>Name: &nbsp;&nbsp;<span>{donor['Donor Name']}</span></strong></p>
          <p>Dear Sir/Madam,</p>
          <p>
            <strong style={{ color: ACCENT }}>Being Sevak Charitable Trust</strong>, would like to thank you for your generous donation of
            <span
              style={{
                fontWeight: 700,
                marginLeft: '8px',
                marginRight: '8px',
                color: '#0a3d62'
              }}
            >
              Rs. {formatAmount(amount)}
            </span>
            <strong
              style={{
                fontWeight: 700,
                paddingBottom: '5px'
              }}
            >
              {' '}{amountInWords(amount)}{' '}
            </strong>

            for a noble cause &amp; making a difference.
          </p>
          <br/>
          <p>
            Your financial support helps us to continue in our mission. With the valuable support of donor <strong style={{ color: ACCENT }}>LIKE YOU</strong>,
            We are be able to help many of needy families and individuals for not only to meet essential daily needs, but to
            manage their live-hood through our different activities like Food-grain Kit Distribution, Medical Kit Distribution,
            Education Facilities &amp; many other activities.
          </p>
          <br/>
          <p>Please keep this written acknowledgement of your donation for your tax records. We thank you once again for your support and love we have received from you, We also hope forward to
            your continued support.</p>
            <br/>
          
          <p>Thanking you,<br />Yours truly,<br /><strong style={{ color: ACCENT }}>Being Sevak Charitable Trust</strong></p>
          <p style={{ fontSize: '11px', color: '#555', marginTop: '5px' }}>
            Note: Your Donation to Being Sevak Charitable Trust Is Eligible For 50% Tax Rebate [U/S 80G of Income Tax Act 1961]
          </p>
        </div>
      </div>

      {/* Dashed separator */}
      <div style={{ margin: '20px 0', borderTop: `2px dashed ${ACCENT}` }} />

      {/* ===== BOTTOM SECTION: Formal Receipt ===== */}
      <div style={{ background: '#fff', border: `2px solid ${ACCENT}`, borderRadius: '10px', padding: '22px' }}>

        {/* Header */}
        <div style={{ width: '100%', display: 'table', borderBottom: `2px solid ${ACCENT}`, paddingBottom: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'table-cell', width: '90px', verticalAlign: 'top' }}>
            <img crossOrigin="anonymous" src={beingSevakLogo} alt="Trust Logo" style={{ width: '80px', height: 'auto', display: 'block', marginTop: '11px', marginLeft: '10px' }} />
          </div>
          <div style={{ display: 'table-cell', textAlign: 'center', verticalAlign: 'middle', padding: '0 10px' }}>
            <div style={{ fontSize: '11px', color: '#555', fontWeight: 400, marginTop: '-18px' }}>Subject to Mumbai Jurisdiction</div>

            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
              <span style={{ fontWeight: 800, fontSize: '22px' }}></span> <span style={{ fontWeight: 800, fontSize: '22px' }}></span>Being Sevak Charitable Trust
            </div>
            <div style={{ fontSize: '11px', color: '#000', lineHeight: '1.4' }}>
              Charity Commissioner (Reg.) No: E-31948, Certificate Under Section 80G of the Income Tax Act 1961
            </div>
            <div style={{ fontSize: '11px', color: '#000', lineHeight: '1.4' }}>
              80G Registration No: AACTB6422FF20214 &nbsp;CSR Registration No: CSR00015528 Trust PAN CARD No : AACTB6422F
            </div>
           
            <div style={{ fontSize: '10px', color: '#000', lineHeight: '1.4' }}>
              Website: www.beingsevak.org &nbsp;Email: being.sevak@gmail.com &nbsp; Helpline Number SEVAK : 8879-035-035 / 8879-034-034
            </div>
            <div style={{ fontSize: '10px', color: '#000', lineHeight: '1.4' }}>
               <div style={{ fontSize: '13px', color: '#000', lineHeight: '1.4' }}>
              Registered Add: 401, 4th Floor, 'A' Wing, New Delite Apartment, Chandavarkar Lane, Borivali (West), Mumbai - 92.
            </div>
              
            </div>
          </div>
        </div>

        {/* Receipt Fields Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${ACCENT}` }}>
          <tbody>
            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff',
                  width: '25%'
                }}
              >
                Receipt No:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {donor['Receipt No.']}
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff',
                  textAlign: 'left'
                }}
              >
                Dated:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {formattedDate}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                RECEIVED with thanks from Ms./Mr./Miss.
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
                colSpan="3"
              >
                {donor['Donor Name']}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                Address:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
                colSpan="3"
              >
                {donor['Address 1'] || 'NA'}{' , '}
                {[donor['City'], donor['State'], donor['Pincode']].some(Boolean) && (
                  <>
                    {donor['City']}
                    {donor['City'] && donor['State'] ? ', ' : ''}
                    {donor['State']}
                    {donor['State'] && donor['Pincode'] ? ' - ' : ''}
                    {donor['Pincode']}
                  </>
                )}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                The Sum of Rupees:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
                colSpan="3"
              >
                 {amountInWords(amount)}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                Mode of Payment:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {donor['Mode of Payment (MOP)']}
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff',
                  textAlign: 'left'
                }}
              >
                Payment ID No:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {donor['Payment ID No.']}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                Bank Name:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {donor['Donor Bank Name'] || 'NA'}
              </td>

              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff',
                  textAlign: 'left'
                }}
              >
                On Account Of:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
              >
                {donor['Account Of'] || 'Corpus'}
              </td>
            </tr>

            <tr>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#f3fbff'
                }}
              >
                Email ID:
              </td>
              <td
                style={{
                  border: `1px solid ${ACCENT}`,
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff'
                }}
                colSpan="3"
              >
                {donor['Email ID'] || donor['Email'] || 'NA'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Amount + PAN + Seal row */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '18px' }}>
          <div style={{ flex: 1, border: `2px solid ${ACCENT}`, borderRadius: '8px', padding: '14px', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, borderBottom: `1px solid ${ACCENT}`, paddingBottom: '8px', marginBottom: '8px' }}>
              <span style={{ fontWeight: 800 }}>Amount (INR)</span>
              <span style={{ color: '#000', fontSize: '17px' }}>Rs.</span>
              <span style={{ fontSize: '18px', color: '#0a3d62', marginRight: '10px' }}>{formatAmount(amount)}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, }}>PAN NO:</span>
              <span style={{ fontWeight: 700, color: '#222' }}>{donor['PAN No.'] || 'NA'}</span>
            </div>
            <div style={{ fontSize: '15px', color: '#555', textAlign: 'center', marginTop : '25px'}}>Donation Payment is Subject to Realisation</div>
            <div style={{ fontSize: '15px', color: '#555', textAlign: 'center', marginTop : '5px' }}>****This is system generated auto receipt****</div>
          </div>
          <div style={{ width: '180px', border: `2px solid ${ACCENT}`, borderRadius: '8px', textAlign: 'center', padding: '10px', background: '#f9fdff' }}>
            <img crossOrigin="anonymous" src={signature || beingSevakStamp} alt="Seal" style={{ width: '85px', marginLeft: '34px' }} />
            <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, }}>
              Authorised Sign.<br /><strong style={{ color: '#222' }}>Being Sevak Charitable Trust</strong>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
