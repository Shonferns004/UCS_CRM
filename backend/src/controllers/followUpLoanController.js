import db from '../config/db.js';
import { getUserNgoIds } from './ngoAdminController.js';
import { periodStartForType } from './froController.js';
import { istDateString } from '../utils/ist.js';
import {
  deriveLoanStatus,
  closeExpiredLoans,
  recordLoanEvent,
  invalidateLoanCache,
  isFollowUpLoansEnabled,
} from '../services/followUpLoanService.js';

// ─── Follow-up / Callback Loans — NGO Admin management ───────────────────────
//
// Every handler is mounted behind authenticateRole('admin','super_admin') in
// ngoAdminRoutes.js and re-checks that the loan's NGO is inside the admin's own
// NGO scope.
//
// Invariants:
//  • fro_assignments is READ only. Nothing here changes a station, an owner or
//    a donor status. A loan is a visibility/permission window.
//  • expires_at is mandatory and capped at 30 days.
//  • The item list is snapshotted at create time. Leads that become follow-ups
//    later stay with the source station unless the admin creates another loan.
//  • Every mutation writes an append-only followup_loan_events row.

const REASON_CODES = new Set(['STAFF_ABSENCE', 'WORKLOAD_SUPPORT', 'SPECIAL_ASSIGNMENT', 'OTHER']);
const SCOPES = new Set(['BOTH', 'FOLLOW_UP', 'CALLBACK']);
const SELECTIONS = new Set(['ALL_OPEN', 'UPCOMING_ONLY', 'OVERDUE_ONLY', 'FIXED_COUNT']);
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 5000;

// The FRO's work lists are built from three sources, not one status column:
//   • open `fro_scheduled_contacts` (a lead with a pending schedule)
//   • the follow-up family (scheduled / follow_up / office & program visits)
//   • money promises (promise_to_pay, payment_pending, …)
// plus explicit callbacks. A loan must mirror exactly that set or the preview
// under-counts (BOD-10 showed 0 follow-ups while the FRO saw 4 + 1 promise).
const FOLLOWUP_FAMILY_STATUSES = [
  'scheduled', 'follow_up', 'office_visit_scheduled', 'program_visit_scheduled',
];
const PROMISE_STATUSES = [
  'promise_to_pay', 'payment_pending', 'will_donate_online', 'visit_donate',
  'whatsapp_sent', 'promise_pay_wa_email',
];
const CALLBACK_STATUSES = ['callback'];
const OPEN_LEAD_STATUSES = [
  ...new Set([...FOLLOWUP_FAMILY_STATUSES, ...PROMISE_STATUSES, ...CALLBACK_STATUSES]),
];

function badRequest(res, message, code = 'VALIDATION') {
  return res.status(400).json({ message, code });
}

function leadBucket(status) {
  if (PROMISE_STATUSES.includes(status)) return 'promise';
  if (CALLBACK_STATUSES.includes(status)) return 'callback';
  return 'follow_up';
}

function scopeAllowsBucket(scope, bucket) {
  if (scope === 'CALLBACK') return bucket === 'callback';
  if (scope === 'FOLLOW_UP') return bucket === 'follow_up' || bucket === 'promise';
  return true;
}

function leadDueMs(row) {
  const at = row.scheduled_at || row.next_follow_up || null;
  if (!at) return null;
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : null;
}

