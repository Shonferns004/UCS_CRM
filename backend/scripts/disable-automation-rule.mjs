// Disables ONE WhatsApp automation rule. Approved by the operator.
//
// ── Scope, stated before the statement ─────────────────────────────────────
//
// Exactly one row, in one table:
//
//   UPDATE whatsapp_automation_rules SET enabled = false WHERE id = $1
//
// Nothing is deleted. The rule's name, keyword, match_type, reply_text,
// priority and cooldown_seconds are left exactly as they are, so re-enabling it
// later is a single `SET enabled = true` and loses no configuration.
//
// The master switch (whatsapp_automation_settings.enabled) is deliberately NOT
// touched: the operator asked for this one rule to be disabled, not for the
// automation feature to be switched off for every project.
//
// The WHERE clause carries the project and the name as well as the id, so if
// the row was edited since it was last read this updates 0 rows and says so
// rather than disabling whatever now occupies that id.
//
// Idempotent: re-running when the rule is already disabled updates 0 rows and
// reports ALREADY DISABLED.

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

// The operator named this rule by project and by name; both are in the guard.
const TARGET = { id: 1, project: 'bsct2', name: 'timings enquiry' };

// ── Before ─────────────────────────────────────────────────────────────────
const { rows: before } = await db._pool.query(
  `SELECT id, project, name, keyword, match_type, enabled, priority, cooldown_seconds,
          (reply_text IS NOT NULL AND length(reply_text) > 0) AS has_reply_text,
          (template_name IS NOT NULL) AS has_template
     FROM whatsapp_automation_rules
    WHERE id = $1 AND project = $2 AND name = $3`,
  [TARGET.id, TARGET.project, TARGET.name],
);

if (before.length === 0) {
  console.error(
    `ABORTED: no rule matching id=${TARGET.id} project=${TARGET.project} name="${TARGET.name}". `
    + 'Nothing was changed.',
  );
  process.exit(1);
}

const row = before[0];
console.log('BEFORE:', row);

if (row.enabled === false) {
  console.log('ALREADY DISABLED. Nothing was changed.');
  process.exit(0);
}

// ── The one statement ──────────────────────────────────────────────────────
const { rows: updated } = await db._pool.query(
  `UPDATE whatsapp_automation_rules
      SET enabled = false
    WHERE id = $1 AND project = $2 AND name = $3 AND enabled = true
    RETURNING id, project, name, keyword, match_type, enabled, priority, cooldown_seconds`,
  [TARGET.id, TARGET.project, TARGET.name],
);

if (updated.length === 0) {
  console.error('ABORTED: the row changed between the read and the update. Nothing was changed.');
  process.exit(1);
}

console.log('AFTER: ', updated[0]);

// ── Proof the configuration survived ───────────────────────────────────────
const { rows: after } = await db._pool.query(
  `SELECT keyword, match_type, reply_text, priority, cooldown_seconds, template_name, template_language
     FROM whatsapp_automation_rules WHERE id = $1`,
  [TARGET.id],
);
console.log('\npreserved configuration:', after[0]);

const { rows: master } = await db._pool.query(
  `SELECT id, enabled, updated_by, updated_at FROM whatsapp_automation_settings WHERE id = 1`,
);
console.log('master switch left untouched:', master[0] || 'no row');

const { rows: enabledLeft } = await db._pool.query(
  `SELECT count(*)::int AS n FROM whatsapp_automation_rules WHERE enabled`,
);
console.log('enabled rules remaining:', enabledLeft[0].n);

console.log('\nDone. Re-enable with: UPDATE whatsapp_automation_rules SET enabled = true WHERE id = 1;');
process.exit(0);