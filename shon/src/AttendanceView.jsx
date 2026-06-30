import { useEffect, useState } from 'react'
import { apiGet, apiPut, apiPost, apiDelete } from './api'

const IST_OFFSET = 5.5 * 60 * 60 * 1000

function fmtTime(iso) {
  if (!iso) return <span className="dim">&mdash;</span>
  const d = new Date(new Date(iso).getTime() + IST_OFFSET)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return <span>{hh}:{mm}</span>
}

function getIstDateStr(date) {
  const ist = new Date(date.getTime() + IST_OFFSET)
  const y = ist.getUTCFullYear()
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const d = String(ist.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function extractTime(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + IST_OFFSET)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function reconstructIso(originalIso, newTime) {
  if (!newTime) return null
  const [h, m] = newTime.split(':').map(Number)
  const ist = new Date(new Date(originalIso).getTime() + IST_OFFSET)
  ist.setUTCHours(h, m, 0, 0)
  return new Date(ist.getTime() - IST_OFFSET).toISOString()
}

function Badge({ status }) {
  const map = {
    present: { cls: 'badge-present', lbl: 'Present' },
    late: { cls: 'badge-late', lbl: 'Late' },
    absent: { cls: 'badge-absent', lbl: 'Absent' },
    leave: { cls: 'badge-leave', lbl: 'Leave' },
  }
  const { cls, lbl } = map[status] || { cls: '', lbl: status || '\u2014' }
  return <span className={`badge ${cls}`}>{lbl}</span>
}

export default function AttendanceView() {
  const [attendance, setAttendance] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')

  const [selectedWorker, setSelectedWorker] = useState(null)
  const [workerAttendance, setWorkerAttendance] = useState([])

  const [editingRecord, setEditingRecord] = useState(null)
  const [editPunchIn, setEditPunchIn] = useState('')
  const [editPunchOut, setEditPunchOut] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [addingRecord, setAddingRecord] = useState(false)
  const [addWorkerId, setAddWorkerId] = useState('')
  const [addDate, setAddDate] = useState('')
  const [addPunchIn, setAddPunchIn] = useState('')
  const [addPunchOut, setAddPunchOut] = useState('')
  const [addStatus, setAddStatus] = useState('present')
  const [addLoading, setAddLoading] = useState(false)

  useEffect(() => {
    const d = new Date()
    setDateTo(getIstDateStr(d))
    d.setDate(d.getDate() - 30)
    setDateFrom(getIstDateStr(d))
    loadData()
  }, [])

  useEffect(() => {
    if (selectedWorker) {
      setWorkerAttendance(attendance.filter(a => a.worker_id === selectedWorker.id && a.id))
    }
  }, [attendance, selectedWorker])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [att, wrk] = await Promise.all([
        apiGet('/attendance/all').catch(() => []),
        apiGet('/workers').catch(() => []),
      ])
      setAttendance(Array.isArray(att) ? att : [])
      setWorkers(Array.isArray(wrk) ? wrk : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = attendance.filter(r => {
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo && r.date > dateTo) return false
    if (statusFilter && r.status !== statusFilter) return false
    const w = r.workers || workers.find(x => x.id === r.worker_id) || {}
    if (deptFilter && w.department !== deptFilter) return false
    if (search) {
      const name = (w.name || '').toLowerCase()
      const lid = (w.login_id || '').toLowerCase()
      const s = search.toLowerCase()
      if (!name.includes(s) && !lid.includes(s)) return false
    }
    return true
  })

  const depts = [...new Set(workers.map(w => w.department).filter(Boolean))].sort()

  function openEdit(record) {
    setEditingRecord(record)
    setEditPunchIn(extractTime(record.punch_in_time))
    setEditPunchOut(extractTime(record.punch_out_time))
    setEditStatus(record.status)
  }

  function closeEdit() {
    setEditingRecord(null)
    setEditLoading(false)
  }

  async function saveEdit() {
    if (!editingRecord) return
    setEditLoading(true)
    try {
      await apiPut('/attendance/' + editingRecord.id, {
        punch_in_time: reconstructIso(editingRecord.punch_in_time, editPunchIn),
        punch_out_time: reconstructIso(editingRecord.punch_out_time, editPunchOut),
        status: editStatus,
      })
      await loadData()
      closeEdit()
    } catch (err) {
      alert(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  async function deleteRecord(id) {
    if (!confirm('Delete this attendance record?')) return
    try {
      await apiDelete('/attendance/' + id)
      await loadData()
      closeEdit()
    } catch (err) {
      alert(err.message)
    }
  }

  async function addRecord() {
    if (!addWorkerId || !addDate) { alert('Select a worker and date'); return }
    setAddLoading(true)
    try {
      await apiPost('/attendance', {
        worker_id: addWorkerId,
        date: addDate,
        punch_in_time: addPunchIn ? `${addDate}T${addPunchIn}:00.000Z` : null,
        punch_out_time: addPunchOut ? `${addDate}T${addPunchOut}:00.000Z` : null,
        status: addStatus,
      })
      await loadData()
      setAddingRecord(false)
      setAddWorkerId('')
      setAddDate('')
      setAddPunchIn('')
      setAddPunchOut('')
      setAddStatus('present')
    } catch (err) {
      alert(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  const presentCount = filtered.filter(r => r.status === 'present').length
  const lateCount = filtered.filter(r => r.status === 'late').length
  const absentCount = filtered.filter(r => r.status === 'absent').length
  const leaveCount = filtered.filter(r => r.status === 'leave').length

  if (loading && attendance.length === 0) {
    return <div className="loading"><div className="spinner" /><p>Loading attendance...</p></div>
  }

  if (selectedWorker) {
    return (
      <div>
        <div className="flex-row">
          <button className="btn" onClick={() => { setSelectedWorker(null); setEditingRecord(null) }}>&larr; Back</button>
          <h3 style={{ margin: 0 }}>{selectedWorker.name}'s Attendance</h3>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setAddingRecord(true); setAddWorkerId(selectedWorker.id); setAddDate(''); setAddPunchIn(''); setAddPunchOut(''); setAddStatus('present') }}>+ Add Attendance</button>
        </div>
        <div className="card">
          {workerAttendance.length === 0 ? (
            <div className="empty">No attendance records for this worker.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Date</th><th>Status</th><th>Punch In</th><th>Punch Out</th><th>Late (min)</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {workerAttendance.map((r, i) => (
                    <tr key={r.id} className={r.status === 'late' ? 'row-late' : r.status === 'absent' ? 'row-absent' : ''}>
                      <td>{i + 1}</td>
                      <td>{r.date}</td>
                      <td><Badge status={r.status} /></td>
                      <td>{fmtTime(r.punch_in_time)}</td>
                      <td>{fmtTime(r.punch_out_time)}</td>
                      <td>{r.late_minutes > 0 ? <span className="late-mins">{r.late_minutes}</span> : '\u2014'}</td>
                      <td>
                        <button className="btn btn-sm" onClick={() => openEdit(r)} title="Edit">&#9998;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {addingRecord && (
          <div className="modal-overlay" onClick={() => setAddingRecord(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Add Attendance</h3>
                <button className="btn btn-sm" onClick={() => setAddingRecord(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <label className="field">
                  <span>Worker</span>
                  <input type="text" value={selectedWorker?.name || ''} disabled />
                </label>
                <label className="field">
                  <span>Date</span>
                  <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Punch In Time</span>
                  <input type="time" value={addPunchIn} onChange={e => setAddPunchIn(e.target.value)} />
                </label>
                <label className="field">
                  <span>Punch Out Time</span>
                  <input type="time" value={addPunchOut} onChange={e => setAddPunchOut(e.target.value)} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={addStatus} onChange={e => setAddStatus(e.target.value)}>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="leave">Leave</option>
                  </select>
                </label>
              </div>
              <div className="modal-foot">
                <button className="btn" onClick={() => setAddingRecord(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addRecord} disabled={addLoading}>
                  {addLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingRecord && (
          <div className="modal-overlay" onClick={closeEdit}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Edit Attendance</h3>
                <button className="btn btn-sm" onClick={closeEdit}>&times;</button>
              </div>
              <div className="modal-body">
                <label className="field">
                  <span>Worker</span>
                  <input type="text" value={editingRecord.workers?.name || selectedWorker?.name || ''} disabled />
                </label>
                <label className="field">
                  <span>Date</span>
                  <input type="text" value={editingRecord.date} disabled />
                </label>
                <label className="field">
                  <span>Punch In</span>
                  <input type="time" value={editPunchIn} onChange={e => setEditPunchIn(e.target.value)} />
                </label>
                <label className="field">
                  <span>Punch Out</span>
                  <input type="time" value={editPunchOut} onChange={e => setEditPunchOut(e.target.value)} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="leave">Leave</option>
                  </select>
                </label>
              </div>
              <div className="modal-foot">
                <button className="btn btn-danger" onClick={() => deleteRecord(editingRecord.id)} style={{ marginRight: 'auto' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Delete
                </button>
                <button className="btn" onClick={closeEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <div className="filters">
          <div className="filter-group">
            <label>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Department</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Search</label>
            <input type="text" placeholder="Name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-group" style={{ flex: 0 }}>
            <label>&nbsp;</label>
            <button className="btn btn-primary" onClick={loadData}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat stat-total"><span className="stat-num">{filtered.length}</span><span className="stat-lbl">Total</span></div>
        <div className="stat stat-present"><span className="stat-num">{presentCount}</span><span className="stat-lbl">Present</span></div>
        <div className="stat stat-late"><span className="stat-num">{lateCount}</span><span className="stat-lbl">Late</span></div>
        <div className="stat stat-absent"><span className="stat-num">{absentCount}</span><span className="stat-lbl">Absent</span></div>
        <div className="stat stat-leave"><span className="stat-num">{leaveCount}</span><span className="stat-lbl">Leave</span></div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">No attendance records found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Date</th><th>Worker</th><th>Department</th><th>Status</th><th>Punch In</th><th>Punch Out</th><th>Late (min)</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const w = r.workers || workers.find(x => x.id === r.worker_id) || {}
                  const cls = r.status === 'absent' ? 'row-absent' : r.status === 'late' ? 'row-late' : ''
                  return (
                    <tr key={r.id} className={cls}>
                      <td>{i + 1}</td>
                      <td>{r.date}</td>
                      <td>
                        <a href="#" className="worker-link" onClick={e => { e.preventDefault(); setSelectedWorker(w) }}>
                          <strong>{w.name || 'Unknown'}</strong>
                        </a>
                      </td>
                      <td>{w.department || '\u2014'}</td>
                      <td><Badge status={r.status} /></td>
                      <td>{fmtTime(r.punch_in_time)}</td>
                      <td>{fmtTime(r.punch_out_time)}</td>
                      <td>{r.late_minutes > 0 ? <span className="late-mins">{r.late_minutes}</span> : '\u2014'}</td>
                      <td>
                        <button className="btn btn-sm" onClick={() => openEdit(r)} title="Edit">&#9998;</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRecord && !selectedWorker && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Edit Attendance</h3>
              <button className="btn btn-sm" onClick={closeEdit}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>Worker</span>
                <input type="text" value={editingRecord.workers?.name || workers.find(w => w.id === editingRecord.worker_id)?.name || ''} disabled />
              </label>
              <label className="field">
                <span>Date</span>
                <input type="text" value={editingRecord.date} disabled />
              </label>
              <label className="field">
                <span>Punch In</span>
                <input type="time" value={editPunchIn} onChange={e => setEditPunchIn(e.target.value)} />
              </label>
              <label className="field">
                <span>Punch Out</span>
                <input type="time" value={editPunchOut} onChange={e => setEditPunchOut(e.target.value)} />
              </label>
              <label className="field">
                <span>Status</span>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="leave">Leave</option>
                </select>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-danger" onClick={() => deleteRecord(editingRecord.id)} style={{ marginRight: 'auto' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
              <button className="btn" onClick={closeEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editLoading}>
                {editLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
