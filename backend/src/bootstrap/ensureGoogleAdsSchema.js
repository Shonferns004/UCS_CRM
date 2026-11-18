import db from '../config/db.js';

// Storage for the Google Ads + GA4 integration.
//
// The Marketing API is slow and rate limited, so the dashboard never queries
// Google on page load. A sync run writes one row per (customer, scope,
// dimension, day) and every widget is an aggregate over this cache.
//
// Leads carry the same attribution provenance shape the Meta integration uses,
// so a future Google lead-form webhook can be deduped by gclid exactly like a
// Meta lead is deduped by lead id.
//
// Idempotent: re-applied on every boot.
export async function ensureGoogleAdsSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS google_ads_metrics_daily (
      id BIGSERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      dimension_id TEXT NOT NULL DEFAULT '',
      dimension_label TEXT,
      metric_date DATE NOT NULL,
      status TEXT,
      budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
      spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      conversions NUMERIC(14, 4) NOT NULL DEFAULT 0,
      conversion_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (customer_id, scope, dimension_id, metric_date)
    )
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_scope_date
      ON google_ads_metrics_daily (scope, metric_date DESC)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_customer_date
      ON google_ads_metrics_daily (customer_id, metric_date DESC)
  `);

  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS google_ads_sync_state (
      key TEXT PRIMARY KEY,
      last_run_at TIMESTAMPTZ,
      detail JSONB
    )
  `);

  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS gbraid TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS wbraid TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_campaign_id TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_campaign_name TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_ad_group_id TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_keyword TEXT`);
  await db._pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_match_type TEXT`);

  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leads_google_click
      ON leads (gclid)
      WHERE gclid IS NOT NULL
  `);
}

export default ensureGoogleAdsSchema;
