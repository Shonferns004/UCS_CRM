import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

// Legacy lead ownership — idempotent re-application of migration 169.
//
// Same rationale as ensureSignatureSchema: migrations are not auto-run, so the
// attribution has to be repaired on boot or the recruiter panel stays broken until
// somebody remembers to paste the SQL by hand.
//
// Why it exists: GET /api/leads scopes a recruiter to
//   recruiter_id = me OR created_by = me OR created_by_name = me
//                      OR scheduled_by_name = me
// (leadController.js -> recruiterOwner(), leadModel.js -> ownerOrFilter()). Rows
// entered by HR on the recruiter's behalf, and rows predating the created_by
// column, carry none of those stamps, so the recruiter's own older leads read as
// "No leads found." while HR still counts them.
//
// The rules live in the .sql file, not here, so the migration and the boot path
// can never drift. The SQL is idempotent and only ever writes recruiter_id on
// rows where recruiter_id AND created_by are both NULL — a lead that already has
// an owner, or that a recruiter personally typed, is never touched.

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../migrations/169_leads_ownership_backfill.sql');

// A row with no recruiter_id and no created_by matches none of the four owner
// clauses, so it is invisible to whoever really worked it.
const UNOWNED = `recruiter_id is null and created_by is null`;

async function tableExists(name) {
  const r = await db._pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rows.length > 0;
}

async function applyMigration() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  await db._pool.query(sql);
}

/** Rows the two rules could not attribute, so the log names what still needs a human. */
async function reportRemaining() {
  const { rows } = await db._pool.query(
    `SELECT count(*)::int AS n FROM public.leads WHERE ${UNOWNED}`,
  );
  return rows[0]?.n || 0;
}

export async function ensureLeadOwnershipSchema() {
  try {
    if (!(await tableExists('leads'))) return;
    if (!(await tableExists('users'))) return;

    const before = await reportRemaining();
    await applyMigration();
    const after = await reportRemaining();

    const attributed = before - after;
    if (attributed > 0) {
      console.log(
        `[lead ownership] attributed ${attributed} legacy lead(s) to a recruiter; ${after} still unowned`,
      );
    }
    if (after > 0) {
      // Not an error — these are rows no rule can prove. Left untouched on
      // purpose: guessing an owner would hand one recruiter another person's work,
      // so they are named instead. Run `node scripts/audit-lead-ownership.mjs`
      // for the breakdown and to fill in lead_ownership_backfill_map.
      console.warn(
        `[lead ownership] ${after} legacy lead(s) have no owner and stay hidden from the recruiter panel; ` +
          `run scripts/audit-lead-ownership.mjs`,
      );
    }
  } catch (e) {
    // The panel keeps working for leads that do carry an owner, so a failure here
    // must never stop the rest of the API from booting.
    console.warn('[lead ownership] skip:', e?.message || String(e));
  }
}
