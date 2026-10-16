import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

/**
 * Monthly Planner row → created-event link bootstrap.
 *
 * Re-applies backend/migrations/189_event_head_planner_event_links.sql on every
 * boot. The migration is written with CREATE ... IF NOT EXISTS, so running it
 * against an already-migrated database is a no-op — a fresh or partially-
 * migrated DB gets the table without a manual step, and a boot failure here must
 * never stop the rest of the API from coming up.
 *
 * Only `event_head_planner_event_links` is touched; nothing else is read or
 * changed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../migrations/189_event_head_planner_event_links.sql');

export async function ensureEventHeadPlannerEventLinkSchema() {
  try {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    await db._pool.query(sql);
    console.log('event_head_planner_event_links schema ready');
  } catch (e) {
    console.warn('[event_head_planner_event_links schema] skip:', e?.message || String(e));
  }
}
