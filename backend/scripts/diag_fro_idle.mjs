// WHY DO SOME FROs SHOW 0 IDLE?  (run on a host that can reach the RDS)
//
// The NGO-admin Telecaller Performance column (GET /ngo-admin/tl-dashboard,
// ngoAdminController.js:5286-5325) returns committed + live streak, but the
// live streak is dropped in two distinct cases. This classifies every FRO into
// one of them so we stop guessing.
//
//   CAUSE A  work_as  -> isWorkAs(ls) is true, so effectiveIdleSeconds is
//                       hardcoded to 0 (line 5323-5324). BY DESIGN: a covered
//                       FRO is absent from the field and accrues nothing.
//   CAUSE B  stale    -> idle_since is set (an idle streak IS open) but
//                       updated_at is older than 3 min, so idleStreakFor()
//                       returns 0 (line 5306). Committed is still shown, and if
//                       the streak has never closed, committed is 0 too.
//                       NOT BY DESIGN - this is the bug.
//   OK               -> committed + fresh streak, i.e. the true figure.

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  max: 2,
  options: '-c timezone=Asia/Kolkata',
});

const LIVE_FRESH_MS = 3 * 60 * 1000;

const { rows } = await pool.query(`
  SELECT l.worker_id,
         w.name,
         l.status,
         l.today_idle_seconds                                  AS committed,
         l.idle_since,
         l.updated_at,
         l.work_as_operator_id,
         l.work_as_operator_name,
         EXTRACT(EPOCH FROM (now() - l.updated_at))::int         AS row_age_s,
         CASE WHEN l.idle_since IS NULL THEN NULL
              ELSE EXTRACT(EPOCH FROM (now() - l.idle_since))::int
         END                                                    AS streak_age_s,
         s.last_active_at,
         s.logged_out_at
  FROM fro_live_status l
  LEFT JOIN workers w ON w.id = l.worker_id
  LEFT JOIN auth_sessions s ON s.user_id = l.worker_id
  ORDER BY l.today_idle_seconds ASC NULLS FIRST
`);

const now = Date.now();
const out = rows.map((r) => {
  const ageS = r.row_age_s == null ? Infinity : r.row_age_s * 1000;
  const fresh = ageS <= LIVE_FRESH_MS;
  const streakOpen = r.idle_since != null;
  const workAs = !!r.work_as_operator_id && fresh;

  let cause;
  if (workAs) cause = 'A: work_as (by design)';
  else if (streakOpen && !fresh) cause = 'B: STALE ROW - streak dropped';
  else if (streakOpen) cause = 'OK: counting';
  else cause = 'OK: no streak open';

  const streakS = streakOpen && fresh ? r.streak_age_s : 0;
  return {
    worker_id: r.worker_id,
    name: r.name || '?',
    status: r.status,
    committed_s: r.committed,
    streak_age_s: r.streak_age_s,
    row_age_s: r.row_age_s,
    shows_now_s: workAs ? 0 : (r.committed || 0) + (streakS || 0),
    verdict: cause,
    work_as: r.work_as_operator_name || '',
    session_logged_out: r.logged_out_at ? 'YES' : '',
  };
});

console.log('\n==== EVERY FRO LIVE ROW ====\n');
console.table(out);

const zero = out.filter((o) => o.shows_now_s === 0);
console.log('\n==== SHOWING 0 IDLE (' + zero.length + ' of ' + out.length + ') ====\n');
console.table(zero);

const causeB = out.filter((o) => o.verdict.startsWith('B:'));
console.log('\n==== CAUSE B  (stale row while a streak is open) = ' + causeB.length + ' ====');
if (causeB.length === 0) {
  console.log('None. If FROs still show 0, look at CAUSE A rows instead.');
} else {
  console.table(causeB.map((o) => ({
    name: o.name, status: o.status, committed_s: o.committed_s,
    streak_open_for_s: o.streak_age_s, row_last_written_s: o.row_age_s,
  })));
  console.log('A streak open but the row is stale means the panel is NOT sending the');
  console.log('60s idle heartbeat (CallContext.jsx:636) - old cached bundle, backgrounded');
  console.log('tab throttling, or a crashed/closed tab mid-streak.');
}

const { rows: daily } = await pool.query(`
  SELECT d.worker_id, w.name, d.stat_date, d.idle_seconds, d.talk_seconds, d.calls, d.updated_at
  FROM fro_daily_stats d LEFT JOIN workers w ON w.id = d.worker_id
  WHERE d.stat_date >= (now()::date - 2)
  ORDER BY d.stat_date DESC, d.idle_seconds ASC
`);
console.log('\n==== DAILY STATS (last 3 days) — committed snapshot, GREATEST-kept ====\n');
console.table(daily);

await pool.end();
