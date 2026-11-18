import db from '../config/db.js';
import {
  GOOGLE_ADS_CONFIG_FIELDS,
  GOOGLE_ADS_SECRET_FIELDS,
  applyGoogleAdsConfigPatch,
  clearGoogleAdsConfig,
  getGoogleAdsConfig,
  getGoogleAdsConfigView,
  isGa4Configured,
  isGoogleAdsConfigured,
  normalizeApiVersion,
  normalizeCustomerId,
  normalizeGa4PropertyId,
  persistGoogleAdsConfig,
  restoreGoogleAdsConfig,
  snapshotGoogleAdsConfig,
} from '../services/googleAdsConfigStore.js';
import {
  clearGa4Cache,
  clearTokenCache,
  getGoogleAccessToken,
  getLastSync,
  startGoogleAdsSyncScheduler,
  syncGoogleAdsMetrics,
  testGoogleConnection,
} from '../services/googleAdsService.js';
import { getGoogleAdsOverview } from '../services/googleAdsOverview.js';

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

function requirementChecklist() {
  const cfg = getGoogleAdsConfig();
  return {
    client_id: Boolean(cfg.clientId),
    client_secret: Boolean(cfg.clientSecret),
    refresh_token: Boolean(cfg.refreshToken),
    customer_id: Boolean(cfg.customerId),
    ga4_property_id: Boolean(cfg.ga4PropertyId),
    ads_ready: isGoogleAdsConfigured(),
    ga4_ready: isGa4Configured(),
  };
}

async function readLastSync() {
  const cfg = getGoogleAdsConfig();
  const row = await getLastSync(cfg.customerId).catch(() => null);
  return row
    ? {
      at: row.last_run_at,
      detail: row.detail || null,
      errors: Array.isArray(row.detail?.errors) ? row.detail.errors : [],
      customer: row.detail?.customer || null,
    }
    : null;
}

