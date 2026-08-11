import { useState } from 'react'
import { generateQuiz, submitQuiz } from './api'

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

function FormStep({ onStart }) {
  const [form, setForm] = useState({
    name: '',
    surname: '',
    age: '',
    dob: '',
    role: 'accounts',
    other_role: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.surname.trim()) return setError('Please enter your full name.')
    if (!form.age || Number(form.age) <= 0) return setError('Please enter a valid age.')
    if (!form.dob) return setError('Please select your date of birth.')
    if (form.role === 'others' && !form.other_role.trim()) return setError('Please specify your role.')
    setLoading(true)
    try {
      await onStart({
        ...form,
        name: form.name.trim(),
        surname: form.surname.trim(),
        role_label: form.role === 'others' ? form.other_role.trim() : ROLE_LABELS[form.role],
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card form-card">
        <div className="logo-row">
          <div className="logo">U</div>
          <div>
            <h1>Recruit Quiz</h1>
            <p>Skill screening for candidates</p>
          </div>
        </div>
        <form onSubmit={submit} className="form">
          <div className="row2">
            <label>
              <span>Name *</span>
              <input value={form.name} onChange={set('name')} placeholder="First name" />
            </label>
            <label>
              <span>Surname *</span>
              <input value={form.surname} onChange={set('surname')} placeholder="Last name" />
            </label>
          </div>
          <div className="row2">
            <label>
              <span>Age *</span>
              <input type="number" min="1" max="120" value={form.age} onChange={set('age')} placeholder="e.g. 24" />
            </label>
            <label>
              <span>Date of Birth *</span>
              <input type="date" value={form.dob} onChange={set('dob')} />
            </label>
          </div>
          <label>
            <span>Role applying for *</span>
            <select value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {form.role === 'others' && (
            <label>
              <span>Specify your role *</span>
              <input value={form.other_role} onChange={set('other_role')} placeholder="e.g. Content Writer" />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Generating quiz…' : 'Start Quiz'}
          </button>
          <p className="hint">10 role-based questions · 7 multiple choice + 3 short answers · AI evaluated</p>
        </form>
      </div>
    </div>
  )
}

function QuizStep({ candidate, questions, onSubmit, onBack }) {
  const [answers, setAnswers] = useState(() => {
    const a = {}
    questions.forEach((q, i) => {
      a[i] = q.type === 'mcq' ? '' : ''
    })
    return a
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const setAnswer = (i) => (e) => setAnswers({ ...answers, [i]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    for (let i = 0; i < questions.length; i++) {
      if (!String(answers[i] || '').trim()) return setError(`Please answer question ${i + 1}.`)
    }
    setLoading(true)
    try {
      await onSubmit(answers)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const progress = questions.filter((_, i) => String(answers[i] || '').trim()).length

  return (
    <div className="page">
      <div className="card quiz-card">
        <div className="quiz-head">
          <div className="logo-row">
            <div className="logo">U</div>
            <div>
              <h1>Recruit Quiz</h1>
              <p>{candidate.name} {candidate.surname} · {candidate.role_label}</p>
            </div>
          </div>
          <button className="btn-ghost" onClick={onBack}>Exit</button>
        </div>
        <div className="progressbar"><div className="progressbar-fill" style={{ width: `${(progress / questions.length) * 100}%` }} /></div>
        <form onSubmit={submit} className="questions">
          {questions.map((q, i) => (
            <div className="question" key={i}>
              <div className="q-title">
                <span className="q-no">{i + 1}</span>
                <span className="q-type">{q.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                <p>{q.question}</p>
              </div>
              {q.type === 'mcq' ? (
                <div className="options">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`option ${answers[i] === opt ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`q${i}`}
                        value={opt}
                        checked={answers[i] === opt}
                        onChange={setAnswer(i)}
                      />
                      <span>{String.fromCharCode(65 + oi)}. {opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  value={answers[i]}
                  onChange={setAnswer(i)}
                  placeholder="Type your answer…"
                  rows={3}
                />
              )}
            </div>
          ))}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Evaluating answers…' : 'Submit Quiz'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ResultStep({ result, candidate }) {
  const pass = result.verdict === 'eligible'
  return (
    <div className="page">
      <div className="card result-card">
        <div className="logo-row">
          <div className="logo">U</div>
          <div>
            <h1>Recruit Quiz</h1>
            <p>Your result</p>
          </div>
        </div>
        <div className={`result-badge ${pass ? 'pass' : 'fail'}`}>
          {pass ? '✓' : '✗'}
        </div>
        <h2 className="result-title">
          {candidate.name} {candidate.surname}
        </h2>
        <p className="result-sub">{candidate.role_label}</p>
        <div className="score-ring">
          <div className="score-num">{result.percentage}%</div>
          <div className="score-label">{result.marks} / {result.max_marks} marks</div>
        </div>
        <div className={`verdict ${pass ? 'pass' : 'fail'}`}>
          {pass ? 'Eligible for Interview' : 'Not Eligible for Interview'}
        </div>
        {result.feedback && (
          <div className="feedback">
            <h4>AI Feedback</h4>
            <p>{result.feedback}</p>
          </div>
        )}
        <button className="btn-ghost" onClick={() => window.location.reload()}>Take another quiz</button>
      </div>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState('form')
  const [candidate, setCandidate] = useState(null)
  const [questions, setQuestions] = useState([])
  const [result, setResult] = useState(null)

  const start = async (details) => {
    const data = await generateQuiz(details.role === 'others' ? details.other_role : details.role)
    const qs = Array.isArray(data.questions) ? data.questions : []
    if (qs.length !== 10) throw new Error('Could not generate a full quiz. Please try again.')
    setCandidate(details)
    setQuestions(qs)
    setStep('quiz')
  }

  const submit = async (answers) => {
    const data = await submitQuiz({
      candidate,
      role: candidate.role,
      other_role: candidate.role === 'others' ? candidate.other_role : undefined,
      role_label: candidate.role_label,
      questions,
      answers,
    })
    setResult(data)
    setStep('result')
  }

  if (step === 'quiz') return <QuizStep candidate={candidate} questions={questions} onSubmit={submit} onBack={() => { setStep('form'); setQuestions([]) }} />
  if (step === 'result') return <ResultStep result={result} candidate={candidate} />
  return <FormStep onStart={start} />
}
