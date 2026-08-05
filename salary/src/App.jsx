import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX_NS from 'xlsx'
import { computeWorkbook, buildCsv, money, normalizeName } from './lib/salaryCalc'

const XLSX = XLSX_NS.default || XLSX_NS

const DB_KEY = 'salaryCalcDbMap4'

const BASE_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function loadDbPresent() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const [rows, setRows] = useState(null)
  const [dbPresent, setDbPresent] = useState(loadDbPresent)
  const [dbStatus, setDbStatus] = useState('Present days will be pulled automatically from the database when you import the Excel file.')
  const [dbStatusError, setDbStatusError] = useState(false)
  const [msg, setMsg] = useState(null)
  const [msgKind, setMsgKind] = useState('info')
  const [busy, setBusy] = useState(false)
  const wbRef = useRef(null)
  const dbPresentRef = useRef(dbPresent)

  useEffect(() => { dbPresentRef.current = dbPresent }, [dbPresent])

  const showMsg = useCallback((text, kind = 'info') => {
    setMsg(text)
    setMsgKind(kind)
  }, [])

  const compute = useCallback(() => {
    setMsg(null)
    if (!wbRef.current) { showMsg('Choose the Excel file first.', 'info'); return null; }
    const result = computeWorkbook(wbRef.current, dbPresentRef.current)
    if (!result) {
      showMsg('No payroll rows found. Make sure the sheet has an "Agent Name" and "Salary" column.', 'info')
      return null
    }
    setRows(result.rows)
    return result.lastMonthKey
  }, [showMsg])

  const fetchPresentDays = useCallback(async (monthKey) => {
    if (!monthKey) { setDbStatus('Could not determine the sheet month.', true); setDbStatusError(true); return; }
    if (!BASE_API_URL) { setDbStatus('API URL not set in .env (VITE_API_URL).', true); setDbStatusError(true); return; }
    const year = Math.floor(monthKey / 12)
    const monthIdx = monthKey % 12
    const monthStr = year + '-' + String(monthIdx + 1).padStart(2, '0')
    setDbStatus('Fetching present days for ' + monthStr + '…')
    setDbStatusError(false)
    try {
      const res = await fetch(BASE_API_URL + '/api/salary/present-days?month=' + monthStr)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Fetch failed')
      const map = {}
      for (const r of data.rows) map[normalizeName(r.name)] = { days: r.paid_days, joinDed: r.joining_deduction || 0, lateDed: r.late_deduction_days || 0 }
      const next = { ...dbPresentRef.current, [monthKey]: map }
      dbPresentRef.current = next
      setDbPresent(next)
      localStorage.setItem(DB_KEY, JSON.stringify(next))
      setDbStatus('DB present days loaded for ' + monthStr + ' (' + data.rows.length + ' workers, ' + data.days_in_month + ' days).')
      compute()
    } catch (err) {
      setDbStatus('DB fetch error: ' + err.message + ' — showing Excel values only.', true)
      setDbStatusError(true)
    }
  }, [compute])

  const handleFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setBusy(true)
    setMsg(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        wbRef.current = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
        const monthKey = compute()
        if (monthKey) fetchPresentDays(monthKey)
      } catch (err) {
        showMsg('Could not parse the file: ' + err.message, 'err')
      } finally {
        setBusy(false)
      }
    }
    reader.onerror = () => {
      setBusy(false)
      showMsg('Could not read the file.', 'err')
    }
    reader.readAsArrayBuffer(file)
  }, [compute, fetchPresentDays, showMsg])

  const exportCsv = useCallback(() => {
    if (!rows || !rows.length) return
    const blob = new Blob(['\ufeff' + buildCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'salary-calculation.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [rows])

  const hasFileSalary = rows ? rows.some(r => r.fileSalary !== null) : false
  const hasFileNet = rows ? rows.some(r => r.fileNet !== null) : false

  const head = [
    'Sheet', 'Employee', 'Date of Joining', 'Salary', 'Days/Month', 'DB Present Days', 'Match?', 'Training & Sun. Ded.', 'Sunday To Add', 'Net Present Days', 'Joining Ded. (new)', 'Late Deduction', 'Computed Salary (by days)',
  ]
  const computed = [true, false, false, false, true, false, false, false, false, false, true, true, true]
  if (hasFileSalary) { head.push('File Month Salary', 'Match?'); computed.push(false, true) }
  head.push('10% Incentive', 'Monthly Eligible?', 'Total AKI', 'AKI Eligible?', 'Total Incentive', 'Weekly Inc.', 'Gross Payable', 'OT/Extra (manual)', 'Pending Exp.', 'Advance', 'Net Payable')
  computed.push(false, true, false, true, true, false, true, false, false, false, true)
  if (hasFileNet) { head.push('File Net Payable'); computed.push(false) }

  const sumSalary = rows ? rows.reduce((a, r) => a + r.calcSalary, 0) : 0
  const sumMonthly = rows ? rows.reduce((a, r) => a + r.monthly10, 0) : 0
  const sumAki = rows ? rows.reduce((a, r) => a + r.totalAki, 0) : 0
  const sumIncentive = rows ? rows.reduce((a, r) => a + r.incentiveTotal, 0) : 0
  const sumWeekly = rows ? rows.reduce((a, r) => a + r.weekly, 0) : 0
  const sumGross = rows ? rows.reduce((a, r) => a + r.gross, 0) : 0
  const sumOt = rows ? rows.reduce((a, r) => a + r.otExtra, 0) : 0
  const sumNet = rows ? rows.reduce((a, r) => a + r.netPayable, 0) : 0
  const sumDbPresent = rows ? rows.reduce((a, r) => a + r.dbPresent, 0) : 0
  const sumNetPresent = rows ? rows.reduce((a, r) => a + r.netPresent, 0) : 0
  const sumJoinDed = rows ? rows.reduce((a, r) => a + (r.joiningDeduction || 0), 0) : 0
  const sumLateDed = rows ? rows.reduce((a, r) => a + (r.lateDeduction || 0), 0) : 0

  const badge = (match) => {
    if (match === null) return <span className="badge b-ghost">—</span>
    return match ? <span className="badge b-ok">match</span> : <span className="badge b-no">diff</span>
  }
  const yesNo = (v) => v ? <span className="badge b-ok">yes</span> : <span className="badge b-ghost">no</span>

  const colClass = (i) => (i <= 2 ? 'l ' : '') + (computed[i] ? 'c' : '')
  const leftClass = (i) => i <= 2 ? 'l ' : ''

  const sums = rows ? (() => {
    const s = [rows.length + ' employees', '', '', '', '', sumDbPresent, '', '', '', sumNetPresent, sumJoinDed, sumLateDed, money(sumSalary)]
    if (hasFileSalary) s.push('', '')
    s.push(money(sumMonthly), '', money(sumAki), '', money(sumIncentive), money(sumWeekly), money(sumGross), money(sumOt), '', '', money(sumNet))
    if (hasFileNet) s.push('')
    return s
  })() : []

  return (
    <div className="wrap">
      <h1>Salary Calculator</h1>
      <div className="sub">Upload the payroll Excel and it counts each employee's salary from the days worked (Present Days &times; Salary &divide; days in month), plus the full Gross → Net chain. Present days are pulled automatically from the database when you import the file.</div>

      <div className="card">
        <div className="row">
          <label>Excel file
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={busy} />
          </label>
          <button onClick={compute} disabled={busy}>Compute</button>
          <button className="ghost" onClick={exportCsv} disabled={busy || !rows}>Export CSV</button>
        </div>
        <div className="note">Auto-detects the current month's payroll sheet (latest date columns in the file). Formula used: <b>Salary &divide; days in month &times; (DB Present Days − Late Deduction − Joining Ded.)</b>, where days in month come from the date columns in the sheet. When pulled from the database, <b>DB Present Days</b> = the backend's paid days (present minus absences, half-days, Sunday deductions, plus attended cancelled Sundays). The <b>Late Deduction</b> and <b>Joining Ded.</b> columns (from the backend) are then subtracted to get the days used for salary, matching the HR salary page. When the DB is unreachable, DB Present Days = Excel Present Days − Joining Ded. (Excel values only). Then Gross = Month Salary + 10% Incentive + Aaj Ka Incentive + Weekly Incentive; Net = Gross + OT/Extra + Pending Expenses − Advance.</div>
        <div className="note">Columns highlighted in <span className="hl">blue</span> are calculated by this tool after upload; uncolored columns are read directly from the Excel file.</div>
        <div className="note" style={{ color: dbStatusError ? '#b91c1c' : '#6b7280' }}>{dbStatus}</div>
      </div>

      {msg && <div className={'msg ' + msgKind}>{msg}</div>}

      {rows && (
        <>
          <div className="stats">
            <div className="stat"><div className="lbl">Employees</div><div className="val">{rows.length}</div></div>
            <div className="stat"><div className="lbl">Total Salary (by days)</div><div className="val green">{money(sumSalary)}</div></div>
            <div className="stat"><div className="lbl">Total Gross</div><div className="val">{money(sumGross)}</div></div>
            <div className="stat"><div className="lbl">Total Net Payable</div><div className="val">{money(sumNet)}</div></div>
          </div>

          <div className="card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>{head.map((h, i) => <th key={i} className={colClass(i)}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className={leftClass(0)}>{r.sheet}</td>
                      <td className={leftClass(1)}>
                        {r.name}
                        {r.presentSource === 'db' && <span className="badge b-ok" title="Present days from database">db</span>}
                      </td>
                      <td className={leftClass(2)}>{r.doj || '—'}</td>
                      <td>{money(r.salary)}</td>
                      <td className="c">{r.days}</td>
                      <td>{r.dbPresent}</td>
                      <td>{badge(r.presentMatch)}</td>
                      <td>{r.training}</td>
                      <td>{r.sundayAdd}</td>
                      <td>{r.netPresent}</td>
                      <td className="c">{r.joiningDeduction || '—'}</td>
                      <td className="c">{r.lateDeduction || '—'}</td>
                      <td className="c">{money(r.calcSalary)}</td>
                      {hasFileSalary && (
                        <>
                          <td>{r.fileSalary !== null ? money(r.fileSalary) : '—'}</td>
                          <td>{r.fileSalary !== null ? badge(Math.abs(r.calcSalary - r.fileSalary) < 0.01) : <span className="badge b-ghost">–</span>}</td>
                        </>
                      )}
                      <td>{money(r.monthly10)}</td>
                      <td className="c">{yesNo(r.eligibleMonthly)}</td>
                      <td>{money(r.totalAki)}</td>
                      <td className="c">{yesNo(r.eligibleAki)}</td>
                      <td className="c">{money(r.incentiveTotal)}</td>
                      <td>{money(r.weekly)}</td>
                      <td className="c">{money(r.gross)}</td>
                      <td>{money(r.otExtra)}</td>
                      <td>{money(r.pending)}</td>
                      <td>{money(r.advance)}</td>
                      <td className="c">{money(r.netPayable)}</td>
                      {hasFileNet && <td>{r.fileNet !== null ? money(r.fileNet) : '—'}</td>}
                    </tr>
                  ))}
                  <tr className="total">
                    {sums.map((c, i) => <td key={i} className={colClass(i)}>{c}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
