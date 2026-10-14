// READ-ONLY diagnostic. No writes of any kind.
//
// Reports, for verification only:
//   1. agent1's identity: crm_agents row, whether whatsapp_admin is set, and the
//      branch auto-login will take for them.
//   2. The configured whatsapp_accounts rows: id, name, project, whether each has
//      Meta credentials present (never printed), and whether any duplicate
//      project exists.
//   3. The donor-allotment path a WhatsApp send will now take for agent1's
//      donors, per organisation.
//
// Access tokens are NEVER printed -- only a boolean "credentials present".

import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = '127.0.0.1';
  u.port = process.env.DB_TUNNEL_LOCAL_PORT || '15432';
  process.env.DATABASE_URL = u.toString();
}

const db = (await import('../src/config/db.js')).default;
const q = (sql, params) => db._pool.query(sql, params);

// ── 1. agent1 ───────────────────────────────────────────────────────────────
const { rows: agents } = await q(
  `SELECT c.id, c.label, c.login_id, c.worker_id, c.ngo_id, c.is_active,
          c.whatsapp_admin, w.login_id AS worker_login
     FROM crm_agents c
     LEFT JOIN workers w ON w.id = c.worker_id
    WHERE lower(c.login_id) = lower($1)`,
  [process.env.DIAG_LOGIN || 'agent1'],
);

console.log('=== agent1 ===');
console.log(agents.length ? {
  label: agents[0].label,
  login_id: agents[0].login_id,
  worker_login: agents[0].worker_login,
  is_active: agents[0].is_active,
  whatsapp_admin: agents[0].whatsapp_admin,
  has_worker_id: !!agents[0].worker_id,
} : 'NOT FOUND');

// ── 2. WhatsApp accounts ────────────────────────────────────────────────────
const { rows: accounts } = await q(
  `SELECT id, name, project, is_active, is_default, waba_id, phone_number_id,
          (access_token IS NOT NULL AND length(access_token) > 0) AS has_token
     FROM whatsapp_accounts
    ORDER BY id`,
);

console.log('\n=== whatsapp_accounts ===');
console.table(accounts.map(a => ({
  id: a.id, name: a.name, project: a.project,
  active: a.is_active, default: a.is_default,
  has_token: a.has_token, has_waba: !!a.waba_id, has_number_id: !!a.phone_number_id,
})));

const dupes = await q(
  `SELECT project, count(*)::int AS n
     FROM whatsapp_accounts WHERE is_active GROUP BY project HAVING count(*) > 1`,
);
console.log('duplicate active projects:', dupes.rows.length ? dupes.rows : 'none');

// ── 3. Which organisation agent1's donors resolve to ────────────────────────
if (agents.length && agents[0].worker_id) {
  const { rows: byNgo } = await q(
    `SELECT n.name AS ngo, count(*)::int AS donors
       FROM fro_assignments a
       JOIN donor_profiles d ON d.id = a.donor_id
       LEFT JOIN ngos n ON n.id = a.ngo_id
      WHERE a.fro_worker_id = $1 AND a.status <> 'reassigned'
      GROUP BY n.name ORDER BY donors DESC`,
    [agents[0].worker_id],
  );
  console.log('\n=== agent1 donor allotment by assignment NGO ===');
  console.table(byNgo);

  const { rows: unresolved } = await q(
    `SELECT count(*)::int AS n
       FROM fro_assignments a
       JOIN donor_profiles d ON d.id = a.donor_id
      WHERE a.fro_worker_id = $1 AND a.status <> 'reassigned'
        AND (a.ngo_id IS NULL
             OR COALESCE(NULLIF(trim(d.project_supported), ''), '') = '')`,
    [agents[0].worker_id],
  );
  console.log('donors with neither assignment NGO nor project_supported:', unresolved[0].n);

  const { rows: nullProjectConvs } = await q(
    `SELECT count(*)::int AS n FROM conversations WHERE project IS NULL`,
  );
  console.log('conversations with project NULL (previously sent from BSCT):', nullProjectConvs[0].n);

  const { rows: byConvProject } = await q(
    `SELECT COALESCE(project,'(null)') AS project, count(*)::int AS conversations
       FROM conversations GROUP BY project ORDER BY conversations DESC`,
  );
  console.log('\n=== conversations by project ===');
  console.table(byConvProject);
}

// ── 4. Is the test number already a real donor? ─────────────────────────────
const { rows: testHit } = await q(
  `SELECT id, name, mobile_number, project_supported
     FROM donor_profiles
    WHERE mobile_number IN ('7054996353','917054996353')
       OR replace(replace(mobile_number,'+',''),'-','') IN ('7054996353','917054996353')`,
);
console.log('\n=== test recipient 7054996353 ===');
console.log(testHit.length ? testHit : 'no donor record (good - test send will proceed)');

process.exit(0);