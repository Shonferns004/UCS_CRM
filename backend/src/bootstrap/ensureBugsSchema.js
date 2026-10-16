import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

/**
 * QA bug-tracker bootstrap.
 *
 * Re-applies backend/migrations/189_bugs.sql on every boot. The migration uses
 * CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
 * EXISTS, so running it against an already-migrated database is a no-op — a
 * fresh or partially-migrated DB gets the `bugs` table without a manual step.
 * A boot failure here must never stop the rest of the API from coming up.
 *
 * Only the `bugs` table is touched; nothing else is read or changed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../migrations/189_bugs.sql');

export async function ensureBugsSchema() {
  try {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    await db._pool.query(sql);
    console.log('bugs schema ready');
  } catch (e) {
    console.warn('[bugs schema] skip:', e?.message || String(e));
  }
}
