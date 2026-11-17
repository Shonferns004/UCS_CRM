import db from '../config/db.js';
import { emitRealtime } from '../socket.js';
import { notifyWorker } from './fcmService.js';

// ---------------------------------------------------------------------------
// Per-FRO "new lead" alerts behind the topbar bell.
//
// A row is written once, when a lead lands on a station that already has an
// owner. It is durable on purpose: the badge must survive a refresh, a dropped
// socket, or a browser that was closed when the lead arrived. It closes when
// the FRO opens the lead (seen_at) and when a disposition is logged
// (attended_at), which is also when the FRO has actually worked it.
// ---------------------------------------------------------------------------

const TITLE = 'New lead received';

const labelOf = (score) => (score >= 70 ? 'interested' : score >= 40 ? 'review' : 'low');

export async function createLeadAlert({
  workerId,
  assignmentId,
  leadId = null,
  ngoId = null,
  station = null,
  source = null,
  score = null,
  label = null,
  name = null,
  phone = null,
}) {
  if (!workerId || !assignmentId) return null;

  // Re-ingest (webhook then poller) must not ring the bell twice. The unique
  // index is the final guard; this read keeps the common path quiet.
  const { data: existing } = await db
    .from('fro_lead_alerts')
    .select('id')
    .eq('worker_id', workerId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existing) return null;

  const body = name || phone || 'New lead';
  const numericScore = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;

  const { data, error } = await db
    .from('fro_lead_alerts')
    .insert({
      worker_id: workerId,
      assignment_id: assignmentId,
      lead_id: leadId,
      ngo_id: ngoId,
      station,
      source,
      score: numericScore,
      label: label || (numericScore == null ? null : labelOf(numericScore)),
      title: TITLE,
      body,
    })
    .select()
    .single();

  if (error) {
    // 23505 = the unique index won the race with another ingest path.
    if (error.code !== '23505') console.error('lead alert insert failed:', error.message);
    return null;
  }

  try {
    emitRealtime('lead:new', data, `worker:${workerId}`);
  } catch (e) {
    console.warn('lead alert realtime failed:', e?.message || e);
  }

  // Best effort mobile push. The web bell already has the row, so a missing
  // token or a disabled FCM project must not block placement.
  Promise.resolve()
    .then(() => notifyWorker(workerId, TITLE, body, 'lead_alert', String(assignmentId)))
    .catch(() => {});

  return data;
}

export async function listLeadAlerts(workerId, { limit = 50 } = {}) {
  const size = Math.min(Math.max(Number(limit) || 50, 1), 100);
  // A lead the admin has since reassigned is not this FRO's work any more, so
  // its alert must not keep the bell lit.
  const { rows } = await db._pool.query(
    `select a.*
       from fro_lead_alerts a
       left join fro_assignments fa on fa.id = a.assignment_id
      where a.worker_id = $1
        and a.attended_at is null
        and (fa.id is null or fa.status is null or fa.status <> 'reassigned')
      order by a.created_at desc
      limit $2`,
    [workerId, size],
  );
  return rows;
}

export async function leadAlertCounts(workerId) {
  const { rows } = await db._pool.query(
    `select
        count(*) filter (where a.seen_at is null) as unseen,
        count(*) as pending
       from fro_lead_alerts a
       left join fro_assignments fa on fa.id = a.assignment_id
      where a.worker_id = $1
        and a.attended_at is null
        and (fa.id is null or fa.status is null or fa.status <> 'reassigned')`,
    [workerId],
  );
  const row = rows[0] || {};
  return { unseen: Number(row.unseen) || 0, pending: Number(row.pending) || 0 };
}

export async function markLeadAlertSeen(workerId, alertId) {
  const { data, error } = await db
    .from('fro_lead_alerts')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('worker_id', workerId)
    .is('seen_at', null)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Opening a lead from the normal queue (not from the bell) is the same "seen"
// signal. Keyed by donor because that is what the FRO screen knows.
export async function markAlertsSeenForDonor(workerId, donorId) {
  if (!workerId || !donorId) return 0;
  const { rows } = await db._pool.query(
    `update fro_lead_alerts a
        set seen_at = now()
       from fro_assignments fa
      where fa.id = a.assignment_id
        and fa.donor_id = $2
        and a.worker_id = $1
        and a.seen_at is null
        and a.attended_at is null
      returning a.id`,
    [workerId, donorId],
  );
  return rows.length;
}

// Called from the disposition save: the FRO actually worked the lead, so the
// alert leaves the bell for good. Not worker-scoped on purpose — the row is
// already keyed to the assignment, and a reassignment must not leave a ghost.
export async function markAlertsAttended(assignmentId) {
  if (!assignmentId) return 0;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('fro_lead_alerts')
    .update({ attended_at: now, seen_at: now })
    .eq('assignment_id', assignmentId)
    .is('attended_at', null)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

export const closeLeadAlertsForAssignment = markAlertsAttended;
