import db from '../src/config/db.js';
const monthStart = new Date();
monthStart.setUTCDate(1);
monthStart.setUTCHours(0,0,0,0);
const ms = monthStart.toISOString();
console.log('month_start', ms);
const { rows } = await db._pool.query(
  `SELECT id FROM fro_assignments
    WHERE status IN ('follow_up','scheduled','callback','office_visit_scheduled','program_visit_scheduled','promise_to_pay','payment_pending','will_donate_online','promise_pay_wa_email')
      AND COALESCE(last_contacted_at, updated_at, assigned_at, to_timestamp(0)) < $1`,
  [ms]
);
const ids = rows.map(r => r.id);
console.log('stale count', ids.length);
if (ids.length) {
  await db._pool.query(
    `UPDATE fro_assignments SET status='pending', rollover_from_status=status, rollover_at=now(), next_follow_up=NULL WHERE id=ANY($1::int[])`,
    [ids]
  );
  await db._pool.query(
    `DELETE FROM fro_scheduled_contacts WHERE assignment_id=ANY($1::int[]) AND is_completed=false`,
    [ids]
  );
  console.log('repaired');
}
process.exit(0);