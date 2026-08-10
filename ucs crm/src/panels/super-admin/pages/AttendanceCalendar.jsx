import { useState, useEffect } from 'react'
import { api } from '../api/auth'

// Status -> colour mapping (same as screenshot)
const STATUS_STYLES = {
  present:  { bg: '#B9EFCE', text: '#1B7A3D' },
  absent:   { bg: '#FBDBD6', text: '#B3392B' },
  leave:    { bg: '#D6E4FB', text: '#2B5FB3' },
  late:     { bg: '#FDE0BC', text: '#B37122' },
  'half-day': { bg: '#EBDDF7', text: '#7B3FB3' },
  holiday:  { bg: '#EBDDF7', text: '#7B3FB3' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'half-day', label: 'Half-day' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
]

const IST_OFFSET = 5.5 * 60 * 60 * 1000

// ISO timestamp -> HH:mm in IST (backend stores IST wall-clock time in UTC fields)
const toTimeInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const ist = new Date(d.getTime() + IST_OFFSET)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

// Date (YYYY-MM-DD) + "HH:mm" (IST) -> ISO timestamp (inverse of toTimeInput)
const toIsoTimestamp = (dateStr, time) => {
  if (!time) return null
  const [hh, mm] = time.split(':').map(Number)
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) - IST_OFFSET + ((hh * 60 + mm) * 60000)
  return new Date(ms).toISOString()
}

