import db from '../config/db.js';
import { getLeavesInRange } from '../models/leaveModel.js';
import { getAbsenceProofsByWorker } from '../models/absenceProofModel.js';
import { getAllWorkers } from '../models/workerModel.js';
import { getAllFcmTokens } from '../models/notificationModel.js';
import { getISTToday } from '../utils/salaryDays.js';
import { expandLeaveDatesForDetection } from '../utils/absenceRules.js';
import { resolveLateGrace } from '../utils/latePolicy.js';
import { deliverWorkerNotification } from './workerNotifyService.js';

const pad = (n) => String(n).padStart(2, '0');
const FULL_DAY_FAMILY = new Set(['full_day', 'vacational', 'emergency', 'holiday']);

// Runs after the shift ends. A worker with no attendance row on a working day,
// no approved leave covering it, and no approved/pending absence proof has an
// unauthorized absence: the month's late grace is charged. Warn them once per
// date through the bell + FCM. Saturdays/Sundays, holidays, pre-join dates and
// approved leaves are skipped, mirroring utils/absenceRules.js.
export async function warnTodaysUnauthorizedAbsences() {
  const ist = getISTToday();
  const date = `${ist.year}-${pad(ist.month + 1)}-${pad(ist.day)}`;

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return { checked: 0, warned: 0 };

  try {
    const { data: holiday } = await db
      .from('holidays')
      .select('date')
      .eq('date', date)
      .limit(1)
      .maybeSingle();
    if (holiday) return { checked: 0, warned: 0 };
  } catch (_) {}

  const tokens = await getAllFcmTokens().catch(() => []);
  const appWorkerIds = new Set((tokens || []).map((t) => String(t.worker_id)));
  const workers = (await getAllWorkers()).filter((w) => {
    if (w?.is_active === false) return false;
    const status = String(w?.employment_status || '').toLowerCase();
    if (status && !['active', 'probation'].includes(status)) return false;
    // Only people who actually use the attendance app: registered devices plus
    // FRO/field staff rows (a worker may have denied notifications and still
    // need the warning in the bell). Office-only roles are left alone.
    if (appWorkerIds.has(String(w.id))) return true;
    const role = String(w?.role || '').toLowerCase();
    const dept = String(w?.department || '').toLowerCase();
    return role === 'fro' || role === 'worker' || dept.startsWith('fro');
  });
  if (!workers.length) return { checked: 0, warned: 0 };

  let warned = 0;
  for (const worker of workers) {
    const workerId = worker.id;
    if (!workerId) continue;
    try {
      // reference_id is left null because notification_log may type it as a
      // UUID; a date string would then fail the insert. Dedup on the IST day.
      const { data: existing } = await db
        .from('notification_log')
        .select('id')
        .eq('worker_id', workerId)
        .eq('type', 'absence_warning')
        .gte('sent_at', `${date}T00:00:00+05:30`)
        .lte('sent_at', `${date}T23:59:59+05:30`)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const joinedAt = String(worker.created_at || '').slice(0, 10);
      if (joinedAt && joinedAt > date) continue;

      // Any attendance row other than 'absent' is a worked/leave/half day.
      const { data: rows } = await db
        .from('attendance')
        .select('status')
        .eq('worker_id', workerId)
        .eq('date', date)
        .limit(1);
      const record = rows?.[0];
      if (record && record.status !== 'absent') continue;

      const leaves = await getLeavesInRange(date, date, workerId).catch(() => []);
      const covering = (leaves || []).filter((l) =>
        expandLeaveDatesForDetection(l).includes(date),
      );
      const approved = covering.some((l) => l.status === 'approved');
      if (approved) continue;

      const proofs = await getAbsenceProofsByWorker(workerId, date, date).catch(() => []);
      if ((proofs || []).some((p) => ['approved', 'pending'].includes(p.status))) continue;

      const rejected = covering.some(
        (l) => l.status === 'rejected' && FULL_DAY_FAMILY.has(l.type),
      );
      const pending = covering.some(
        (l) => l.status === 'pending' && FULL_DAY_FAMILY.has(l.type),
      );
      const reason = rejected
        ? 'Your leave for today was rejected'
        : pending
          ? 'Your leave for today is still pending'
          : 'You have no approved leave for today';

      const grace = resolveLateGrace(worker);
      await deliverWorkerNotification({
        workerId,
        title: '⚠️ Unauthorized absence — grace at risk',
        body: `${reason}. ${grace} min of this month's late grace is charged unless a proof is approved. Upload a proof from Alerts.`,
        type: 'absence_warning',
        referenceId: null,
      });
      warned += 1;
    } catch (error) {
      console.error(`[absenceWarning] ${workerId}:`, error.message);
    }
  }

  console.log(`[absenceWarning] ${date}: checked ${workers.length}, warned ${warned}`);
  return { checked: workers.length, warned };
}
