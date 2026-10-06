import { useEffect, useMemo, useRef, useState } from 'react'
import { FORM_META, SECTIONS, MEMBERSHIP_PRICES } from './formConfig.js'
import { validateField, validateIdentityDocument } from './validate.js'
import { buildInitialValues, computeEndDate } from './formUtils.js'
import { submitApplication, sendPaymentReminder } from './api.js'
import CheckoutPage from './CheckoutPage.jsx'
import DonePage from './DonePage.jsx'

function Field({ field, value, onChange, error }) {
  const handleText = (e) => onChange(field.id, e.target.value)

  if (field.type === 'textarea') {
    return (
      <div className={`field ${error ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor={field.id}>
          {field.label}
          {field.required && <span className="req">*</span>}
        </label>
        {field.helpText && <p className="help-text">{field.helpText}</p>}
        <textarea
          id={field.id}
          rows={3}
          value={value || ''}
          onChange={handleText}
          placeholder={field.placeholder}
        />
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className={`field ${error ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor={field.id}>
          {field.label}
          {field.required && <span className="req">*</span>}
        </label>
        {field.helpText && <p className="help-text">{field.helpText}</p>}
        <select id={field.id} value={value || ''} onChange={handleText}>
          <option value="" disabled>
            {field.placeholder || 'Select...'}
          </option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  if (field.type === 'radio') {
    return (
      <div className={`field ${error ? 'has-error' : ''}`}>
        <span className="field-label">
          {field.label}
          {field.required && <span className="req">*</span>}
        </span>
        {field.helpText && <p className="help-text">{field.helpText}</p>}
        <div className="options">
          {field.options.map((opt) => (
            <label key={opt} className="option">
              <input
                type="radio"
                name={field.id}
                checked={value === opt}
                onChange={() => onChange(field.id, opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  if (field.type === 'checkboxes') {
    const arr = Array.isArray(value) ? value : []
    const toggle = (opt) => {
      const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]
      onChange(field.id, next)
    }
    return (
      <div className={`field ${error ? 'has-error' : ''}`}>
        <span className="field-label">
          {field.label}
          {field.required && <span className="req">*</span>}
        </span>
        {field.helpText && <p className="help-text">{field.helpText}</p>}
        <div className="options">
          {field.options.map((opt) => (
            <label key={opt} className="option">
              <input
                type="checkbox"
                checked={arr.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <div className={`field checkbox-single ${error ? 'has-error' : ''}`}>
        <label className="option">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(field.id, e.target.checked)}
          />
          <span>{field.options[0]}</span>
        </label>
        {field.helpText && <p className="help-text">{field.helpText}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  if (field.type === 'file') {
    return (
      <PhotoField field={field} value={value} onChange={onChange} error={error} />
    )
  }

  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={field.id}>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {field.helpText && <p className="help-text">{field.helpText}</p>}
      <input
        id={field.id}
        type={field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
        inputMode={field.inputMode || undefined}
        value={value || ''}
        onChange={handleText}
        disabled={field.readOnly}
        className={field.readOnly ? 'readonly' : undefined}
        placeholder={field.placeholder}
        maxLength={field.maxLength || (field.type === 'tel' ? 10 : undefined)}
      />
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function PhotoField({ field, value, onChange, error }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const previewUrl = useMemo(() => {
    if (value instanceof File) return URL.createObjectURL(value)
    return ''
  }, [value])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const pick = (e) => {
    onChange(field.id, e.target.files[0] || '')
    e.target.value = ''
  }

  const openCamera = () => cameraRef.current?.click()
  const openGallery = () => galleryRef.current?.click()

  const hasPreview = !!previewUrl

  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label">
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {field.helpText && <p className="help-text">{field.helpText}</p>}

      <div className="photo-field">
        <button
          type="button"
          className={`photo-drop ${hasPreview ? 'has-preview' : ''}`}
          onClick={openCamera}
          aria-label={hasPreview ? 'Change photo' : 'Take photo'}
        >
          {hasPreview ? (
            <img src={previewUrl} alt={`${field.label} preview`} />
          ) : (
            <>
              <span className="photo-drop-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
              <span className="photo-drop-title">Add {field.label.toLowerCase()}</span>
              <span className="photo-drop-hint">Tap to open camera</span>
            </>
          )}
        </button>

        <div className="photo-actions">
          {hasPreview && (
            <>
              <button type="button" className="photo-act" onClick={openCamera}>
                Change
              </button>
              <button
                type="button"
                className="photo-act photo-act-remove"
                onClick={() => onChange(field.id, '')}
              >
                Remove
              </button>
            </>
          )}
          <button type="button" className="photo-act photo-act-gallery" onClick={openGallery}>
            Upload from gallery
          </button>
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="user" onChange={pick} className="photo-hidden" />
        <input ref={galleryRef} type="file" accept={field.accept ? field.accept.join(',') : 'image/*'} onChange={pick} className="photo-hidden" />
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function AboutLibrary({ section }) {
  return (
    <div className="about-card">
      {section.content.map((block, i) =>
        block.heading ? (
          <h2 key={i} className="about-heading">
            {block.heading}
          </h2>
        ) : (
          <p key={i} className="about-body">
            {block.body}
          </p>
        )
      )}
    </div>
  )
}

function SectionBody({ section, values, onChange, errors }) {
  if (section.type === 'info') return <AboutLibrary section={section} />
  return section.fields.map((f) => (
    <Field
      key={f.id}
      field={f}
      value={values[f.id]}
      onChange={onChange}
      error={errors[f.id]}
    />
  ))
}

async function validateSection(section, values) {
  const errs = {}
  for (const f of section.fields || []) {
    if (f.custom === 'identityDocument') {
      errs[f.id] = await validateIdentityDocument(values[f.id])
    } else {
      errs[f.id] = validateField(f, values[f.id], values)
    }
  }
  return errs
}

export default function App() {
  const [values, setValues] = useState(buildInitialValues)
  const [errors, setErrors] = useState({})
  const [current, setCurrent] = useState(0)
  const [stage, setStage] = useState('form')
  const [application, setApplication] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const section = SECTIONS[current]
  const total = SECTIONS.length
  const progress = Math.round(((current + 1) / total) * 100)

  const handleChange = (id, value) => {
    const next = { ...values, [id]: value }
    if (id === 'membershipType' && value && MEMBERSHIP_PRICES[value]) {
      next.membershipFee = MEMBERSHIP_PRICES[value]
    }
    if (id === 'membershipType' || id === 'startDate') {
      next.endDate = computeEndDate(next.startDate, next.membershipType)
    }
    setValues(next)

    const field = (section.fields || []).find((f) => f.id === id)
    if (field) {
      if (field.custom === 'identityDocument') {
        validateIdentityDocument(value).then((err) =>
          setErrors((prev) => ({ ...prev, [id]: err }))
        )
      } else {
        const err = validateField(field, value, next)
        setErrors((prev) => ({ ...prev, [id]: err }))
      }
    }
  }

  const goNext = async () => {
    if (current === total - 1) {
      setSubmitting(true)
      setSubmitError('')
      const ready = {
        ...values,
        endDate: values.endDate || computeEndDate(values.startDate, values.membershipType)
      }
      const errs = await validateSection(section, ready)
      setErrors(errs)
      if (Object.values(errs).some(Boolean)) {
        setSubmitting(false)
        return
      }
      try {
        const row = await submitApplication(ready)
        sendPaymentReminder(row.id).catch(() => {})
        setApplication(row)
        setStage('checkout')
      } catch (e) {
        setSubmitError(e.message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    const errs = await validateSection(section, values)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    setCurrent(current + 1)
    setErrors({})
  }

  const goBack = () => {
    if (current > 0) {
      setCurrent(current - 1)
      setErrors({})
    }
  }

  const reset = () => {
    setValues(buildInitialValues())
    setErrors({})
    setCurrent(0)
    setStage('form')
    setApplication(null)
  }

  if (stage === 'checkout') {
    return (
      <CheckoutPage
        application={application}
        onDone={(updated) => {
          setApplication(updated)
          setStage('done')
        }}
      />
    )
  }

  if (stage === 'done') {
    return <DonePage application={application} onReset={reset} />
  }

  return (
    <div className="page">
      <header className="form-header">
        <div className="form-header-logo"><img src={`${import.meta.env.BASE_URL}sevak-logo.png`} alt="Sevak Library logo" /></div>
        <h1>{FORM_META.title}</h1>
        <h2>{FORM_META.subtitle}</h2>
        <p className="initiative">{FORM_META.initiative}</p>
        <p className="description">{FORM_META.description}</p>
      </header>

      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-label">
          {current + 1} of {total} sections
        </span>
      </div>

      <div className="card">
        <h3 className="section-title">{section.title}</h3>
        <SectionBody section={section} values={values} onChange={handleChange} errors={errors} />

        {submitError && <p className="error-text submit-error">{submitError}</p>}

        <div className="nav-buttons">
          {current > 0 && (
            <button className="btn-secondary" onClick={goBack}>
              Back
            </button>
          )}
          <button className="btn-primary" onClick={goNext} disabled={submitting}>
            {submitting ? 'Submitting...' : current === total - 1 ? 'Pay Now' : 'Next'}
          </button>
        </div>
      </div>

      <footer className="form-footer">
        <p>
          Sevak Library | Being Sevak Charitable Trust
        </p>
      </footer>
    </div>
  )
}
