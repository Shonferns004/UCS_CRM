p=r'C:\Users\ADMIN\Desktop\Projects\UCS_CRM\backend\src\services\froMonthlyRollover.js'
s=open(p).read()
old="""        await db._pool.query(
          `UPDATE public.fro_assignments
              SET status = 'pending',
                  rollover_from_status = status, rollover_at = now()
            WHERE id = ANY($1::int[])`,
          [resetIds]
        );
        rowsReset += resetIds.length;"""
new="""        await db._pool.query(
          `UPDATE public.fro_assignments
              SET status = 'pending',
                  rollover_from_status = status, rollover_at = now(),
                  next_follow_up = NULL
            WHERE id = ANY($1::int[])`,
          [resetIds]
        );
        await db._pool.query(
          `DELETE FROM public.fro_scheduled_contacts
            WHERE assignment_id = ANY($1::int[])
              AND is_completed = false`,
          [resetIds]
        );
        rowsReset += resetIds.length;"""
assert old in s, "old not found"
s=s.replace(old,new)
open(p,'w').write(s)
print('done')