// ─── Hide Old Donors (admin switch) ──────────────────────────────────────────
//
// GET /api/ngo-admin/hide-old-donors   → { hidden: boolean }
// PUT /api/ngo-admin/hide-old-donors   → body { hidden: boolean } → { hidden }
//
// One global switch that hides every OLD-station donor from the field teams.
// Enforcement lives in the FRO read paths (see services/oldDonorVisibility.js
// and the scope filter in controllers/froController.js); this controller only
// owns the on/off state and the cache invalidation that goes with a flip.

import redis from '../config/redis.cjs';
import { cacheDelPrefix } from '../utils/ttlCache.js';
import { isOldDonorsHidden, setOldDonorsHidden } from '../services/oldDonorVisibility.js';

// Every FRO-facing cached payload is prefixed "fro:" (dash/target/search/
// donors/receipts), and the only Redis tier under the FRO namespace is the
// My Leads list. Both are dropped on a flip so nobody keeps looking at a
// donor list that was built before the switch moved.
const FRO_CACHE_PREFIX = 'fro:';
const FRO_DONORS_REDIS_PREFIX = 'v1:fro:donors:';

const bustFroCaches = () => {
  cacheDelPrefix(FRO_CACHE_PREFIX);
  redis.delByPrefix(FRO_DONORS_REDIS_PREFIX).catch(() => { });
};

export const getHideOldDonors = async (req, res) => {
  try {
    const hidden = await isOldDonorsHidden();
    return res.json({ hidden });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const setHideOldDonors = async (req, res) => {
  try {
    const body = req.body || {};
    // Accept `hidden`, `value` or `hide_old_donors` so the client does not
    // have to care about the field name.
    const raw = body.hidden ?? body.value ?? body.hide_old_donors;
    const hidden = raw === true || raw === 'true' || raw === 1 || raw === '1';
    await setOldDonorsHidden(hidden);
    bustFroCaches();
    return res.json({
      hidden,
      message: hidden
        ? 'Old-station donors are now hidden from the field teams. They can only work on the new (FD) stations.'
        : 'Old-station donors are visible again to the field teams.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
