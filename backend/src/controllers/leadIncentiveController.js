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
  getStoppedSlabIds,
  clearSlabStop,
  clearAllSlabStops,
} from '../models/incentiveSlabModel.js';
import {
  getDailySummary,
  getFroDetail,
  getCurrentChampions,
  getFroRanks,
  announceChampion,
  notifyRangeRuleChange,
  stopSlabCompetition,
  stopAllSlabsCompetition,
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

    // Optional competition window (⏱ Start/End Time control): a value sets the
    // start/end instant, null or '' clears it back to "not scheduled/ended".
    const startedAt = req.body.started_at !== undefined
      ? (req.body.started_at === null || req.body.started_at === '' ? null : new Date(req.body.started_at).toISOString())
      : undefined;
    const endedAt = req.body.ended_at !== undefined
      ? (req.body.ended_at === null || req.body.ended_at === '' ? null : new Date(req.body.ended_at).toISOString())
      : undefined;

    const slab = await updateSlab(req.params.id, {
      min_amount: Number(min_amount),
      max_amount: Number(max_amount),
      incentive_amount: Number(incentive_amount) || 0,
      min_lead_amount: numOr(req.body.min_lead_amount, 300),
      lead_rate: numOr(req.body.lead_rate, 20),
      started_at: startedAt,
      ended_at: endedAt,
    });
    if (!slab) return res.status(404).json({ message: 'Slab not found' });

    // Configuring a range restarts its competition (clears any stopped marker).
    try { await clearSlabStop(req.params.id); } catch (e) { console.error('[lead rules clear stop]', e?.message); }

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
    const { min_lead_amount, lead_rate, started_at, ended_at } = req.body || {};
    const hasRates = min_lead_amount !== undefined && min_lead_amount !== '' && lead_rate !== undefined && lead_rate !== '';
    const hasTimes = started_at !== undefined;
    if (!hasRates && !hasTimes) {
      return res.status(400).json({ message: 'Provide min_lead_amount + lead_rate, or started_at/ended_at' });
    }
    if (hasRates) {
      const minLead = Number(min_lead_amount);
      const rate = Number(lead_rate);
      if (!(minLead >= 0) || !(rate >= 0)) {
        return res.status(400).json({ message: 'Minimum Lead Amount and ₹ per Qualified Lead must be 0 or more' });
      }
    }
    const startedAtVal = started_at !== undefined
      ? (started_at === null || started_at === '' ? null : new Date(started_at).toISOString())
      : undefined;
    const endedAtVal = ended_at !== undefined
      ? (ended_at === null || ended_at === '' ? null : new Date(ended_at).toISOString())
      : undefined;

    const slabs = await updateAllSlabs({
      min_lead_amount: hasRates ? Number(min_lead_amount) : undefined,
      lead_rate: hasRates ? Number(lead_rate) : undefined,
      started_at: startedAtVal,
      ended_at: endedAtVal,
    });
    // Setting a new competition window re-opens any range that was stopped for
    // today (the scheduled race takes over). Value-only applies keep the previous behaviour.
    if (hasTimes) {
      try { await clearAllSlabStops(); } catch (e) { console.error('[lead rules clear stops]', e?.message); }
    }
    // Every FRO gets one combined popup listing all ranges with the new common value.
    if (hasRates) {
      try { await notifyRangeRuleChange({ slabs }); }
      catch (e) { console.error('[lead rules notify]', e?.message); }
    }
    return res.json({ ok: true, count: slabs.length, slabs });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Admin stops a range's live competition. Removes the range from the FRO live
// leaderboard for the date, deletes today's champion announcements for it and
// clears the rule/winner popups from every panel's notification feed.
export async function stopSlabCompetitionHandler(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = await stopSlabCompetition({ slabId: req.params.id, date, userId: req.user?.id });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Admin stops EVERY live range competition for a date at once.
export async function stopAllSlabsCompetitionHandler(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = await stopAllSlabsCompetition({ date, userId: req.user?.id });
    return res.json(result);
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

    // Enrich with worker photos so the history leaderboard can show the
    // winner's image (like "Sir ka Incentive" winner display).
    const ids = [...new Set([
      ...(summary.fros || []).map(f => f.fro_id),
      ...(summary.champions || []).map(c => c.fro_id),
    ])];
    if (ids.length > 0) {
      const { data: workers } = await db.from('workers').select('id, photo_url').in('id', ids);
      const photoMap = {};
      for (const w of workers || []) photoMap[w.id] = w.photo_url || null;
      summary.fros = (summary.fros || []).map(f => ({ ...f, photo_url: photoMap[f.fro_id] || null }));
      summary.champions = (summary.champions || []).map(c => ({ ...c, photo_url: photoMap[c.fro_id] || null }));
    } else {
      summary.fros = (summary.fros || []).map(f => ({ ...f, photo_url: null }));
      summary.champions = (summary.champions || []).map(c => ({ ...c, photo_url: null }));
    }

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

// FRO-facing "my summary" for the Lead Incentive dashboard. Lets the logged-in
// FRO see their own daily numbers, their range, whether today's competition is
// live, and whether they are today's champion (includes the champion bonus).
export async function myLeadSummaryHandler(req, res) {
  try {
    const froId = req.user?.id;
    if (!froId) return res.status(401).json({ message: 'Unauthorized' });

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const detail = await getFroDetail(froId, date);
    if (!detail) return res.status(404).json({ message: 'FRO not found' });

    // Same daily computation used everywhere → consistent champion/bonus figures.
    const summary = await getDailySummary(date);
    const champ = (summary.champions || []).find(c => String(c.fro_id) === String(froId));

    const isChampion = !!champ;
    const championBonus = champ ? Number(champ.champion_bonus || 0) : 0;
    const totalIncentive = (Number(detail.lead_incentive) || 0)
      + (Number(detail.slab_bonus) || 0)
      + championBonus;

    // Is this FRO's range competition live right now? Mirrors getFroRanks logic:
    // needs a started_at in the past, an ended_at (if set) still in the future,
    // and the range must not have been stopped for today.
    const slab = detail.slab;
    let isLive = false;
    if (slab && slab.started_at) {
      const nowMs = Date.now();
      const started = new Date(slab.started_at).getTime();
      const ended = slab.ended_at ? new Date(slab.ended_at).getTime() : null;
      isLive = started <= nowMs && (!ended || ended > nowMs);
    }
    if (isLive && slab) {
      try {
        const stopped = await getStoppedSlabIds();
        const datePrefix = String(date).slice(0, 10);
        const stoppedToday = (stopped || []).some(s =>
          String(s.stopped_date).slice(0, 10) === datePrefix && String(s.id) === String(slab.id)
        );
        if (stoppedToday) isLive = false;
      } catch (e) {
        console.error('[lead my summary] stopped check:', e?.message);
      }
    }

    return res.json({
      ...detail,
      is_live: isLive,
      is_champion: isChampion,
      champion_bonus: championBonus,
      total_incentive: totalIncentive,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// FRO-facing daily leaderboard (corner card + big popup, any active role).
export async function leaderboardHandler(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const includeWon = req.query.includeWon === '1' || req.query.include_won === '1';
    const ranks = await getFroRanks(date, { includeWon });
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
