import db from '../config/db.js';

// Bell/list rows are operational alerts, not audit history: anything older
// than three months is purged. Raw pool SQL is deliberate — the notification_log
// proxy broadcasts every DELETE over realtime, and a retention sweep would fan
// out one socket event per removed row.
export const NOTIFICATION_RETENTION_MONTHS = 3;

export async function purgeOldNotifications({
  months = NOTIFICATION_RETENTION_MONTHS,
} = {}) {
  const keepMonths = Math.max(1, Math.trunc(Number(months) || NOTIFICATION_RETENTION_MONTHS));
  try {
    const result = await db._pool.query(
      `DELETE FROM public.notification_log
        WHERE sent_at < (NOW() - ($1::int * INTERVAL '1 month'))`,
      [keepMonths],
    );
    const deleted = result?.rowCount || 0;
    if (deleted > 0) {
      console.log(
        `[notificationRetention] purged ${deleted} notification(s) older than ${keepMonths} months`,
      );
    }
    return deleted;
  } catch (error) {
    console.error(
      '[notificationRetention] purge failed:',
      error?.message || String(error),
    );
    return 0;
  }
}

let lastPurgeDay = '';

// Called from the notification cycle/cron endpoint as well as the overnight
// cron, so retention still runs on serverless deployments where fixed crons are
// not guaranteed. At most one sweep per IST day per process.
export async function maybePurgeOldNotifications() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.toISOString().slice(0, 10);
  if (lastPurgeDay === day) return 0;
  lastPurgeDay = day;
  return purgeOldNotifications();
}