// Single source of truth for preview() and create() so the number shown in the
// modal is exactly the number of assignments snapshotted.
export async function loadEligibleLeads({ ngoId, station, scope }) {
  const { rows } = await db._pool.query(
    `WITH open_sched AS (
       SELECT s.assignment_id, MIN(s.scheduled_at) AS first_at
         FROM fro_scheduled_contacts s
         JOIN fro_assignments sa ON sa.id = s.assignment_id
        WHERE s.is_completed = false
          AND sa.ngo_id = $1
          AND sa.station = $2
        GROUP BY s.assignment_id
     )
     SELECT a.id AS assignment_id, a.donor_id, a.ngo_id, a.station, a.fro_worker_id,
            a.status, a.next_follow_up, a.last_contacted_at,
            oc.first_at AS scheduled_at,
            d.name AS donor_name, d.mobile_number
       FROM fro_assignments a
       LEFT JOIN open_sched oc ON oc.assignment_id = a.id
       LEFT JOIN donor_profiles d ON d.id = a.donor_id
      WHERE a.ngo_id = $1
        AND a.station = $2
        AND a.status = ANY($3::text[])
        AND NOT EXISTS (
          SELECT 1
            FROM followup_loan_items li
            JOIN followup_loans l ON l.id = li.loan_id
           WHERE li.assignment_id = a.id
             AND li.returned_at IS NULL
             AND l.status IN ('SCHEDULED', 'ACTIVE')
        )
      ORDER BY COALESCE(oc.first_at, a.next_follow_up::timestamptz) ASC NULLS LAST, a.id ASC
      LIMIT $4`,
    [ngoId, station, OPEN_LEAD_STATUSES, MAX_ITEMS],
  );

  // Drop donors who already paid in their current donation period. Mirrors
  // buildCollectedReceiptEvidence() in froController so a collected donor never
  // shows up in the FRO's lists and therefore is never offered for a loan.
  const donorIds = [...new Set(rows.map(r => r.donor_id).filter(Boolean))];
  const ngoIds = [...new Set(rows.map(r => r.ngo_id).filter(Boolean))];
  const [receiptsRes, donorTypesRes, ngoRes] = await Promise.all([
    donorIds.length > 0
      ? db.from('receipts').select('donor_id, project_id, receipt_date').in('donor_id', donorIds)
      : { data: [] },
    donorIds.length > 0
      ? db.from('donor_profiles').select('id, donor_type, donation_frequency').in('id', donorIds)
      : { data: [] },
    ngoIds.length > 0
      ? db.from('ngos').select('id, name').in('id', ngoIds)
      : { data: [] },
  ]);
  const donorTypeMap = {};
  for (const p of donorTypesRes.data || []) donorTypeMap[p.id] = p.donor_type || p.donation_frequency || '';
  const ngoProject = {};
  for (const n of ngoRes.data || []) ngoProject[n.id] = (n.name || '').toLowerCase();
  const collected = new Set();
  const now = new Date();
  for (const r of receiptsRes.data || []) {
    if (!r.receipt_date) continue;
    if (new Date(r.receipt_date) >= periodStartForType(donorTypeMap[r.donor_id] || '', now)) {
      collected.add(`${r.donor_id}|${(r.project_id || '').toLowerCase()}`);
    }
  }
  const isCollected = (row) => {
    const project = ngoProject[row.ngo_id];
    return project ? collected.has(`${row.donor_id}|${project}`) : false;
  };

  const nowMs = Date.now();
  const istDayStart = new Date(`${istDateString(now)}T00:00:00+05:30`).getTime();
  const seen = new Set();
  const leads = [];
  for (const row of rows) {
    if (isCollected(row)) continue;
    const bucket = leadBucket(row.status);
    if (!scopeAllowsBucket(scope, bucket)) continue;
    // The FRO UI shows one card per donor+NGO; keep the most urgent assignment.
    const key = `${row.donor_id}|${row.ngo_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dueMs = leadDueMs(row);
    const workedToday = row.last_contacted_at
      && new Date(row.last_contacted_at).getTime() >= istDayStart;
    leads.push({
      ...row,
      bucket,
      due_at: dueMs,
      is_overdue: dueMs !== null && dueMs < nowMs && !workedToday,
    });
  }
  return leads;
}

function selectLeads(leads, selection, fixedCount) {
  if (selection === 'OVERDUE_ONLY') return leads.filter(l => l.is_overdue);
  if (selection === 'UPCOMING_ONLY') return leads.filter(l => !l.is_overdue);
  if (selection === 'FIXED_COUNT') return leads.slice(0, fixedCount || 0);
  return leads;
}

async function resolveAdminId(user) {
  if (user && user.id && user.id !== 0 && user.id !== -1 && user.email) {
    try {
      const { data } = await db.from('users').select('id').eq('id', user.id).maybeSingle();
      if (data?.id) return data.id;
    } catch { /* fall through */ }
  }
  try {
    const { data } = await db.from('users').select('id').in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
    if (data?.id) return data.id;
  } catch { /* fall through */ }
  return null;
}

async function workerNames(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await db.from('workers').select('id, name, is_active, employment_status').in('id', unique);
  const map = {};
  for (const w of data || []) map[w.id] = w;
  return map;
}

async function attachLoanNames(rows) {
  const names = await workerNames(rows.flatMap(r => [
    r.source_fro_worker_id, r.target_fro_worker_id, r.created_by, r.revoked_by,
  ]));
  for (const r of rows) {
    r.source_fro_name = names[r.source_fro_worker_id]?.name || null;
    r.target_fro_name = names[r.target_fro_worker_id]?.name || null;
    r.created_by_name = names[r.created_by]?.name || null;
    r.revoked_by_name = names[r.revoked_by]?.name || null;
    r.target_fro_active = names[r.target_fro_worker_id]?.is_active ?? null;
    r.computed_status = deriveLoanStatus(r);
  }
  return rows;
}

async function loadLoanForAdmin(req, id) {
  const ngoIds = await getUserNgoIds(req.user);
  if (ngoIds.length === 0) return { error: 'forbidden' };
  const { data, error } = await db
    .from('followup_loans')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: 'not_found' };
  if (!ngoIds.some(n => String(n) === String(data.ngo_id))) return { error: 'forbidden' };
  return { loan: data, ngoIds };
}

// ─── GET /followup-loans ─────────────────────────────────────────────────────
export async function listFollowUpLoans(req, res) {
  try {
    const ngoIds = await getUserNgoIds(req.user);
    if (ngoIds.length === 0) return res.json([]);

    const { status, source_station, target_station, q } = req.query;
    let query = db
      .from('followup_loans')
      .select('*')
      .in('ngo_id', ngoIds)
      .order('created_at', { ascending: false })
      .limit(500);
    if (source_station) query = query.eq('source_station', source_station);
    if (target_station) query = query.eq('target_station', target_station);

    const { data, error } = await query;
    if (error) throw error;

    const rows = await attachLoanNames(data || []);
    let out = rows;
    if (status) out = out.filter(r => r.computed_status === status);
    if (q) {
      const needle = String(q).toLowerCase();
      out = out.filter(r => [
        r.source_station, r.target_station,
        r.source_fro_name, r.target_fro_name, r.created_by_name,
      ].some(v => String(v || '').toLowerCase().includes(needle)));
    }
    return res.json(out);
  } catch (error) {
    console.error('listFollowUpLoans error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── GET /followup-loans/fro-candidates ──────────────────────────────────────
// Recipient picker. Scoped to the loan's NGO so a station's donor data can never
// be lent to an FRO belonging to a different NGO.
export async function listFollowUpLoanFroCandidates(req, res) {
  try {
    const ngo_id = req.query.ngo_id;
    if (!ngo_id) return badRequest(res, 'ngo_id is required');
    const ngoIds = await getUserNgoIds(req.user);
    if (!ngoIds.some(n => String(n) === String(ngo_id))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { rows, error } = await db._pool.query(
      `SELECT DISTINCT w.id, w.name, w.login_id, w.department, w.is_active, w.employment_status
         FROM workers w
        WHERE w.is_active IS NOT FALSE
          AND lower(coalesce(w.department, '')) IN ('fro', 'telecaller')
          AND (
            w.ngo_id::text = $1
            OR EXISTS (
              SELECT 1 FROM fro_station_assignments fsa
               WHERE fsa.fro_worker_id = w.id AND fsa.ngo_id::text = $1
            )
          )
        ORDER BY w.name ASC`,
      [String(ngo_id)],
    );
    if (error) throw new Error(error.message);
    return res.json(rows || []);
  } catch (error) {
    console.error('listFollowUpLoanFroCandidates error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── GET /followup-loans/preview ─────────────────────────────────────────────
// Counts + conflicts before the admin confirms. Same eligibility rules create()
// uses, so the number in the modal is the number that will actually be lent.
export async function previewFollowUpLoan(req, res) {
  try {
    if (!isFollowUpLoansEnabled()) {
      return res.status(503).json({ message: 'Follow-up loans are disabled', code: 'DISABLED' });
    }
    const {
      ngo_id, source_station, target_station, target_fro_worker_id,
      scope = 'BOTH', selection = 'ALL_OPEN', count,
    } = req.query;

    if (!ngo_id || !source_station) {
      return badRequest(res, 'ngo_id and source_station are required');
    }
    if (!SCOPES.has(scope)) return badRequest(res, 'Invalid scope');
    if (!SELECTIONS.has(selection)) return badRequest(res, 'Invalid selection');

    const ngoIds = await getUserNgoIds(req.user);
    if (!ngoIds.some(n => String(n) === String(ngo_id))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const requested = selection === 'FIXED_COUNT' ? Math.max(0, parseInt(count, 10) || 0) : null;
    const leads = await loadEligibleLeads({ ngoId: ngo_id, station: source_station, scope });
    const selected = selectLeads(leads, selection, requested);
    const upcoming = leads.filter(l => !l.is_overdue);
    const overdueLeads = leads.filter(l => l.is_overdue);

    const { rows: already } = await db._pool.query(
      `SELECT count(*)::int AS n
         FROM followup_loan_items li
         JOIN followup_loans l ON l.id = li.loan_id
         JOIN fro_assignments a ON a.id = li.assignment_id
        WHERE li.returned_at IS NULL
          AND l.status IN ('SCHEDULED', 'ACTIVE')
          AND l.ngo_id = $1
          AND a.station = $2
          AND a.status = ANY($3::text[])`,
      [ngo_id, source_station, OPEN_LEAD_STATUSES],
    );

    const conflicts = [];
    if (target_station && String(target_station).trim() === String(source_station).trim()) {
      conflicts.push({ code: 'SAME_STATION', message: 'Target station must be different from the source station.' });
    }

    if (target_station) {
      const { data: targetRow } = await db
        .from('fro_station_assignments')
        .select('id, ngo_id, station, fro_worker_id')
        .eq('ngo_id', ngo_id)
        .eq('station', String(target_station).trim())
        .limit(1)
        .maybeSingle();
      if (!targetRow) {
        conflicts.push({ code: 'TARGET_STATION_NOT_FOUND', message: 'Target station does not belong to this NGO.' });
      } else if (target_fro_worker_id && targetRow.fro_worker_id &&
        String(targetRow.fro_worker_id) !== String(target_fro_worker_id)) {
        conflicts.push({
          code: 'NOT_STATION_OWNER',
          message: 'The selected FRO is not the owner of the target station.',
          severity: 'warning',
        });
      }
    }

    if (target_fro_worker_id) {
      const { data: fro } = await db
        .from('workers')
        .select('id, name, department, is_active, employment_status')
        .eq('id', target_fro_worker_id)
        .maybeSingle();
      if (!fro) {
        conflicts.push({ code: 'FRO_NOT_FOUND', message: 'Recipient FRO not found.' });
      } else {
        const { rows: froNgo } = await db._pool.query(
          `SELECT 1 FROM workers w
            WHERE w.id = $1
              AND (w.ngo_id::text = $2 OR EXISTS (
                SELECT 1 FROM fro_station_assignments fsa
                 WHERE fsa.fro_worker_id = w.id AND fsa.ngo_id::text = $2))
            LIMIT 1`,
          [target_fro_worker_id, String(ngo_id)],
        );
        if (froNgo.length === 0) {
          conflicts.push({ code: 'FRO_WRONG_NGO', message: 'Recipient FRO does not belong to this NGO.' });
        }
        const dept = String(fro.department || '').toLowerCase().trim();
        if (dept !== 'fro' && dept !== 'telecaller') {
          conflicts.push({ code: 'FRO_INELIGIBLE', message: 'Selected worker is not an FRO.' });
        }
        if (fro.is_active === false || fro.employment_status === 'terminated') {
          conflicts.push({ code: 'FRO_INACTIVE', message: 'Selected FRO is inactive or terminated.' });
        }
      }
    }

    const { data: activeTargetLoans } = await db
      .from('followup_loans')
      .select('id, expires_at')
      .eq('ngo_id', ngo_id)
      .eq('source_station', String(source_station).trim())
      .eq('target_station', String(target_station || '').trim())
      .in('status', ['SCHEDULED', 'ACTIVE'])
      .gt('expires_at', new Date().toISOString())
      .limit(5);
    if ((activeTargetLoans || []).length > 0) {
      conflicts.push({
        code: 'ACTIVE_LOAN_EXISTS',
        message: `${activeTargetLoans.length} active loan(s) already exist from ${source_station} to ${target_station}.`,
        severity: 'warning',
      });
    }

    return res.json({
      // Upcoming buckets mirror the FRO's Follow Ups tab (fresh follow-ups +
      // promises); overdue is shown separately because it is what the FRO sees
      // in Overdue. Buckets overlap, so total is the unique lead count.
      follow_up: upcoming.filter(l => l.bucket === 'follow_up').length,
      promise: upcoming.filter(l => l.bucket === 'promise').length,
      callback: leads.filter(l => l.bucket === 'callback').length,
      overdue: overdueLeads.length,
      upcoming: upcoming.length,
      total: leads.length,
      selected_count: selected.length,
      requested_count: requested,
      already_loaned: already?.[0]?.n || 0,
      sample: selected.slice(0, 20).map(l => ({
        assignment_id: l.assignment_id,
        donor_id: l.donor_id,
        status: l.status,
        next_follow_up: l.next_follow_up,
        scheduled_at: l.scheduled_at,
        bucket: l.bucket,
        is_overdue: l.is_overdue,
        donor_name: l.donor_name,
        mobile_number: l.mobile_number,
      })),
      conflicts,
    });
  } catch (error) {
    console.error('previewFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── GET /followup-loans/:id ─────────────────────────────────────────────────
export async function getFollowUpLoan(req, res) {
  try {
    const { loan, error } = await loadLoanForAdmin(req, req.params.id);
    if (error === 'not_found') return res.status(404).json({ message: 'Loan not found' });
    if (error === 'forbidden') return res.status(403).json({ message: 'Access denied' });

    await attachLoanNames([loan]);

    const { rows: items } = await db._pool.query(
      `SELECT li.id, li.assignment_id, li.donor_id, li.source_station,
              li.original_status, li.original_next_follow_up, li.returned_at,
              a.status AS current_status, a.next_follow_up AS current_next_follow_up,
              a.station AS current_station,
              d.name AS donor_name, d.mobile_number
         FROM followup_loan_items li
         LEFT JOIN fro_assignments a ON a.id = li.assignment_id
         LEFT JOIN donor_profiles d ON d.id = li.donor_id
        WHERE li.loan_id = $1
        ORDER BY li.id ASC
        LIMIT 2000`,
      [req.params.id],
    );

    const ids = (items || []).map(i => i.assignment_id);
    let workedSet = new Set();
    if (ids.length > 0) {
      const { rows: worked } = await db._pool.query(
        `SELECT DISTINCT assignment_id
           FROM fro_donor_logs
          WHERE assignment_id = ANY($1::int[])
            AND created_at >= $2
            AND created_at <= LEAST($3::timestamptz, now())`,
        [ids, loan.starts_at, loan.expires_at],
      );
      workedSet = new Set((worked || []).map(w => w.assignment_id));
    }

    const { rows: events } = await db._pool.query(
      `SELECT id, event_type, actor_admin_id, actor_role, previous_state, new_state, reason, created_at
         FROM followup_loan_events
        WHERE loan_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [req.params.id],
    );

    return res.json({
      ...loan,
      computed_status: deriveLoanStatus(loan),
      items: (items || []).map(i => ({ ...i, worked: workedSet.has(i.assignment_id) })),
      worked_count: workedSet.size,
      events: events || [],
    });
  } catch (error) {
    console.error('getFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /followup-loans ────────────────────────────────────────────────────
export async function createFollowUpLoan(req, res) {
  try {
    if (!isFollowUpLoansEnabled()) {
      return res.status(503).json({ message: 'Follow-up loans are disabled', code: 'DISABLED' });
    }
    const {
      ngo_id, source_station, target_station, target_fro_worker_id,
      scope = 'BOTH', selection = 'ALL_OPEN', count,
      starts_at, expires_at, reason_code, reason_note,
    } = req.body || {};

    if (!ngo_id || !source_station || !target_station || !target_fro_worker_id) {
      return badRequest(res, 'ngo_id, source_station, target_station and target_fro_worker_id are required');
    }
    if (!SCOPES.has(scope)) return badRequest(res, `scope must be one of: ${[...SCOPES].join(', ')}`);
    if (!SELECTIONS.has(selection)) return badRequest(res, `selection must be one of: ${[...SELECTIONS].join(', ')}`);
    if (!reason_code || !REASON_CODES.has(reason_code)) {
      return badRequest(res, `reason_code must be one of: ${[...REASON_CODES].join(', ')}`);
    }
    if (reason_code === 'OTHER' && !String(reason_note || '').trim()) {
      return badRequest(res, 'reason_note is required when reason_code is OTHER');
    }

    const src = String(source_station).trim();
    const tgt = String(target_station).trim();
    if (src === tgt) return badRequest(res, 'Target station must be different from the source station', 'SAME_STATION');

    const ngoIds = await getUserNgoIds(req.user);
    if (!ngoIds.some(n => String(n) === String(ngo_id))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const start = starts_at ? new Date(starts_at) : new Date();
    const expiry = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
      return badRequest(res, 'starts_at and expires_at must be valid dates');
    }
    if (expiry <= start) return badRequest(res, 'expires_at must be after starts_at');
    if (expiry.getTime() <= Date.now()) return badRequest(res, 'expires_at must be in the future');
    if (expiry.getTime() - start.getTime() > MAX_WINDOW_MS) {
      return badRequest(res, 'A loan window cannot exceed 30 days', 'WINDOW_TOO_LONG');
    }

    // Both stations must belong to the same NGO and the recipient must be a
    // live FRO. The source owner is stored for audit only.
    const { data: sourceRow, error: sErr } = await db
      .from('fro_station_assignments')
      .select('id, ngo_id, station, fro_worker_id')
      .eq('ngo_id', ngo_id)
      .eq('station', src)
      .limit(1)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sourceRow) return badRequest(res, 'Source station does not belong to this NGO', 'SOURCE_STATION_NOT_FOUND');

    const { data: targetRow, error: tErr } = await db
      .from('fro_station_assignments')
      .select('id, ngo_id, station, fro_worker_id')
      .eq('ngo_id', ngo_id)
      .eq('station', tgt)
      .limit(1)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!targetRow) return badRequest(res, 'Target station does not belong to this NGO', 'TARGET_STATION_NOT_FOUND');

    const { data: froRow, error: fErr } = await db
      .from('workers')
      .select('id, name, department, is_active, employment_status')
      .eq('id', target_fro_worker_id)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!froRow) return badRequest(res, 'Recipient FRO not found', 'FRO_NOT_FOUND');
    const dept = String(froRow.department || '').toLowerCase().trim();
    if (dept !== 'fro' && dept !== 'telecaller') {
      return badRequest(res, 'Selected worker is not an FRO', 'FRO_INELIGIBLE');
    }
    if (froRow.is_active === false || froRow.employment_status === 'terminated') {
      return badRequest(res, 'Selected FRO is inactive or terminated', 'FRO_INELIGIBLE');
    }
    const { rows: froNgo } = await db._pool.query(
      `SELECT 1 FROM workers w
        WHERE w.id = $1
          AND (w.ngo_id::text = $2 OR EXISTS (
            SELECT 1 FROM fro_station_assignments fsa
             WHERE fsa.fro_worker_id = w.id AND fsa.ngo_id::text = $2))
        LIMIT 1`,
      [target_fro_worker_id, String(ngo_id)],
    );
    if (froNgo.length === 0) {
      return badRequest(res, 'Selected FRO does not belong to this NGO', 'FRO_WRONG_NGO');
    }

    let fixedCount = null;
    if (selection === 'FIXED_COUNT') {
      const n = parseInt(count, 10);
      if (!Number.isFinite(n) || n < 1) return badRequest(res, 'count must be a positive integer', 'BAD_COUNT');
      if (n > MAX_ITEMS) return badRequest(res, `count cannot exceed ${MAX_ITEMS}`, 'BAD_COUNT');
      fixedCount = n;
    }

    // Release any stale rows first so the live-assignment unique index cannot
    // block this grant.
    await closeExpiredLoans();

    const leads = await loadEligibleLeads({ ngoId: ngo_id, station: src, scope });
    const eligible = selectLeads(leads, selection, fixedCount);
    if (eligible.length === 0) {
      return badRequest(res, 'No open follow-up, promise or callback leads matched this selection', 'NO_ELIGIBLE_LEADS');
    }

    const adminId = await resolveAdminId(req.user);
    const adminRole = req.user?.role || null;
    const note = String(reason_note || '').trim() || null;

    const loan = await db.transaction(async () => {
      const { rows, error } = await db._pool.query(
        `INSERT INTO followup_loans
           (ngo_id, source_station, source_fro_worker_id, target_station, target_fro_worker_id,
            scope, selection, status, starts_at, expires_at, reason_code, reason_note,
            item_count, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          ngo_id, src, sourceRow.fro_worker_id || null, tgt, target_fro_worker_id,
          scope, selection,
          start.getTime() > Date.now() ? 'SCHEDULED' : 'ACTIVE',
          start.toISOString(), expiry.toISOString(),
          reason_code, note, eligible.length, adminId,
        ],
      );
      if (error) throw error;
      const row = rows[0];

      // Chunked insert so a 5,000-row loan does not build one giant statement.
      for (let i = 0; i < eligible.length; i += 500) {
        const chunk = eligible.slice(i, i + 500);
        const values = [];
        const params = [];
        chunk.forEach((a, idx) => {
          const base = idx * 8;
          values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`);
          params.push(
            row.id, a.assignment_id, a.donor_id, a.ngo_id, src, a.fro_worker_id,
            a.status, a.next_follow_up,
          );
        });
        const ins = await db._pool.query(
          `INSERT INTO followup_loan_items
             (loan_id, assignment_id, donor_id, ngo_id, source_station,
              source_fro_worker_id, original_status, original_next_follow_up)
           VALUES ${values.join(',')}`,
          params,
        );
        if (ins.error) throw ins.error;
      }

      await recordLoanEvent({
        loanId: row.id,
        eventType: 'CREATED',
        actorAdminId: adminId,
        actorRole: adminRole,
        newState: {
          source_station: row.source_station,
          target_station: row.target_station,
          target_fro_worker_id: row.target_fro_worker_id,
          scope: row.scope,
          selection: row.selection,
          item_count: row.item_count,
          starts_at: row.starts_at,
          expires_at: row.expires_at,
        },
        reason: reason_code,
      });
      return row;
    });

    invalidateLoanCache(target_fro_worker_id);
    if (loan.source_fro_worker_id) invalidateLoanCache(loan.source_fro_worker_id);
    // FRO donor/station payload caches may include follow-up lists; drop both
    // sides so the next request reflects the loan immediately.
    try {
      const { invalidateFroCaches } = await import('./froController.js');
      invalidateFroCaches(target_fro_worker_id);
      if (loan.source_fro_worker_id) invalidateFroCaches(loan.source_fro_worker_id);
    } catch (e) {
      console.warn('[follow-up loans] fro cache invalidation skipped:', e?.message || String(e));
    }

    return res.status(201).json({
      loan: { ...loan, computed_status: deriveLoanStatus(loan) },
      lent: eligible.length,
      permanent_ownership_unchanged: true,
    });
  } catch (error) {
    if (error?.code === '23505' || String(error?.message || '').includes('fl_item_live_assignment_uniq')) {
      return res.status(409).json({
        message: 'One or more leads are already on an active loan. Refresh the preview and try again.',
        code: 'LEAD_ALREADY_LOANED',
      });
    }
    console.error('createFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /followup-loans/:id/extend ─────────────────────────────────────────
export async function extendFollowUpLoan(req, res) {
  try {
    const { expires_at, reason } = req.body || {};
    const expiry = new Date(expires_at);
    if (isNaN(expiry.getTime())) return badRequest(res, 'expires_at must be a valid date');

    const { loan, error } = await loadLoanForAdmin(req, req.params.id);
    if (error === 'not_found') return res.status(404).json({ message: 'Loan not found' });
    if (error === 'forbidden') return res.status(403).json({ message: 'Access denied' });

    const computed = deriveLoanStatus(loan);
    if (computed === 'RETURNED' || computed === 'REVOKED') {
      return badRequest(res, `Cannot extend a ${computed.toLowerCase()} loan`, 'BAD_STATUS');
    }
    if (expiry.getTime() <= new Date(loan.starts_at).getTime()) {
      return badRequest(res, 'expires_at must be after starts_at');
    }
    if (expiry.getTime() > Date.now() + MAX_WINDOW_MS) {
      return badRequest(res, 'A loan window cannot exceed 30 days', 'WINDOW_TOO_LONG');
    }

    const adminId = await resolveAdminId(req.user);
    const adminRole = req.user?.role || null;
    const updated = await db.transaction(async () => {
      const { rows, error: uErr } = await db._pool.query(
        `UPDATE followup_loans
            SET expires_at = $2,
                status = CASE
                  WHEN status = 'EXPIRED' THEN 'ACTIVE'
                  WHEN status IN ('SCHEDULED','ACTIVE') AND starts_at > now() THEN 'SCHEDULED'
                  ELSE status END,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [req.params.id, expiry.toISOString()],
      );
      if (uErr) throw uErr;
      if (!rows[0]) return null;
      await recordLoanEvent({
        loanId: req.params.id,
        eventType: 'EXTENDED',
        actorAdminId: adminId,
        actorRole: adminRole,
        previousState: { expires_at: loan.expires_at, status: loan.status },
        newState: { expires_at: rows[0].expires_at, status: rows[0].status },
        reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      });
      return rows[0];
    });
    if (!updated) return res.status(404).json({ message: 'Loan not found' });

    invalidateLoanCache(updated.target_fro_worker_id);
    if (updated.source_fro_worker_id) invalidateLoanCache(updated.source_fro_worker_id);
    return res.json({ loan: { ...updated, computed_status: deriveLoanStatus(updated) } });
  } catch (error) {
    console.error('extendFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /followup-loans/:id/return ─────────────────────────────────────────
export async function returnFollowUpLoan(req, res) {
  try {
    const { loan, error } = await loadLoanForAdmin(req, req.params.id);
    if (error === 'not_found') return res.status(404).json({ message: 'Loan not found' });
    if (error === 'forbidden') return res.status(403).json({ message: 'Access denied' });

    const computed = deriveLoanStatus(loan);
    if (computed === 'RETURNED') {
      return res.json({ loan: { ...loan, computed_status: 'RETURNED' }, already_returned: true });
    }

    const adminId = await resolveAdminId(req.user);
    const adminRole = req.user?.role || null;
    const { reason } = req.body || {};

    const updated = await db.transaction(async () => {
      const { rows, error: uErr } = await db._pool.query(
        `UPDATE followup_loans
            SET status = 'RETURNED', returned_at = now(), updated_at = now()
          WHERE id = $1 AND status <> 'RETURNED'
          RETURNING *`,
        [req.params.id],
      );
      if (uErr) throw uErr;
      if (!rows[0]) return null;
      await db._pool.query(
        `UPDATE followup_loan_items
            SET returned_at = now()
          WHERE loan_id = $1 AND returned_at IS NULL`,
        [req.params.id],
      );
      await recordLoanEvent({
        loanId: req.params.id,
        eventType: 'RETURNED_EARLY',
        actorAdminId: adminId,
        actorRole: adminRole,
        previousState: { status: loan.status, expires_at: loan.expires_at },
        newState: { status: 'RETURNED', returned_at: rows[0].returned_at },
        reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      });
      return rows[0];
    });

    if (!updated) return res.status(404).json({ message: 'Loan not found' });
    invalidateLoanCache(updated.target_fro_worker_id);
    if (updated.source_fro_worker_id) invalidateLoanCache(updated.source_fro_worker_id);
    return res.json({ loan: { ...updated, computed_status: 'RETURNED' } });
  } catch (error) {
    console.error('returnFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// ─── POST /followup-loans/:id/revoke ─────────────────────────────────────────
export async function revokeFollowUpLoan(req, res) {
  try {
    const { loan, error } = await loadLoanForAdmin(req, req.params.id);
    if (error === 'not_found') return res.status(404).json({ message: 'Loan not found' });
    if (error === 'forbidden') return res.status(403).json({ message: 'Access denied' });

    if (loan.status === 'REVOKED') {
      return res.json({ loan: { ...loan, computed_status: 'REVOKED' }, already_revoked: true });
    }

    const { reason } = req.body || {};
    const adminId = await resolveAdminId(req.user);
    const adminRole = req.user?.role || null;

    const updated = await db.transaction(async () => {
      const { rows, error: uErr } = await db._pool.query(
        `UPDATE followup_loans
            SET status = 'REVOKED',
                revoked_at = now(),
                revoked_by = $2,
                revocation_reason = $3,
                updated_at = now()
          WHERE id = $1 AND status <> 'REVOKED'
          RETURNING *`,
        [req.params.id, adminId, typeof reason === 'string' ? reason.slice(0, 500) : null],
      );
      if (uErr) throw uErr;
      if (!rows[0]) return null;
      await db._pool.query(
        `UPDATE followup_loan_items
            SET returned_at = now()
          WHERE loan_id = $1 AND returned_at IS NULL`,
        [req.params.id],
      );
      await recordLoanEvent({
        loanId: req.params.id,
        eventType: 'REVOKED',
        actorAdminId: adminId,
        actorRole: adminRole,
        previousState: { status: loan.status, expires_at: loan.expires_at },
        newState: { status: 'REVOKED', revoked_at: rows[0].revoked_at },
        reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      });
      return rows[0];
    });

    if (!updated) return res.status(404).json({ message: 'Loan not found' });
    invalidateLoanCache(updated.target_fro_worker_id);
    if (updated.source_fro_worker_id) invalidateLoanCache(updated.source_fro_worker_id);
    return res.json({ loan: { ...updated, computed_status: 'REVOKED' } });
  } catch (error) {
    console.error('revokeFollowUpLoan error:', error.message);
    return res.status(500).json({ message: error.message });
  }
}
