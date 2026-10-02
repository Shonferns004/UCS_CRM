// Why a recruiter's older leads are invisible — read-only audit.
//
// GET /api/leads scopes a recruiter to
//   recruiter_id = me OR created_by = me OR created_by_name = me OR
//   scheduled_by_name = me            (backend/src/controllers/leadController.js,
//                                      backend/src/models/leadModel.js)
// so any row carrying none of those four is invisible to its real owner while still
// existing and still counted by HR. Migration 169 attributes the rows it can prove;
// this prints the ones it cannot, grouped by the only clue they carry, so the
// remaining mapping can be decided by a human instead of guessed by a query.
//
//   node scripts/audit-lead-ownership.mjs
//
// Select-only. Nothing here writes, so it is safe against production.

import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.join(__dirname, '..', '.env') });

const db = (await import('../src/config/db.js')).default;

// Kept in step with ownsLead() in backend/src/models/leadModel.js: an id counts
// only when it is genuinely set, because a NULL column must not be coerced to 0
// and handed to whichever user happens to be id 0.
const HAS_ID = (col) => `${col} is not null`;
const HAS_NAME = (col) => `coalesce(btrim(${col}), '') <> ''`;

const OWNERSHIP_STATES = [
  { label: 'assigned to a recruiter (recruiter_id)',        test: HAS_ID('recruiter_id') },
  { label: 'entered by someone (created_by)',              test: HAS_ID('created_by') },
  { label: 'creator name only (created_by_name)',          test: HAS_NAME('created_by_name') },
  { label: 'scheduler name only (scheduled_by_name)',      test: HAS_NAME('scheduled_by_name') },
  { label: 'UNOWNED — no id and no name stamp at all',     test: `not (${HAS_ID('recruiter_id')} or ${HAS_ID('created_by')} or ${HAS_NAME('created_by_name')} or ${HAS_NAME('scheduled_by_name')})` },
];

// Recruiter accounts, as the auth layer normalises them. ROLE_ALIASES in
// backend/src/middleware/authMiddleware.js maps 'hr-recruiter' to 'recruiter', so
// both spellings occur in the users table and both are recruiters here.
const RECRUITER_ROLES = "('recruiter', 'hr-recruiter', 'hr recruiter')";

const show = (title, rows, cols) => {
  console.log(`\n=== ${title} ===`);
  if (!rows.length) return console.log('(none)');
  console.log(cols.join(' | '));
  for (const r of rows) console.log(cols.map((c) => (r[c] == null ? '-' : String(r[c]))).join(' | '));
};

try {
  const { rows: columns } = await db._pool.query(`
    select column_name, data_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
     order by column_name
  `);
  if (!columns.length) {
    console.log('No public.leads table on this connection — check DATABASE_URL / the local tunnel.');
    process.exit(0);
  }
  const present = new Set(columns.map((c) => c.column_name));
  const missing = ['recruiter_id', 'created_by', 'created_by_name', 'scheduled_by_name'].filter((c) => !present.has(c));
  console.log(`public.leads columns: ${columns.length}`);
  if (missing.length) {
    console.log(`\n!! missing expected column(s): ${missing.join(', ')}`);
    console.log('   The owner filter in getAllLeads() would 500 on these. Add them before backfilling.');
  }

  const { rows: total } = await db._pool.query('select count(*)::int as n from public.leads');
  console.log(`total leads: ${total[0].n}`);

  console.log('\n=== ownership breakdown ===');
  for (const s of OWNERSHIP_STATES) {
    const { rows } = await db._pool.query(`select count(*)::int as n from public.leads where ${s.test}`);
    console.log(`${String(rows[0].n).padStart(6)}  ${s.label}`);
  }

  const { rows: recruiters } = await db._pool.query(`
    select id, name, role, is_active
      from public.users
     where lower(btrim(coalesce(role,''))) in ${RECRUITER_ROLES}
     order by id
  `);
  show('recruiter accounts in users', recruiters, ['id', 'name', 'role', 'is_active']);
  if (recruiters.length === 1) {
    console.log('\nExactly one recruiter account exists, so every unowned row is theirs by elimination.');
    console.log('Migration 169 attributes them automatically.');
  } else if (recruiters.length === 0) {
    console.log('\nNo recruiter-role account found. Unowned rows cannot be attributed by elimination.');
  } else {
    console.log(`\n${recruiters.length} recruiter accounts exist, so elimination is not safe — map these by hand.`);
  }

  // Rows migration 169 will not touch, with the only clue each one carries.
  const unowned = `not (${HAS_ID('recruiter_id')} or ${HAS_ID('created_by')})`;
  const { rows: byCreator } = await db._pool.query(`
    select coalesce(nullif(btrim(created_by_name), ''), '(blank)') as stamp, count(*)::int as n
      from public.leads
     where ${unowned}
     group by 1 order by n desc, 1
  `);
  show('untouched rows, grouped by created_by_name', byCreator, ['stamp', 'n']);

  const { rows: byScheduler } = await db._pool.query(`
    select coalesce(nullif(btrim(scheduled_by_name), ''), '(blank)') as stamp, count(*)::int as n
      from public.leads
     where ${unowned} and ${HAS_NAME('scheduled_by_name')}
     group by 1 order by n desc, 1
  `);
  show('of those, rows still visible via scheduled_by_name', byScheduler, ['stamp', 'n']);

  // A name stamp that matches no account is why migration 169 leaves the row alone.
  const { rows: unmatched } = await db._pool.query(`
    select l.created_by_name as stamp, count(*)::int as n
      from public.leads l
     where ${unowned} and ${HAS_NAME('created_by_name')}
       and not exists (
         select 1 from public.users u
          where lower(btrim(u.name)) = lower(btrim(l.created_by_name))
       )
     group by 1 order by n desc, 1
  `);
  show('creator names that match NO users row', unmatched, ['stamp', 'n']);

  const { rows: orphans } = await db._pool.query(`
    select id, name, phone, status, created_at, created_by_name, scheduled_by_name
      from public.leads
     where ${unowned} and not (${HAS_NAME('created_by_name')} or ${HAS_NAME('scheduled_by_name')})
     order by created_at desc nulls last
     limit 50
  `);
  show('completely unattributable rows (first 50)', orphans, ['id', 'name', 'phone', 'status', 'created_at']);
} catch (e) {
  console.error('audit failed:', e?.message || e);
  process.exitCode = 1;
} finally {
  await db._pool.end().catch(() => {});
  process.exit(process.exitCode || 0);
}
