import db from '../config/db.js';
import { sendPushNotification, sendPushToMultiple } from './fcmService.js';
import { getNoticeRecipients } from '../models/noticeModel.js';

// notification_log drives the mobile bell/list. The generic logNotification()
// helper is retired (it no-ops when NOTIFICATION_LOG_RETIRED !== 'off'), so
// important worker-facing notifications are written here explicitly, then an
// FCM push is attempted on top. That gives the worker all three surfaces:
// in-app toast (foreground FCM), the notification bell, and the OS notification.

const clamp = (value, max) => {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
};

export async function logWorkerNotification({
  workerId,
  title,
  body = '',
  type = 'general',
  referenceId = null,
} = {}) {
  if (!workerId || !title) return null;
  try {
    const { data, error } = await db
      .from('notification_log')
      .insert([{
        worker_id: workerId,
        type: type || 'general',
        title,
        body,
        reference_id: referenceId == null ? null : String(referenceId),
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[workerNotify] log insert failed:', error.message);
    return null;
  }
}

export async function deliverWorkerNotification({
  workerId,
  title,
  body = '',
  type = 'general',
  referenceId = null,
} = {}) {
  if (!workerId || !title) return null;
  const row = await logWorkerNotification({ workerId, title, body, type, referenceId });
  // sendPushNotification is already best-effort and handles stale tokens.
  await sendPushNotification(workerId, title, body, type, referenceId);
  return row;
}

export async function workerAlreadyNotified(workerId, type, referenceId) {
  if (!workerId || !type || referenceId == null) return false;
  const { data, error } = await db
    .from('notification_log')
    .select('id')
    .eq('worker_id', workerId)
    .eq('type', type)
    .eq('reference_id', String(referenceId))
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

// Fan a newly created admin/HR/super-admin notice out to every worker whose
// role or department panel is targeted by the notice. Runs at creation time
// (immediate) and again as a scheduler safety net; rows already written for
// the same notice are skipped so nobody receives it twice.
export async function notifyNoticeRecipients(notice) {
  if (!notice?.id || !notice?.title) return { delivered: 0 };
  const recipients = await getNoticeRecipients(notice);
  if (!recipients.length) return { delivered: 0 };

  const referenceId = String(notice.id);
  const { data: existing, error: existingErr } = await db
    .from('notification_log')
    .select('worker_id')
    .eq('type', 'notice')
    .eq('reference_id', referenceId);
  if (existingErr) {
    console.error('[workerNotify] notice dedup lookup failed:', existingErr.message);
  }
  const already = new Set((existing || []).map((r) => String(r.worker_id)));
  const pending = recipients.filter((w) => !already.has(String(w.id)));
  if (!pending.length) return { delivered: 0 };

  const title = `📢 ${clamp(notice.title, 110)}`;
  const body = clamp(notice.content, 180) || 'New notice from your organisation';
  const rows = pending.map((w) => ({
    worker_id: w.id,
    type: 'notice',
    title,
    body,
    reference_id: referenceId,
  }));

  try {
    const { error } = await db.from('notification_log').insert(rows);
    if (error) throw error;
  } catch (error) {
    // A failed log write must not stop the push itself.
    console.error('[workerNotify] notice log insert failed:', error.message);
  }

  await sendPushToMultiple(
    pending.map((w) => ({
      workerId: w.id,
      title,
      body,
      type: 'notice',
      referenceId,
    })),
  );

  return { delivered: pending.length };
}
