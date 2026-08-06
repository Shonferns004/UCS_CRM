import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX_NS from 'xlsx'
import { computeWorkbook, buildCsv, money, normalizeName } from './lib/salaryCalc'
import Login from './Login'

const XLSX = XLSX_NS.default || XLSX_NS

const DB_KEY = 'salaryCalcDbMap5'
const AUTH_KEY = 'salaryCalcAuth'

const BASE_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function loadDbPresent() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
  } catch {
    return null
  }
}

export default function App() {
  const [rows, setRows] = useState(null)
  const [dbPresent, setDbPresent] = useState(loadDbPresent)
  const [msg, setMsg] = useState(null)
  const [msgKind, setMsgKind] = useState('info')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [modalRow, setModalRow] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [attBusy, setAttBusy] = useState(false)
  const [attError, setAttError] = useState('')
  const [auth, setAuth] = useState(loadAuth)
  const wbRef = useRef(null)
  const dbPresentRef = useRef(dbPresent)
  const authRef = useRef(auth)
  const fileInput = useRef(null)

  useEffect(() => { dbPresentRef.current = dbPresent }, [dbPresent])
  useEffect(() => { authRef.current = auth }, [auth])

  const handleLogin = useCallback((data) => {
    const next = { token: data.token, role: data.role, user: data.user }
    setAuth(next)
    localStorage.setItem(AUTH_KEY, JSON.stringify(next))
  }, [])

  const handleLogout = useCallback(() => {
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    wbRef.current = null
    setRows(null)
    setSearch('')
    setFileName('')
    setMsg(null)
    setModalRow(null)
    setAttendance(null)
    setAttError('')
  }, [])

  const authHeaders = useCallback(() => {
    const t = authRef.current && authRef.current.token
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }
  }, [])

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
    if (!monthKey) { showMsg('Could not determine the sheet month.', 'err'); return; }
    if (!BASE_API_URL) { showMsg('API URL not set in .env (VITE_API_URL).', 'err'); return; }
    const year = Math.floor(monthKey / 12)
    const monthIdx = monthKey % 12
    const monthStr = year + '-' + String(monthIdx + 1).padStart(2, '0')
    try {
      const res = await fetch(BASE_API_URL + '/api/salary/present-days?month=' + monthStr, { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Fetch failed')
      const map = {}
      for (const r of data.rows) map[normalizeName(r.name)] = {
        days: r.paid_days,
        joinDed: r.joining_deduction || 0,
        lateDed: r.late_deduction_days || 0,
        absent: r.absent_count || 0,
        half: r.half_days || 0,
        available: r.available_days || null,
        present: r.present || 0,
        sunCount: r.sunday_count || 0,
        sunAttended: r.attended_sundays || 0,
        sunUnpaid: r.unpaid_sundays || 0,
        sunDeducted: r.deducted_sundays || 0,
        collection: r.collection || 0,
      }
      const next = { ...dbPresentRef.current, [monthKey]: map }
      dbPresentRef.current = next
      setDbPresent(next)
      localStorage.setItem(DB_KEY, JSON.stringify(next))
      compute()
    } catch (err) {
      showMsg('DB fetch error: ' + err.message + ' — showing Excel values only.', 'err')
    }
  }, [compute, showMsg, authHeaders])

  const processFile = useCallback((file) => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    setFileName(file.name)
    setModalRow(null)
    setAttendance(null)
    setAttError('')
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

  const handleFile = useCallback((e) => {
    processFile(e.target.files && e.target.files[0])
    e.target.value = ''
  }, [processFile])

  const clearAll = useCallback(() => {
    wbRef.current = null
    setRows(null)
    setSearch('')
    setFileName('')
    setMsg(null)
    setModalRow(null)
    setAttendance(null)
    setAttError('')
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [processFile])

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])

  const exportCsv = useCallback(() => {
    if (!rows || !rows.length) return
    const blob = new Blob(['\ufeff' + buildCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'salary-calculation.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [rows])

  const closeModal = useCallback(() => {
    setModalRow(null)
    setAttendance(null)
    setAttError('')
  }, [])

  const openAttendance = useCallback(async (row) => {
    setModalRow(row)
    setAttendance(null)
    setAttError('')
    if (row.mkey == null) { setAttError('Month is unknown for this row.'); return }
    if (!BASE_API_URL) { setAttError('API URL not set in .env (VITE_API_URL).'); return }
    const year = Math.floor(row.mkey / 12)
    const monthIdx = row.mkey % 12
    const monthStr = year + '-' + String(monthIdx + 1).padStart(2, '0')
    setAttBusy(true)
    try {
      const res = await fetch(BASE_API_URL + '/api/salary/attendance?month=' + monthStr + '&name=' + encodeURIComponent(row.name), { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Fetch failed')
      if (!data.worker) { setAttError('No matching worker in the database for "' + row.name + '".'); return }
      setAttendance(data)
    } catch (err) {
      setAttError(err.message)
    } finally {
      setAttBusy(false)
    }
  }, [authHeaders])

  const monthLabel = (mkey) => {
    if (mkey == null) return '—'
    return MONTH_NAMES[mkey % 12] + ' ' + Math.floor(mkey / 12)
  }

  const statusLabel = (d) => {
    if (d.status === 'half-day') return 'Half Day'
    return d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : ''
  }

  const attTitle = (d) => {
    const parts = [d.date, statusLabel(d)]
    if (d.punch_in) parts.push('In: ' + d.punch_in)
    if (d.punch_out) parts.push('Out: ' + d.punch_out)
    if (d.hours_worked) parts.push('Hours: ' + d.hours_worked)
    if (d.late_minutes > 0) parts.push(d.late_minutes + 'm late')
    return parts.join(' · ')
  }

  const attStat = (label, val, cls) => (
    <div className={'att-stat ' + cls}><span className="dot"></span>{val} {label}</div>
  )

  const hasFileSalary = rows ? rows.some(r => r.fileSalary !== null) : false
  const hasFileNet = rows ? rows.some(r => r.fileNet !== null) : false

  const head = [
    'Employee', 'Date of Joining', 'Salary', 'Days/Month',
    'DB Present Days', 'Half Day', 'Absent', 'Deducted Sun.',
    'Joining Ded. (new)', 'Late Deduction', 'Training & Sun. Ded',
    'Total Days', 'Net Present Days', 'Match?', 'Computed Salary (by days)',
  ]
  const computed = [false, false, false, true, false, false, false, false, true, true, false, true, false, false, true]
  if (hasFileSalary) { head.push('File Month Salary', 'Match?'); computed.push(false, false) }
  head.push('Monthly Eligible?', '10% Incentive', 'AKI Eligible?', 'Total AKI', 'Total Incentive', 'Gross Payable', 'OT/Extra (manual)', 'Pending Exp.', 'Advance', 'Net Payable')
  computed.push(true, true, true, true, true, true, false, false, false, true)
  if (hasFileNet) { head.push('File Net Payable', 'Match?', 'Difference'); computed.push(false, false, true) }

  const filtered = rows
    ? rows.filter(r => !search || r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  const podium = rows
    ? [...rows].sort((a, b) => (b.collection || 0) - (a.collection || 0)).slice(0, 3)
    : []
  const PODIUM_SLOTS = [
    { cls: 'place-2', num: '2', label: 'SILVER', height: 128 },
    { cls: 'place-1', num: '1', label: 'GOLD', height: 192 },
    { cls: 'place-3', num: '3', label: 'BRONZE', height: 96 },
  ]
  const podiumSlots = [
    ...(podium.length > 1 ? [podium[1]] : podium.length === 1 ? [podium[0]] : []),
    ...(podium.length > 0 ? [podium[0]] : []),
    ...(podium.length > 2 ? [podium[2]] : []),
  ]

  const sumSalary = filtered.reduce((a, r) => a + r.calcSalary, 0)
  const sumMonthly = filtered.reduce((a, r) => a + r.monthly10, 0)
  const sumAki = filtered.reduce((a, r) => a + r.totalAki, 0)
  const sumIncentive = filtered.reduce((a, r) => a + r.incentiveTotal, 0)
  const sumGross = filtered.reduce((a, r) => a + r.gross, 0)
  const sumOt = filtered.reduce((a, r) => a + r.otExtra, 0)
  const sumNet = filtered.reduce((a, r) => a + r.netPayable, 0)
  const sumDbPresent = filtered.reduce((a, r) => a + r.dbPresent, 0)
  const sumAbsent = filtered.reduce((a, r) => a + (r.dbAbsent || 0), 0)
  const sumHalf = filtered.reduce((a, r) => a + ((r.dbHalf || 0) * 0.5), 0)
  const sumTotalPresent = filtered.reduce((a, r) => a + (r.totalPresentDays || 0), 0)
  const sumNetPresent = filtered.reduce((a, r) => a + r.netPresent, 0)
  const sumJoinDed = filtered.reduce((a, r) => a + (r.joiningDeduction || 0), 0)
  const sumLateDed = filtered.reduce((a, r) => a + (r.lateDeduction || 0), 0)
  const sumDiff = filtered.reduce((a, r) => a + (r.diff || 0), 0)

  const badge = (match) => {
    if (match === null) return <span className="badge b-ghost">0</span>
    return match ? <span className="badge b-ok">match</span> : <span className="badge b-no">diff</span>
  }
  const yesNo = (v) => v ? <span className="badge b-ok">yes</span> : <span className="badge b-ghost">no</span>

  const colClass = (i) => (i <= 1 ? 'l ' : '') + (computed[i] ? 'c' : '')
  const leftClass = (i) => i <= 1 ? 'l ' : ''

  const sums = (() => {
    const s = [filtered.length + ' employees', '', '', '', sumDbPresent, sumHalf, sumAbsent, '', sumJoinDed, sumLateDed, '', sumTotalPresent, sumNetPresent, '', money(sumSalary)]
    if (hasFileSalary) s.push('', '')
    s.push('', money(sumMonthly), '', money(sumAki), money(sumIncentive), money(sumGross), money(sumOt), '', '', money(sumNet))
    if (hasFileNet) s.push('', '', money(sumDiff))
    return s
  })()

  if (!auth) {
    return <Login apiUrl={BASE_API_URL} onLogin={handleLogin} />
  }

  return (
    <div className="wrap">
      <header>
        <div className="header-row">
          <div>
            <h1>Salary Calculator</h1>
            <p className="sub">Upload the payroll Excel and it counts each employee's salary from the days worked (Present Days &times; Salary &divide; days in month), plus the full Gross → Net chain. Present days are pulled automatically from the database when you import the file.</p>
          </div>
          {auth && (
            <div className="header-user">
              <span className="user-chip">
                <span className="material-symbols-outlined">person</span>
                <span className="user-name">{auth.user && auth.user.name}</span>
                <span className="role-tag">{auth.role === 'super_admin' ? 'Super Admin' : 'Accounts'}</span>
              </span>
              <button className="btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <section className="card">
        <div className="panel-head">
          <h2 className="panel-title">Upload Receipts</h2>
          <button className="icon-btn" onClick={clearAll} disabled={busy || !rows} title="Clear the loaded file" aria-label="Clear">
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
        <div
          className={'dropzone' + (dragOver ? ' dropzone-over' : '')}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInput.current && fileInput.current.click()}
        >
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={busy} hidden />
          <span className="material-symbols-outlined dz-icon">upload</span>
          <span className="dz-main">Drag &amp; drop your Excel/CSV file here</span>
          <span className="dz-sub">or click to browse &middot; .xlsx .xls .csv</span>
          {fileName && <span className="dz-file">Loaded: {fileName}</span>}
        </div>
        <div className="btn-actions">
          <button className="btn-ghost" onClick={exportCsv} disabled={busy || !rows}>
            <span className="material-symbols-outlined">download</span> Export CSV
          </button>
        </div>
      </section>

      {msg && <div className={'msg ' + msgKind}>{msg}</div>}

      {rows && (
        <>
          <section className="summary">
            <div className="stat"><p className="lbl">Employees</p><p className="val">{filtered.length}</p></div>
            <div className="stat"><p className="lbl">Total Salary (By Days)</p><p className="val green">{money(sumSalary)}</p></div>
            <div className="stat"><p className="lbl">Total Gross</p><p className="val">{money(sumGross)}</p></div>
            <div className="stat"><p className="lbl">Total Net Payable</p><p className="val">{money(sumNet)}</p></div>
          </section>

          <section className="card">
            <h2 className="podium-title">Top 3 Collection</h2>
            <div className="podium">
              {podium.length === 0 && <div className="note">No collection data found for this month's workers.</div>}
              {podiumSlots.map((r, i) => {
                const place = PODIUM_SLOTS[i]
                return (
                  <div className={'podium-place ' + place.cls} key={i}>
                    <div className="podium-name">{r.name}</div>
                    <div className="podium-amount">{money(r.collection || 0)}</div>
                    <div className="podium-block" style={{ height: place.height }}>
                      <div className="podium-num">{place.num}</div>
                    </div>
                    <div className="podium-tag">{place.label}</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card table-card">
            <div className="search-bar">
              <label className="search-label" htmlFor="salary-search">Search</label>
              <input id="salary-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee..." />
              {search && <button className="btn-ghost btn-sm" onClick={() => setSearch('')}>Clear</button>}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>{head.map((h, i) => <th key={i} className={colClass(i)}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i} className="row-click" onClick={() => openAttendance(r)} title="Click for attendance">
                      <td className={leftClass(0)}>
                        {r.name}
                        {r.presentSource === 'db' && <span className="badge b-ok" title="Present days from database">db</span>}
                      </td>
                      <td className={leftClass(1)}>{r.doj || '0'}</td>
                      <td>{money(r.salary)}</td>
                      <td className="c">{r.days}</td>
                      <td>{r.dbPresent}</td>
                      <td>{((r.dbHalf ?? 0) * 0.5) || 0}</td>
                      <td>{r.dbAbsent ?? 0}</td>
                      <td>{r.dbSunDeducted ?? 0}</td>
                      <td className="c">{r.joiningDeduction || 0}</td>
                      <td className="c">{r.lateDeduction || 0}</td>
                      <td>{r.training}</td>
                      <td className="c">{r.totalPresentDays}</td>
                      <td>{r.netPresent}</td>
                      <td>{badge(r.presentMatch)}</td>
                      <td className="c">{money(r.calcSalary)}</td>
                      {hasFileSalary && (
                        <>
                          <td>{r.fileSalary !== null ? money(r.fileSalary) : money(0)}</td>
                          <td>{r.fileSalary !== null ? badge(Math.abs(r.calcSalary - r.fileSalary) < 0.01) : <span className="badge b-ghost">0</span>}</td>
                        </>
                      )}
                      <td className="c">{yesNo(r.eligibleMonthly)}</td>
                      <td>{money(r.monthly10)}</td>
                      <td className="c">{yesNo(r.eligibleAki)}</td>
                      <td>{money(r.totalAki)}</td>
                      <td className="c">{money(r.incentiveTotal)}</td>
                      <td className="c">{money(r.gross)}</td>
                      <td>{money(r.otExtra)}</td>
                      <td>{money(r.pending)}</td>
                      <td>{money(r.advance)}</td>
                      <td className="c">{money(r.netPayable)}</td>
                      {hasFileNet && (
                        <>
                          <td>{r.fileNet !== null ? money(r.fileNet) : money(0)}</td>
                          <td>{r.fileNet !== null ? badge(Math.abs(r.netPayable - r.fileNet) < 0.01) : <span className="badge b-ghost">0</span>}</td>
                          <td className="c">{r.diff !== null ? money(r.diff) : money(0)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="total">
                    {sums.map((c, i) => <td key={i} className={colClass(i)}>{c}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {modalRow && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 className="modal-name">{modalRow.name}</h3>
                <p className="modal-sub">{monthLabel(modalRow.mkey)} &middot; Salary {money(modalRow.salary)} &middot; Total Days {modalRow.totalPresentDays}</p>
              </div>
              <button className="icon-btn" onClick={closeModal} title="Close" aria-label="Close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              {attBusy && (
                <div className="sk" aria-label="Loading monthly attendance">
                  <div className="sk-stats">
                    <div className="sk-chip"></div>
                    <div className="sk-chip"></div>
                    <div className="sk-chip"></div>
                    <div className="sk-chip"></div>
                    <div className="sk-chip"></div>
                    <div className="sk-chip"></div>
                  </div>
                  <div className="sk-grid">
                    {Array.from({ length: 28 }).map((_, i) => <div key={i} className="sk-cell"></div>)}
                  </div>
                </div>
              )}
              {attError && <div className="msg err">{attError}</div>}
              {attendance && attendance.rows && !attBusy && (
                <>
                  <div className="att-stats">
                    {attStat('Present', attendance.stats.present, 'p-present')}
                    {attStat('Late', attendance.stats.late, 'p-late')}
                    {attStat('Half Day', attendance.stats.half, 'p-half')}
                    {attStat('Absent', attendance.stats.absent, 'p-absent')}
                    {attStat('Leave', attendance.stats.leave, 'p-leave')}
                    {attStat('Sunday', attendance.stats.sunday, 'p-sunday')}
                  </div>
                  <div className="att-grid">
                    {attendance.rows.map((d) => {
                      const cls = d.status === 'half-day' ? 'half' : d.status
                      return (
                        <div key={d.date} className={'att-cell st-' + cls} title={attTitle(d)}>
                          <span className="att-num">{Number(d.date.slice(8))}</span>
                          <span className="att-day">{DAY_NAMES[d.day]}</span>
                          <span className="att-status">{statusLabel(d)}</span>
                          {d.late_minutes > 0 && <span className="att-late">{d.late_minutes}m</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="att-legend">
                    <span className="legend-item"><span className="dot p-present"></span>Present</span>
                    <span className="legend-item"><span className="dot p-late"></span>Late</span>
                    <span className="legend-item"><span className="dot p-half"></span>Half Day</span>
                    <span className="legend-item"><span className="dot p-absent"></span>Absent</span>
                    <span className="legend-item"><span className="dot p-leave"></span>Leave</span>
                    <span className="legend-item"><span className="dot p-sunday"></span>Sunday / Off</span>
                    <span className="legend-item">Hover a day for punch in / out.</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