export async function googleAdsStatus(req, res) {
  try {
    const [view, lastSync] = await Promise.all([
      getGoogleAdsConfigView(),
      readLastSync(),
    ]);
    return res.json({
      configured: isGoogleAdsConfigured(),
      ga4_configured: isGa4Configured(),
      requirements: requirementChecklist(),
      fields: view.fields,
      customer: lastSync?.customer || null,
      last_sync: lastSync,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function getGoogleAdsConfigHandler(req, res) {
  try {
    return res.json(await getGoogleAdsConfigView());
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// On-demand reveal for a saved secret. The normal config view only ever sends a
// mask; this endpoint is the one place a raw value leaves the server, so it is
// limited to admin roles, marked no-store, and logged without the value.
export async function revealGoogleAdsConfigField(req, res) {
  try {
    const field = String(req.body?.field || req.query?.field || '').trim().toUpperCase();
    if (!GOOGLE_ADS_SECRET_FIELDS.includes(field)) {
      return res.status(400).json({ message: 'Only secret fields can be revealed.' });
    }

    const { rows } = await db._pool.query(
      `select value from settings where key = $1`,
      [field.toLowerCase()],
    );
    const value = String(rows?.[0]?.value || '');

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    if (value) {
      const actor = req.user?.email || req.user?.name || req.user?.id || 'unknown';
      console.log(`[google-ads] secret revealed: ${field} by ${actor}`);
    }

    return res.json({ field, value, set: Boolean(value) });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

function collectPatch(body = {}) {
  const patch = {};
  for (const key of GOOGLE_ADS_CONFIG_FIELDS) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
      continue;
    }
    const alias = key.toLowerCase();
    if (body[alias] !== undefined) patch[key] = body[alias];
  }
  return patch;
}

export async function saveGoogleAdsConfigHandler(req, res) {
  try {
    const patch = collectPatch(req.body || {});
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: `Send at least one of: ${GOOGLE_ADS_CONFIG_FIELDS.join(', ')}` });
    }

    if (patch.GOOGLE_ADS_CUSTOMER_ID !== undefined) {
      const customerId = normalizeCustomerId(patch.GOOGLE_ADS_CUSTOMER_ID);
      if (patch.GOOGLE_ADS_CUSTOMER_ID && !/^\d{6,12}$/.test(customerId)) {
        return res.status(400).json({ message: 'Customer id must be 6–12 digits (123-456-7890 is accepted and stored as digits).' });
      }
      patch.GOOGLE_ADS_CUSTOMER_ID = customerId;
    }

    if (patch.GOOGLE_ADS_LOGIN_CUSTOMER_ID !== undefined) {
      const loginId = normalizeCustomerId(patch.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
      if (patch.GOOGLE_ADS_LOGIN_CUSTOMER_ID && !/^\d{6,12}$/.test(loginId)) {
        return res.status(400).json({ message: 'Manager account id must be 6–12 digits.' });
      }
      patch.GOOGLE_ADS_LOGIN_CUSTOMER_ID = loginId;
    }

    if (patch.GA4_PROPERTY_ID !== undefined) {
      const propertyId = normalizeGa4PropertyId(patch.GA4_PROPERTY_ID);
      if (patch.GA4_PROPERTY_ID && !/^\d{6,15}$/.test(propertyId)) {
        return res.status(400).json({ message: 'GA4 property id must be numeric (properties/123456789 is accepted).' });
      }
      patch.GA4_PROPERTY_ID = propertyId;
    }

    if (patch.GOOGLE_ADS_API_VERSION !== undefined) {
      const requested = String(patch.GOOGLE_ADS_API_VERSION || '').trim();
      if (requested && !/^v?\d{1,3}$/i.test(requested)) {
        return res.status(400).json({ message: 'API version must look like v21.' });
      }
      patch.GOOGLE_ADS_API_VERSION = normalizeApiVersion(requested);
    }

    if (patch.GOOGLE_ADS_CLIENT_ID !== undefined) {
      const clientId = String(patch.GOOGLE_ADS_CLIENT_ID || '').trim();
      if (clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
        return res.status(400).json({ message: 'Client id should end with .apps.googleusercontent.com' });
      }
      patch.GOOGLE_ADS_CLIENT_ID = clientId;
    }

    const previous = snapshotGoogleAdsConfig();

    applyGoogleAdsConfigPatch(patch);
    clearTokenCache();

    const cfgAfterPatch = getGoogleAdsConfig();
    // Verify the OAuth trio before anything is persisted. A rejected refresh
    // token must never replace a working configuration. Only run the round trip
    // when one of the three OAuth values actually changed.
    const oauthTouched = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN']
      .some((key) => patch[key] !== undefined);
    let verification = null;
    if (oauthTouched && cfgAfterPatch.clientId && cfgAfterPatch.clientSecret && cfgAfterPatch.refreshToken) {
      try {
        await getGoogleAccessToken({ force: true });
        verification = { ok: true, message: 'OAuth token issued' };
      } catch (e) {
        restoreGoogleAdsConfig(previous);
        clearTokenCache();
        return res.status(400).json({
          message: `Google rejected the OAuth credentials: ${e?.message || e}`,
          verification: { ok: false, error: e?.message || String(e) },
        });
      }
    }

    try {
      await persistGoogleAdsConfig(patch);
    } catch (e) {
      // The DB is the source of truth, so a failed write must also undo the
      // in-memory patch; otherwise the running process would use a credential
      // that will disappear on the next restart.
      restoreGoogleAdsConfig(previous);
      clearTokenCache();
      throw e;
    }
    clearGa4Cache();
    startGoogleAdsSyncScheduler();

    return res.json({
      ok: true,
      saved: Object.keys(patch),
      verification,
      config: await getGoogleAdsConfigView(),
      status: {
        configured: isGoogleAdsConfigured(),
        ga4_configured: isGa4Configured(),
        requirements: requirementChecklist(),
        last_sync: await readLastSync(),
      },
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function disconnectGoogleAds(req, res) {
  try {
    const cleared = await clearGoogleAdsConfig();
    clearTokenCache();
    clearGa4Cache();
    return res.json({
      ok: true,
      cleared,
      note: 'Saved credentials were removed from the database. Google Ads is now disconnected until new values are saved.',
      config: await getGoogleAdsConfigView(),
      status: {
        configured: isGoogleAdsConfigured(),
        ga4_configured: isGa4Configured(),
        requirements: requirementChecklist(),
      },
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function testGoogleAdsConnection(req, res) {
  try {
    return res.json(await testGoogleConnection());
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function syncGoogleAds(req, res) {
  try {
    const days = clampInt(req.body?.days ?? req.query?.days, 1, 180, 30);
    const result = await syncGoogleAdsMetrics({ days });
    clearGa4Cache();
    return res.json({ ...result, last_sync: await readLastSync() });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
}

export async function getGoogleAdsOverviewHandler(req, res) {
  try {
    const days = clampInt(req.query?.days, 1, 180, 30);
    const sample = String(req.query?.sample || '') === '1';
    const overview = await getGoogleAdsOverview({ days, sample });
    const leads = sample
      ? { total: 0, rows: [], note: 'Sample preview does not include CRM leads.' }
      : await loadRecentLeads({ days, limit: 25 }).catch((e) => ({ total: 0, rows: [], error: e?.message || String(e) }));
    return res.json({ ...overview, leads });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// Google-attributed leads already present in the CRM. Attribution columns are
// created by ensureGoogleAdsSchema, so this only ever returns rows the CRM
// actually captured — no fabricated pipeline.
export async function listGoogleAdsLeads(req, res) {
  try {
    const days = clampInt(req.query?.days, 1, 180, 30);
    const limit = clampInt(req.query?.limit, 1, 200, 50);
    const result = await loadRecentLeads({ days, limit });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

async function loadRecentLeads({ days, limit }) {
  const safeDays = clampInt(days, 1, 180, 30);
  const safeLimit = clampInt(limit, 1, 200, 50);

  try {
    const where = `
      created_at >= NOW() - ($1::text || ' days')::interval
      AND (
        source ILIKE '%google%'
        OR source ILIKE '%adwords%'
        OR gclid IS NOT NULL
        OR google_campaign_name IS NOT NULL
      )
    `;

    const [rowsRes, countRes] = await Promise.all([
      db._pool.query(
        `SELECT id, name, phone, email, source, status, created_at, assigned_to,
                gclid, google_campaign_name, google_keyword, google_match_type
           FROM leads
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $2`,
        [safeDays, safeLimit],
      ),
      db._pool.query(
        `SELECT COUNT(*)::int AS total FROM leads WHERE ${where}`,
        [safeDays],
      ),
    ]);

    const rows = (rowsRes.rows || []).map((row) => ({
      id: row.id,
      name: row.name || 'Unnamed contact',
      phone: row.phone || '',
      email: row.email || '',
      source: row.source || 'Google Ads',
      status: row.status || 'new',
      createdAt: row.created_at,
      owner: row.assigned_to == null ? '' : String(row.assigned_to),
      campaign: row.google_campaign_name || '',
      keyword: row.google_keyword || '',
      matchType: row.google_match_type || '',
      gclid: row.gclid || '',
    }));

    return {
      total: countRes.rows?.[0]?.total || rows.length,
      rows,
      available: true,
      note: rows.length
        ? null
        : 'No Google-attributed leads in this window. Add a gclid (or source containing “Google”) when your landing page creates the lead.',
    };
  } catch (e) {
    return {
      total: 0,
      rows: [],
      available: false,
      error: e?.message || String(e),
      note: 'The leads table could not be read for Google attribution.',
    };
  }
}
