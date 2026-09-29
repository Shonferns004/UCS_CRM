import { useEffect, useMemo, useState } from 'react';
import { useHR } from '../store';
import { Check, X } from '../icons';
import { SkeletonRows } from './ui';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LIVE_STATUSES = ['approved', 'active', 'overdue'];

// Salary is processed between the 10th and 15th, so a month's deductions must be
// recorded before the 10th of the following month. Mirrors PAYROLL_PAYMENT_DAY
// in backend/src/utils/loanTerm.js — keep the two in step.
const PAYROLL_DUE_DAY = 10;

// The date a salary month is disbursed: the 10th of the month after it.
function payrollDueDate(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return null;
  return new Date(y, m, PAYROLL_DUE_DAY);
}

function fmtShortDate(d) {
  if (!d || isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const raw = String(d);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00+05:30' : raw);
  if (isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

function fmtMonth(d) {
  if (!d) return '';
  const m = String(d).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
}

// '2026-09' -> 'Sep 2026'. Month inputs and DATE columns disagree about format
// ('2026-09' vs '2026-09-01'), so everything goes through this before display.
function monthLabel(v) {
  const m = fmtMonth(v);
  if (!m) return '';
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
}

function monthEndOf(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return '';
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function addMonths(ym, n) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(startYm, endYm) {
  if (!startYm || !endYm) return 0;
  const [y1, m1] = startYm.split('-').map(Number);
  const [y2, m2] = endYm.split('-').map(Number);
  if (endYm < startYm) return 0;
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

function fmtAmount(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN');
}

function num(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function StatusBadge({ status }) {
  const map = {
    pending: { cls: 'pill-gold', lbl: 'Pending' },
    approved: { cls: 'pill-green', lbl: 'Approved' },
    active: { cls: 'pill-green', lbl: 'Active' },
    rejected: { cls: 'pill-danger', lbl: 'Rejected' },
    closed: { cls: 'pill-gray', lbl: 'Closed' },
    // Term has fully elapsed with a balance still outstanding. No longer deducted
    // from salary, but the money is still owed — needs an accounts decision.
    overdue: { cls: 'pill-danger', lbl: 'Overdue' },
  };
  const { cls, lbl } = map[status] || { cls: 'pill-gray', lbl: status };
  return <span className={`pill ${cls}`}>{lbl}</span>;
}

const inputStyle = { width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '6px 9px', fontSize: 13, background: '#fff' };
const labelStyle = { fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', display: 'block', marginBottom: 4 };
const hintStyle = { fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.45 };

function Field({ label, hint, error, children, style }) {
  return (
    <div style={style}>
      {label && <span style={labelStyle}>{label}</span>}
      {children}
      {error
        ? <div style={{ ...hintStyle, color: 'var(--danger)' }}>{error}</div>
        : hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

function MoneyInput({ value, onChange, style, ...rest }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-soft)', pointerEvents: 'none' }}>₹</span>
      <input type="number" min="0" step="1" value={value} onChange={onChange}
        style={{ ...inputStyle, paddingLeft: 22, ...style }} {...rest} />
    </div>
  );
}

function StatTile({ label, value, tone, sub }) {
  return (
    <div style={{
      flex: '1 1 150px', minWidth: 150, padding: '12px 14px',
      border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
      background: tone === 'danger' ? 'var(--danger-soft, #fdf1f0)' : tone === 'gold' ? 'var(--sage-soft, #f4f7f1)' : '#fff',
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, color: tone === 'danger' ? 'var(--danger)' : 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Loans() {
  const { fetchLoans, fetchWorkers, decideLoan, settleLoans, updateLoanApi, deleteLoanApi, createLoanApi } = useHR();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [toast, setToast] = useState(null);

  const [approving, setApproving] = useState(null);
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [hrRemark, setHrRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [settleMonth, setSettleMonth] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });
  const [settleBusy, setSettleBusy] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editBusy, setEditBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    worker_id: '', type: 'loan', total_amount: '', monthly_deduction: '',
    reason: '', start_month: '', end_month: '', recurring: false,
  });
  const [createErrors, setCreateErrors] = useState({});
  const [createBusy, setCreateBusy] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerOpen, setWorkerOpen] = useState(false);

  const [detailId, setDetailId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('applied');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let cancelled = false;
    fetchLoans().then(d => { if (!cancelled) setLoans(d); }).catch(e => console.error('API error:', e.message)).finally(() => { if (!cancelled) setLoading(false); });
    fetchWorkers('active').then(d => { if (!cancelled) setWorkers(Array.isArray(d) ? d : []); }).catch(e => console.error('API error:', e.message));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = () => fetchLoans().then(setLoans).catch(e => console.error('API error:', e.message));
  const notify = (message, tone = 'ok') => setToast({ message, tone });

  const openCreate = () => {
    const d = new Date();
    setCreateForm({
      worker_id: '', type: 'loan', total_amount: '', monthly_deduction: '',
      reason: '', start_month: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      end_month: '', recurring: false,
    });
    setCreateErrors({});
    setWorkerSearch('');
    setWorkerOpen(false);
    setShowCreate(true);
  };

  // A recurring commitment never amortises, so it must not be forced into the
  // "instalment cannot exceed total" rule — rent of 48,000 a month against a
  // 48,000 balance is the normal case, not a mistake.
  const applyPreset = (months) => {
    const total = num(createForm.total_amount);
    if (!(total > 0)) return;
    const per = Math.ceil(total / months);
    setCreateForm(f => ({
      ...f,
      monthly_deduction: String(per),
      // An explicit preset is a deliberate choice, so stop auto-filling the
      // instalment from the amount afterwards.
      autoDeduction: false,
      end_month: f.recurring ? f.end_month : addMonths(f.start_month || addMonths(new Date().toISOString().slice(0, 7), 0), months - 1),
    }));
  };

  const createPreview = useMemo(() => {
    const total = num(createForm.total_amount);
    const ded = num(createForm.monthly_deduction);
    const start = createForm.start_month;
    if (!(total > 0) || !(ded > 0) || !start) return null;
    if (createForm.recurring) {
      return `${fmtAmount(ded)} will be deducted from ${monthLabel(start)} salary every month until you press Stop. The balance never reduces.`;
    }
    const instalments = ded >= total ? 1 : Math.ceil(total / ded);
    const end = createForm.end_month;
    if (!end) return `${fmtAmount(ded)} per month from ${monthLabel(start)} until the balance clears — ${instalments} instalment${instalments > 1 ? 's' : ''}, finishing ${monthLabel(addMonths(start, instalments - 1))}.`;
    const available = monthsBetween(start, end);
    if (available < instalments) {
      return `Warning: the term ${monthLabel(start)} to ${monthLabel(end)} is only ${available} month${available === 1 ? '' : 's'}, recovering ${fmtAmount(ded * available)} of ${fmtAmount(total)}. The remaining ${fmtAmount(total - ded * available)} would be left unpaid.`;
    }
    return `${fmtAmount(ded)} per month for ${instalments} month${instalments > 1 ? 's' : ''} (${monthLabel(start)} to ${monthLabel(end)}), fully clearing ${fmtAmount(total)}.`;
  }, [createForm]);

  const validateCreate = () => {
    const errs = {};
    if (!createForm.worker_id) errs.worker_id = 'Choose the worker this is for.';
    if (!(num(createForm.total_amount) > 0)) errs.total_amount = 'Enter the amount given.';
    if (!(num(createForm.monthly_deduction) > 0)) errs.monthly_deduction = 'Enter how much to recover each month.';
    if (!createForm.reason.trim()) errs.reason = 'Give a reason — it appears on the payslip history.';
    if (!createForm.start_month) errs.start_month = 'Choose the first salary month to deduct from.';
    if (!createForm.recurring && num(createForm.monthly_deduction) > num(createForm.total_amount) && num(createForm.total_amount) > 0) {
      errs.monthly_deduction = 'Cannot recover more in one month than was given.';
    }
    if (createForm.end_month && createForm.start_month && createForm.end_month < createForm.start_month) {
      errs.end_month = 'The last month cannot be before the first month.';
    }
    if (createForm.end_month && createForm.start_month && createForm.end_month === createForm.start_month && !createForm.recurring) {
      const total = num(createForm.total_amount);
      const ded = num(createForm.monthly_deduction);
      if (total > 0 && ded > 0 && ded < total) {
        errs.end_month = `A single month can only recover ${fmtAmount(ded)}. Either set the monthly amount to ${fmtAmount(total)} or extend the end month.`;
      }
    }
    setCreateErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitCreate = async () => {
    if (!validateCreate()) return;
    setCreateBusy(true);
    try {
      await createLoanApi({
        worker_id: createForm.worker_id,
        type: createForm.type,
        total_amount: num(createForm.total_amount),
        monthly_deduction: num(createForm.monthly_deduction),
        reason: createForm.reason.trim(),
        recurring: createForm.recurring,
        start_month: createForm.start_month ? createForm.start_month + '-01' : null,
        end_month: createForm.end_month ? createForm.end_month + '-01' : null,
      });
      setShowCreate(false);
      setCreateForm({ worker_id: '', type: 'loan', total_amount: '', monthly_deduction: '', reason: '', start_month: '', end_month: '', recurring: false });
      setWorkerSearch('');
      notify('Loan / advance recorded and active.');
      refresh();
    } catch (e) {
      setCreateErrors({ form: e.message });
    } finally {
      setCreateBusy(false);
    }
  };

  const askConfirm = ({ title, body, confirmLabel, tone, onConfirm }) => setConfirmState({ title, body, confirmLabel, tone, onConfirm });

  const runConfirm = async () => {
    const c = confirmState;
    setConfirmState(null);
    if (c?.onConfirm) await c.onConfirm();
  };

  const stopRecurring = (loan) => askConfirm({
    title: 'Stop this recurring deduction?',
    body: `${fmtAmount(loan.monthly_deduction)} per month will no longer be deducted from ${loan.workers?.name || 'this worker'}'s salary from next month. Deductions already recorded are kept, and the balance stays outstanding.`,
    confirmLabel: 'Stop deduction',
    tone: 'danger',
    onConfirm: async () => {
      try {
        await updateLoanApi(loan.id, { stop_recurring: true });
        notify('Recurring deduction stopped.');
        refresh();
      } catch (e) { notify(e.message, 'error'); }
    },
  });

  const handleResolve = (loan, resolveAs) => {
    const name = loan.workers?.name || 'this worker';
    const owed = fmtAmount(loan.remaining_amount);
    askConfirm({
      title: resolveAs === 'repaid' ? 'Mark as fully repaid?' : 'Write off the balance?',
      body: resolveAs === 'repaid'
        ? `The remaining ${owed} on ${name}'s loan will be written down to zero and the loan closed. Use this only when the money has actually been recovered outside payroll.`
        : `The remaining ${owed} on ${name}'s loan will be written down to zero and the loan closed. This is recorded in the remark and cannot be undone here.`,
      confirmLabel: resolveAs === 'repaid' ? 'Mark repaid' : 'Write off',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await updateLoanApi(loan.id, { resolve: resolveAs });
          notify(resolveAs === 'repaid' ? 'Marked as repaid.' : 'Balance written off.');
          refresh();
        } catch (e) { notify(e.message, 'error'); }
      },
    });
  };

  // Spells out what the instalment will do before HR commits to it. The failure
  // this prevents is silent: an instalment smaller than the balance over a term
  // that ends this month recovers part of the loan and strands the remainder.
  const approvalPreview = (loan, monthly) => {
    if (!loan) return '';
    const total = num(loan.total_amount);
    const ded = num(monthly);
    if (!(ded > 0) || !(total > 0)) return '';
    if (loan.recurring) return `Recurring: ${fmtAmount(ded)} every month until stopped. The balance never reduces.`;
    const instalments = ded >= total ? 1 : Math.ceil(total / ded);
    const start = fmtMonth(loan.start_month);
    const end = fmtMonth(loan.end_month);
    if (!end) return `${fmtAmount(ded)} per month until the balance clears — ${instalments} instalment${instalments > 1 ? 's' : ''}.`;
    const available = monthsBetween(start, end);
    if (available < instalments) {
      return `Only ${available} month${available === 1 ? '' : 's'} in the term (${monthLabel(start)} to ${monthLabel(end)}) — ${fmtAmount(ded)} per month recovers ${fmtAmount(ded * available)} of ${fmtAmount(total)}, leaving ${fmtAmount(total - ded * available)} unpaid.`;
    }
    return `${fmtAmount(ded)} per month clears ${fmtAmount(total)} in ${instalments} month${instalments > 1 ? 's' : ''} (${monthLabel(start)} to ${monthLabel(end)}).`;
  };

  const handleDecide = async (id, status) => {
    if (status === 'approved') {
      setApproving(id);
      const loan = loans.find(l => l.id === id);
      // Default to the instalment HR already entered when the request was raised.
      // It used to hard-code total/3, which silently overwrote a correctly chosen
      // amount: a one-month 5,000 advance got approved at 1,667/mo, recovered only
      // 1,667 in its single month and then went overdue with 3,333 outstanding.
      const entered = num(loan?.monthly_deduction);
      const total = num(loan?.total_amount);
      const singleMonth = loan?.start_month && loan?.start_month === loan?.end_month;
      setMonthlyDeduction(String(entered > 0 ? entered : (singleMonth || loan?.recurring ? total : Math.round(total / 3))));
      setHrRemark('');
      return;
    }
    askConfirm({
      title: 'Reject this request?',
      body: `The request from ${loans.find(l => l.id === id)?.workers?.name || 'this worker'} will be rejected and no deduction will be made.`,
      confirmLabel: 'Reject request',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await decideLoan(id, 'rejected', 0, '');
          notify('Request rejected.');
          refresh();
        } catch (e) { notify(e.message, 'error'); }
      },
    });
  };

  const confirmApprove = async () => {
    if (!(num(monthlyDeduction) > 0)) { notify('Enter a monthly deduction amount.', 'error'); return; }
    setSubmitting(true);
    try {
      await decideLoan(approving, 'approved', num(monthlyDeduction), hrRemark);
      setApproving(null);
      setMonthlyDeduction('');
      setHrRemark('');
      notify('Approved. It will start deducting from the next settlement.');
      refresh();
    } catch (e) { notify(e.message, 'error'); } finally { setSubmitting(false); }
  };

  const startEdit = (loan) => {
    setEditing(loan.id);
    setEditForm({
      total_amount: num(loan.total_amount),
      monthly_deduction: num(loan.monthly_deduction),
      reason: loan.reason || '',
      start_month: fmtMonth(loan.start_month),
      end_month: fmtMonth(loan.end_month),
    });
  };

  const saveEdit = async () => {
    setEditBusy(true);
    try {
      const payload = { ...editForm };
      payload.start_month = payload.start_month ? payload.start_month + '-01' : null;
      payload.end_month = payload.end_month ? payload.end_month + '-01' : null;
      await updateLoanApi(editing, payload);
      setEditing(null);
      setEditForm({});
      notify('Changes saved.');
      refresh();
    } catch (e) { notify(e.message, 'error'); } finally { setEditBusy(false); }
  };

  const handleDelete = (loan) => {
    const name = loan.workers?.name || 'this worker';
    const hasDeductions = num(loan.total_deducted) > 0;
    askConfirm({
      title: `Delete this ${loan.type}?`,
      body: `${fmtAmount(loan.total_amount)} for ${name} will be removed from the records.${hasDeductions ? ` Its ${fmtAmount(loan.total_deducted)} of recorded salary deductions will be deleted too, which will change those payslips.` : ''} This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await deleteLoanApi(loan.id, true);
          notify('Deleted.');
          refresh();
        } catch (e) { notify(e.message, 'error'); }
      },
    });
  };

  const handleSettle = () => {
    if (!settleMonth) { notify('Choose a month first.', 'error'); return; }
    askConfirm({
      title: `Record salary deductions for ${monthLabel(settleMonth)}?`,
      body: 'This writes one permanent deduction row per eligible loan for that month. It is safe to run twice — months already recorded are skipped.',
      confirmLabel: 'Run settlement',
      tone: 'ok',
      onConfirm: async () => {
        setSettleBusy(true);
        try {
          const [year, month] = settleMonth.split('-').map(Number);
          const res = await settleLoans(year, month);
          notify(`${monthLabel(settleMonth)} settled — ${res.settled} loan(s), ${fmtAmount(res.total_deducted)} deducted.`);
          refresh();
        } catch (e) { notify(e.message, 'error'); } finally { setSettleBusy(false); }
      },
    });
  };

  const pending = useMemo(() => loans.filter(l => l.status === 'pending'), [loans]);

  const summary = useMemo(() => {
    let owed = 0, recurring = 0, overdue = 0, overdueAmt = 0;
    for (const l of loans) {
      if (!LIVE_STATUSES.includes(l.status)) continue;
      if (l.status === 'overdue') { overdue++; overdueAmt += num(l.remaining_amount); }
      if (l.recurring) { if (l.status === 'active' || l.status === 'approved') recurring += num(l.monthly_deduction); }
      else owed += num(l.remaining_amount);
    }
    return { owed, recurring, overdue, overdueAmt };
  }, [loans]);

  // Reconciles one salary month: what the payslips will show against what has
  // actually been written to worker_loan_deductions.
  //
  // This is the check that would have caught all three of the real data bugs: a
  // loan created after its month was already settled shows up here as a gap, and
  // "paid" stays invisible until someone runs settlement before the payroll runs.
  const audit = useMemo(() => {
    if (!settleMonth) return null;
    const mStart = `${settleMonth}-01`;
    const mEnd = monthEndOf(settleMonth);
    const gaps = [];
    let expectedTotal = 0, recordedTotal = 0, recordedCount = 0, loanCount = 0;

    for (const l of loans) {
      const rec = (l.deductions || []).filter(d => fmtMonth(d.month) === settleMonth);
      if (rec.length) {
        recordedCount++;
        recordedTotal += rec.reduce((s, d) => s + num(d.amount), 0);
      }
      if (!LIVE_STATUSES.includes(l.status)) continue;
      if (num(l.remaining_amount) <= 0) continue;
      if (l.start_month && mEnd < l.start_month) continue;
      if (l.end_month && l.end_month < mStart) continue;
      loanCount++;
      const monthly = num(l.monthly_deduction);
      if (!(monthly > 0)) continue;
      const expected = l.recurring ? monthly : Math.min(monthly, num(l.remaining_amount));
      expectedTotal += expected;
      if (rec.length) continue;
      gaps.push({ loan: l, expected });
    }

    const due = payrollDueDate(settleMonth);
    const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
    let state = 'clear';
    if (gaps.length && daysLeft !== null && daysLeft < 0) state = 'missed';
    else if (gaps.length) state = 'pending';

    return { gaps, expectedTotal, recordedTotal, recordedCount, loanCount, due, daysLeft, state };
  }, [loans, settleMonth]);

  const settleOne = (workerId, name) => askConfirm({
    title: `Record ${name}'s deduction now?`,
    body: `This writes the permanent deduction for ${monthLabel(settleMonth)} salary immediately, so it is already on the payslip when payroll runs on ${fmtShortDate(audit?.due)}.`,
    confirmLabel: 'Record it',
    tone: 'ok',
    onConfirm: async () => {
      setSettleBusy(true);
      try {
        const [year, month] = settleMonth.split('-').map(Number);
        const res = await settleLoans(year, month, workerId);
        notify(`${monthLabel(settleMonth)} recorded for ${name} — ${fmtAmount(res.total_deducted)}.`);
        refresh();
      } catch (e) { notify(e.message, 'error'); } finally { setSettleBusy(false); }
    },
  });

  const history = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = loans.filter(l => l.status !== 'pending');
    if (statusFilter !== 'all') rows = rows.filter(l => l.status === statusFilter);
    if (typeFilter !== 'all') rows = rows.filter(l => l.type === typeFilter);
    if (q) rows = rows.filter(l => `${l.workers?.name || ''} ${l.reason || ''}`.toLowerCase().includes(q));
    const val = (l) => {
      switch (sortKey) {
        case 'worker': return (l.workers?.name || '').toLowerCase();
        case 'amount': return num(l.total_amount);
        case 'monthly': return num(l.monthly_deduction);
        case 'recovered': return num(l.total_deducted);
        case 'outstanding': return l.recurring ? -1 : num(l.remaining_amount);
        case 'status': return l.status;
        case 'applied': return String(l.applied_at || l.created_at || '');
        default: return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a); const y = val(b);
      const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [loans, search, statusFilter, typeFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortHead = ({ k, children, align }) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: align }}
      title="Click to sort"
    >
      {children}{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const selectedWorker = workers.find(w => w.id === createForm.worker_id);
  const workerOptions = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    return workers
      .filter(w => w.employment_status === 'active' || w.is_active === true)
      .filter(w => !q || `${w.name || ''} ${w.employee_id || ''}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [workers, workerSearch]);

  const workerExistingLoans = useMemo(
    () => (createForm.worker_id ? loans.filter(l => l.worker_id === createForm.worker_id && LIVE_STATUSES.includes(l.status)) : []),
    [loans, createForm.worker_id]);

  const detailLoan = detailId ? loans.find(l => l.id === detailId) : null;

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 1200, maxWidth: 380,
          padding: '11px 15px', borderRadius: 'var(--radius-sm)', fontSize: 13,
          color: '#fff', boxShadow: '0 6px 22px rgba(0,0,0,.18)',
          background: toast.tone === 'error' ? 'var(--danger)' : 'var(--sage)',
        }}>{toast.message}</div>
      )}

      {/* ── Summary ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>Loans & Advances</h3>
            <div className="sub">Money given to workers and recovered from salary</div>
          </div>
          <button className="btn btn-sm" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }} onClick={openCreate}>
            + New Loan / Advance
          </button>
        </div>
        <div className="card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile label="To recover" value={fmtAmount(summary.owed)} sub="One-time loans still owed" />
          <StatTile label="Monthly commitment" value={fmtAmount(summary.recurring)} sub="Recurring deductions per month" tone="gold" />
          <StatTile label="Overdue" value={summary.overdue} sub={summary.overdue ? fmtAmount(summary.overdueAmt) + ' needs a decision' : 'Nothing overdue'} tone={summary.overdue ? 'danger' : undefined} />
          <StatTile label="Pending requests" value={pending.length} sub={pending.length ? 'Awaiting approval' : 'All approved'} tone={pending.length ? 'gold' : undefined} />
        </div>
      </div>

      {/* ── Create / raise ── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--sage)' }}>
          <div className="card-head">
            <h3>Record a loan or advance</h3>
            <span className="sub">Takes effect immediately</span>
          </div>
          <div className="card-pad">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>

              <Field label="Worker" error={createErrors.worker_id} style={{ gridColumn: 'span 2', minWidth: 240, position: 'relative' }}
                hint={selectedWorker ? `Selected: ${selectedWorker.name}` : 'Type to search, then pick from the list.'}>
                <input
                  type="text"
                  placeholder="Search by name or employee ID…"
                  value={workerSearch}
                  onFocus={() => setWorkerOpen(true)}
                  onBlur={() => setTimeout(() => setWorkerOpen(false), 150)}
                  onChange={e => { setWorkerSearch(e.target.value); setWorkerOpen(true); }}
                  style={inputStyle}
                />
                {selectedWorker && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span className="pill pill-green">{selectedWorker.name}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { setCreateForm({ ...createForm, worker_id: '' }); setWorkerSearch(''); }}>Change</button>
                  </div>
                )}
                {workerOpen && !selectedWorker && (
                  <div style={{
                    position: 'absolute', top: 62, left: 0, right: 0, zIndex: 40, maxHeight: 210,
                    overflowY: 'auto', background: '#fff', border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                  }}>
                    {workerOptions.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink-soft)' }}>No active worker matches that search.</div>}
                    {workerOptions.map(w => (
                      <button
                        key={w.id} type="button"
                        onClick={() => { setCreateForm({ ...createForm, worker_id: w.id }); setWorkerSearch(''); setWorkerOpen(false); setCreateErrors({ ...createErrors, worker_id: undefined }); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 0, background: 'transparent', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                      >
                        <div style={{ fontWeight: 600 }}>{w.name}</div>
                        {w.employee_id && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{w.employee_id}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Type" hint={createForm.type === 'advance' ? 'Given ahead of salary for a specific need.' : 'A repayment obligation spread over months.'}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['loan', 'advance'].map(t => (
                    <button
                      key={t} type="button" className="btn btn-sm"
                      onClick={() => setCreateForm({ ...createForm, type: t })}
                      style={createForm.type === t
                        ? { background: 'var(--sage)', color: '#fff', border: 'none', textTransform: 'capitalize', fontWeight: 600 }
                        : { textTransform: 'capitalize' }}
                    >{t}</button>
                  ))}
                </div>
              </Field>

              <Field label="Amount given (₹)" error={createErrors.total_amount} hint={createForm.recurring ? 'The monthly commitment, kept on record.' : 'The full amount owed back.'}>
                <MoneyInput
                  value={createForm.total_amount}
                  onChange={e => {
                    const total = e.target.value;
                    // Keep the instalment in step with the amount until it is set
                    // deliberately, so a single-month recovery is the default.
                    setCreateForm(f => ({
                      ...f,
                      total_amount: total,
                      monthly_deduction: f.monthly_deduction && f.autoDeduction ? total : f.monthly_deduction,
                      autoDeduction: !f.monthly_deduction || f.autoDeduction,
                    }));
                  }}
                />
              </Field>

              <Field
                label={createForm.recurring ? 'Deduct every month (₹)' : 'Recover each month (₹)'}
                error={createErrors.monthly_deduction}
                hint={createForm.recurring ? 'Charged every month until you press Stop.' : 'How much to take from each month’s salary.'}
              >
                <MoneyInput value={createForm.monthly_deduction} onChange={e => setCreateForm({ ...createForm, monthly_deduction: e.target.value, autoDeduction: false })} />
              </Field>

              <Field label="Split across" hint="Quick presets. The end month and instalment update together.">
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" onClick={() => applyPreset(1)}>1 month</button>
                  <button type="button" className="btn btn-sm" onClick={() => applyPreset(3)}>3 months</button>
                  <button type="button" className="btn btn-sm" onClick={() => applyPreset(6)}>6 months</button>
                  <button type="button" className="btn btn-sm" onClick={() => applyPreset(12)}>12 months</button>
                </div>
              </Field>

              <Field label="Recurring commitment" hint="Use for standing costs like rent or a security deposit. The balance never reduces.">
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '6px 0' }}>
                  <input type="checkbox" checked={createForm.recurring} onChange={e => setCreateForm({ ...createForm, recurring: e.target.checked })} />
                  Deduct every month until stopped
                </label>
              </Field>

              <Field label="First deduction month" error={createErrors.start_month} hint="The salary month the first deduction comes from.">
                <input type="month" value={createForm.start_month} onChange={e => setCreateForm({ ...createForm, start_month: e.target.value })} style={inputStyle} />
              </Field>

              <Field label="Last deduction month" error={createErrors.end_month} hint="Leave blank to keep deducting until the balance clears.">
                <input type="month" value={createForm.end_month} onChange={e => setCreateForm({ ...createForm, end_month: e.target.value })} style={inputStyle} />
              </Field>

              <Field label="Reason" error={createErrors.reason} hint="Shown in the history and on payslips." style={{ gridColumn: '1 / -1' }}>
                <input
                  type="text" value={createForm.reason}
                  onChange={e => setCreateForm({ ...createForm, reason: e.target.value })}
                  placeholder="e.g. Security deposit, one-time medical advance, PG rent"
                  style={inputStyle}
                />
              </Field>
            </div>

            {workerExistingLoans.length > 0 && (
              <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--sage-soft, #f4f7f1)', fontSize: 12 }}>
                <strong>{selectedWorker?.name}</strong> already carries {workerExistingLoans.length} live loan/advance
                {workerExistingLoans.length > 1 ? 's' : ''}:{' '}
                {workerExistingLoans.map(l => `${fmtAmount(l.recurring ? l.monthly_deduction : l.remaining_amount)}${l.recurring ? '/mo' : ''}`).join(', ')}.
              </div>
            )}

            {createPreview && (
              <div style={{
                marginTop: 12, padding: '11px 13px', borderRadius: 'var(--radius-sm)', fontSize: 13,
                background: createPreview.startsWith('Warning') ? 'var(--danger-soft, #fdf1f0)' : 'var(--sage-soft, #f4f7f1)',
                border: `1px solid ${createPreview.startsWith('Warning') ? 'var(--danger)' : 'var(--line)'}`,
              }}>
                <strong>{createPreview.startsWith('Warning') ? 'Check this' : 'What will happen'}:</strong> {createPreview.replace(/^Warning: /, '')}
              </div>
            )}
            {createErrors.form && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>{createErrors.form}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-sm" disabled={createBusy} style={{ background: 'var(--sage)', color: '#fff', border: 'none' }} onClick={submitCreate}>
                {createBusy ? 'Saving…' : 'Save loan / advance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending approvals ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Requests awaiting approval</h3>
          <span className="sub">{pending.length} pending</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Worker</th><th>Type</th><th>Amount</th><th>Reason</th><th>From</th><th>Applied</th><th style={{ textAlign: 'right' }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={3} widths={[120, 60, 80, 160, 90, 80, 140]} />
            ) : pending.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">Nothing waiting — every request has been decided.</div></td></tr>
            ) : pending.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.workers?.name || 'Unknown'}</td>
                <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                <td style={{ fontWeight: 600 }}>{fmtAmount(l.total_amount)}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{l.reason || '—'}</td>
                <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{monthLabel(l.start_month) || '—'}</td>
                <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fmtDate(l.applied_at)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {approving === l.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 230, textAlign: 'left' }}>
                      <div>
                        <span style={labelStyle}>Monthly deduction (₹)</span>
                        <MoneyInput value={monthlyDeduction} onChange={e => setMonthlyDeduction(e.target.value)} />
                        {approvalPreview(l, monthlyDeduction) && (
                          <div style={{ ...hintStyle, color: approvalPreview(l, monthlyDeduction).startsWith('Only') ? 'var(--danger)' : undefined }}>
                            {approvalPreview(l, monthlyDeduction)}
                          </div>
                        )}
                      </div>
                      <div>
                        <span style={labelStyle}>Remark (optional)</span>
                        <input type="text" value={hrRemark} onChange={e => setHrRemark(e.target.value)} placeholder="e.g. Recover over 3 months" style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => { setApproving(null); setMonthlyDeduction(''); setHrRemark(''); }}>Cancel</button>
                        <button className="btn btn-sm" disabled={submitting} style={{ background: 'var(--sage)', color: '#fff', border: 'none' }} onClick={confirmApprove}>
                          {submitting ? '…' : 'Confirm approval'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => handleDecide(l.id, 'approved')}><Check width={14} /> Approve</button>
                      <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDecide(l.id, 'rejected')}><X width={14} /> Reject</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Payroll reconciliation ── */}
      <div className="card" style={{ marginBottom: 16, borderColor: audit?.state === 'missed' ? 'var(--danger)' : undefined }}>
        <div className="card-head">
          <div>
            <h3>Payroll deduction check</h3>
            <div className="sub">Confirm every deduction is recorded before salary is processed</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={settleMonth} onChange={e => setSettleMonth(e.target.value)} style={{ ...inputStyle, width: 165 }} />
            <button className="btn btn-sm" disabled={settleBusy} style={{ background: 'var(--sage)', color: '#fff', border: 'none' }} onClick={handleSettle}>
              {settleBusy ? 'Running…' : 'Settle all'}
            </button>
          </div>
        </div>
        <div className="card-pad">
          {audit && (
            <>
              <div style={{
                padding: '11px 13px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14,
                border: `1px solid ${audit.state === 'missed' ? 'var(--danger)' : audit.state === 'pending' ? 'var(--line)' : 'var(--sage)'}`,
                background: audit.state === 'missed' ? 'var(--danger-soft, #fdf1f0)' : audit.state === 'pending' ? 'var(--sage-soft, #f4f7f1)' : '#fff',
                color: audit.state === 'missed' ? 'var(--danger)' : 'var(--ink)',
              }}>
                {audit.state === 'clear' && (
                  <><strong>All clear.</strong> Every loan due for {monthLabel(settleMonth)} salary is recorded — {fmtAmount(audit.recordedTotal)} across {audit.recordedCount} record{audit.recordedCount === 1 ? '' : 's'}.</>
                )}
                {audit.state === 'pending' && (
                  <><strong>{audit.gaps.length} deduction{audit.gaps.length === 1 ? '' : 's'} not yet recorded</strong> for {monthLabel(settleMonth)} salary, worth {fmtAmount(audit.gaps.reduce((s, g) => s + g.expected, 0))}. Salary is processed from {fmtShortDate(audit.due)} — record {audit.gaps.length === 1 ? 'it' : 'them'} before then.</>
                )}
                {audit.state === 'missed' && (
                  <><strong>Missed the payroll window.</strong> {audit.gaps.length} deduction{audit.gaps.length === 1 ? '' : 's'} for {monthLabel(settleMonth)} salary ({fmtAmount(audit.gaps.reduce((s, g) => s + g.expected, 0))}) were never recorded, and salary was due on {fmtShortDate(audit.due)}. Record them now and the payslip will pick them up.</>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: audit.gaps.length ? 14 : 0 }}>
                <StatTile label="Expected" value={fmtAmount(audit.expectedTotal)} sub={`${audit.loanCount} live loan${audit.loanCount === 1 ? '' : 's'} in this month`} />
                <StatTile label="Recorded" value={fmtAmount(audit.recordedTotal)} sub={`${audit.recordedCount} record${audit.recordedCount === 1 ? '' : 's'} written`} />
                <StatTile
                  label="Gap"
                  value={fmtAmount(audit.expectedTotal - audit.recordedTotal)}
                  tone={audit.gaps.length ? 'danger' : undefined}
                  sub={audit.gaps.length ? `${audit.gaps.length} worker${audit.gaps.length === 1 ? '' : 's'} missing` : 'Nothing outstanding'}
                />
              </div>

              {audit.gaps.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th><th>Type</th><th>Reason</th>
                      <th style={{ textAlign: 'right' }}>Should deduct</th>
                      <th>Salary due</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.gaps.map(({ loan: l, expected }) => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{l.workers?.name || 'Unknown'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{l.reason || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmount(expected)}</td>
                        <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fmtShortDate(audit.due)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-sm" disabled={settleBusy}
                            style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                            onClick={() => settleOne(l.worker_id, l.workers?.name || 'this worker')}>
                            Record now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── History ── */}
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3>All loans & advances</h3>
            <div className="sub">{history.length} record{history.length === 1 ? '' : 's'}</div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search worker or reason…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 190 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 130 }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="closed">Closed</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 110 }}>
              <option value="all">All types</option>
              <option value="loan">Loan</option>
              <option value="advance">Advance</option>
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <SortHead k="worker">Worker</SortHead>
              <th>Type</th>
              <SortHead k="amount" align="right">Amount</SortHead>
              <SortHead k="monthly" align="right">Monthly</SortHead>
              <SortHead k="recovered" align="right">Recovered</SortHead>
              <SortHead k="outstanding" align="right">Outstanding</SortHead>
              <th>Period</th>
              <SortHead k="status">Status</SortHead>
              <SortHead k="applied">Applied</SortHead>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={5} widths={[120, 55, 75, 70, 80, 85, 110, 80, 80, 150]} />
            ) : history.length === 0 ? (
              <tr><td colSpan={10}><div className="empty">No records match these filters.</div></td></tr>
            ) : history.map(l => (
              editing === l.id ? (
                <tr key={l.id} style={{ background: 'var(--sage-soft, #f0f4ec)' }}>
                  <td style={{ fontWeight: 500 }}>{l.workers?.name || 'Unknown'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                  <td><MoneyInput value={editForm.total_amount} onChange={e => setEditForm({ ...editForm, total_amount: e.target.value })} style={{ width: 95 }} /></td>
                  <td><MoneyInput value={editForm.monthly_deduction} onChange={e => setEditForm({ ...editForm, monthly_deduction: e.target.value })} style={{ width: 90 }} /></td>
                  <td style={{ color: 'var(--sage)' }}>{num(l.total_deducted) > 0 ? fmtAmount(l.total_deducted) : '—'}</td>
                  <td>{l.recurring ? '—' : (num(l.remaining_amount) > 0 ? fmtAmount(l.remaining_amount) : '—')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="month" value={editForm.start_month} onChange={e => setEditForm({ ...editForm, start_month: e.target.value })} style={{ ...inputStyle, width: 118 }} />
                      <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>to</span>
                      <input type="month" value={editForm.end_month} onChange={e => setEditForm({ ...editForm, end_month: e.target.value })} style={{ ...inputStyle, width: 118 }} />
                    </div>
                  </td>
                  <td><StatusBadge status={l.status} /></td>
                  <td style={{ color: 'var(--ink-soft)' }}>{fmtDate(l.applied_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => { setEditing(null); setEditForm({}); }}>Cancel</button>{' '}
                    <button className="btn btn-sm" disabled={editBusy} style={{ background: 'var(--sage)', color: '#fff', border: 'none' }} onClick={saveEdit}>{editBusy ? '…' : 'Save'}</button>
                  </td>
                </tr>
              ) : (
                <tr
                  key={l.id}
                  style={l.status === 'overdue' ? { background: 'var(--danger-soft, #fdf1f0)' } : undefined}
                  onClick={() => setDetailId(l.id)}
                  title="Click to see the full deduction history"
                >
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{l.workers?.name || 'Unknown'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmount(l.total_amount)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{num(l.monthly_deduction) > 0 ? fmtAmount(l.monthly_deduction) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {num(l.total_deducted) > 0
                      ? <span style={{ color: 'var(--sage)' }}>{fmtAmount(l.total_deducted)}<div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{(l.deductions || []).length} month{(l.deductions || []).length === 1 ? '' : 's'}</div></span>
                      : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* A recurring balance never reduces, so showing it next to the
                        recovered total reads as a contradiction. Say so instead. */}
                    {l.recurring
                      ? <span style={{ color: 'var(--ink-soft)' }} title="Recurring commitments do not reduce the balance">n/a</span>
                      : num(l.remaining_amount) > 0
                        ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtAmount(l.remaining_amount)}</span>
                        : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                    {monthLabel(l.start_month) || '—'} → {l.end_month ? monthLabel(l.end_month) : 'ongoing'}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                      <StatusBadge status={l.status} />
                      {l.recurring && <span className="pill pill-gold">Recurring</span>}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fmtDate(l.applied_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    {['pending', 'active'].includes(l.status) && (
                      <>
                        {l.recurring && l.status === 'active' && (
                          <button className="btn btn-sm" style={{ color: 'var(--danger)', marginRight: 4 }} onClick={() => stopRecurring(l)}>Stop</button>
                        )}
                        <button className="btn btn-sm" style={{ marginRight: 4 }} onClick={() => startEdit(l)}>Edit</button>
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(l)}>Delete</button>
                      </>
                    )}
                    {l.status === 'overdue' && (
                      <>
                        <button className="btn btn-sm" style={{ background: 'var(--sage)', color: '#fff', border: 'none', marginRight: 4 }} onClick={() => handleResolve(l, 'repaid')}>Mark repaid</button>
                        <button className="btn btn-sm" style={{ marginRight: 4 }} onClick={() => startEdit(l)}>Edit</button>
                        <button className="btn btn-sm" style={{ marginRight: 4 }} onClick={() => handleResolve(l, 'written_off')}>Write off</button>
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(l)}>Delete</button>
                      </>
                    )}
                    {['closed', 'rejected'].includes(l.status) && (
                      <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(l)}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Detail ── */}
      {detailLoan && (
        <div onClick={() => setDetailId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,15,.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 620, width: '100%', maxHeight: '86vh', overflowY: 'auto', margin: 0 }}>
            <div className="card-head">
              <div>
                <h3>{detailLoan.workers?.name || 'Loan / advance'}</h3>
                <div className="sub" style={{ textTransform: 'capitalize' }}>{detailLoan.type} · {detailLoan.reason || 'No reason recorded'}</div>
              </div>
              <button className="btn btn-sm" onClick={() => setDetailId(null)}><X width={14} /></button>
            </div>
            <div className="card-pad">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
                <StatTile label="Amount" value={fmtAmount(detailLoan.total_amount)} />
                <StatTile label="Monthly" value={fmtAmount(detailLoan.monthly_deduction)} />
                <StatTile label="Recovered" value={fmtAmount(detailLoan.total_deducted)} />
                <StatTile
                  label={detailLoan.recurring ? 'Outstanding' : 'Remaining'}
                  value={detailLoan.recurring ? 'n/a' : fmtAmount(detailLoan.remaining_amount)}
                  tone={!detailLoan.recurring && num(detailLoan.remaining_amount) > 0 ? 'danger' : undefined}
                  sub={detailLoan.recurring ? 'Balance never reduces' : undefined}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12, marginBottom: 16 }}>
                <div><span style={labelStyle}>Status</span><StatusBadge status={detailLoan.status} />{detailLoan.recurring && <> <span className="pill pill-gold">Recurring</span></>}</div>
                <div><span style={labelStyle}>Period</span>{monthLabel(detailLoan.start_month) || '—'} → {detailLoan.end_month ? monthLabel(detailLoan.end_month) : 'ongoing'}</div>
                <div><span style={labelStyle}>Applied</span>{fmtDate(detailLoan.applied_at)}</div>
                <div><span style={labelStyle}>Decided</span>{fmtDate(detailLoan.decided_at)}</div>
                {detailLoan.closed_at && <div><span style={labelStyle}>Closed</span>{fmtDate(detailLoan.closed_at)}</div>}
                {detailLoan.hr_remark && <div><span style={labelStyle}>HR remark</span>{detailLoan.hr_remark}</div>}
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Deduction history ({(detailLoan.deductions || []).length} month{(detailLoan.deductions || []).length === 1 ? '' : 's'})
              </div>
              {(detailLoan.deductions || []).length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>Nothing has been recovered from salary yet.</div>
              ) : (
                <table>
                  <thead><tr><th>Salary month</th><th style={{ textAlign: 'right' }}>Deducted</th><th style={{ textAlign: 'right' }}>Recorded on</th></tr></thead>
                  <tbody>
                    {[...(detailLoan.deductions || [])]
                      .sort((a, b) => String(b.month).localeCompare(String(a.month)))
                      .map(d => (
                        <tr key={d.id}>
                          <td>{monthLabel(d.month)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtAmount(d.amount)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>{fmtDate(d.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm ── */}
      {confirmState && (
        <div onClick={() => setConfirmState(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,15,.42)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 440, width: '100%', margin: 0 }}>
            <div className="card-head"><h3>{confirmState.title}</h3></div>
            <div className="card-pad">
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{confirmState.body}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn btn-sm" onClick={() => setConfirmState(null)}>Cancel</button>
                <button
                  className="btn btn-sm"
                  style={confirmState.tone === 'danger'
                    ? { background: 'var(--danger)', color: '#fff', border: 'none' }
                    : { background: 'var(--sage)', color: '#fff', border: 'none' }}
                  onClick={runConfirm}
                >{confirmState.confirmLabel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
