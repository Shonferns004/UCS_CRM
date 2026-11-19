import db from '../config/db.js';
import {
  getGoogleAdsConfig,
  isGa4Configured,
  isGoogleAdsConfigured,
} from './googleAdsConfigStore.js';
import { placeLeadIfValuable, placeUnplacedGoogleLeads } from './leadIntakeService.js';

// ---------------------------------------------------------------------------
// Google Ads + GA4 read path.
//
// Everything here uses the public REST APIs with the OAuth refresh token saved
// by the Connection panel. No extra npm dependency is needed (Node 24 has
// fetch), and no Google call happens during a normal page load: a sync run
// writes `google_ads_metrics_daily`, and the dashboard aggregates that table.
//
// Failures are returned as data, never thrown at the route, so a bad token
// produces a readable banner instead of a 500.
// ---------------------------------------------------------------------------

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_BASE = 'https://googleads.googleapis.com';
const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const IST = 'Asia/Kolkata';

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
});

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export const istDate = (offsetDays = 0) => dayFmt.format(new Date(Date.now() + offsetDays * 86400000));

export const buildRange = (days) => {
  const safeDays = clampInt(days, 1, 180, 30);
  const to = istDate(0);
  const from = istDate(-(safeDays - 1));
  const prevTo = istDate(-safeDays);
  const prevFrom = istDate(-(safeDays * 2 - 1));
  return { days: safeDays, from, to, prevFrom, prevTo };
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

async function googleFetch(url, { method = 'GET', headers = {}, body, timeout = 25000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new Error(`Could not reach Google (${e?.name === 'TimeoutError' ? 'timed out' : e?.message || e})`);
  }

  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!res.ok) {
    const message = extractApiError(payload, `${res.status} ${res.statusText}`);
    const error = new Error(message);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function extractApiError(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload.slice(0, 500) || fallback;
  // OAuth errors come back as { error: 'invalid_grant', error_description: … }.
  if (typeof payload.error === 'string') {
    return payload.error_description ? `${payload.error}: ${payload.error_description}` : payload.error;
  }
  const root = payload.error || payload;
  let message = root.message || fallback;
  const details = Array.isArray(root.details) ? root.details : [];
  const reasons = [];
  for (const detail of details) {
    const errors = Array.isArray(detail?.errors) ? detail.errors : [];
    for (const entry of errors) {
      if (entry?.reason) reasons.push(String(entry.reason));
      if (entry?.message) message = `${message}: ${entry.message}`;
    }
  }
  // v25+ returns CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION when the Google Cloud
  // project only has Test access. The fix lives in Cloud Console, not in this
  // app, so point the operator straight at it.
  if (reasons.some((reason) => reason === 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' || reason === 'ACTION_NOT_PERMITTED')) {
    message += ' — this Google Cloud project only has Test access. Apply for Explorer access at https://console.cloud.google.com/google/ads-apis/overview';
  }
  return message;
}

// ---- OAuth ----------------------------------------------------------------

let tokenCache = { key: '', token: '', expiresAt: 0 };

export async function getGoogleAccessToken({ force = false } = {}) {
  const cfg = getGoogleAdsConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error('Google OAuth is not configured (client id, client secret and refresh token are required)');
  }

  const key = `${cfg.clientId}:${cfg.refreshToken.slice(-12)}:${cfg.clientSecret.slice(-6)}`;
  if (!force && tokenCache.key === key && tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  });

  const payload = await googleFetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    timeout: 20000,
  });

  const token = payload?.access_token;
  if (!token) throw new Error('Google did not return an access token');
  const ttl = Math.max(60, num(payload.expires_in) || 3600);
  tokenCache = { key, token, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return token;
}

export function clearTokenCache() {
  tokenCache = { key: '', token: '', expiresAt: 0 };
}

// The dashboard is a cache view, so something has to refresh it. One boot
// kickoff plus a six-hour sweep keeps a week of numbers current without anyone
// pressing Sync; the button is still there for an immediate pull.
let syncTimer = null;

