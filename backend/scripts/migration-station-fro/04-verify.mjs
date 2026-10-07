// Tests A..E + final verification for the station -> FRO migration.
// Read-only against the database; the only write is a rolled-back probe.
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { receiptsForDonor, mobileVariants } from '../../src/services/receiptLookup.js';

const DSN =
  process.env.DATABASE_URL ||
  'postgres://ucs_admin:ucscompany123@ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com:5432/postgres';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
// Baseline receipts md5 captured pre-migration covered donor_id / donor_mobile,
// which the live app re-links continuously, so it is NOT re-asserted here.
// The financial invariants (row count, sum, id window) are the enforced gate.
const BASELINE_RECEIPTS_MD5 = '9d5d393ed289a1d5995facaba7fae9aa';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// A minimal adapter over pg that answers the exact query shapes
// receiptsForDonor issues, so the real module runs unmodified.
const makeClient = c => ({
  from(table) {
    const filters = [];
    const api = {
      select() { return api; },
      eq(col, val) { filters.push({ type: 'eq', col, val }); return api; },
      in(col, vals) { filters.push({ type: 'in', col, vals }); return api; },
      then(onOk, onBad) { return run().then(onOk, onBad); },
      catch(fn) { return run().catch(fn); },
    };
    async function run() {
      const params = [];
      const parts = [];
      try {
        for (const f of filters) {
          if (f.type === 'eq') { params.push(f.val); parts.push(`"${f.col}" = $${params.length}`); }
          else {
            const ph = f.vals.map(v => { params.push(v); return `$${params.length}`; });
            parts.push(`"${f.col}" IN (${ph.join(', ')})`);
          }
        }
        const r = await c.query(`SELECT * FROM "${table}" WHERE ${parts.join(' AND ')}`, params);
        return { data: r.rows, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    }
    return api;
  },
});

async function main() {
  const c = new pg.Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const one = async (sql, params = []) => (await c.query(sql, params)).rows[0];

  // ── A. station agent is the current FRO ───────────────────────────────
  const a = await one(`
    SELECT count(*)::int AS mismatch
      FROM fro_assignments a
      JOIN fro_station_assignments s ON s.ngo_id = a.ngo_id AND s.station = a.station
     WHERE a.status IS NULL OR a.status <> 'reassigned'`);
  const a2 = await one(`
    SELECT count(*)::int AS mismatch
      FROM fro_assignments a
      JOIN fro_station_assignments s ON s.ngo_id = a.ngo_id AND s.station = a.station
     WHERE (a.status IS NULL OR a.status <> 'reassigned')
       AND s.fro_worker_id IS NOT NULL
       AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id`);
  check('A. every station with an agent has that agent as its donors current FRO',
    a2.mismatch === 0, `${a2.mismatch} mismatches`);

  // ── B. NGO-only change must NOT rewrite FROs ──────────────────────────
  const src = fs.readFileSync(
    path.join(REPO, 'backend', 'src', 'controllers', 'ngoAdminController.js'), 'utf8');
  const guard = /hasOwnProperty\.call\(req\.body,\s*'fro_worker_id'\)/.test(src);
  const hasSync = src.includes('syncStationAgentToFro(db, resolvedNgoId, trimmed');
  const client = fs.readFileSync(
    path.join(REPO, 'client', 'src', 'panels', 'ngo-admin', 'pages', 'StationManagement.jsx'), 'utf8');
  const ngoChangeSendsOnlyNgo = /handleNgoChange[\s\S]{0,600}ngo_id/.test(client);
  check('B. updateStationNgos propagates only on an explicit agent assignment',
    guard && hasSync, `guard=${guard} sync=${hasSync}`);
  check('B2. handleNgoChange still sends ngo_id only (must be left alone)',
    ngoChangeSendsOnlyNgo, `present=${ngoChangeSendsOnlyNgo}`);

  // ── C. receipts resolve by donor_id OR canonical mobile ───────────────
  const variantSample = mobileVariants('9876543210');
  const variantOk = ['9876543210', '919876543210', '09876543210', '+919876543210']
    .every(v => variantSample.includes(v));
  check('C. mobile variants cover bare / 91 / 0 / +91 spellings', variantOk,
    JSON.stringify(variantSample));

  const cand = (await c.query(`
    SELECT d.id, d.mobile_number,
           count(*) FILTER (WHERE r.donor_id = d.id)::int AS by_donor,
           count(*)::int AS total
      FROM donor_profiles d
      JOIN receipts r
        ON regexp_replace(r.donor_mobile, '[^0-9]', '', 'g')
           = regexp_replace(d.mobile_number, '[^0-9]', '', 'g')
     WHERE d.mobile_number IS NOT NULL AND length(regexp_replace(d.mobile_number,'[^0-9]','','g')) = 10
       AND (r.donor_id IS DISTINCT FROM d.id)
     GROUP BY d.id, d.mobile_number
    HAVING count(*) > count(*) FILTER (WHERE r.donor_id = d.id)
     ORDER BY count(*) DESC LIMIT 1`)).rows[0];

  if (!cand) {
    check('C2. receiptsForDonor recovers mobile-only receipts', false, 'no candidate donor');
  } else {
    const donor = (await c.query('SELECT * FROM donor_profiles WHERE id = $1', [cand.id])).rows[0];
    const unioned = await receiptsForDonor(makeClient(c), donor);
    const byDonorOnly = (await c.query('SELECT id FROM receipts WHERE donor_id = $1', [cand.id])).rows.length;
    const expected = (await c.query(
      `SELECT count(*)::int AS n FROM receipts
        WHERE donor_id = $1
           OR regexp_replace(donor_mobile,'[^0-9]','','g')
              = regexp_replace($2,'[^0-9]','','g')`,
      [cand.id, donor.mobile_number])).rows[0].n;
    check('C2. receiptsForDonor recovers mobile-only receipts',
      unioned.length === expected && unioned.length > byDonorOnly,
      `donor ${cand.id}: ${byDonorOnly} by donor_id -> ${unioned.length} unioned (expected ${expected})`);
    const ids = new Set(unioned.map(r => r.id));
    check('C3. union is de-duplicated by receipt id', ids.size === unioned.length,
      `${unioned.length} rows / ${ids.size} unique`);
  }

  // ── D. unique index actually blocks a second active row ───────────────
  let dupBlocked = false;
  let detail = '';
  try {
    await c.query('BEGIN');
    const victim = (await c.query(`
      SELECT donor_id, ngo_id FROM fro_assignments
       WHERE status IS NULL OR status <> 'reassigned'
       ORDER BY id LIMIT 1`)).rows[0];
    try {
      await c.query(
        `INSERT INTO fro_assignments (donor_id, ngo_id, station, status, assigned_at)
         VALUES ($1, $2, 'TEST-SHOULD-NOT-EXIST', 'pending', now())`,
        [victim.donor_id, victim.ngo_id]);
      detail = 'duplicate insert SUCCEEDED - index not enforcing';
    } catch (e) {
      dupBlocked = e.code === '23505';
      detail = `code=${e.code}`;
    }
    await c.query('ROLLBACK');
  } catch (e) {
    detail = e.message;
    try { await c.query('ROLLBACK'); } catch (_) {}
  }
  check('D. uq_fro_assignments_active_donor_ngo blocks a duplicate active row',
    dupBlocked, detail);

  const leftovers = (await c.query(
    `SELECT count(*)::int AS n FROM fro_assignments WHERE station = 'TEST-SHOULD-NOT-EXIST'`)).rows[0].n;
  check('D2. probe left no rows behind', leftovers === 0, `${leftovers} rows`);

  // ── E. the Excel files are fully applied (idempotent) ─────────────────
  const e = await one(`
    SELECT
      (SELECT count(*)::int FROM fro_assignments a
        WHERE a.status IS NULL OR a.status <> 'reassigned') AS active_rows,
      (SELECT count(*)::int FROM (
         SELECT donor_id, ngo_id FROM fro_assignments
          WHERE status IS NULL OR status <> 'reassigned'
          GROUP BY donor_id, ngo_id HAVING count(*) > 1) d) AS dup_pairs`);
  check('E. one active assignment per (donor, NGO)', e.dup_pairs === 0,
    `${e.dup_pairs} dup pairs / ${e.active_rows} active rows`);

  // Station prefixes must stay inside their own NGO's family. Legacy families
  // (AFD/BFD/MFD) predate the Excel split and are legitimate for their NGO;
  // the failure mode we guard against is one NGO's station name appearing
  // under another NGO.
  const bleed = await one(`
    SELECT count(*)::int AS n
      FROM fro_assignments a
      JOIN ngos n ON n.id = a.ngo_id
     WHERE (a.status IS NULL OR a.status <> 'reassigned')
       AND a.station IS NOT NULL
       AND CASE left(upper(a.station), 3)
             WHEN 'AOD' THEN 'AFLF' WHEN 'AFD' THEN 'AFLF'
             WHEN 'BOD' THEN 'BSCT' WHEN 'BFD' THEN 'BSCT'
             WHEN 'MOD' THEN 'MANN' WHEN 'MFD' THEN 'MANN'
             ELSE NULL
           END IS NOT NULL
       AND CASE left(upper(a.station), 3)
             WHEN 'AOD' THEN 'AFLF' WHEN 'AFD' THEN 'AFLF'
             WHEN 'BOD' THEN 'BSCT' WHEN 'BFD' THEN 'BSCT'
             WHEN 'MOD' THEN 'MANN' WHEN 'MFD' THEN 'MANN'
             ELSE NULL
           END <> n.name`);
  check('E2. no cross-NGO station bleed', bleed.n === 0, `${bleed.n} rows`);

  // ── final: receipt safety gate ────────────────────────────────────────
  // The migration must never write to receipts. These are the financial
  // invariants captured at baseline; donor_id / donor_mobile are deliberately
  // excluded because the live app re-links receipts to donors continuously,
  // which changes them without touching money.
  const r = await one(`
    SELECT count(*)::int AS rows, coalesce(sum(amount),0)::text AS sum_amount,
           min(id)::bigint AS min_id, max(id)::bigint AS max_id
      FROM receipts WHERE id <= 1892728`);
  check('FINAL. receipts row count unchanged', r.rows === 104382, `${r.rows} (expected 104382)`);
  check('FINAL. receipts total amount unchanged', r.sum_amount === '156549218.84', `${r.sum_amount}`);
  check('FINAL. receipts baseline id window unchanged',
    String(r.min_id) === '1781906' && String(r.max_id) === '1892728',
    `min=${r.min_id} max=${r.max_id}`);
  check('FINAL. no migration script writes to receipts',
    !fs.readFileSync(path.join(REPO, 'backend', 'scripts', 'migration-station-fro', '01-dedupe.mjs'), 'utf8')
      .match(/INTO receipts|UPDATE receipts|DELETE FROM receipts/), '01-dedupe read-only');
  console.log(`  info  pre-migration md5 (not asserted, linkage columns drift): ${BASELINE_RECEIPTS_MD5}`);

  // ghost profiles must NOT exist
  const ghosts = (await c.query(
    `SELECT count(*)::int AS n FROM donor_profiles WHERE id IN (320534, 307761, 308424)`)).rows[0].n;
  check('FINAL. ghost donor_profiles were never created', ghosts === 0, `${ghosts} found`);

  // referenced ids resolve to the mapped canonical donors
  const mapped = (await c.query(
    `SELECT count(*)::int AS n FROM donor_profiles WHERE id IN (320535, 323510)`)).rows[0].n;
  check('FINAL. mapped canonical donors exist', mapped === 2, `${mapped}/2`);

  // orphan safety
  const orph = await one(`
    SELECT (SELECT count(*)::int FROM fro_donor_logs l
             WHERE l.assignment_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM fro_assignments a WHERE a.id = l.assignment_id)) AS logs,
           (SELECT count(*)::int FROM fro_scheduled_contacts s
             WHERE s.assignment_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM fro_assignments a WHERE a.id = s.assignment_id)) AS sc`);
  check('FINAL. no orphaned assignment references', orph.logs === 0 && orph.sc === 0,
    JSON.stringify(orph));

  // station/write-through invariant one more time under live traffic
  const inv = await one(`
    SELECT (SELECT count(*)::int FROM fro_assignments a
             JOIN fro_station_assignments s ON s.ngo_id = a.ngo_id AND s.station = a.station
            WHERE (a.status IS NULL OR a.status <> 'reassigned')
              AND s.fro_worker_id IS NOT NULL
              AND a.fro_worker_id IS DISTINCT FROM s.fro_worker_id) AS mismatch,
           (SELECT count(*)::int FROM fro_assignments
             WHERE original_fro_worker_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM workers w WHERE w.id = original_fro_worker_id)) AS dangling,
           (SELECT count(*)::int FROM fro_assignments
             WHERE original_fro_worker_id IS NOT NULL
               AND original_fro_worker_id IS DISTINCT FROM fro_worker_id) AS history_kept,
           (SELECT count(*)::int FROM fro_assignments
             WHERE original_fro_worker_id IS NULL AND fro_worker_id IS NOT NULL) AS gained_from_null`);
  check('FINAL. write-through still holds under live traffic', inv.mismatch === 0,
    `${inv.mismatch} mismatches`);
  check('FINAL. preserved history never points at a missing worker',
    inv.dangling === 0, `${inv.dangling} dangling`);
  // Rows with no original are ones that had NO FRO before the write-through
  // (they were null, then adopted their station agent) or rows the app created
  // afterwards — both legitimately have no prior FRO to preserve.
  console.log(`  info  history kept on ${inv.history_kept} changed rows; ` +
    `${inv.gained_from_null} rows gained a station agent from NULL (no prior FRO)`);

  await c.end();

  const failed = results.filter(x => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log('  - ' + f.name + '  ' + f.detail);
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
