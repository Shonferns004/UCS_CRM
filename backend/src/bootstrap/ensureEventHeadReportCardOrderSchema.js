import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

/**
 * Monthly Report card order bootstrap.
 *
 * Re-applies backend/migrations/194_event_head_report_card_order.sql on every
 * boot. It is written with CREATE ... IF NOT EXISTS, so re-running it against
 * an already-migrated database is a no-op - a fresh or partially-migrated DB
 * gets the right schema without a manual step, and a boot failure here must
 * never stop the rest of the API from coming up.
 *
 * Only `event_head_report_card_order` is touched; nothing else is read or
 * changed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  '../../migrations/194_event_head_report_card_order.sql',
].map((f) => path.resolve(here, f));

export async function ensureEventHeadReportCardOrderSchema() {
  try {
    for (const file of MIGRATIONS) {
      await db._pool.query(fs.readFileSync(file, 'utf8'));
    }
    console.log('event_head_report_card_order schema ready');
  } catch (e) {
    console.warn('[event_head_report_card_order schema] skip:', e?.message || String(e));
  }
}