export function startGoogleAdsSyncScheduler({ intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  // Leads have their own 5-minute scheduler; start it even when the metrics
  // timer is already running (e.g. after a credentials save).
  startGoogleAdsLeadSyncScheduler();
  if (syncTimer || !isGoogleAdsConfigured()) return false;
  const run = () => {
    syncGoogleAdsMetrics({ days: 30 }).catch((e) => {
      console.warn('[google-ads] scheduled sync failed:', e?.message || e);
    });
  };
  const kickoff = setTimeout(run, 60 * 1000);
  if (typeof kickoff.unref === 'function') kickoff.unref();
  syncTimer = setInterval(run, intervalMs);
  if (typeof syncTimer.unref === 'function') syncTimer.unref();
  return true;
}

export function stopGoogleAdsSyncScheduler() {
  if (!syncTimer) return;
  clearInterval(syncTimer);
  syncTimer = null;
}

// ---- Google Ads -----------------------------------------------------------

function adsHeaders(token) {
  const cfg = getGoogleAdsConfig();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // Developer tokens were sunset on 9 Sep 2026 and the API ignores the header.
  // Sending it is optional and will be rejected in a future major version, so
  // this integration no longer sends it at all.
  // Only a manager (MCC) account needs the login-customer-id header.
  if (cfg.loginCustomerId) headers['login-customer-id'] = cfg.loginCustomerId;
  return headers;
}

export async function adsSearch(query, { pageLimit = 20 } = {}) {
  const cfg = getGoogleAdsConfig();
  if (!cfg.customerId) throw new Error('Google Ads customer id is not configured');

  const token = await getGoogleAccessToken();
  const url = `${ADS_BASE}/${cfg.apiVersion}/customers/${cfg.customerId}/googleAds:search`;

  const results = [];
  let pageToken;
  for (let page = 0; page < pageLimit; page += 1) {
    const payload = await googleFetch(url, {
      method: 'POST',
      headers: adsHeaders(token),
      body: { query, ...(pageToken ? { pageToken } : {}) },
    });
    const batch = Array.isArray(payload?.results) ? payload.results : [];
    results.push(...batch);
    pageToken = payload?.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

// Campaign names for ids that only appear in a lead-form export. Used by the
// CSV import so the Leads tab shows "Being Sevak..." instead of a raw id.
export async function fetchGoogleAdsCampaignNames(ids = []) {
  const numeric = [...new Set((ids || []).map((id) => String(id || '').trim()).filter((id) => /^\d+$/.test(id)))].slice(0, 200);
  if (!numeric.length || !isGoogleAdsConfigured()) return new Map();
  try {
    const rows = await adsSearch(
      `SELECT campaign.id, campaign.name FROM campaign WHERE campaign.id IN (${numeric.join(',')})`,
    );
    const out = new Map();
    for (const row of rows) {
      const id = String(row?.campaign?.id || '');
      if (id) out.set(id, row.campaign?.name || '');
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function fetchGoogleAdsCustomer() {
  const rows = await adsSearch(
    `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account
     FROM customer
     LIMIT 1`,
  );
  const customer = rows?.[0]?.customer || null;
  if (!customer) throw new Error('Google Ads returned no customer for this id');
  return {
    id: String(customer.id || ''),
    name: customer.descriptiveName || customer.descriptive_name || `Customer ${customer.id || ''}`,
    currency: customer.currencyCode || customer.currency_code || 'INR',
    timeZone: customer.timeZone || customer.time_zone || 'Asia/Kolkata',
    isManager: Boolean(customer.manager),
    isTestAccount: Boolean(customer.testAccount || customer.test_account),
  };
}

const microsToUnits = (value) => num(value) / 1_000_000;

const DEVICE_LABEL = {
  MOBILE: 'Mobile',
  DESKTOP: 'Desktop',
  TABLET: 'Tablet',
  CONNECTED_TV: 'Connected TV',
  OTHER: 'Other',
  UNKNOWN: 'Unknown',
};

const rowToMetric = (row, { scope, dimensionId, dimensionLabel, status, budgetMicros }) => {
  const metrics = row?.metrics || {};
  const segments = row?.segments || {};
  return {
    customerId: getGoogleAdsConfig().customerId,
    scope,
    dimensionId: String(dimensionId ?? ''),
    dimensionLabel: dimensionLabel || '',
    date: String(segments.date || ''),
    status: status || null,
    budget: microsToUnits(budgetMicros),
    spend: microsToUnits(metrics.costMicros ?? metrics.cost_micros),
    impressions: Math.round(num(metrics.impressions)),
    clicks: Math.round(num(metrics.clicks)),
    conversions: num(metrics.conversions),
    conversionValue: num(metrics.conversionsValue ?? metrics.conversions_value),
  };
};

async function fetchGeoLabels(ids) {
  // Country criterion ids are numeric. Anything else is dropped rather than
  // interpolated into a GAQL `IN (...)` list.
  const numeric = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 200);
  if (!numeric.length) return new Map();
  try {
    const rows = await adsSearch(
      `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code
       FROM geo_target_constant
       WHERE geo_target_constant.id IN (${numeric.join(',')})`,
    );
    const map = new Map();
    for (const row of rows) {
      const geo = row?.geoTargetConstant || row?.geo_target_constant || {};
      if (!geo.id) continue;
      map.set(String(geo.id), geo.name || geo.countryCode || String(geo.id));
    }
    return map;
  } catch {
    return new Map();
  }
}

// Google returns one row per campaign/segment, but the cache is keyed by
// (customer, scope, dimension, date). Device and geo therefore arrive as
// several rows for the same key — Postgres rejects that inside one INSERT with
// "ON CONFLICT DO UPDATE cannot affect row a second time". Merge them first.
function mergeMetricRows(rows) {
  const merged = new Map();
  for (const row of rows || []) {
    const key = `${row.customerId}|${row.scope}|${row.dimensionId}|${row.date}`;
    const cur = merged.get(key);
    if (!cur) {
      merged.set(key, { ...row });
      continue;
    }
    cur.spend += Number(row.spend) || 0;
    cur.impressions += Number(row.impressions) || 0;
    cur.clicks += Number(row.clicks) || 0;
    cur.conversions += Number(row.conversions) || 0;
    cur.conversionValue += Number(row.conversionValue) || 0;
    cur.budget = Math.max(Number(cur.budget) || 0, Number(row.budget) || 0);
    if (!cur.dimensionLabel && row.dimensionLabel) cur.dimensionLabel = row.dimensionLabel;
    if (!cur.status && row.status) cur.status = row.status;
  }
  return [...merged.values()];
}

async function replaceScope(customerId, scope, from, to, rows) {
  await db._pool.query(
    `DELETE FROM google_ads_metrics_daily
      WHERE customer_id = $1 AND scope = $2 AND metric_date BETWEEN $3 AND $4`,
    [customerId, scope, from, to],
  );
  const deduped = mergeMetricRows(rows);
  const chunkSize = 400;
  for (let i = 0; i < deduped.length; i += chunkSize) {
    const chunk = deduped.slice(i, i + chunkSize);
    const params = [];
    const values = chunk.map((row, index) => {
      const base = index * 12;
      params.push(
        row.customerId, row.scope, row.dimensionId, row.dimensionLabel, row.date,
        row.status, row.budget, row.spend, row.impressions, row.clicks,
        row.conversions, row.conversionValue,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
    });
    await db._pool.query(
      `INSERT INTO google_ads_metrics_daily
         (customer_id, scope, dimension_id, dimension_label, metric_date, status, budget, spend, impressions, clicks, conversions, conversion_value)
       VALUES ${values.join(',')}
       ON CONFLICT (customer_id, scope, dimension_id, metric_date) DO UPDATE SET
         dimension_label = EXCLUDED.dimension_label,
         status = EXCLUDED.status,
         budget = EXCLUDED.budget,
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         conversions = EXCLUDED.conversions,
         conversion_value = EXCLUDED.conversion_value,
         updated_at = NOW()`,
      params,
    );
  }
}

async function saveSyncState(key, detail) {
  await db
    .from('google_ads_sync_state')
    .upsert({ key, last_run_at: new Date().toISOString(), detail }, { onConflict: 'key' })
    .catch(() => {});
}

export async function getLastSync(customerId) {
  const key = `metrics:${customerId || getGoogleAdsConfig().customerId}`;
  const { data, error } = await db
    .from('google_ads_sync_state')
    .select('key, last_run_at, detail')
    .eq('key', key)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

// Pulls every dimension the dashboard needs. Each scope is independent: a
// rejected GAQL query records an error and the other scopes still land.
export async function syncGoogleAdsMetrics({ days = 30 } = {}) {
  if (!isGoogleAdsConfigured()) {
    throw new Error('Google Ads is not connected. Add the OAuth credentials in the Connection tab first.');
  }

  const cfg = getGoogleAdsConfig();
  const range = buildRange(days);
  const customerId = cfg.customerId;
  const detail = {
    range,
    customer: null,
    scopes: {},
    errors: [],
  };

  try {
    detail.customer = await fetchGoogleAdsCustomer();
  } catch (e) {
    detail.errors.push({ scope: 'customer', message: e?.message || String(e) });
  }

  const campaignQuery = (withBudget) => `
    SELECT
      campaign.id, campaign.name, campaign.status,
      ${withBudget ? 'campaign_budget.amount_micros,' : ''}
      segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
      AND campaign.status != 'REMOVED'
  `;

  const deviceQuery = `
    SELECT
      campaign.id, campaign.name, segments.device, segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
      AND campaign.status != 'REMOVED'
  `;

  const geoQuery = `
    SELECT
      user_location_view.country_criterion_id, segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM user_location_view
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
  `;

  const keywordQuery = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      campaign.id, campaign.name, segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
      AND campaign.status != 'REMOVED'
  `;

  const runScope = async (scope, loader) => {
    try {
      const rows = await loader();
      await replaceScope(customerId, scope, range.from, range.to, rows);
      detail.scopes[scope] = rows.length;
    } catch (e) {
      detail.scopes[scope] = 0;
      detail.errors.push({ scope, message: e?.message || String(e) });
    }
  };

  await runScope('campaign', async () => {
    let rows;
    try {
      rows = await adsSearch(campaignQuery(true));
    } catch {
      rows = await adsSearch(campaignQuery(false));
    }
    return rows
      .map((row) => rowToMetric(row, {
        scope: 'campaign',
        dimensionId: row?.campaign?.id,
        dimensionLabel: row?.campaign?.name || `Campaign ${row?.campaign?.id || ''}`,
        status: row?.campaign?.status || null,
        budgetMicros: row?.campaignBudget?.amountMicros ?? row?.campaign_budget?.amount_micros,
      }))
      .filter((row) => row.date && row.dimensionId);
  });

  await runScope('device', async () => {
    const rows = await adsSearch(deviceQuery);
    return rows
      .map((row) => {
        const device = String(row?.segments?.device || 'UNKNOWN');
        return rowToMetric(row, {
          scope: 'device',
          dimensionId: device,
          dimensionLabel: DEVICE_LABEL[device] || device,
          status: null,
        });
      })
      .filter((row) => row.date);
  });

  await runScope('geo', async () => {
    const rows = await adsSearch(geoQuery);
    const ids = rows.map((row) => row?.userLocationView?.countryCriterionId).filter(Boolean);
    const labels = await fetchGeoLabels(ids);
    return rows
      .map((row) => {
        const id = String(row?.userLocationView?.countryCriterionId || '');
        return rowToMetric(row, {
          scope: 'geo',
          dimensionId: id,
          dimensionLabel: labels.get(id) || (id ? `Country ${id}` : 'Unknown'),
          status: null,
        });
      })
      .filter((row) => row.date);
  });

  await runScope('keyword', async () => {
    const rows = await adsSearch(keywordQuery);
    return rows
      .map((row) => {
        const text = row?.adGroupCriterion?.keyword?.text || '';
        const match = row?.adGroupCriterion?.keyword?.matchType || '';
        if (!text) return null;
        return rowToMetric(row, {
          scope: 'keyword',
          dimensionId: `${text}::${match}`.toLowerCase(),
          dimensionLabel: text,
          status: match || null,
        });
      })
      .filter((row) => row && row.date);
  });

  await saveSyncState(`metrics:${customerId}`, detail);

  return {
    ok: true,
    customer: detail.customer,
    range,
    scopes: detail.scopes,
    errors: detail.errors,
    rowCount: Object.values(detail.scopes).reduce((sum, n) => sum + num(n), 0),
  };
}

// ---- Lead form submissions ------------------------------------------------
// Google Ads lead form assets are available as a first-class GAQL resource in
// v23+ (`lead_form_submission_data`). This is the live path: every sync pulls
// the submissions and stores them in `leads` with gclid/campaign attribution.

function parseSubmissionDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapLeadFormSubmission(row) {
  const data = row?.leadFormSubmissionData || {};
  const fields = {};
  for (const field of data.leadFormSubmissionFields || []) {
    const key = String(field?.fieldType || '').toUpperCase();
    const value = String(field?.fieldValue || '').trim();
    if (key && value) fields[key] = value;
  }
  const answers = (data.customLeadFormSubmissionFields || [])
    .map((field) => ({
      question: String(field?.questionText || '').trim(),
      answer: String(field?.fieldValue || '').trim(),
    }))
    .filter((entry) => entry.answer);

  const campaignId = String(row?.campaign?.id || '').trim();
  const name = fields.FULL_NAME
    || [fields.FIRST_NAME, fields.LAST_NAME].filter(Boolean).join(' ')
    || '';
  return {
    googleLeadId: String(data.id || data.resourceName || data.gclid || '').trim(),
    gclid: String(data.gclid || '').trim(),
    name,
    email: fields.EMAIL || fields.WORK_EMAIL || '',
    phone: String(fields.PHONE_NUMBER || '').replace(/[^0-9]/g, ''),
    city: fields.CITY || '',
    answers,
    campaignId,
    campaignName: row?.campaign?.name || (campaignId ? `Campaign ${campaignId}` : ''),
    createdAt: parseSubmissionDate(data.submissionDateTime),
  };
}

export async function fetchGoogleAdsLeadForms({ days = 30 } = {}) {
  const range = buildRange(days);
  const query = `
    SELECT
      lead_form_submission_data.id,
      lead_form_submission_data.gclid,
      lead_form_submission_data.campaign,
      lead_form_submission_data.ad_group,
      lead_form_submission_data.submission_date_time,
      lead_form_submission_data.lead_form_submission_fields,
      lead_form_submission_data.custom_lead_form_submission_fields,
      campaign.id,
      campaign.name
    FROM lead_form_submission_data
    WHERE lead_form_submission_data.submission_date_time >= '${range.from}'
      AND lead_form_submission_data.submission_date_time <= '${range.to}'
  `;
  const rows = await adsSearch(query, { pageLimit: 50 });
  return rows
    .map(mapLeadFormSubmission)
    .filter((row) => row.googleLeadId || row.gclid);
}

export async function syncGoogleAdsLeadForms({ days = 30, limit = 1000 } = {}) {
  if (!isGoogleAdsConfigured()) {
    throw new Error('Google Ads is not connected. Add the OAuth credentials in the Connection tab first.');
  }

  const all = await fetchGoogleAdsLeadForms({ days });
  const slice = all.slice(0, clampInt(limit, 1, 5000, 1000));

  const ids = [...new Set(slice.map((lead) => lead.googleLeadId).filter(Boolean))];
  const gclids = [...new Set(slice.map((lead) => lead.gclid).filter(Boolean))];
  const seen = new Set();
  if (ids.length || gclids.length) {
    const { rows } = await db._pool.query(
      `SELECT google_lead_id, gclid FROM leads
        WHERE google_lead_id = ANY($1::text[]) OR gclid = ANY($2::text[])`,
      [ids, gclids],
    );
    for (const row of rows) {
      if (row.google_lead_id) seen.add(`id:${row.google_lead_id}`);
      if (row.gclid) seen.add(`g:${row.gclid}`);
    }
  }

  let ingested = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors = [];

  for (const lead of slice) {
    const idKey = lead.googleLeadId ? `id:${lead.googleLeadId}` : '';
    const gclidKey = lead.gclid ? `g:${lead.gclid}` : '';
    if ((idKey && seen.has(idKey)) || (gclidKey && seen.has(gclidKey))) {
      duplicates += 1;
      continue;
    }
    if (!lead.phone && !lead.email) {
      skipped += 1;
      continue;
    }

    const notes = [
      `[Google Lead: ${lead.googleLeadId || lead.gclid || lead.phone || lead.email}]`,
      lead.campaignName ? `[Campaign: ${lead.campaignName}]` : '',
      lead.city ? `[City: ${lead.city}]` : '',
      ...lead.answers.map(({ question, answer }) => (question ? `${question}: ${answer}` : answer)),
    ].filter(Boolean).join('\n');

    try {
      const { rows: inserted } = await db._pool.query(
        `INSERT INTO leads
           (name, phone, email, source, status, notes, gclid,
            google_campaign_id, google_campaign_name, google_lead_id, created_at)
         VALUES ($1,$2,$3,'Google Ads Lead Form','new',$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          lead.name || lead.phone || lead.email,
          lead.phone || null,
          lead.email || null,
          notes,
          lead.gclid || null,
          lead.campaignId || null,
          lead.campaignName || null,
          lead.googleLeadId || null,
          lead.createdAt || new Date(),
        ],
      );
      ingested += 1;
      if (idKey) seen.add(idKey);
      if (gclidKey) seen.add(gclidKey);

      // Google leads go straight to their station, any score. Placement is
      // best-effort: a missing phone or an unmapped NGO must not fail the pull.
      const created = inserted[0];
      if (created) {
        await placeLeadIfValuable(created, { ignoreScore: true }).catch((e) => {
          if (errors.length < 3) errors.push(`place: ${e.message}`);
        });
      }
    } catch (e) {
      if (errors.length < 3) errors.push(e.message);
    }
  }

  // Heal rows inserted before auto-place existed, or where a placement failed
  // transiently. Bounded and silent; invalid phones are excluded by the query.
  const healed = await placeUnplacedGoogleLeads({ days, limit: 200, silent: true })
    .catch(() => ({ placed: 0 }));

  return {
    ok: true,
    range: buildRange(days),
    scanned: all.length,
    ingested,
    duplicates,
    skipped,
    backfilled: Number(healed?.placed) || 0,
    errors,
  };
}

let leadSyncTimer = null;

export function startGoogleAdsLeadSyncScheduler({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (leadSyncTimer || !isGoogleAdsConfigured()) return false;
  const run = () => {
    // A week is enough for the recurring poll; the manual button can ask for 30.
    syncGoogleAdsLeadForms({ days: 7 }).catch((e) => {
      console.warn('[google-ads] lead form sync failed:', e?.message || e);
    });
  };
  const kickoff = setTimeout(run, 90 * 1000);
  if (typeof kickoff.unref === 'function') kickoff.unref();
  leadSyncTimer = setInterval(run, intervalMs);
  if (typeof leadSyncTimer.unref === 'function') leadSyncTimer.unref();
  return true;
}

export function stopGoogleAdsLeadSyncScheduler() {
  if (!leadSyncTimer) return;
  clearInterval(leadSyncTimer);
  leadSyncTimer = null;
}

// ---- GA4 -----------------------------------------------------------------

const ga4Cache = new Map();
const GA4_TTL_MS = 5 * 60 * 1000;

async function ga4RunReport(body) {
  const cfg = getGoogleAdsConfig();
  if (!cfg.ga4PropertyId) throw new Error('GA4 property id is not configured');
  const token = await getGoogleAccessToken();
  return googleFetch(`${GA4_BASE}/properties/${cfg.ga4PropertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
    // A GA4 report is a page-load dependency, so it must fail fast rather than
    // hold the dashboard for the full 25 s Google Ads budget.
    timeout: 12000,
  });
}

const metricValue = (headers, values, name) => {
  const index = (headers || []).findIndex((h) => h?.name === name);
  return index >= 0 ? num(values?.[index]?.value) : 0;
};

const dimValue = (headers, values, name) => {
  const index = (headers || []).findIndex((h) => h?.name === name);
  return index >= 0 ? (values?.[index]?.value ?? '') : '';
};

export async function getGa4Overview({ days = 30 } = {}) {
  if (!isGa4Configured()) {
    return { ok: false, configured: false, message: 'Add a GA4 property id in the Connection tab to see web behaviour.' };
  }

  const range = buildRange(days);
  const key = `${getGoogleAdsConfig().ga4PropertyId}:${range.from}:${range.to}`;
  const cached = ga4Cache.get(key);
  if (cached && Date.now() - cached.at < GA4_TTL_MS) return cached.value;

  const dateRanges = [{ startDate: range.from, endDate: range.to }];

  try {
    const [totalsResult, channelResult, landingResult] = await Promise.allSettled([
      ga4RunReport({
        dateRanges,
        metrics: [
          { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'sessions' },
          { name: 'engagedSessions' }, { name: 'engagementRate' },
          { name: 'averageSessionDuration' }, { name: 'keyEvents' },
        ],
      }),
      ga4RunReport({
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      ga4RunReport({
        dateRanges,
        dimensions: [{ name: 'landingPagePlusQueryString' }],
        metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'keyEvents' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
    ]);

    if (totalsResult.status === 'rejected') throw totalsResult.reason;
    const totalsPayload = totalsResult.value;
    const channelPayload = channelResult.status === 'fulfilled' ? channelResult.value : null;
    const landingPayload = landingResult.status === 'fulfilled' ? landingResult.value : null;
    const partial = channelResult.status === 'rejected' || landingResult.status === 'rejected';

    const totalsHeaders = totalsPayload?.metricHeaders || [];
    const totalsRow = totalsPayload?.rows?.[0]?.metricValues || [];
    const totalSessions = metricValue(totalsHeaders, totalsRow, 'sessions');

    const channels = (channelPayload?.rows || []).map((row) => {
      const sessions = metricValue(channelPayload.metricHeaders, row.metricValues, 'sessions');
      return {
        channel: dimValue(channelPayload.dimensionHeaders, row.dimensionValues, 'sessionDefaultChannelGroup') || 'Unassigned',
        sessions,
        users: metricValue(channelPayload.metricHeaders, row.metricValues, 'totalUsers'),
        keyEvents: metricValue(channelPayload.metricHeaders, row.metricValues, 'keyEvents'),
        share: totalSessions > 0 ? (sessions / totalSessions) * 100 : 0,
      };
    });

    const landingPages = (landingPayload?.rows || []).map((row) => ({
      page: dimValue(landingPayload.dimensionHeaders, row.dimensionValues, 'landingPagePlusQueryString') || '(not set)',
      sessions: metricValue(landingPayload.metricHeaders, row.metricValues, 'sessions'),
      engagementRate: metricValue(landingPayload.metricHeaders, row.metricValues, 'engagementRate'),
      keyEvents: metricValue(landingPayload.metricHeaders, row.metricValues, 'keyEvents'),
    }));

    const value = {
      ok: true,
      configured: true,
      partial,
      propertyId: getGoogleAdsConfig().ga4PropertyId,
      range,
      totals: {
        users: metricValue(totalsHeaders, totalsRow, 'totalUsers'),
        newUsers: metricValue(totalsHeaders, totalsRow, 'newUsers'),
        sessions: totalSessions,
        engagedSessions: metricValue(totalsHeaders, totalsRow, 'engagedSessions'),
        engagementRate: metricValue(totalsHeaders, totalsRow, 'engagementRate'),
        averageSessionDuration: metricValue(totalsHeaders, totalsRow, 'averageSessionDuration'),
        keyEvents: metricValue(totalsHeaders, totalsRow, 'keyEvents'),
      },
      channels,
      landingPages,
    };
    ga4Cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    return { ok: false, configured: true, propertyId: getGoogleAdsConfig().ga4PropertyId, message: e?.message || String(e) };
  }
}

export function clearGa4Cache() {
  ga4Cache.clear();
}

// ---- Connection test ------------------------------------------------------

export async function testGoogleConnection() {
  const cfg = getGoogleAdsConfig();
  const checks = {
    oauth: { ok: false, message: '' },
    ads: { ok: false, customer: null, message: '' },
    ga4: { ok: false, propertyId: cfg.ga4PropertyId, message: '' },
  };

  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    checks.oauth.message = 'Client id, client secret and refresh token are required';
    return { ok: false, checks };
  }

  try {
    await getGoogleAccessToken({ force: true });
    checks.oauth = { ok: true, message: 'Access token issued' };
  } catch (e) {
    checks.oauth.message = e?.message || String(e);
    return { ok: false, checks };
  }

  if (isGoogleAdsConfigured()) {
    try {
      checks.ads.customer = await fetchGoogleAdsCustomer();
      checks.ads.ok = true;
      checks.ads.message = 'Ad account readable';
    } catch (e) {
      checks.ads.message = e?.message || String(e);
    }
  } else {
    checks.ads.message = 'A customer id is required for the Ads API (developer tokens are no longer used).';
  }

  if (cfg.ga4PropertyId) {
    try {
      const report = await ga4RunReport({
        dateRanges: [{ startDate: istDate(-1), endDate: istDate(0) }],
        metrics: [{ name: 'sessions' }],
        limit: 1,
      });
      checks.ga4.ok = true;
      checks.ga4.message = `GA4 reporting works (${report?.rows?.length || 0} row)`;
      clearGa4Cache();
    } catch (e) {
      checks.ga4.message = e?.message || String(e);
    }
  } else {
    checks.ga4.message = 'No GA4 property id saved';
  }

  return {
    ok: checks.oauth.ok && checks.ads.ok,
    checks,
  };
}
