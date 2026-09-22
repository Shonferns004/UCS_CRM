import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/auth';
import { deptLabel } from '../../../lib/labels';
import * as XLSX from 'xlsx-js-style';

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function getIstDateStr(date) {
  const ist = new Date(date.getTime() + IST_OFFSET);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtTime(iso) {
  if (!iso) return <span style={{ color: '#d1d5db' }}>&mdash;</span>;
  const d = new Date(new Date(iso).getTime() + IST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return <span>{hh}:{mm}</span>;
}

function istTimeStr(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function Attendance() {
  const [workers, setWorkers] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [previewImg, setPreviewImg] = useState(null);

  // export range (defaults to this month's start -> today, IST)
  const [exportFrom, setExportFrom] = useState(() => {
    const ist = new Date(Date.now() + IST_OFFSET);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
  const [exportTo, setExportTo] = useState(() => getIstDateStr(new Date()));

  // detailed drill-down (read-only)
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerMonth, setWorkerMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

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

  const handleExportSheet = () => {
    try {
      if (!exportFrom || !exportTo) { alert('Please select both a From and To date.'); return; }
      if (exportTo < exportFrom) { alert('The "To" date cannot be before the "From" date.'); return; }

      const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = [];
      const cur = new Date(exportFrom + 'T00:00:00+05:30');
      const stop = new Date(exportTo + 'T00:00:00+05:30');
      while (cur <= stop) {
        days.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      if (days.length === 0) { alert('The date range is empty.'); return; }
      const todayStr = getIstDateStr(new Date());

      const fmtFrom = new Date(exportFrom + 'T12:00:00Z');
      const fmtTo = new Date(exportTo + 'T12:00:00Z');
      const sameMonth = fmtFrom.getUTCMonth() === fmtTo.getUTCMonth() && fmtFrom.getUTCFullYear() === fmtTo.getUTCFullYear();
      const monthLabel = fmtFrom.toLocaleString('en-US', { month: 'long' });
      const rangeLabel = sameMonth ? `${monthLabel} ${fmtFrom.getUTCFullYear()}` : `${exportFrom} to ${exportTo}`;

      const recCache = {};
      allRecords.forEach(r => {
        const date = r.date || (r.punch_in_time ? getIstDateStr(new Date(r.punch_in_time)) : '');
        if (!date) return;
        recCache[`${r.worker_id}|${date}`] = r;
      });

      const activeWorkers = workers
        .filter(w => String(w.employment_status || '').toLowerCase().trim() !== 'absconded')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const totalCols = 3 + days.length + 4;
      const wsData = [
        ['No. ', 'Week ', rangeLabel, ...days.map(d => WEEKDAYS[new Date(d + 'T12:00:00Z').getUTCDay()]), 'Present', 'Absent', 'Sunday', 'Half Day'],
        ['Sr.', 'Name of the Staff', 'Day ', ...days.map(d => parseInt(d.slice(8), 10)), '', '', '', ''],
      ];

      activeWorkers.forEach((w, idx) => {
        const joinDate = (w.created_at || '').slice(0, 10);
        let present = 0, absent = 0, sunday = 0, halfDay = 0;
        const inCells = [];
        const outCells = [];
        for (const ds of days) {
          const dow = new Date(ds + 'T12:00:00Z').getUTCDay();
          if (ds > todayStr) { inCells.push(''); outCells.push(''); continue; }
          if (joinDate && ds < joinDate) { inCells.push(''); outCells.push(''); continue; }
          if (dow === 0) { sunday++; inCells.push(''); outCells.push(''); continue; }
          const rec = recCache[`${w.id}|${ds}`];
          if (!rec) { absent++; inCells.push('A'); outCells.push(''); continue; }
          if (rec.status === 'present' || rec.status === 'late') {
            present++;
            inCells.push(istTimeStr(rec.punch_in_time) || 'P');
            outCells.push(istTimeStr(rec.punch_out_time) || '');
          } else if (rec.status === 'half-day') {
            halfDay++;
            inCells.push(istTimeStr(rec.punch_in_time) || 'HD');
            outCells.push('HD');
          } else if (rec.status === 'leave') {
            absent++;
            inCells.push('L'); outCells.push('');
          } else {
            absent++;
            inCells.push('A'); outCells.push('');
          }
        }
        wsData.push([idx + 1, w.name || `Worker ${w.id}`, 'In ', ...inCells, present, absent, sunday, halfDay]);
        wsData.push(['', '', 'Out', ...outCells, '', '', '', '']);
        wsData.push(Array(totalCols).fill(''));
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 7 }, ...days.map(() => ({ wch: 8 })), { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 9 }];

      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < totalCols; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFE8E8E8' } }, alignment: { horizontal: 'center' } };
        }
      }
      for (let i = 2; i < wsData.length; i++) {
        const row = wsData[i];
        const rowNum = i;
        if (row.every(v => v === '' || v == null)) {
          for (let c = 0; c < totalCols; c++) {
            ws[XLSX.utils.encode_cell({ r: rowNum, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: 'FF111111' } } } };
          }
          continue;
        }
        const nameCell = ws[XLSX.utils.encode_cell({ r: rowNum, c: 1 })];
        if (nameCell) nameCell.s = { font: { bold: true } };
        for (let c = 0; c < days.length; c++) {
          const v = row[3 + c];
          const addr = XLSX.utils.encode_cell({ r: rowNum, c: 3 + c });
          const cell = ws[addr];
          if (!cell) continue;
          if (v === 'A') cell.s = { fill: { fgColor: { rgb: 'FFFDE2E1' } }, font: { bold: true, color: { rgb: 'FFB91C1C' } } };
          else if (v === 'L') cell.s = { fill: { fgColor: { rgb: 'FFFEF3C7' } }, font: { bold: true, color: { rgb: 'FFB45309' } } };
          else if (v === 'HD') cell.s = { fill: { fgColor: { rgb: 'FFFFEDD5' } }, font: { bold: true, color: { rgb: 'FFC2410C' } } };
        }
        for (let c = totalCols - 4; c < totalCols; c++) {
          const addr = XLSX.utils.encode_cell({ r: rowNum, c });
          if (ws[addr]) ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFE8F5E9' } } };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `attendance-sheet-${exportFrom}_to_${exportTo}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  };

  const fmt = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

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
    const isAbs = String(r.employment_status || '').toLowerCase().trim() === 'absconded';
    if (statusFilter === 'active' && isAbs) return false;
    if (statusFilter === 'absconded' && !isAbs) return false;
    if (attendanceFilter !== 'all') {
      const st = r.record?.status || '';
      if (attendanceFilter === 'present' && (!r.hasPunch || st === 'half-day' || st === 'leave')) return false;
      else if (attendanceFilter === 'halfday' && st !== 'half-day') return false;
      else if (attendanceFilter === 'absent' && r.hasPunch) return false;
    }
    if (!search) return true;
    const name = r.name || '';
    const dept = r.department || '';
    return name.toLowerCase().includes(search.toLowerCase()) || dept.toLowerCase().includes(search.toLowerCase());
  });

  const punchedIn = filtered.filter(r => r.hasPunch).length;
  const noPunch = filtered.filter(r => !r.hasPunch).length;

  // detailed worker attendance for selected month (read-only) — hide future dates, most recent first
  const workerRecords = (() => {
    if (!selectedWorker) return [];
    const recs = allRecords.filter(a => a.worker_id === selectedWorker.id);
    const [y, m] = workerMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayStr = getIstDateStr(new Date());
    const filled = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${workerMonth}-${String(d).padStart(2, '0')}`;
      if (ds > todayStr) continue;
      const existing = recs.find(r => {
        const rd = r.date || (r.punch_in_time ? getIstDateStr(new Date(r.punch_in_time)) : '');
        return rd === ds;
      });
      filled.push(existing || { id: null, date: ds, status: 'absent', punch_in_time: null, punch_out_time: null, late_minutes: 0, worker_id: selectedWorker.id });
    }
    return filled.reverse();
  })();

  if (selectedWorker) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setSelectedWorker(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13 }}>← Back</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedWorker.name}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{deptLabel(selectedWorker.department) || '—'} · {selectedWorker.login_id || selectedWorker.email || ''}</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={workerMonth} onChange={e => setWorkerMonth(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
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
              </tr>
            </thead>
            <tbody>
              {workerRecords.map(r => (
                <tr key={r.date} style={{ borderBottom: '1px solid #f3f4f6', background: r.status === 'absent' ? '#fef2f2' : r.status === 'late' ? '#fef3c7' : r.id ? 'white' : '#f9fafb' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.date}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtTime(r.punch_in_time)}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtTime(r.punch_out_time)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.id ? (
                      r.status === 'present' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontSize: 12 }}>Present</span>
                      : r.status === 'late' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 12 }}>Late {r.late_minutes ? `${r.late_minutes}m` : ''}</span>
                      : r.status === 'half-day' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#ffedd5', color: '#9a3412', fontSize: 12 }}>Half-day</span>
                      : r.status === 'leave' ? <span style={{ padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontSize: 12 }}>Leave</span>
                      : <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 12 }}>{r.status}</span>
                    ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>Absent</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, background: 'white' }}>
            <option value="active">Active</option>
            <option value="absconded">Absconded</option>
          </select>
          <select value={attendanceFilter} onChange={e => setAttendanceFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, background: 'white' }}>
            <option value="all">All</option>
            <option value="present">Present</option>
            <option value="halfday">Half Day</option>
            <option value="absent">Absent</option>
          </select>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f766e' }}>Export Monthly Attendance Sheet</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
          From
          <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
          To
          <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
        </label>
        <button
          onClick={handleExportSheet}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#0f766e', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          Export Sheet
        </button>
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
                      {deptLabel(w.department) || '—'}
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
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'pointer',
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
