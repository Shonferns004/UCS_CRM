import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { getApplicationByRef } from './api.js'
import CheckoutPage from './CheckoutPage.jsx'
import { formatINR, formatDate } from './formUtils.js'

const PAID_STATUS = {
  PAYMENT_SUBMITTED: 'Payment submitted — awaiting admin verification',
  VERIFIED: 'Payment verified — membership being issued',
  APPROVED: 'Approved — membership active'
}

export default function ResumePayPage() {
  const { ref } = useParams()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = (r) => {
    setLoading(true)
    setError('')
    getApplicationByRef(r)
      .then((row) => {
        if (row) setApp(row)
        else setError('Application not found. Check your reference number.')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (ref) load(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  if (loading) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#5f6368' }}>
          <Loader2 size={26} className="spin" />
          <p style={{ marginTop: 10 }}>Loading your application...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="card thank-you">
          <div className="thank-icon" style={{ background: 'var(--danger)' }}>!</div>
          <h2>Payment link invalid</h2>
          <p>{error}</p>
          <p className="thank-sub">You can track your application using your reference number.</p>
          <Link className="btn-secondary" to="/">Back to application form</Link>
        </div>
      </div>
    )
  }

  if (app.status === 'SUBMITTED') {
    return (
      <CheckoutPage
        application={app}
        onDone={(updated) => {
          setApp(updated)
        }}
      />
    )
  }

  const paidLabel = PAID_STATUS[app.status]
  if (paidLabel) {
    return (
      <div className="page">
        <div className="card thank-you">
          <div className="thank-icon"><CheckCircle2 size={34} /></div>
          <h2>Payment already submitted</h2>
          <p>{paidLabel}</p>
          <div className="track-card">
            <div className="track-row"><span>Application Reference</span><strong>{app.ref}</strong></div>
            <div className="track-row"><span>Plan</span><strong>{app.membership_type} • {formatINR(app.membership_fee)}</strong></div>
            <div className="track-row"><span>Period</span><strong>{formatDate(app.start_date)} → {formatDate(app.end_date)}</strong></div>
            {app.membership_id && (
              <div className="track-row"><span>Membership ID</span><strong>{app.membership_id}</strong></div>
            )}
          </div>
          <Link className="btn-primary" to="/">Submit another application</Link>
        </div>
      </div>
    )
  }

  if (app.status === 'REJECTED') {
    return (
      <div className="page">
        <div className="card thank-you">
          <div className="thank-icon" style={{ background: 'var(--danger)' }}><XCircle size={34} /></div>
          <h2>Application rejected</h2>
          <p>Your application was not approved. Please contact the library for details.</p>
          <Link className="btn-secondary" to="/">Back to application form</Link>
        </div>
      </div>
    )
  }

  return null
}
