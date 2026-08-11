import { useEffect, useRef, useState } from 'react'
import { generateQuiz, submitQuiz } from './api'
import { getT, getQuizT } from './translations'

const ROLES = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'telecalling', label: 'Telecalling' },
  { value: 'graphic designer', label: 'Graphic Designer' },
  { value: 'web app developer', label: 'Web App Developer' },
  { value: 'hr', label: 'HR' },
  { value: 'others', label: 'Others' },
]

const ROLE_LABELS = {
  accounts: 'Accounts',
  telecalling: 'Telecalling',
  'graphic designer': 'Graphic Designer',
  'web app developer': 'Web App Developer',
  hr: 'HR',
  others: 'Other',
}

const LANGUAGES = [
  'English',
  'Hindi',
  'Gujarati',
  'Marathi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Bengali',
  'Punjabi',
  'Odia',
  'Urdu',
]

function Field({ label, required, children }) {
  return (
    <label className="field">
      <span>{label} {required && <em>*</em>}</span>
      {children}
    </label>
  )
}

function FormStep({ onStart }) {
  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [role, setRole] = useState('')
  const [other, setOther] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) return setError('Please enter your full name.')
    if (!age || Number(age) <= 0) return setError('Please enter a valid age.')
    if (!role) return setError('Please choose the role you are applying for.')
    if (role === 'others' && !other.trim()) return setError('Please specify your role.')
    const parts = fullName.trim().split(/\s+/)
    onStart({
      fullName: fullName.trim(),
      name: parts[0] || '',
      surname: parts.slice(1).join(' '),
      age: String(age).trim(),
      role,
      other_role: role === 'others' ? other.trim() : undefined,
      role_label: role === 'others' ? other.trim() : ROLE_LABELS[role],
    })
  }

  const ready = fullName.trim() && age && role

  return (
    <div className="page center">
      <div className="content">
        <div className="login-logo">UCS</div>
        <h1 className="auth-title">Recruit Skill Quiz</h1>
        <p className="auth-sub">Answer 10 quick questions. Our HR evaluates your answers and we will get back to you.</p>

        <span className="hero-badge">🎯 Skill Screening</span>

        <form onSubmit={submit}>
          <div className="section">
            <div className="section-title"><span>01</span> Personal Details</div>
            <div className="form-row">
              <Field label="Full Name" required>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aarav Sharma" autoComplete="name" />
              </Field>
              <Field label="Age" required>
                <input type="number" min="1" max="120" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 24" />
              </Field>
            </div>
          </div>

          <div className="section">
            <div className="section-title"><span>02</span> Apply for Role</div>
            <div className="role-row">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  className={`role-chip ${role === r.value ? 'sel' : ''}`}
                  onClick={() => setRole(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {role === 'others' && (
              <div style={{ marginTop: 12 }}>
                <Field label="Specify your role" required>
                  <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Content Writer" autoFocus />
                </Field>
              </div>
            )}
          </div>

          {error && <div className="error"><span>!</span> {error}</div>}

          <div className="bottom-cta">
            <button type="submit" className="btn btn-primary btn-block" disabled={!ready}>
              Continue <span className="btn-arrow">→</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InstructionsStep({ candidate, language, onStart, onBack }) {
  const t = getT(language)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const start = async () => {
    setBusy(true)
    setErr('')
    try {
      await onStart()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="page center">
      <div className="content">
        <div className="login-logo">UCS</div>
        <h1 className="auth-title">{t.instTitle}</h1>
        <p className="auth-sub">Hi {candidate.name}, {t.instSub}</p>

        <div className="inst-list">
          {t.instItems.map((item, i) => (
            <div className="inst-item" key={i}>
              <span className="inst-num">{i + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>

        <div className="inst-note">{t.instNote}</div>

        {err && <div className="error" style={{ marginBottom: 12 }}><span>!</span> {err}</div>}

        <div className="inst-actions">
          <button className="btn btn-ghost" onClick={onBack}>{t.goBack}</button>
          <button className="btn btn-primary btn-block" onClick={start} disabled={busy}>
            {busy ? t.preparing : t.startQuiz}
            {!busy && <span className="btn-arrow">→</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

function LanguageStep({ candidate, locked, language, onPick, onContinue, onBack }) {
  const [sel, setSel] = useState(language || 'English')
  const t = getT(locked ? language : sel)

  const start = () => {
    if (locked) return onContinue()
    onPick(sel)
  }

  return (
    <div className="page center">
      <div className="content">
        <div className="login-logo">UCS</div>
        <h1 className="auth-title">{t.langTitle}</h1>
        <p className="auth-sub">Hi {candidate.name}, {t.langSub}</p>

        <div className="lang-row" style={{ marginBottom: 14 }}>
          {LANGUAGES.map((lang) => (
            <button
              type="button"
              key={lang}
              className={`lang-chip ${sel === lang ? 'sel' : ''}`}
              onClick={() => setSel(lang)}
              disabled={locked}
            >
              {lang}
            </button>
          ))}
        </div>

        {locked
          ? <div className="inst-note">🔒 {t.langLocked}</div>
          : <div className="inst-note">⚠️ {t.langNote}</div>}

        <div className="inst-actions">
          <button className="btn btn-ghost" onClick={onBack}>{t.goBack}</button>
          <button className="btn btn-primary btn-block" onClick={start} disabled={locked ? false : !sel}>
            {locked ? t.continueQuiz : t.startQuiz}
            {!locked && <span className="btn-arrow">→</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuizStep({ candidate, language, questions, onSubmit, onBack }) {
  const [answers, setAnswers] = useState({})
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [anim, setAnim] = useState('')
  const [left, setLeft] = useState(6 * 60)
  const submittedRef = useRef(false)
  const submitRef = useRef(null)

  const qt = getQuizT(language || 'English')
  const q = questions[index]
  const isLast = index === questions.length - 1
  const answered = String(answers[index] || '').trim()

  useEffect(() => {
    const t = setInterval(() => {
      setLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const submitAll = async () => {
    setLoading(true)
    setError('')
    try {
      await onSubmit(answers)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  submitRef.current = submitAll

  useEffect(() => {
    if (left > 0 || submittedRef.current || loading) return
    submittedRef.current = true
    submitRef.current()
  }, [left, loading])

  const goTo = (i) => {
    setAnim(i < index ? 'back' : 'fwd')
    setIndex(i)
  }

  const next = () => {
    if (!answered) return setError(qt.answerRequired)
    setError('')
    if (isLast) {
      submitAll()
    } else {
      goTo(index + 1)
    }
  }

  const back = () => {
    setError('')
    if (index === 0) return onBack()
    goTo(index - 1)
  }

  const selectOption = (opt) => {
    const updated = { ...answers, [index]: opt }
    setAnswers(updated)
    setError('')
    if (!isLast) {
      setAnim('fwd')
      setTimeout(() => setIndex((i) => i + 1), 260)
    }
  }

  const initials = `${candidate.name?.charAt(0) || ''}${candidate.surname?.charAt(0) || ''}`.toUpperCase()
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const low = left <= 60

  return (
    <div className="page quiz-page">
      <header className="quiz-top">
        <div className="quiz-top-inner">
          <button className="icon-btn" onClick={onBack} aria-label="Exit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="quiz-top-mid">
            <div className="quiz-count">
              {qt.question} {index + 1} <span>{qt.of} {questions.length}</span>
            </div>
            <div className="quiz-progress">
              {questions.map((_, i) => (
                <span
                  key={i}
                  className={`seg ${i < index ? 'done' : i === index ? 'active' : ''}`}
                />
              ))}
            </div>
          </div>
          <div className={`quiz-timer ${low ? 'warn' : ''}`}>⏱ {mm}:{ss}</div>
          <div className="quiz-user">{initials}</div>
        </div>
      </header>

      <main className="quiz-body">
        <div className="quiz-body-inner">
          <div className="quiz-meta">
            <span className="quiz-role">{candidate.role_label}</span>
            <span className="quiz-pill">{q.type === 'mcq' ? qt.mcq : qt.short}</span>
          </div>

          <div className={`q-slide ${anim}`} key={index}>
            <h2 className="q-text">{q.question}</h2>

            {q.type === 'mcq' ? (
              <div className="opt-list">
                {q.options.map((opt, oi) => {
                  const sel = answers[index] === opt
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`opt ${sel ? 'sel' : ''}`}
                      onClick={() => selectOption(opt)}
                    >
                      <span className="opt-letter">{String.fromCharCode(65 + oi)}</span>
                      <span className="opt-text">{opt}</span>
                      {sel && <span className="opt-check">✓</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="short-wrap">
                <textarea
                  value={answers[index] || ''}
                  onChange={(e) => { setAnswers({ ...answers, [index]: e.target.value }); setError('') }}
                  placeholder={qt.answerPlaceholder}
                  rows={6}
                  autoFocus
                />
                <div className="char-hint">{String(answers[index] || '').trim().length} {qt.characters}</div>
              </div>
            )}

            {error && <div className="error"><span>!</span> {error}</div>}
          </div>
        </div>
      </main>

      <footer className="quiz-bottom">
        <div className="quiz-bottom-inner">
          <button className="btn-back" onClick={back}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {index === 0 ? qt.exit : qt.back}
          </button>
          <button className="btn-next" onClick={next} disabled={!answered || loading}>
            {loading ? qt.submitting : isLast ? qt.submitQuiz : qt.next}
            {!loading && <span className="btn-arrow">→</span>}
          </button>
        </div>
      </footer>
    </div>
  )
}

function ResultStep({ candidate }) {
  return (
    <div className="page center">
      <div className="content result-wrap">
        <div className="result-check">✓</div>
        <h2 className="result-title">Thank you, {candidate.name}!</h2>
        <p className="result-sub">Your quiz has been submitted successfully.</p>
        <div className="result-box">
          <span className="result-box-icon">🎉</span>
          <p>Thank you for submitting the quiz.<br />We will get back to you soon.</p>
        </div>
        <p className="result-team">— UFS / UCS Team</p>
      </div>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState('form')
  const [candidate, setCandidate] = useState(null)
  const [questions, setQuestions] = useState([])
  const [language, setLanguage] = useState('English')
  const [locked, setLocked] = useState(false)

  const saveDetails = (details) => {
    setCandidate(details)
    setStep('language')
  }

  const chooseLanguage = (lang) => {
    setLanguage(lang)
    setLocked(true)
    setStep('instructions')
  }

  const beginQuiz = async () => {
    const data = await generateQuiz(
      candidate.role === 'others' ? candidate.other_role : candidate.role,
      language,
    )
    const qs = Array.isArray(data.questions) ? data.questions : []
    if (qs.length !== 10) throw new Error('Could not generate a full quiz. Please try again.')
    setQuestions(qs)
    setStep('quiz')
  }

  const submit = async (answers) => {
    await submitQuiz({
      candidate,
      role: candidate.role,
      other_role: candidate.role === 'others' ? candidate.other_role : undefined,
      role_label: candidate.role_label,
      language,
      questions,
      answers,
    })
    setStep('result')
  }

  if (step === 'quiz') return <QuizStep candidate={candidate} language={language} questions={questions} onSubmit={submit} onBack={() => setStep('language')} />
  if (step === 'result') return <ResultStep candidate={candidate} />
  if (step === 'language') return <LanguageStep candidate={candidate} locked={locked} language={language} onPick={chooseLanguage} onContinue={() => setStep('quiz')} onBack={() => setStep('form')} />
  if (step === 'instructions') return <InstructionsStep candidate={candidate} language={language} onStart={beginQuiz} onBack={() => setStep('language')} />
  return <FormStep onStart={saveDetails} />
}