export default function AttendanceCalendar({ workerId, worker }) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [records, setRecords] = useState({}) // { 'YYYY-MM-DD': { status, event } }
  const [calendarDates, setCalendarDates] = useState({}) // { 'YYYY-MM-DD': ['event', 'birthday'] }
  const [selectedDate, setSelectedDate] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [panelErr, setPanelErr] = useState('')

  const dateKey = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const load = () => {
    const mm = String(month + 1).padStart(2, '0')
    const monthKey = `${year}-${mm}`
    Promise.all([
      api(`/attendance/worker/${workerId}?month=${monthKey}`).catch(() => []),
      api(`/calendar?year=${year}&month=${mm}`).catch(() => ({ events: [], holidays: [], birthdays: [] })),
    ]).then(([attList, calData]) => {
      const map = {}
      ;(attList || []).forEach(r => { map[r.date] = r })
      ;(calData.holidays || []).forEach(h => {
        if (!map[h.date]) map[h.date] = { date: h.date, status: 'holiday' }
      })
      setRecords(map)

      const calMap = {}
      ;(calData.events || []).forEach(e => {
        if (e.date) calMap[e.date] = [...(calMap[e.date] || []), 'event']
      })
      ;(calData.birthdays || []).forEach(b => {
        if (b.date) calMap[b.date] = [...(calMap[b.date] || []), 'birthday']
      })
      setCalendarDates(calMap)
    }).catch(() => { setRecords({}); setCalendarDates({}) })
  }
  useEffect(load, [workerId, month, year])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay() // 0 = Sunday

  const calForDate = (d) => calendarDates[dateKey(d)] || []

  // Monthly consistency = present (+ late + half-day counted) / marked working days
  let presentCount = 0, markedCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const rec = records[dateKey(d)]
    if (!rec) continue
    if (rec.status === 'holiday') continue
    markedCount++
    if (['present', 'late', 'half-day'].includes(rec.status)) presentCount++
  }
  const consistency = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  const openDay = (dateStr) => {
    const rec = records[dateStr]
    setSelectedDate(dateStr)
    setPanelErr('')
    setDraft({
      status: rec && rec.status && rec.status !== 'holiday' ? rec.status : 'present',
      punchIn: toTimeInput(rec && rec.punch_in_time),
      punchOut: toTimeInput(rec && rec.punch_out_time),
      lateMinutes: rec && rec.late_minutes != null ? String(rec.late_minutes) : '0',
      id: rec && rec.id ? rec.id : null,
    })
  }

  const closePanel = () => {
    setSelectedDate(null)
    setDraft(null)
    setPanelErr('')
  }

  const handleSave = async () => {
    if (!selectedDate || !draft) return
    setSaving(true)
    setPanelErr('')
    const body = {
      status: draft.status,
      punch_in_time: toIsoTimestamp(selectedDate, draft.punchIn),
      punch_out_time: toIsoTimestamp(selectedDate, draft.punchOut),
      late_minutes: parseInt(draft.lateMinutes || '0', 10) || 0,
    }
    try {
      if (draft.id) {
        await api(`/attendance/${draft.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await api('/attendance', { method: 'POST', body: JSON.stringify({ worker_id: workerId, date: selectedDate, ...body }) })
      }
      closePanel()
      load()
    } catch (e) {
      setPanelErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNullify = async () => {
    if (!selectedDate || !draft) return
    if (!draft.id) { closePanel(); return }
    if (!window.confirm(`Delete the attendance record for ${selectedDate}?`)) return
    setSaving(true)
    setPanelErr('')
    try {
      await api(`/attendance/${draft.id}`, { method: 'DELETE' })
      closePanel()
      load()
    } catch (e) {
      setPanelErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const formatDateLabel = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return `${d} ${MONTHS[m - 1]} ${y} · ${DAY_NAMES[dt.getDay()]}`
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="sa-card att-cal-card">
      <div className="att-cal-header">
        <h3 className="sa-card-title" style={{ margin: 0 }}>Attendance Calendar</h3>
        <div className="att-cal-nav">
          <button className="att-nav-btn" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
          <span className="att-cal-month">{MONTHS[month]} {year}</span>
          <button className="att-nav-btn" onClick={nextMonth} aria-label="Next month">&#8250;</button>
        </div>
      </div>

      <div className="att-consistency">
        <div className="att-consistency-row">
          <span className="att-consistency-label">Monthly Consistency</span>
          <span className="att-consistency-value">{consistency}%</span>
        </div>
        <div className="att-progress">
          <div className="att-progress-fill" style={{ width: `${consistency}%` }} />
        </div>
      </div>

      <div className="att-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="att-weekday">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const dateStr = dateKey(d)
          const rec = records[dateStr]
          const style = rec ? STATUS_STYLES[rec.status] : null
          const selected = selectedDate === dateStr
          return (
            <div
              key={d}
              className={`att-day${selected ? ' selected' : ''}`}
              title={rec ? rec.status : ''}
              style={style ? { background: style.bg, color: style.text, fontWeight: 600 } : {}}
              onClick={() => openDay(dateStr)}
            >
              <span className="att-day-num">{d}</span>
              {(rec?.punch_in_time || rec?.punch_out_time) && (
                <span className="att-day-times">
                  {rec.punch_in_time && <span>{toTimeInput(rec.punch_in_time)}</span>}
                  {rec.punch_in_time && rec.punch_out_time && <span className="att-day-times-sep">–</span>}
                  {rec.punch_out_time && <span>{toTimeInput(rec.punch_out_time)}</span>}
                </span>
              )}
              {(rec?.event || calForDate(d).includes('event')) && <span className="att-dot" />}
              {calForDate(d).includes('birthday') && <span className="att-cake">&#127874;</span>}
            </div>
          )
        })}
      </div>

      {selectedDate && draft && (
        <div className="att-detail-panel">
          <div className="att-detail-head">
            <span className="att-detail-date">{formatDateLabel(selectedDate)}</span>
            <button className="att-detail-close" onClick={closePanel} aria-label="Close">&times;</button>
          </div>
          {panelErr && <div className="att-detail-err">{panelErr}</div>}
          <div className="att-detail-fields">
            <label className="att-field">
              <span>Status</span>
              <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="att-field">
              <span>Punch In</span>
              <input type="time" value={draft.punchIn} onChange={e => setDraft({ ...draft, punchIn: e.target.value })} />
            </label>
            <label className="att-field">
              <span>Punch Out</span>
              <input type="time" value={draft.punchOut} onChange={e => setDraft({ ...draft, punchOut: e.target.value })} />
            </label>
            <label className="att-field">
              <span>Late Minutes</span>
              <input type="number" min="0" value={draft.lateMinutes} onChange={e => setDraft({ ...draft, lateMinutes: e.target.value })} />
            </label>
          </div>
          <div className="att-detail-actions">
            <button className="att-btn att-btn-null" onClick={handleNullify} disabled={saving}>Null</button>
            <button className="att-btn att-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className="att-legend">
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#B9EFCE'}} /> Present</span>
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#FBDBD6'}} /> Absent</span>
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#D6E4FB'}} /> Leave</span>
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#FDE0BC'}} /> Late</span>
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#EBDDF7'}} /> Half-day</span>
        <span className="att-legend-item"><span className="att-swatch" style={{background:'#EBDDF7'}} /> Holiday</span>
        <span className="att-legend-item"><span className="att-dot" style={{position:'static'}} /> Event</span>
        <span className="att-legend-item">&#127874; Birthday</span>
      </div>

      <style>{`
.att-cal-card { }
.att-cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.att-cal-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.att-cal-month {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  min-width: 110px;
  text-align: center;
}
.att-nav-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: #333;
  padding: 2px 8px;
  border-radius: 6px;
}
.att-nav-btn:hover { background: #eef4fb; }
.att-consistency { margin-bottom: 18px; }
.att-consistency-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.att-consistency-label {
  font-size: 14px;
  font-weight: 500;
  color: #444;
}
.att-consistency-value {
  font-size: 14px;
  font-weight: 700;
  color: #1B7A3D;
}
.att-progress {
  height: 10px;
  border-radius: 20px;
  background: #FDE0BC;
  overflow: hidden;
}
.att-progress-fill {
  height: 100%;
  border-radius: 20px;
  background: #2A6B45;
  transition: width .4s ease;
}
.att-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  text-align: center;
}
.att-weekday {
  font-size: 13px;
  font-weight: 600;
  color: #9aa3ad;
  padding: 6px 0;
}
.att-day {
  position: relative;
  padding: 8px 0 6px;
  border-radius: 10px;
  font-size: 14px;
  color: #c3c9d0;
  user-select: none;
  cursor: pointer;
  transition: box-shadow .15s ease, transform .15s ease;
}
.att-day-num {
  display: block;
  font-weight: 600;
}
.att-day-times {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
  opacity: .95;
}
.att-day-times-sep {
  margin: 0 1px;
  opacity: .6;
}
.att-day:hover {
  box-shadow: 0 0 0 2px #2B5FB3;
  transform: translateY(-1px);
}
.att-day.selected {
  box-shadow: 0 0 0 2px #2B5FB3;
  transform: scale(1.06);
}
.att-dot {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2B5FB3;
  display: inline-block;
}
.att-cake {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
}
.att-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 18px;
}
.att-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: #444;
}
.att-swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  display: inline-block;
}
.att-detail-panel {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #d0e4f5;
  border-left: 4px solid #3485d4;
  border-radius: 10px;
  background: #f8fbff;
}
.att-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.att-detail-date {
  font-size: 14px;
  font-weight: 700;
  color: #333;
}
.att-detail-close {
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #9aa3ad;
  padding: 0 4px;
  border-radius: 6px;
}
.att-detail-close:hover { background: #eef4fb; color: #333; }
.att-detail-err {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #FBDBD6;
  color: #B3392B;
  font-size: 13px;
}
.att-detail-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.att-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
}
.att-field input,
.att-field select {
  padding: 7px 9px;
  border: 1px solid #d0e4f5;
  border-radius: 7px;
  font-size: 14px;
  background: #fff;
  color: #333;
  outline: none;
}
.att-field input:focus,
.att-field select:focus { border-color: #3485d4; }
.att-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.att-btn {
  border: none;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  color: #fff;
}
.att-btn:disabled { opacity: .6; cursor: default; }
.att-btn-save { background: #2A6B45; }
.att-btn-save:hover:not(:disabled) { background: #1f5235; }
.att-btn-null { background: #d9534f; }
.att-btn-null:hover:not(:disabled) { background: #b93d39; }
      `}</style>
    </div>
  )
}
