import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApplicationByRef } from './api.js'
import { formatDate, formatINR } from './formUtils.js'

const STATUS_META = {
  SUBMITTED: { label: 'Application submitted — payment pending', cls: 'status-pending' },
  PAYMENT_SUBMITTED: { label: 'Payment submitted — awaiting admin verification', cls: 'status-pending' },
  VERIFIED: { label: 'Payment verified — membership being issued', cls: 'status-verified' },
  APPROVED: { label: 'Approved — membership active', cls: 'status-approved' }
}

export default function DonePage({ application, onReset }) {
  const [active, setActive] = useState(
    application
      ? {
          ref: application.ref,
          status: application.status,
          membership_id: application.membership_id,
          full_name: application.full_name
        }
      : null
  )
  const [refInput, setRefInput] = useState('')
  const [lookupErr, setLookupErr] = useState('')

  useEffect(() => {
    if (application) {
      getApplicationByRef(application.ref)
        .then((row) => {
          if (row) setActive(row)
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async () => {
    if (!active) return
    setLookupErr('')
    try {
      const row = await getApplicationByRef(active.ref)
      if (row) setActive(row)
      else setLookupErr('Application not found.')
    } catch (e) {
      setLookupErr(e.message)
    }
  }

  const doLookup = async () => {
    const ref = refInput.trim()
    if (!ref) return
    setLookupErr('')
    try {
      const row = await getApplicationByRef(ref)
      if (row) setActive(row)
      else setLookupErr('Application not found. Check your reference number.')
    } catch (e) {
      setLookupErr(e.message)
    }
  }

  const meta = STATUS_META[active?.status] || { label: active?.status || '—', cls: 'status-pending' }

  return (
    <div className="page">
      <div className="card thank-you">
        <div className="thank-icon">✓</div>
        <h2>Thank you{active?.full_name ? `, ${active.full_name}` : ''}!</h2>
        <p>Your application has been received successfully.</p>

        {active?.status === 'SUBMITTED' && (
          <Link className="btn-primary" to={`/pay/${active.ref}`}>
            Complete your payment
          </Link>
        )}

        {active && (
          <div className="track-card">
            <div className="track-row">
              <span>Application Reference</span>
              <strong>{active.ref}</strong>
            </div>
            <div className="track-row">
              <span>Status</span>
              <span className={`badge ${meta.cls}`}>{meta.label}</span>
            </div>
            {active.membership_id && (
              <div className="track-row">
                <span>Membership ID</span>
                <strong>{active.membership_id}</strong>
              </div>
            )}
          </div>
        )}

        {application && (
          <div className="track-card">
            <div className="track-row">
              <span>Plan</span>
              <strong>
                {application.membership_type} • {formatINR(application.membership_fee)}
              </strong>
            </div>
            <div className="track-row">
              <span>Period</span>
              <strong>
                {formatDate(application.start_date)} → {formatDate(application.end_date)}
              </strong>
            </div>
          </div>
        )}

        <p className="thank-sub">Initiative by Being Sevak Charitable Trust</p>

        {active && (
          <button className="btn-secondary" onClick={refresh}>
            Check status
          </button>
        )}
        {lookupErr && <p className="error-text">{lookupErr}</p>}

        <div className="track-lookup">
          <input
            type="text"
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            placeholder="Enter reference (e.g. SL-20260715-ABC123) to track"
          />
          <button className="btn-secondary" onClick={doLookup}>
            Track
          </button>
        </div>

        <button className="btn-primary" onClick={onReset}>
          Submit another application
        </button>
      </div>
    </div>
  )
}
