import db from '../src/config/db.js';
p=r'C:\Users\ADMIN\Desktop\Projects\UCS_CRM\backend\src\services\froMonthlyRollover.js'
# month start
import datetime
now=datetime.datetime.now(datetime.timezone.utc)
month_start=now.replace(day=1,hour=0,minute=0,second=0,microsecond=0).isoformat()
print('month_start', month_start)
# find stale assignments
rows = (await db._pool.query if False else None)
import asyncio
async def main():
    q = """SELECT id FROM fro_assignments WHERE status IN ('follow_up','scheduled','callback','office_visit_scheduled','program_visit_scheduled','promise_to_pay','payment_pending','will_donate_online','promise_pay_wa_email') AND COALESCE(last_contacted_at, updated_at, assigned_at, to_timestamp(0)) < $1"""
    r = await db._pool.query(q, [month_start])
    ids = [x['id'] for x in r.rows]
    print('stale count', len(ids))
    if not ids: return
    await db._pool.query("UPDATE fro_assignments SET status='pending', rollover_from_status=status, rollover_at=now(), next_follow_up=NULL WHERE id=ANY($1::int[])", [ids])
    await db._pool.query("DELETE FROM fro_scheduled_contacts WHERE assignment_id=ANY($1::int[]) AND is_completed=false", [ids])
    print('done')
asyncio.run(main()) if False else None
# run sync via node instead? We'll just print and exit
print('use node')