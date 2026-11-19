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
  fetchGoogleAdsCampaignNames,
  getGoogleAccessToken,
  getLastSync,
  startGoogleAdsSyncScheduler,
  syncGoogleAdsLeadForms,
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
    // Lead forms are a separate API resource; a failure there must not hide the
    // metrics that already landed.
    const leads = await syncGoogleAdsLeadForms({ days }).catch((e) => ({
      ok: false,
      error: e?.message || String(e),
    }));
    return res.json({ ...result, leads, last_sync: await readLastSync() });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
}

export async function syncGoogleAdsLeadsHandler(req, res) {
  try {
    const days = clampInt(req.body?.days ?? req.query?.days, 1, 180, 30);
    const result = await syncGoogleAdsLeadForms({ days });
    return res.json(result);
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

function leadHeaderKey(header) {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LEAD_SHEET_KEYS = new Set([
  'submittimeutc', 'submittime', 'submissiontime', 'submittedat',
  'gclid', 'campaignid', 'adgroupid', 'creativeid',
  'fullname', 'firstname', 'lastname', 'name',
  'email', 'phonenumber', 'phonenumberverified', 'phone', 'mobile',
  'city', 'leadstage', 'leadsource', 'id', 'submissionid',
]);

function parseSheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Excel serial date (1900 epoch).
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(text);
  if (slash) {
    const [, month, day, year, hour, minute] = slash;
    return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  }
  const parsed = new Date(text.includes(' ') ? text.replace(' ', 'T') : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Import the Google Ads lead-form export (CSV / XLSX from the Ads UI) into the
// leads table. The Google Ads API sync is the live path; this is the bridge for
// the sheet an operator already has.
export async function importGoogleAdsLeads(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ message: 'No file uploaded' });

    const XLSX = await import('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ message: 'The file has no sheets' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (!rows.length) return res.status(400).json({ message: 'No rows found in the first sheet' });

    const parsed = rows.map((row) => {
      const known = {};
      const answers = [];
      for (const [header, raw] of Object.entries(row)) {
        const key = leadHeaderKey(header);
        const value = String(raw ?? '').trim();
        if (!value) continue;
        if (LEAD_SHEET_KEYS.has(key)) known[key] = raw;
        else answers.push({ question: String(header).trim(), answer: value });
      }
      const name = String(known.fullname || known.name || '').trim()
        || [known.firstname, known.lastname].map((v) => String(v || '').trim()).filter(Boolean).join('');
      const phone = String(known.phonenumber || known.phone || known.mobile || '').replace(/[^0-9]/g, '');
      const email = String(known.email || '').trim();
      return {
        name,
        phone,
        email,
        gclid: String(known.gclid || '').trim(),
        campaignId: String(known.campaignid || '').trim(),
        city: String(known.city || '').trim(),
        leadStage: String(known.leadstage || '').trim(),
        leadSource: String(known.leadsource || '').trim(),
        answers,
        created: parseSheetDate(known.submittimeutc || known.submittime || known.submissiontime || known.submittedat),
      };
    }).filter((row) => row.name || row.phone || row.email);

    if (!parsed.length) {
      return res.status(400).json({ message: 'No rows with a name, phone or email were found' });
    }

    let nameById = new Map();
    if (isGoogleAdsConfigured()) {
      const ids = [...new Set(parsed.map((row) => row.campaignId).filter(Boolean))];
      nameById = await fetchGoogleAdsCampaignNames(ids).catch(() => new Map());
    }

    const gclids = [...new Set(parsed.map((row) => row.gclid).filter(Boolean))];
    const existingGclids = new Set();
    if (gclids.length) {
      const { rows: have } = await db._pool.query(
        `SELECT gclid FROM leads WHERE gclid = ANY($1::text[])`,
        [gclids],
      );
      for (const row of have) existingGclids.add(row.gclid);
    }

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    const errors = [];

    for (const lead of parsed) {
      if (!lead.phone && !lead.email) { skipped += 1; continue; }
      if (lead.gclid && existingGclids.has(lead.gclid)) { duplicates += 1; continue; }

      const campaignName = nameById.get(lead.campaignId)
        || (lead.campaignId ? `Campaign ${lead.campaignId}` : '');
      const notes = [
        `[Google Lead: ${lead.gclid || lead.phone || lead.email}]`,
        campaignName ? `[Campaign: ${campaignName}]` : '',
        lead.city ? `[City: ${lead.city}]` : '',
        ...lead.answers.map(({ question, answer }) => `${question}: ${answer}`),
        lead.leadStage ? `[Lead Stage: ${lead.leadStage}]` : '',
        lead.leadSource ? `[Lead Source: ${lead.leadSource}]` : '',
      ].filter(Boolean).join('\n');

      try {
        await db._pool.query(
          `INSERT INTO leads
             (name, phone, email, source, status, notes, gclid, google_campaign_id, google_campaign_name, created_at)
           VALUES ($1,$2,$3,'Google Ads Lead Form','new',$4,$5,$6,$7,$8)`,
          [
            lead.name || lead.phone || lead.email,
            lead.phone || null,
            lead.email || null,
            notes,
            lead.gclid || null,
            lead.campaignId || null,
            campaignName || null,
            lead.created || new Date(),
          ],
        );
        imported += 1;
        if (lead.gclid) existingGclids.add(lead.gclid);
      } catch (e) {
        if (errors.length < 3) errors.push(e.message);
      }
    }

    return res.json({ scanned: rows.length, imported, duplicates, skipped, errors });
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
      l.created_at >= NOW() - ($1::text || ' days')::interval
      AND (
        l.source ILIKE '%google%'
        OR l.source ILIKE '%adwords%'
        OR l.gclid IS NOT NULL
        OR l.google_campaign_name IS NOT NULL
      )
    `;

    const [rowsRes, countRes] = await Promise.all([
      db._pool.query(
        `SELECT l.id, l.name, l.phone, l.email, l.source, l.status, l.created_at,
                l.recruiter_id, l.notes, fa.fro_worker_id, w.name AS fro_name,
                l.gclid, l.google_campaign_name, l.google_keyword, l.google_match_type
           FROM leads l
           LEFT JOIN LATERAL (
             SELECT a.fro_worker_id
               FROM fro_assignments a
              WHERE a.notes LIKE '%[Lead:' || l.id::text || ']%'
                AND (a.status IS NULL OR a.status <> 'reassigned')
              LIMIT 1
           ) fa ON TRUE
           LEFT JOIN workers w ON w.id = fa.fro_worker_id
          WHERE ${where}
          ORDER BY l.created_at DESC
          LIMIT $2`,
        [safeDays, safeLimit],
      ),
      db._pool.query(
        `SELECT COUNT(*)::int AS total FROM leads l WHERE ${where}`,
        [safeDays],
      ),
    ]);

    const rows = (rowsRes.rows || []).map((row) => {
      const notes = String(row.notes || '');
      const answerLine = notes
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^[^:[\]]{2,}:\s*.+/.test(line) && !/^\[(Campaign|City|Lead Stage|Lead Source|Google Lead):/i.test(line));
      const answer = answerLine ? answerLine.slice(answerLine.indexOf(':') + 1).trim() : '';
      return {
        id: row.id,
        name: row.name || 'Unnamed contact',
        phone: row.phone || '',
        email: row.email || '',
        source: row.source || 'Google Ads',
        status: row.status || 'new',
        createdAt: row.created_at,
        // The leads table has no assigned_to column; ownership is the FRO on the
        // live assignment, or the recruiter id for recruitment leads.
        owner: row.fro_name || (row.recruiter_id == null ? '' : String(row.recruiter_id)),
        campaign: row.google_campaign_name || '',
        keyword: row.google_keyword || '',
        matchType: row.google_match_type || '',
        gclid: row.gclid || '',
        answer,
      };
    });

    return {
      total: countRes.rows?.[0]?.total || rows.length,
      rows,
      available: true,
      note: rows.length
        ? null
        : 'No Google-attributed leads in this window. Press Fetch leads to pull lead-form submissions from Google Ads, or let your landing page post gclid.',
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
