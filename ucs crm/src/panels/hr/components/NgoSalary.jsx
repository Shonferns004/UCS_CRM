import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useHR } from '../store';
import { useSalaryPrivacy } from '../../../context/SalaryPrivacyContext';
import { Dropdown, SkeletonRows } from './ui';
import { api } from '../../../api/auth';
import * as XLSX from 'xlsx';

const monthNow = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const fmtMonth = (m) => {
  if (!m) return '—';
  const p = String(m).slice(0, 10).split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(p[1], 10) - 1]} ${p[0]}`;
};

const PAY_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled'];

const PAY_STYLES = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  processing: { bg: '#dbeafe', color: '#1e40af' },
  paid: { bg: '#d1fae5', color: '#065f46' },
  failed: { bg: '#fee2e2', color: '#991b1b' },
  cancelled: { bg: '#f3f4f6', color: '#374151' },
  unpaid: { bg: '#f3f4f6', color: '#6b7280' },
};

function StatusPill({ status }) {
  const s = PAY_STYLES[status] || PAY_STYLES.unpaid;
  return (
    <span className="pill" style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
      {status || 'unpaid'}
    </span>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="mc" style={{ justifyContent: 'center' }}>
      <div className="mc-top">
        <span className="mc-icon" style={{ color: color || 'var(--sage)' }}>{value}</span>
      </div>
      <div className="mc-label">{label}</div>
      {sub && <div className="mc-sub">{sub}</div>}
    </div>
  );
}

/* ─── NGO Management ─── */
function NgoManagementTab({ ngos, onChanged, onAddNgo, onEditNgo }) {
  const { formatSalary } = useSalaryPrivacy();
  const [modal, setModal] = useState(null);

  return (
    <div className="card">
      <div className="card-head">
        <h3>NGO Management</h3>
      </div>
      <table>
        <thead>
          <tr><th>NGO</th><th>Code</th><th>Volunteers</th><th>Allocation %</th><th>Salary Employees</th><th>Salary Amount</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {ngos.map(n => (
            <tr key={n.id}>
              <td style={{ fontWeight: 600 }}>{n.name}</td>
              <td><code style={{ background: 'var(--line)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{n.code}</code></td>
              <td>{n.volunteers || 0}</td>
              <td>{n.allocation_percentage != null ? `${parseFloat(n.allocation_percentage)}%` : '—'}</td>
              <td>{n.salary_employees || 0}</td>
              <td>{formatSalary(n.salary_amount)}</td>
              <td>
                <span className="pill" style={{
                  background: n.is_active ? '#d1fae5' : '#f3f4f6',
                  color: n.is_active ? '#065f46' : '#374151',
                  padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                }}>{n.is_active ? 'Active' : 'Inactive'}</span>
              </td>              <td style={{ textAlign: 'right' }}>
                <button className="btn btn-sm" onClick={() => setModal({ mode: 'edit', id: n.id, name: n.name, code: n.code })}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{modal.mode === 'add' ? 'Add NGO' : 'Edit NGO'}</h3>
              <button className="btn btn-sm" onClick={() => setModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="field"><span>Name</span>
                <input value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} placeholder="e.g. Being Sevak Charitable Trust" />
              </label>
              <label className="field"><span>Code</span>
                <input value={modal.code} onChange={e => setModal({ ...modal, code: e.target.value.toUpperCase() })} placeholder="e.g. BSCT" maxLength={10} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!modal.name.trim() || !modal.code.trim()} onClick={async () => {
                try {
                  if (modal.mode === 'add') await onAddNgo({ name: modal.name.trim(), code: modal.code.trim() });
                  else await onEditNgo(modal.id, { name: modal.name.trim(), code: modal.code.trim() });
                  setModal(null);
                  onChanged();
                } catch (e) { alert(e.message); }
              }}>{modal.mode === 'add' ? 'Add' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Allocation Settings ─── */
function SettingsTab({ settings, ngos, onSave }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState('auto');
  const msgTimer = useRef(null);

  useEffect(() => { return () => { if (msgTimer.current) clearTimeout(msgTimer.current); }; }, []);

  const showMsg = (text) => {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setMsg(text);
    msgTimer.current = setTimeout(() => { setMsg(''); msgTimer.current = null; }, 1000);
  };

  useEffect(() => {
    const savedRows = settings.map(s => ({ ngo_id: s.ngo_id, ngo_name: s.ngos?.name || s.ngo_name || '', code: s.ngos?.code || '', allocation_percentage: parseFloat(s.allocation_percentage || 0) }));
    const savedIds = new Set(savedRows.map(r => r.ngo_id));
    const missing = (ngos || [])
      .filter(n => !savedIds.has(n.id))
      .map(n => ({ ngo_id: n.id, ngo_name: n.name || '', code: n.code || '', allocation_percentage: 0 }));
    setRows([...savedRows, ...missing]);
  }, [settings, ngos]);

  const sum = rows.reduce((s, r) => s + (parseFloat(r.allocation_percentage) || 0), 0);
  const remaining = Math.round((100 - sum) * 100) / 100;
  const canSave = rows.length > 0 && Math.abs(remaining) <= 0.5;

  const setPctAuto = (id, val) => {
    const newVal = Math.max(0, parseFloat(val) || 0);
    const oldRow = rows.find(r => r.ngo_id === id);
    const oldVal = oldRow ? parseFloat(oldRow.allocation_percentage) || 0 : 0;
    const diff = newVal - oldVal;
    if (Math.abs(diff) < 0.001) {
      setRows(rows.map(r => r.ngo_id === id ? { ...r, allocation_percentage: newVal } : r));
      return;
    }
    const others = rows.filter(r => r.ngo_id !== id);
    const othersTotal = others.reduce((s, r) => s + (parseFloat(r.allocation_percentage) || 0), 0);
    const adjusted = rows.map(r => {
      if (r.ngo_id === id) return { ...r, allocation_percentage: newVal };
      const cur = parseFloat(r.allocation_percentage) || 0;
      if (othersTotal === 0) {
        const share = diff / others.length;
        return { ...r, allocation_percentage: Math.max(0, Math.round((cur - share) * 100) / 100) };
      }
      const portion = cur / othersTotal;
      const adj = cur - diff * portion;
      return { ...r, allocation_percentage: Math.max(0, Math.round(adj * 100) / 100) };
    });
    const adjSum = adjusted.reduce((s, r) => s + (parseFloat(r.allocation_percentage) || 0), 0);
    const drift = Math.round((100 - adjSum) * 100) / 100;
    if (Math.abs(drift) > 0.001 && others.length > 0) {
      const lastIdx = adjusted.findIndex(r => r.ngo_id !== id);
      const lastCur = parseFloat(adjusted[lastIdx].allocation_percentage) || 0;
      adjusted[lastIdx] = { ...adjusted[lastIdx], allocation_percentage: Math.max(0, Math.round((lastCur + drift) * 100) / 100) };
    }
    setRows(adjusted);
  };

  const setPctCustom = (id, val) => {
    setRows(rows.map(r => r.ngo_id === id ? { ...r, allocation_percentage: Math.max(0, parseFloat(val) || 0) } : r));
  };

  const setPct = mode === 'auto' ? setPctAuto : setPctCustom;

  const toggleStyle = { display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', fontSize: 13, fontWeight: 600 };
  const toggleBtn = (active) => ({ padding: '5px 14px', border: 'none', cursor: 'pointer', background: active ? 'var(--sage)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)', fontWeight: 600, fontSize: 13 });

  return (
    <div className="card">
      <div className="card-head">
        <h3>Allocation Settings</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="sub" style={{ fontSize: 12 }}>
            Remaining: <strong style={{ color: Math.abs(remaining) <= 0.5 ? 'var(--sage)' : 'var(--danger)' }}>{remaining}%</strong>
          </span>
          <div style={toggleStyle}>
            <button style={toggleBtn(mode === 'auto')} onClick={() => setMode('auto')}>Auto</button>
            <button style={toggleBtn(mode === 'customize')} onClick={() => setMode('customize')}>Customize</button>
          </div>
        </div>
      </div>
      <div className="card-pad">
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
          {mode === 'auto'
            ? 'Auto mode: changing one NGO adjusts the others proportionally to keep the total at 100%.'
            : 'Customize mode: set each NGO % manually. You must ensure the total equals 100% to save.'}
        </p>
        {rows.length === 0 && <div className="empty-state"><p>No settings yet — saving will create them.</p></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          {rows.map(r => (
            <div key={r.ngo_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{r.ngo_name} <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>({r.code})</span></span>
              <input type="number" min="0" max="100" step="0.01" value={r.allocation_percentage}
                onChange={e => setPct(r.ngo_id, e.target.value)}
                style={{ width: 90, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, textAlign: 'right' }} />
              <span style={{ width: 34, color: 'var(--ink-soft)', fontSize: 13 }}>%</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={!canSave || saving} onClick={async () => {
            setSaving(true); setMsg('');
            try { await onSave(rows.map(r => ({ ngo_id: r.ngo_id, allocation_percentage: r.allocation_percentage }))); showMsg('Saved'); }
            catch (e) { setMsg(e.message); }
            setSaving(false);
          }}>{saving ? '...' : 'Save Settings'}</button>
          {msg && <span style={{ fontSize: 13, color: msg === 'Saved' ? 'var(--sage)' : 'var(--danger)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── NGO Salary Report ─── */
function ReportTab({ month, setMonth, ngos, workers }) {
  const { formatSalary, promptUnlock } = useSalaryPrivacy();
  const { fetchNgoSalaryReport, fetchNgoSalaryReportFallback, fetchNgoReport, generateAllSalaryAllocations } = useHR();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ngoId, setNgoId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    generateAllSalaryAllocations(month)
      .catch(e => console.warn('[NGO Salary Report] generate-all unavailable:', e.message))
      .then(() => fetchNgoSalaryReport({ month, ngo_id: ngoId || undefined, worker_id: workerId || undefined, status: status || undefined }))
      .then(data => setRows((data && data.rows) || []))
      .catch(e => {
        console.error('[NGO Salary Report] load failed:', e.message);
        return fetchNgoSalaryReportFallback({ month, ngo_id: ngoId || undefined, worker_id: workerId || undefined, status: status || undefined })
          .then(rows => setRows(rows || []))
          .catch(e2 => { console.error('[NGO Salary Report] fallback failed:', e2.message); setRows([]); });
      })
      .finally(() => setLoading(false));
  }, [month, ngoId, workerId, status, refresh]);

  const totalAmount = rows.reduce((s, r) => s + parseFloat(r.allocation_amount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + parseFloat(r.paid_amount || 0), 0);

  const exportExcel = () => {
    promptUnlock(() => {
      const headers = ['Employee', 'Emp ID', 'Department', 'NGO', 'Month', 'Allocation %', 'Allocation Amount', 'Paid Amount', 'Payment Status'];
      const wsData = [headers, ...rows.map(r => [
        r.worker_name, r.employee_id, r.department, r.ngo_name, fmtMonth(r.salary_month),
        r.allocation_percentage, r.allocation_amount, r.paid_amount, r.payment_status,
      ])];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'NGO Salary');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `ngo-salary-${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  const openDetail = async (r) => {
    setDetail(r);
    setDetailLoading(true);
    try {
      const d = await fetchNgoReport(r.ngo_id, month);
      setDetail({ ...r, detail: d });
    } catch (e) { setDetail({ ...r, detail: null }); }
    setDetailLoading(false);
  };

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>NGO Salary Report</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }} />
          <Dropdown value={ngoId} onChange={e => setNgoId(e.target.value)} options={[{ value: '', label: 'All NGOs' }, ...ngos.map(n => ({ value: n.id, label: n.name }))]} />
          <Dropdown value={workerId} onChange={e => setWorkerId(e.target.value)} options={[{ value: '', label: 'All employees' }, ...workers.map(w => ({ value: w.id, label: w.name }))]} />
          <Dropdown value={status} onChange={e => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...PAY_STATUSES.map(s => ({ value: s, label: s })), { value: 'unpaid', label: 'unpaid' }]} />
          <button className="btn btn-outline btn-sm" onClick={exportExcel} disabled={rows.length === 0}>Export Excel</button>
          <button className="btn btn-outline btn-sm" onClick={() => setRefresh(r => r + 1)}>Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, padding: '8px 16px', fontSize: 13 }}>
        <span>Total allocation: <strong>{formatSalary(totalAmount)}</strong></span>
        <span>Total paid: <strong style={{ color: 'var(--sage)' }}>{formatSalary(totalPaid)}</strong></span>
        <span>Rows: <strong>{rows.length}</strong></span>
      </div>
      <table>
        <thead>
          <tr><th>Employee</th><th>Emp ID</th><th>NGO</th><th>Allocation %</th><th>Amount</th><th>Paid</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={6} widths={[130, 70, 90, 70, 80, 80, 80, 50]} />
          ) : rows.length === 0 ? (
            <tr><td colSpan={8}><div className="empty-state"><p>No salary allocations for this month.</p></div></td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.worker_name}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{r.employee_id || '—'}</td>
                <td>{r.ngo_name}</td>
                <td>{parseFloat(r.allocation_percentage)}%</td>
                <td style={{ fontWeight: 600 }}>{formatSalary(r.allocation_amount)}</td>
                <td>{formatSalary(r.paid_amount)}</td>
                <td><StatusPill status={r.payment_status} /></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm" onClick={() => openDetail(r)}>Detail</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>NGO Detail — {detail.ngo_name}</h3>
              <button className="btn btn-sm" onClick={() => setDetail(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {detailLoading ? <div className="empty-state"><p>Loading...</p></div> : !detail.detail ? (
                <div className="empty-state"><p>No data</p></div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span>Employees: <strong>{detail.detail.total_employees}</strong></span>
                    <span>Total: <strong>{formatSalary(detail.detail.total_amount)}</strong></span>
                    <span>Paid: <strong style={{ color: 'var(--sage)' }}>{formatSalary(detail.detail.paid_amount)}</strong></span>
                    <span>Pending: <strong style={{ color: 'var(--danger)' }}>{formatSalary(detail.detail.pending_amount)}</strong></span>
                  </div>
                  <table>
                    <thead><tr><th>Employee</th><th>Emp ID</th><th>Allocation %</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {(detail.detail.rows || []).map((d, i) => (
                        <tr key={i}>
                          <td>{d.worker_name}</td>
                          <td>{d.employee_id || '—'}</td>
                          <td>{parseFloat(d.allocation_percentage)}%</td>
                          <td>{formatSalary(d.allocation_amount)}</td>
                          <td><StatusPill status={d.payment_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Payments History ─── */
function PaymentsTab({ month, ngos, workers }) {
  const { fetchPayments, createPayment, updatePaymentStatus } = useHR();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ worker_id: '', ngo_id: '', salary_month: monthNow(), amount: '', payment_reference: '', payment_status: 'pending' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPayments({ month, status: statusFilter || undefined })
      .then(setPayments)
      .catch(e => { console.error('Error:', e.message); setPayments([]); })
      .finally(() => setLoading(false));
  }, [month, statusFilter, refresh]);

  const { formatSalary } = useSalaryPrivacy();
  const paid = payments.filter(p => p.payment_status === 'paid' || p.payment_status === 'processing').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Payments History</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Dropdown value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...PAY_STATUSES.map(s => ({ value: s, label: s }))]} />
          <button className="btn btn-outline btn-sm" onClick={() => setRefresh(r => r + 1)}>Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Record Payment</button>
        </div>
      </div>
      <div style={{ padding: '8px 16px', fontSize: 13 }}>
        Paid/Processing: <strong style={{ color: 'var(--sage)' }}>{formatSalary(paid)}</strong> across {payments.length} records
      </div>
      <table>
        <thead>
          <tr><th>Employee</th><th>NGO</th><th>Amount</th><th>Month</th><th>Status</th><th>Date</th><th>Reference</th></tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={6} widths={[130, 90, 80, 80, 90, 90, 100]} />
          ) : payments.length === 0 ? (
            <tr><td colSpan={7}><div className="empty-state"><p>No payment records.</p></div></td></tr>
          ) : (
            payments.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.workers?.name || 'Unknown'}</td>
                <td>{p.ngos?.name || '—'}</td>
                <td style={{ fontWeight: 600 }}>{formatSalary(p.amount)}</td>
                <td>{fmtMonth(p.salary_month)}</td>
                <td>
                  <Dropdown value={p.payment_status} onChange={e => updatePaymentStatus(p.id, e.target.value).then(() => setRefresh(r => r + 1)).catch(err => alert(err.message))}
                    options={PAY_STATUSES.map(s => ({ value: s, label: s }))} renderValue={(sel) => <StatusPill status={p.payment_status} />} />
                </td>
                <td style={{ color: 'var(--ink-soft)' }}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                <td style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{p.payment_reference || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Record Payment</h3>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="field"><span>Employee</span>
                <Dropdown value={form.worker_id} onChange={e => setForm({ ...form, worker_id: e.target.value })} options={workers.map(w => ({ value: w.id, label: w.name }))} searchable />
              </label>
              <label className="field"><span>NGO</span>
                <Dropdown value={form.ngo_id} onChange={e => setForm({ ...form, ngo_id: e.target.value })} options={ngos.map(n => ({ value: n.id, label: n.name }))} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="field" style={{ flex: 1 }}><span>Month</span>
                  <input type="month" value={form.salary_month} onChange={e => setForm({ ...form, salary_month: e.target.value })} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '7px 8px', fontSize: 13 }} />
                </label>
                <label className="field" style={{ flex: 1 }}><span>Amount (₹)</span>
                  <input type="number" min="1" step="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '7px 8px', fontSize: 13 }} />
                </label>
              </div>
              <label className="field"><span>Reference (optional)</span>
                <input value={form.payment_reference} onChange={e => setForm({ ...form, payment_reference: e.target.value })} placeholder="e.g. UTR no / cheque no" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '7px 8px', fontSize: 13 }} />
              </label>
              <label className="field"><span>Status</span>
                <Dropdown value={form.payment_status} onChange={e => setForm({ ...form, payment_status: e.target.value })} options={PAY_STATUSES.map(s => ({ value: s, label: s }))} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !form.worker_id || !form.ngo_id || !(parseFloat(form.amount) > 0) || !form.salary_month} onClick={async () => {
                setSaving(true);
                try {
                  await createPayment({ ...form, amount: parseFloat(form.amount) });
                  setShowCreate(false);
                  setForm({ worker_id: '', ngo_id: '', salary_month: monthNow(), amount: '', payment_reference: '', payment_status: 'pending' });
                  setRefresh(r => r + 1);
                } catch (e) { alert(e.message); }
                setSaving(false);
              }}>{saving ? '...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main ─── */
export default function NgoSalary() {
  const { isSalaryUnlocked, promptUnlock, lockSalary, formatSalary } = useSalaryPrivacy();
  const { fetchNgoSalarySummary, fetchNgoAllocationSettings, saveNgoAllocationSettings, fetchNgoSummaryList, fetchWorkers } = useHR();
  const [tab, setTab] = useState('management');
  const [summary, setSummary] = useState(null);
  const [ngos, setNgos] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [settings, setSettings] = useState([]);
  const [month, setMonth] = useState(monthNow());

  const load = useCallback(async () => {
    fetchNgoSalarySummary().then(setSummary).catch(e => console.error('Error:', e.message));
    fetchNgoSummaryList().then(setNgos).catch(e => console.error('Error:', e.message));
    fetchWorkers('all').then(setWorkers).catch(e => console.error('Error:', e.message));
    fetchNgoAllocationSettings().then(setSettings).catch(e => console.error('Error:', e.message));
  }, [fetchNgoSalarySummary, fetchNgoSummaryList, fetchWorkers, fetchNgoAllocationSettings]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Confidential Lock Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        marginBottom: 16, padding: '10px 16px', borderRadius: 8,
        background: isSalaryUnlocked ? '#f0fdf4' : '#fffbeb',
        border: `1px solid ${isSalaryUnlocked ? '#bbf7d0' : '#fef08a'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ fontSize: 16 }}>{isSalaryUnlocked ? '🔓' : '🔒'}</span>
          <div>
            <span style={{ fontWeight: 700, color: isSalaryUnlocked ? '#166534' : '#92400e' }}>
              {isSalaryUnlocked ? 'Salary Amounts Unlocked' : 'Confidential Salaries Hidden (XXXX)'}
            </span>
            <div style={{ fontSize: 11, color: isSalaryUnlocked ? '#15803d' : '#b45309' }}>
              {isSalaryUnlocked ? 'All salary allocations and payment figures are currently visible.' : 'Salary details are confidential. Unlock to view or export.'}
            </div>
          </div>
        </div>
        {isSalaryUnlocked ? (
          <button className="btn btn-sm btn-outline" onClick={lockSalary} style={{ fontSize: 11, padding: '4px 12px', background: '#fff' }}>
            🔒 Hide Salaries
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => promptUnlock()} style={{ fontSize: 11, padding: '5px 14px', background: 'var(--sage)', color: '#fff', border: 'none', fontWeight: 600 }}>
            👁️ View Salaries
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Active Employees" value={summary?.employees != null ? Number(summary.employees).toLocaleString('en-IN') : '—'} sub="across all NGOs" />
        <SummaryCard label="NGOs" value={summary?.ngos ?? '—'} sub="active entities" />
        <SummaryCard label="Monthly Salary" value={summary?.total_salary != null ? formatSalary(summary.total_salary) : '—'} sub="all employees" color="var(--gold)" />
        <SummaryCard label="Paid (this month)" value={summary?.paid != null ? formatSalary(summary.paid) : '—'} sub="paid & processing" color="var(--sage)" />
        <SummaryCard label="Pending (this month)" value={summary?.pending != null ? formatSalary(summary.pending) : '—'} sub="awaiting payment" color="var(--danger)" />
      </div>

      <div className="tabs">
        <button className={'tab' + (tab === 'management' ? ' active' : '')} onClick={() => setTab('management')}>NGO Management</button>
        <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>Allocation Settings</button>
        <button className={'tab' + (tab === 'report' ? ' active' : '')} onClick={() => setTab('report')}>NGO Salary Report</button>
        <button className={'tab' + (tab === 'payments' ? ' active' : '')} onClick={() => setTab('payments')}>Payments History</button>
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'management' && (
          <NgoManagementTab ngos={ngos} onChanged={load}
            onAddNgo={(d) => api('/ngos', { method: 'POST', body: JSON.stringify(d), _prefix: 'ucs' })}
            onEditNgo={(id, d) => api('/ngos/' + id, { method: 'PUT', body: JSON.stringify(d), _prefix: 'ucs' })} />
        )}
        {tab === 'settings' && <SettingsTab settings={settings} ngos={ngos} onSave={saveNgoAllocationSettings} />}
        {tab === 'report' && <ReportTab month={month} setMonth={setMonth} ngos={ngos} workers={workers} />}
        {tab === 'payments' && <PaymentsTab month={month} ngos={ngos} workers={workers} />}
      </div>
    </div>
  );
}
