import { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost, apiDelete } from '../api/auth';

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function getIstDateStr(date) {
  const ist = new Date(date.getTime() + IST_OFFSET);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtTime(iso, fallbackDate) {
  if (!iso) return <span style={{ color: '#d1d5db' }}>&mdash;</span>;
  const d = new Date(new Date(iso).getTime() + IST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return <span>{hh}:{mm}</span>;
}
function fmtTimeStr(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function extractTime(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function istTimeToIso(dateStr, timeStr) {
  if (!timeStr || !dateStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = dateStr.split('T')[0];
  const base = new Date(new Date(d + 'T00:00:00.000Z').getTime() + IST_OFFSET);
  base.setUTCHours(h, m, 0, 0);
  return new Date(base.getTime() - IST_OFFSET).toISOString();
}
function reconstructIso(originalIso, newTime, fallbackDate) {
  if (!newTime) return null;
  const [h, m] = newTime.split(':').map(Number);
  let base;
  if (originalIso) {
    base = new Date(new Date(originalIso).getTime() + IST_OFFSET);
  } else if (fallbackDate) {
    const fbDate = fallbackDate.split('T')[0];
    base = new Date(new Date(fbDate + 'T00:00:00.000Z').getTime() + IST_OFFSET);
  } else {
    return null;
  }
  base.setUTCHours(h, m, 0, 0);
  return new Date(base.getTime() - IST_OFFSET).toISOString();
}

export default function Attendance() {
  const [workers, setWorkers] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewImg, setPreviewImg] = useState(null);

  // detailed drill-down
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerMonth, setWorkerMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [editingRecord, setEditingRecord] = useState(null);
  const [editPunchIn, setEditPunchIn] = useState('');
  const [editPunchOut, setEditPunchOut] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addPunchIn, setAddPunchIn] = useState('');
  const [addPunchOut, setAddPunchOut] = useState('');
  const [addStatus, setAddStatus] = useState('present');
  const [addLoading, setAddLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiGet('/workers?status=all'),
        apiGet('/attendance/today-all'),
        apiGet('/attendance/all'),
      ]);
      const workersData = results[0].status === 'fulfilled' ? results[0].value : [];
      const attendanceData = results[1].status === 'fulfilled' ? results[1].value : [];
      const allData = results[2].status === 'fulfilled' ? results[2].value : [];
      setWorkers(workersData || []);
      setTodayRecords(attendanceData || []);
      setAllRecords(Array.isArray(allData) ? allData : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (id) => {
    try {
      await apiPut(`/attendance/${id}/verify-selfie`, { status: 'verified' });
      setTodayRecords(prev => prev.map(r => r.id === id ? { ...r, selfie_status: 'verified' } : r));
      setAllRecords(prev => prev.map(r => r.id === id ? { ...r, selfie_status: 'verified' } : r));
    } catch (e) {
      alert(e.message || 'Failed to verify');
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Reject selfie? This will delete the entire attendance record.')) return;
    try {
      await apiPut(`/attendance/${id}/verify-selfie`, { status: 'rejected' });
      setTodayRecords(prev => prev.filter(r => r.id !== id));
      setAllRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(e.message || 'Failed to reject');
    }
  };

  const fmt = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // helpers for detailed view
  function openEdit(record) {
    setEditingRecord(record);
    setEditPunchIn(extractTime(record.punch_in_time));
    setEditPunchOut(extractTime(record.punch_out_time));
    setEditStatus(record.status || 'present');
  }
  function closeEdit() { setEditingRecord(null); setEditLoading(false); }
  function calcLateMin(punchInIso) {
    if (!punchInIso) return 0;
    const d = new Date(new Date(punchInIso).getTime() + IST_OFFSET);
    const h = d.getUTCHours(); const m = d.getUTCMinutes();
    if (h > 10 || (h === 10 && m > 0)) return (h - 10) * 60 + m;
    return 0;
  }
  async function saveEdit() {
    if (!editingRecord) return;
    setEditLoading(true);
    try {
      const newPunchIn = reconstructIso(editingRecord.punch_in_time, editPunchIn, editingRecord.date);
      const updates = {
        punch_in_time: newPunchIn,
        punch_out_time: reconstructIso(editingRecord.punch_out_time, editPunchOut, editingRecord.date),
        status: editStatus,
      };
      if (editPunchIn !== extractTime(editingRecord.punch_in_time)) {
        updates.late_minutes = calcLateMin(newPunchIn);
      }
      await apiPut(`/attendance/${editingRecord.id}`, updates);
      const refreshed = await apiGet('/attendance/all').catch(() => []);
      setAllRecords(Array.isArray(refreshed) ? refreshed : []);
      const todayRef = await apiGet('/attendance/today-all').catch(() => []);
      setTodayRecords(Array.isArray(todayRef) ? todayRef : []);
      closeEdit();
    } catch (err) { alert(err.message); }
    finally { setEditLoading(false); }
  }
  async function deleteRecord(id) {
    if (!confirm('Delete this attendance record?')) return;
    try {
      await apiDelete(`/attendance/${id}`);
      setAllRecords(prev => prev.filter(r => r.id !== id));
      setTodayRecords(prev => prev.filter(r => r.id !== id));
      closeEdit();
    } catch (err) { alert(err.message); }
  }
  async function addRecord() {
    if (!addDate) { alert('Select a date'); return; }
    setAddLoading(true);
    try {
      const punchInIso = istTimeToIso(addDate, addPunchIn);
      await apiPost('/attendance', {
        worker_id: selectedWorker.id,
        date: addDate,
        punch_in_time: punchInIso,
        punch_out_time: istTimeToIso(addDate, addPunchOut),
        status: addStatus,
        late_minutes: punchInIso ? calcLateMin(punchInIso) : 0,
      });
      const refreshed = await apiGet('/attendance/all').catch(() => []);
      setAllRecords(Array.isArray(refreshed) ? refreshed : []);
      const todayRef = await apiGet('/attendance/today-all').catch(() => []);
      setTodayRecords(Array.isArray(todayRef) ? todayRef : []);
      setAddingRecord(false); setAddDate(''); setAddPunchIn(''); setAddPunchOut(''); setAddStatus('present');
    } catch (err) { alert(err.message); }
    finally { setAddLoading(false); }
  }

  const merged = workers.map(w => {
    const record = todayRecords.find(r => r.worker_id === w.id);
    return {
      ...w,
      record: record || null,
      hasPunch: !!record,
    };
  }).sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const filtered = merged.filter(r => {
    if (!search) return true;
    const name = r.name || '';
    const dept = r.department || '';
    return name.toLowerCase().includes(search.toLowerCase()) || dept.toLowerCase().includes(search.toLowerCase());
  });

  const punchedIn = filtered.filter(r => r.hasPunch).length;
  const noPunch = filtered.filter(r => !r.hasPunch).length;

  // detailed worker attendance for selected month
  const workerRecords = (() => {
    if (!selectedWorker) return [];
    const recs = allRecords.filter(a => a.worker_id === selectedWorker.id);
    const [y, m] = workerMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const filled = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${workerMonth}-${String(d).padStart(2, '0')}`;
      const existing = recs.find(r => {
        const rd = r.date || (r.punch_in_time ? getIstDateStr(new Date(r.punch_in_time)) : '');
        return rd === ds;
      });
      filled.push(existing || { id: null, date: ds, status: 'absent', punch_in_time: null, punch_out_time: null, late_minutes: 0, worker_id: selectedWorker.id });
    }
    // newest first for table display? keep ascending for readability
    return filled;
  })();

  if (selectedWorker) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => { setSelectedWorker(null); setEditingRecord(null); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13 }}>← Back</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedWorker.name}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{selectedWorker.department || '—'} · {selectedWorker.login_id || selectedWorker.email || ''}</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={workerMonth} onChange={e => setWorkerMonth(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
            <button onClick={() => { setAddingRecord(true); setAddDate(''); setAddPunchIn(''); setAddPunchOut(''); setAddStatus('present'); }} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: 'white', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>+ Add Attendance</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f9fafb' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Punch In</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Punch Out</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {workerRecords.map(r => (
                <tr key={r.date} style={{ borderBottom: '1px solid #f3f4f6', background: r.status === 'absent' ? '#fef2f2' : r.status === 'late' ? '#fef3c7' : r.id ? 'white' : '#f9fafb' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.date}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtTime(r.punch_in_time, r.date)}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtTime(r.punch_out_time, r.date)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.id ? (
                      r.status === 'present' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontSize: 12 }}>Present</span>
                      : r.status === 'late' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 12 }}>Late {r.late_minutes ? `${r.late_minutes}m` : ''}</span>
                      : r.status === 'half-day' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#ffedd5', color: '#9a3412', fontSize: 12 }}>Half-day</span>
                      : r.status === 'leave' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontSize: 12 }}>Leave</span>
                      : <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 12 }}>{r.status}</span>
                    ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>— No record (Absent)</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {r.id ? (
                      <button onClick={() => openEdit(r)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 12 }}>✎ Edit</button>
                    ) : (
                      <button onClick={() => { setAddingRecord(true); setAddDate(r.date); setAddPunchIn(''); setAddPunchOut(''); setAddStatus('present'); }} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#f3f4f6', cursor: 'pointer', fontSize: 12 }}>+ Add</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {addingRecord && (
          <div onClick={() => setAddingRecord(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: 420, maxWidth: '90vw', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Add Attendance — {selectedWorker.name}</h3>
                <button onClick={() => setAddingRecord(false)} style={{ border: 'none', background: '#f3f4f6', width: 28, height: 28, borderRadius: 14, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Date<input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Punch In<input type="time" value={addPunchIn} onChange={e => setAddPunchIn(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Punch Out<input type="time" value={addPunchOut} onChange={e => setAddPunchOut(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Status<select value={addStatus} onChange={e => setAddStatus(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">Leave</option><option value="half-day">Half-day</option></select></label>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setAddingRecord(false)} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addRecord} disabled={addLoading} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 500 }}>{addLoading ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {editingRecord && (
          <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: 420, maxWidth: '90vw', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Edit Attendance — {editingRecord.date}</h3>
                <button onClick={closeEdit} style={{ border: 'none', background: '#f3f4f6', width: 28, height: 28, borderRadius: 14, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Punch In<input type="time" value={editPunchIn} onChange={e => setEditPunchIn(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Punch Out<input type="time" value={editPunchOut} onChange={e => setEditPunchOut(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>Status<select value={editStatus} onChange={e => setEditStatus(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">Leave</option><option value="half-day">Half-day</option></select></label>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => deleteRecord(editingRecord.id)} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeEdit} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveEdit} disabled={editLoading} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 500 }}>{editLoading ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Today's Attendance</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {punchedIn} punched in · {noPunch} no punch · {filtered.length} total
          </span>
          <input
            type="text"
            placeholder="Search name or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, width: 220 }}
          />
          <button
            onClick={load}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', fontSize: 13, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No workers found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Department</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Punch In</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Punch Out</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#374151', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const r = w.record;
                const isPending = r?.selfie_status === 'pending';
                const hasSelfieIn = !!r?.punch_in_selfie_url;
                const hasSelfieOut = !!r?.punch_out_selfie_url;
                return (
                  <tr
                    key={w.id}
                    onClick={() => setSelectedWorker(w)}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    title="Click to view detailed attendance"
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{w.name || 'Unknown'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                      {w.department || '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {r ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasSelfieIn ? (
                            <img
                              src={r.punch_in_selfie_url}
                              alt="selfie"
                              style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', cursor: 'pointer', border: isPending ? '2px solid #f59e0b' : '2px solid #10b981' }}
                              onClick={(e) => { e.stopPropagation(); setPreviewImg(r.punch_in_selfie_url); }}
                            />
                          ) : r.punch_in_time ? (
                            <span style={{ color: '#10b981', fontSize: 13 }}>📱 QR</span>
                          ) : null}
                          <span>{fmt(r.punch_in_time)}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>No punch</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {r?.punch_out_time ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasSelfieOut ? (
                            <img
                              src={r.punch_out_selfie_url}
                              alt="selfie"
                              style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', cursor: 'pointer', border: isPending ? '2px solid #f59e0b' : '2px solid #10b981' }}
                              onClick={(e) => { e.stopPropagation(); setPreviewImg(r.punch_out_selfie_url); }}
                            />
                          ) : (
                            <span style={{ color: '#10b981', fontSize: 13 }}>📱 QR</span>
                          )}
                          <span>{fmt(r.punch_out_time)}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {!r ? (
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500 }}>Absent</span>
                      ) : r.selfie_status === 'pending' ? (
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 500 }}>⏳ Pending</span>
                      ) : r.selfie_status === 'verified' ? (
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: 500 }}>✓ Verified</span>
                      ) : r.status === 'late' ? (
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 500 }}>Late {r.late_minutes}m</span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: 500 }}>{r.status || 'present'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => handleVerify(r.id)}
                            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#10b981', color: 'white', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
                          >
                            ✓ Verify
                          </button>
                          <button
                            onClick={() => handleReject(r.id)}
                            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#ef4444', color: 'white', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>View →</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {previewImg && (
        <div
          onClick={() => setPreviewImg(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer',
          }}
        >
          <img
            src={previewImg}
            alt="selfie preview"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }}
          />
          <div style={{ position: 'absolute', top: 16, right: 20, color: 'white', fontSize: 28, fontWeight: 300 }}>✕</div>
        </div>
      )}
    </div>
  );
}
