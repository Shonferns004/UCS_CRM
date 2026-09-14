import db from '../config/db.js';
import {
  getSettings,
  updateSettings,
} from '../models/incentiveSettingsModel.js';
import {
  getAllSlabs,
  getSlabById,
  createSlab,
  updateSlab,
  deleteSlab,
  updateAllSlabs,
  getSlabFros,
  setSlabFros,
} from '../models/incentiveSlabModel.js';
import {
  getDailySummary,
  getFroDetail,
  getCurrentChampions,
  getFroRanks,
  announceChampion,
  notifyRangeRuleChange,
} from '../services/leadIncentiveService.js';
import {
  getAnnouncements,
  deleteAnnouncement,
} from '../models/leadChampionModel.js';
import { ensureLowLeadRangeActive } from '../bootstrap/ensureSpecialIncentiveSchema.js';

// ─── Settings ──────────────────────────────────────────────

export async function getSettingsHandler(req, res) {
  try {
    const settings = await getSettings();
    return res.json(settings);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function updateSettingsHandler(req, res) {
  try {
    const { lead_rate, min_lead_amount, champion_bonus } = req.body || {};
    const updated = await updateSettings({ lead_rate, min_lead_amount, champion_bonus });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// ─── Slabs CRUD ────────────────────────────────────────────

export async function listSlabsHandler(req, res) {
  try {
    // Self-heal: guarantee the ₹1–₹20,000 range exists & is active before it is
    // listed, so a soft-deleted/missing low band reappears the moment the Lead
    // Incentive page loads (no backend restart required).
    try { await ensureLowLeadRangeActive(); } catch (e) { console.error('[lead rules heal]', e?.message); }
    const slabs = await getAllSlabs();
    return res.json(slabs);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

const numOr = (v, dflt) => {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

export async function createSlabHandler(req, res) {
  try {
    const { min_amount, max_amount, incentive_amount, min_lead_amount, lead_rate } = req.body || {};
    if (min_amount === undefined || max_amount === undefined) {
      return res.status(400).json({ message: 'min_amount and max_amount are required' });
    }
    if (Number(min_amount) >= Number(max_amount)) {
      return res.status(400).json({ message: 'min_amount must be less than max_amount' });
    }

    // Check for overlapping slabs
    const existing = await getAllSlabs();
    const overlap = existing.find(s =>
      s.is_active &&
      Number(min_amount) < Number(s.max_amount) &&
      Number(max_amount) > Number(s.min_amount)
    );
    if (overlap) {
      return res.status(400).json({
        message: `Overlap with existing slab ₹${Number(overlap.min_amount).toLocaleString('en-IN')} – ₹${Number(overlap.max_amount).toLocaleString('en-IN')}`,
      });
    }

    // Fall back to global defaults when per-slab values omitted
    let defaults = { min_lead_amount: 300, lead_rate: 20 };
    try { defaults = { ...defaults, ...(await getSettings()) }; } catch { /* keep defaults */ }

    const slab = await createSlab({
      min_amount: Number(min_amount),
      max_amount: Number(max_amount),
      incentive_amount: Number(incentive_amount) || 0,
      min_lead_amount: numOr(req.body.min_lead_amount, 300),
      lead_rate: numOr(req.body.lead_rate, 20),
    });
    // A new range may re-bucket FROs — tell the ones landing in it.
    try { await notifyRangeRuleChange({ slab }); } catch (e) { console.error('[lead rules notify]', e?.message); }
    return res.status(201).json(slab);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function updateSlabHandler(req, res) {
  try {
    const { min_amount, max_amount, incentive_amount, min_lead_amount, lead_rate } = req.body || {};
    if (min_amount === undefined || max_amount === undefined) {
      return res.status(400).json({ message: 'min_amount and max_amount are required' });
    }
    if (Number(min_amount) >= Number(max_amount)) {
      return res.status(400).json({ message: 'min_amount must be less than max_amount' });
    }

    // Check overlap excluding self
    const existing = await getAllSlabs();
    const overlap = existing.find(s =>
      s.is_active &&
      s.id !== req.params.id &&
      Number(min_amount) < Number(s.max_amount) &&
      Number(max_amount) > Number(s.min_amount)
    );
    if (overlap) {
      return res.status(400).json({
        message: `Overlap with existing slab ₹${Number(overlap.min_amount).toLocaleString('en-IN')} – ₹${Number(overlap.max_amount).toLocaleString('en-IN')}`,
      });
    }

    const oldSlab = await getSlabById(req.params.id);

    let defaults = { min_lead_amount: 300, lead_rate: 20 };
    try { defaults = { ...defaults, ...(await getSettings()) }; } catch { /* keep defaults */ }

    const slab = await updateSlab(req.params.id, {
      min_amount: Number(min_amount),
      max_amount: Number(max_amount),
      incentive_amount: Number(incentive_amount) || 0,
      min_lead_amount: numOr(req.body.min_lead_amount, 300),
      lead_rate: numOr(req.body.lead_rate, 20),
    });
    if (!slab) return res.status(404).json({ message: 'Slab not found' });

    // Only ping the range's FROs when the qualify amount or per-lead reward changed.
    if (oldSlab) {
      const minLeadChanged = Number(oldSlab.min_lead_amount) !== Number(slab.min_lead_amount);
      const rateChanged = Number(oldSlab.lead_rate) !== Number(slab.lead_rate);
      if (minLeadChanged || rateChanged) {
        try { await notifyRangeRuleChange({ slab }); } catch (e) { console.error('[lead rules notify]', e?.message); }
      }
    }
    return res.json(slab);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function deleteSlabHandler(req, res) {
  try {
    const slab = await deleteSlab(req.params.id);
    if (!slab) return res.status(404).json({ message: 'Slab not found' });
    return res.json({ ok: true, id: slab.id });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function applyAllSlabsHandler(req, res) {
  try {
    const { min_lead_amount, lead_rate } = req.body || {};
    if (min_lead_amount === undefined || min_lead_amount === '' || lead_rate === undefined || lead_rate === '') {
      return res.status(400).json({ message: 'min_lead_amount and lead_rate are required' });
    }
    const minLead = Number(min_lead_amount);
    const rate = Number(lead_rate);
    if (!(minLead >= 0) || !(rate >= 0)) {
      return res.status(400).json({ message: 'Minimum Lead Amount and ₹ per Qualified Lead must be 0 or more' });
    }

    const slabs = await updateAllSlabs({
      min_lead_amount: minLead,
      lead_rate: rate,
    });
    // Every FRO gets one combined popup listing all ranges with the new common value.
    try { await notifyRangeRuleChange({ slabs }); }
    catch (e) { console.error('[lead rules notify]', e?.message); }
    return res.json({ ok: true, count: slabs.length, slabs });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// ─── Lead Summary ──────────────────────────────────────────

export async function dailySummaryHandler(req, res) {
  try {
    // Same self-heal as listSlabsHandler — the page fetches slabs + summary in
    // parallel, so heal here too to avoid a stale first summary.
    try { await ensureLowLeadRangeActive(); } catch (e) { console.error('[lead rules heal]', e?.message); }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const summary = await getDailySummary(date);
    return res.json(summary);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function froDetailHandler(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const detail = await getFroDetail(req.params.id, date);
    if (!detail) return res.status(404).json({ message: 'FRO not found' });
    return res.json(detail);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// FRO-facing daily leaderboard (corner card + big popup, any active role).
export async function leaderboardHandler(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const ranks = await getFroRanks(date);
    return res.json(ranks);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Get the current/announced range champions (FRO-facing, any role).
export async function currentChampionHandler(req, res) {
  try {
    const date = req.query.date || null;
    const champions = await getCurrentChampions(date);
    const withPhotos = [];
    for (const champion of champions) {
      let winner_photo_url = null;
      if (champion && champion.fro_worker_id) {
        try {
          const { data: winners } = await db
            .from('workers')
            .select('id, photo_url')
            .eq('id', champion.fro_worker_id);
          winner_photo_url = (winners && winners[0]?.photo_url) || null;
        } catch (e) {
          console.error('[lead champion] fetch photo:', e?.message);
        }
      }
      withPhotos.push({ ...champion, winner_photo_url });
    }
    return res.json({ champions: withPhotos });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Admin announces today's range winners. Locks each range's first-hitter into a
// snapshot + notifies all panels.
export async function announceChampionHandler(req, res) {
  try {
    const { date, message } = req.body || {};
    const result = await announceChampion({ date, message, userId: req.user?.id });
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }
    return res.status(201).json(result);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// FROs assigned to compete in a specific range (⚙️ Configure).
export async function getSlabFrosHandler(req, res) {
  try {
    const fros = await getSlabFros(req.params.id);
    return res.json({ fro_ids: fros });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function setSlabFrosHandler(req, res) {
  try {
    const { fro_ids } = req.body || {};
    if (!Array.isArray(fro_ids)) {
      return res.status(400).json({ message: 'fro_ids must be an array' });
    }
    const saved = await setSlabFros(req.params.id, fro_ids);
    return res.json({ ok: true, fro_ids: saved });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Full history of champion announcements (live-updating section source).
export async function championHistoryHandler(req, res) {
  try {
    const history = await getAnnouncements();
    return res.json(history);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Hard-delete an announcement. Also removes the FRO-facing champion banner for
// that date AND the champion notification rows every panel got at announce time
// (bell entries type='lead_champion'), so deleting the champion removes it from
// all sides immediately. notification_log is realtime-enabled, so open panels
// drop the bell entry live.
export async function deleteChampionHandler(req, res) {
  try {
    const row = await deleteAnnouncement(req.params.id);
    if (!row) return res.status(404).json({ message: 'Announcement not found' });

    try {
      await db.from('notification_log').delete()
        .eq('type', 'lead_champion')
        .eq('reference_id', String(row.id));
    } catch (e) {
      console.error('[lead champion] cleanup notifications:', e?.message);
    }

    return res.json({ ok: true, id: row.id });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}
