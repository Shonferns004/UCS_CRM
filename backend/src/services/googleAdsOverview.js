import db from '../config/db.js';
import { getGoogleAdsConfig, isGoogleAdsConfigured } from './googleAdsConfigStore.js';
import { buildRange, getGa4Overview, getLastSync } from './googleAdsService.js';

// ---------------------------------------------------------------------------
// Dashboard aggregation. All of this reads the local cache; the only Google
// call is the cached GA4 report, and it is skipped when GA4 is not configured.
// ---------------------------------------------------------------------------

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const ratio = (a, b) => (num(b) > 0 ? num(a) / num(b) : 0);
const pct = (a, b) => ratio(a, b) * 100;

function eachDate(from, to) {
  const out = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

function deriveMetrics(row) {
  const spend = num(row.spend);
  const impressions = num(row.impressions);
  const clicks = num(row.clicks);
  const conversions = num(row.conversions);
  const conversionValue = num(row.conversion_value ?? row.conversionValue);
  return {
    ...row,
    spend,
    impressions,
    clicks,
    conversions,
    conversionValue,
    ctr: pct(clicks, impressions),
    cpc: ratio(spend, clicks),
    cpa: ratio(spend, conversions),
    cvr: pct(conversions, clicks),
    roas: ratio(conversionValue, spend),
  };
}

const KPI_SQL = `
  SELECT
    COALESCE(SUM(spend), 0)            AS spend,
    COALESCE(SUM(impressions), 0)      AS impressions,
    COALESCE(SUM(clicks), 0)           AS clicks,
    COALESCE(SUM(conversions), 0)      AS conversions,
    COALESCE(SUM(conversion_value), 0) AS conversion_value
  FROM google_ads_metrics_daily
  WHERE customer_id = $1 AND scope = 'campaign' AND metric_date BETWEEN $2 AND $3
`;

const TREND_SQL = `
  SELECT
    metric_date::text AS metric_date,
    COALESCE(SUM(spend), 0)            AS spend,
    COALESCE(SUM(impressions), 0)      AS impressions,
    COALESCE(SUM(clicks), 0)           AS clicks,
    COALESCE(SUM(conversions), 0)      AS conversions,
    COALESCE(SUM(conversion_value), 0) AS conversion_value
  FROM google_ads_metrics_daily
  WHERE customer_id = $1 AND scope = 'campaign' AND metric_date BETWEEN $2 AND $3
  GROUP BY metric_date
  ORDER BY metric_date
`;

const DIMENSION_SQL = (scope) => `
  SELECT
    dimension_id,
    MAX(dimension_label)               AS dimension_label,
    MAX(status)                        AS status,
    MAX(budget)                        AS budget,
    COALESCE(SUM(spend), 0)            AS spend,
    COALESCE(SUM(impressions), 0)      AS impressions,
    COALESCE(SUM(clicks), 0)           AS clicks,
    COALESCE(SUM(conversions), 0)      AS conversions,
    COALESCE(SUM(conversion_value), 0) AS conversion_value
  FROM google_ads_metrics_daily
  WHERE customer_id = $1 AND scope = '${scope}' AND metric_date BETWEEN $2 AND $3
  GROUP BY dimension_id
  ORDER BY COALESCE(SUM(spend), 0) DESC
`;

async function loadDimension(customerId, scope, from, to) {
  const { rows } = await db._pool.query(DIMENSION_SQL(scope), [customerId, from, to]);
  return rows.map((row) => deriveMetrics(row));
}

function totalFromRows(rows) {
  const total = rows.reduce((acc, row) => ({
    spend: acc.spend + num(row.spend),
    impressions: acc.impressions + num(row.impressions),
    clicks: acc.clicks + num(row.clicks),
    conversions: acc.conversions + num(row.conversions),
    conversionValue: acc.conversionValue + num(row.conversionValue),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 });
  return {
    ...total,
    ctr: pct(total.clicks, total.impressions),
    cpc: ratio(total.spend, total.clicks),
    cpa: ratio(total.spend, total.conversions),
    cvr: pct(total.conversions, total.clicks),
    roas: ratio(total.conversionValue, total.spend),
  };
}

function fillTrend(rows, from, to) {
  const byDate = new Map(rows.map((row) => [String(row.metric_date || row.date), deriveMetrics(row)]));
  return eachDate(from, to).map((date) => {
    const row = byDate.get(date);
    return {
      date,
      spend: row?.spend || 0,
      impressions: row?.impressions || 0,
      clicks: row?.clicks || 0,
      conversions: row?.conversions || 0,
      conversionValue: row?.conversionValue || 0,
    };
  });
}

function buildInsights({ campaigns, devices, trend, currency }) {
  const insights = [];
  const live = campaigns.filter((c) => num(c.spend) > 0);

  if (live.length) {
    const best = [...live].sort((a, b) => num(b.roas) - num(a.roas))[0];
    if (best && num(best.roas) > 0) {
      insights.push({
        tone: 'success',
        title: 'Best return',
        body: `${best.dimension_label} is returning ${num(best.roas).toFixed(2)}x on ${currency} ${Math.round(num(best.spend)).toLocaleString('en-IN')} of spend.`,
        action: { label: 'Open campaigns', tab: 'Campaigns' },
      });
    }

    const withCost = live.filter((c) => num(c.conversions) > 0);
    if (withCost.length) {
      const worst = [...withCost].sort((a, b) => num(b.cpa) - num(a.cpa))[0];
      if (worst) {
        insights.push({
          tone: 'warning',
          title: 'Highest cost per conversion',
          body: `${worst.dimension_label} costs ${currency} ${Math.round(num(worst.cpa)).toLocaleString('en-IN')} per conversion — the most expensive campaign in this window.`,
          action: { label: 'Review campaign', tab: 'Campaigns' },
        });
      }
    }

    const budget = live.reduce((sum, c) => sum + num(c.budget), 0);
    const today = trend?.[trend.length - 1];
    if (budget > 0 && today) {
      const paced = (num(today.spend) / budget) * 100;
      if (paced >= 90) {
        insights.push({
          tone: paced > 100 ? 'error' : 'warning',
          title: 'Budget paced high',
          body: `${currency} ${Math.round(num(today.spend)).toLocaleString('en-IN')} spent today against ${currency} ${Math.round(budget).toLocaleString('en-IN')} daily budget (${paced.toFixed(0)}%).`,
          action: { label: 'Connection', tab: 'Connection' },
        });
      }
    }
  }

  if (devices.length) {
    const mobile = devices.find((d) => String(d.dimension_id).toUpperCase() === 'MOBILE');
    if (mobile && num(mobile.spend) > 0) {
      insights.push({
        tone: 'primary',
        title: 'Mobile share',
        body: `Mobile carries ${pct(mobile.spend, devices.reduce((s, d) => s + num(d.spend), 0)).toFixed(0)}% of spend with a ${num(mobile.roas).toFixed(2)}x return.`,
        action: { label: 'Device detail', tab: 'Overview' },
      });
    }
  }

  return insights.slice(0, 4);
}

// ---- Sample preview -------------------------------------------------------
// Deterministic demo numbers for the "Preview with sample data" switch. This is
// the only place that invents metrics; every live path reads the cache.

const SAMPLE_CAMPAIGNS = [
  { id: 's1', name: 'Brand Search', status: 'ENABLED', budget: 3000, share: 0.18, ctr: 0.068, cvr: 0.032, aov: 1650 },
  { id: 's2', name: 'Donation – Search', status: 'ENABLED', budget: 4500, share: 0.32, ctr: 0.043, cvr: 0.022, aov: 1400 },
  { id: 's3', name: 'CSR – Corporate', status: 'ENABLED', budget: 3500, share: 0.22, ctr: 0.029, cvr: 0.013, aov: 3200 },
  { id: 's4', name: 'Monthly Giving', status: 'ENABLED', budget: 2500, share: 0.16, ctr: 0.036, cvr: 0.019, aov: 1100 },
  { id: 's5', name: 'Remarketing', status: 'PAUSED', budget: 1500, share: 0.12, ctr: 0.051, cvr: 0.021, aov: 900 },
];

const SAMPLE_KEYWORDS = [
  { text: 'donate to ngo online', match: 'PHRASE', campaign: 'Donation – Search' },
  { text: 'csr partnership ngo', match: 'EXACT', campaign: 'CSR – Corporate' },
  { text: 'monthly giving program', match: 'PHRASE', campaign: 'Monthly Giving' },
  { text: 'ngo donation india', match: 'BROAD', campaign: 'Donation – Search' },
  { text: 'corporate social responsibility', match: 'PHRASE', campaign: 'CSR – Corporate' },
  { text: 'charity donation tax exemption', match: 'EXACT', campaign: 'Brand Search' },
];

const SAMPLE_GEO = [
  { id: '2356', label: 'Maharashtra' },
  { id: '2840', label: 'Karnataka' },
  { id: '2009', label: 'Delhi NCR' },
  { id: '2350', label: 'Gujarat' },
  { id: '2841', label: 'Tamil Nadu' },
];

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildSampleOverview(days) {
  const range = buildRange(days);
  const rand = seededRandom(20261118 + days);
  const dates = eachDate(range.from, range.to);
  const prevDates = eachDate(range.prevFrom, range.prevTo);

  const makeCampaignSeries = (campaign, dateList, growth) => dateList.map((date, index) => {
    const wave = 0.82 + 0.22 * Math.sin((index / Math.max(1, dateList.length - 1)) * Math.PI * 1.7) + 0.08 * rand();
    const spend = campaign.budget * wave * growth;
    const cpc = 4.5 + rand() * 4.5;
    const clicks = spend / cpc;
    const ctr = campaign.ctr * (0.9 + rand() * 0.25);
    const impressions = clicks / ctr;
    const conversions = clicks * campaign.cvr * (0.85 + rand() * 0.35);
    const conversionValue = conversions * campaign.aov * (0.9 + rand() * 0.25);
    return {
      dimension_id: campaign.id,
      dimension_label: campaign.name,
      status: campaign.status,
      budget: campaign.budget,
      date,
      spend,
      impressions,
      clicks,
      conversions,
      conversionValue,
    };
  });

  const currentRows = [];
  const previousRows = [];
  for (const campaign of SAMPLE_CAMPAIGNS) {
    currentRows.push(...makeCampaignSeries(campaign, dates, 1));
    previousRows.push(...makeCampaignSeries(campaign, prevDates, 0.86));
  }

  const totalSpend = currentRows.reduce((sum, row) => sum + row.spend, 0);

  const campaigns = SAMPLE_CAMPAIGNS.map((campaign) => {
    const rows = currentRows.filter((row) => row.dimension_id === campaign.id);
    const total = totalFromRows(rows);
    return {
      dimension_id: campaign.id,
      dimension_label: campaign.name,
      status: campaign.status,
      budget: campaign.budget,
      ...total,
    };
  });

  const devices = [
    { id: 'MOBILE', label: 'Mobile', share: 0.62, roas: 1.08 },
    { id: 'DESKTOP', label: 'Desktop', share: 0.33, roas: 0.92 },
    { id: 'TABLET', label: 'Tablet', share: 0.05, roas: 0.68 },
  ].map((device) => {
    const spend = totalSpend * device.share;
    const clicks = spend / 5.6;
    const conversions = clicks * 0.021 * device.roas;
    return {
      dimension_id: device.id,
      dimension_label: device.label,
      budget: 0,
      spend,
      impressions: clicks / 0.035,
      clicks,
      conversions,
      conversionValue: conversions * 1650,
      ctr: 3.5,
      cpc: 5.6,
      cpa: ratio(spend, conversions),
      cvr: pct(conversions, clicks),
      roas: ratio(conversions * 1650, spend),
    };
  });

  const geo = SAMPLE_GEO.map((place, index) => {
    const share = [0.34, 0.22, 0.19, 0.14, 0.11][index];
    const spend = totalSpend * share;
    const conversions = (spend / 145) * (1.15 - index * 0.08);
    return {
      dimension_id: place.id,
      dimension_label: place.label,
      status: null,
      budget: 0,
      spend,
      impressions: spend / 0.04,
      clicks: spend / 5.4,
      conversions,
      conversionValue: conversions * 1700,
      ctr: 4,
      cpc: 5.4,
      cpa: ratio(spend, conversions),
      cvr: 2,
      roas: ratio(conversions * 1700, spend),
    };
  });

  const keywords = SAMPLE_KEYWORDS.map((keyword, index) => {
    const spend = totalSpend * [0.18, 0.15, 0.13, 0.12, 0.1, 0.09][index];
    const clicks = spend / 5.2;
    const conversions = clicks * (0.026 - index * 0.002);
    return {
      dimension_id: `${keyword.text}::${keyword.match}`,
      dimension_label: keyword.text,
      status: keyword.match,
      budget: 0,
      spend,
      impressions: clicks / 0.04,
      clicks,
      conversions,
      conversionValue: conversions * 1750,
      ctr: 4,
      cpc: 5.2,
      cpa: ratio(spend, conversions),
      cvr: pct(conversions, clicks),
      roas: ratio(conversions * 1750, spend),
    };
  });

  const trendCurrent = fillTrend(
    currentRows.map((row) => ({
      date: row.date,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      conversion_value: row.conversionValue,
    })),
    range.from,
    range.to,
  );
  const trendPrevious = fillTrend(
    previousRows.map((row) => ({
      date: row.date,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      conversion_value: row.conversionValue,
    })),
    range.prevFrom,
    range.prevTo,
  );

  const kpiCurrent = totalFromRows(currentRows);
  const kpiPrevious = totalFromRows(previousRows);

  return {
    connected: true,
    configured: true,
    sample: true,
    customer: { name: 'Sample Google Ads account', currency: 'INR', id: '000-000-0000', timeZone: 'Asia/Kolkata', isManager: false, isTestAccount: false },
    range,
    lastSync: { last_run_at: new Date().toISOString(), detail: { sample: true } },
    hasData: true,
    kpis: { current: kpiCurrent, previous: kpiPrevious },
    trend: { current: trendCurrent, previous: trendPrevious },
    campaigns,
    devices,
    geo,
    keywords,
    insights: buildInsights({ campaigns, devices, trend: trendCurrent, currency: 'INR' }),
    ga4: {
      ok: true,
      configured: true,
      sample: true,
      propertyId: '000000000',
      totals: {
        users: 42850, newUsers: 34120, sessions: 58420, engagedSessions: 37856,
        engagementRate: 0.648, averageSessionDuration: 108, keyEvents: 1240,
      },
      channels: [
        { channel: 'Paid Search', sessions: 25704, users: 20110, keyEvents: 612, share: 44 },
        { channel: 'Organic Search', sessions: 16357, users: 14220, keyEvents: 388, share: 28 },
        { channel: 'Direct', sessions: 8763, users: 7900, keyEvents: 152, share: 15 },
        { channel: 'Referral', sessions: 4673, users: 4100, keyEvents: 66, share: 8 },
        { channel: 'Organic Social', sessions: 2921, users: 2600, keyEvents: 22, share: 5 },
      ],
      landingPages: [
        { page: '/donate', sessions: 18420, engagementRate: 0.684, keyEvents: 220 },
        { page: '/monthly-giving', sessions: 15100, engagementRate: 0.712, keyEvents: 195 },
        { page: '/csr-partnership', sessions: 12650, engagementRate: 0.625, keyEvents: 164 },
        { page: '/campaigns/education', sessions: 8250, engagementRate: 0.541, keyEvents: 95 },
      ],
      message: 'Sample preview — connect Google Ads in the Connection tab to replace these numbers.',
    },
    leads: { total: 0, rows: [], note: 'Sample preview does not include CRM leads.' },
  };
}

// ---- Public overview ------------------------------------------------------

export async function getGoogleAdsOverview({ days = 30, sample = false } = {}) {
  const range = buildRange(days);
  if (sample) return buildSampleOverview(range.days);

  if (!isGoogleAdsConfigured()) {
    return {
      connected: false,
      configured: false,
      hasData: false,
      range,
      customer: null,
      lastSync: null,
      kpis: { current: emptyTotals(), previous: emptyTotals() },
      trend: { current: [], previous: [] },
      campaigns: [],
      devices: [],
      geo: [],
      keywords: [],
      insights: [],
      ga4: await getGa4Overview({ days: range.days }),
      message: 'Connect Google Ads in the Connection tab to load live performance.',
    };
  }

  const cfg = getGoogleAdsConfig();
  const customerId = cfg.customerId;

  const [lastSync, currentKpiRes, previousKpiRes, currentTrendRes, previousTrendRes, campaigns, devices, geo, keywords, ga4] = await Promise.all([
    getLastSync(customerId).catch(() => null),
    db._pool.query(KPI_SQL, [customerId, range.from, range.to]),
    db._pool.query(KPI_SQL, [customerId, range.prevFrom, range.prevTo]),
    db._pool.query(TREND_SQL, [customerId, range.from, range.to]),
    db._pool.query(TREND_SQL, [customerId, range.prevFrom, range.prevTo]),
    loadDimension(customerId, 'campaign', range.from, range.to),
    loadDimension(customerId, 'device', range.from, range.to),
    loadDimension(customerId, 'geo', range.from, range.to),
    loadDimension(customerId, 'keyword', range.from, range.to),
    getGa4Overview({ days: range.days }),
  ]);

  const customer = lastSync?.detail?.customer || null;
  const currency = customer?.currency || 'INR';

  const toTotals = (row) => {
    const base = {
      spend: num(row?.spend),
      impressions: num(row?.impressions),
      clicks: num(row?.clicks),
      conversions: num(row?.conversions),
      conversionValue: num(row?.conversion_value),
    };
    return {
      ...base,
      ctr: pct(base.clicks, base.impressions),
      cpc: ratio(base.spend, base.clicks),
      cpa: ratio(base.spend, base.conversions),
      cvr: pct(base.conversions, base.clicks),
      roas: ratio(base.conversionValue, base.spend),
    };
  };

  const trendCurrent = fillTrend(currentTrendRes.rows, range.from, range.to);
  const trendPrevious = fillTrend(previousTrendRes.rows, range.prevFrom, range.prevTo);
  const hasData = campaigns.length > 0 || signalsOfData(currentTrendRes.rows);

  const warnings = (lastSync?.detail?.errors || []).map((e) => `${e.scope}: ${e.message}`);

  return {
    connected: true,
    configured: true,
    hasData,
    customer: customer ? { ...customer, id: customer.id || customerId } : { id: customerId, name: `Customer ${customerId}`, currency: 'INR' },
    range,
    lastSync: lastSync ? { at: lastSync.last_run_at, detail: lastSync.detail } : null,
    kpis: {
      current: toTotals(currentKpiRes.rows?.[0]),
      previous: toTotals(previousKpiRes.rows?.[0]),
    },
    trend: { current: trendCurrent, previous: trendPrevious },
    campaigns,
    devices,
    geo,
    keywords: keywords.slice(0, 20),
    insights: buildInsights({ campaigns, devices, trend: trendCurrent, currency }),
    ga4,
    warnings,
    message: hasData
      ? null
      : 'No metrics cached for this window yet. Run Sync now (the first pull can take a minute).',
  };
}

const signalsOfData = (rows) => rows.some((row) => num(row.spend) > 0 || num(row.clicks) > 0);

function emptyTotals() {
  return {
    spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0,
    ctr: 0, cpc: 0, cpa: 0, cvr: 0, roas: 0,
  };
}
