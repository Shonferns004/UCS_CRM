import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

/**
 * Social Media task-assignments bootstrap.
 *
 * Re-applies backend/migrations/184_task_assignments.sql on every boot. The
 * migration is written with CREATE ... IF NOT EXISTS and CREATE INDEX IF NOT
 * EXISTS, so running it against an already-migrated database is a no-op — a
 * fresh or partially-migrated DB gets the table without a manual step, and a
 * boot failure here must never stop the rest of the API from coming up.
 *
 * Only `task_assignments` is touched; nothing else is read or changed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../migrations/184_task_assignments.sql');

export async function ensureTaskAssignmentSchema() {
  try {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    await db._pool.query(sql);
    console.log('task_assignments schema ready');
  } catch (e) {
    console.warn('[task_assignments schema] skip:', e?.message || String(e));
  }
}
