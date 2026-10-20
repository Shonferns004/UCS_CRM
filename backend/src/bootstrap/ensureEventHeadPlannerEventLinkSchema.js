import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

/**
 * Monthly Planner row → created-event link bootstrap.
 *
 * Re-applies backend/migrations/189_event_head_planner_event_links.sql (the
 * table) and 193_event_head_planner_event_links_ngo.sql (its unique key, which
 * must include the NGO) on every boot. Both are written with CREATE ... IF NOT
 * EXISTS / DROP ... IF EXISTS, so re-running them against an already-migrated
 * database is a no-op — a fresh or partially-migrated DB gets the right schema
 * without a manual step, and a boot failure here must never stop the rest of
 * the API from coming up.
 *
 * Only `event_head_planner_event_links` is touched; nothing else is read or
 * changed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  '../../migrations/189_event_head_planner_event_links.sql',
  '../../migrations/193_event_head_planner_event_links_ngo.sql',
].map((f) => path.resolve(here, f));

export async function ensureEventHeadPlannerEventLinkSchema() {
  try {
    for (const file of MIGRATIONS) {
      await db._pool.query(fs.readFileSync(file, 'utf8'));
    }
    console.log('event_head_planner_event_links schema ready');
  } catch (e) {
    console.warn('[event_head_planner_event_links schema] skip:', e?.message || String(e));
  }
}
