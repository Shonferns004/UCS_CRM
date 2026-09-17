import db from '../config/db.js';
import { getSetting, upsertSetting } from '../models/settingsModel.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const RESET_DAY_KEY = 'fro_idle_reset_day';

export function istDayOf(date = new Date()) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Clears every FRO's current idle streak. The day's idle total is already saved
// in fro_daily_stats on every heartbeat (GREATEST upsert), so zeroing the live row
// never loses history — it just starts the new day from 0.
export async function resetFroIdleNow() {
  const { error } = await db
    .from('fro_live_status')
    .update({ today_idle_seconds: 0, idle_since: null, updated_at: new Date().toISOString() })
    .not('worker_id', 'is', null);
  if (error) throw error;
}

// Auto-reset at IST midnight. Guarded by a settings key so it runs at most once
// per IST day (a server restart won't wipe idle again the same day).
export async function checkAndResetFroIdleDaily() {
  const today = istDayOf();
  let last = null;
  try { last = await getSetting(RESET_DAY_KEY); } catch { last = null; }
  if (last === today) return false;
  try { await resetFroIdleNow(); } catch (e) {
    console.error('[froIdleReset] reset failed:', e?.message || String(e));
    return false;
  }
  try { await upsertSetting(RESET_DAY_KEY, today); } catch { /* non-fatal */ }
  console.log(`[froIdleReset] cleared all FRO idle counters for ${today}`);
  return true;
}
