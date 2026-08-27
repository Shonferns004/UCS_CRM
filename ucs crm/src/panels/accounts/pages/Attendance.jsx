import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/auth';

export default function Attendance() {
  const [workers, setWorkers] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewImg, setPreviewImg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [workersData, attendanceData] = await Promise.all([
        apiGet('/workers?status=all'),
        apiGet('/attendance/today-all'),
      ]);
      setWorkers(workersData || []);
      setTodayRecords(attendanceData || []);
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
    } catch (e) {
      alert(e.message || 'Failed to verify');
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Reject selfie? This will delete the entire attendance record.')) return;
    try {
      await apiPut(`/attendance/${id}/verify-selfie`, { status: 'rejected' });
      setTodayRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(e.message || 'Failed to reject');
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
    if (!search) return true;
    const name = r.name || '';
    const dept = r.department || '';
    return name.toLowerCase().includes(search.toLowerCase()) || dept.toLowerCase().includes(search.toLowerCase());
  });

  const punchedIn = filtered.filter(r => r.hasPunch).length;
  const noPunch = filtered.filter(r => !r.hasPunch).length;

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
                  <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
                              onClick={() => setPreviewImg(r.punch_in_selfie_url)}
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
                              onClick={() => setPreviewImg(r.punch_out_selfie_url)}
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
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
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
                        <span style={{ color: '#d1d5db' }}>—</span>
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
