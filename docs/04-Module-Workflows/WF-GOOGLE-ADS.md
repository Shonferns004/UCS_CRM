# Workflow — Accounts → Modules → Google Ads & Analytics

> **Document ID:** 04-Module-Workflows/WF-GOOGLE-ADS
> **Status:** Implemented
> **Surfaces:** `client/src/panels/accounts/pages/GoogleAdsAnalytics.jsx`,
> `backend/src/routes/googleAdsRoutes.js`

## What it is

A Google Ads + GA4 cockpit inside the Accounts panel, directly below WhatsApp in
the sidebar. It shows spend, impressions, clicks, CTR, CPC, conversions, cost per
conversion, conversion value, ROAS, device/geo/keyword detail, GA4 traffic, and
Google-attributed CRM leads.

The page never calls Google during a normal load. A sync writes
`google_ads_metrics_daily`, and every widget aggregates that cache. GA4 is the one
live call, with a five-minute in-memory cache and a 12-second timeout.

## Getting to it

Sidebar → **Modules** → **Google Ads & Analytics**
(`/accounts/google-ads`). Modules is the group that owns the WhatsApp entry.

## Credentials

Open the **Connection** tab. Values are stored in the `settings` table and
masked on read. The database is the **only** source of truth: `.env` is not
consulted for Google Ads, and any `GOOGLE_ADS_*` values found in `.env` at boot
are ignored and scrubbed from the process. Saving new OAuth values verifies them
against Google before writing.

| Field | Required | Where it comes from |
| --- | --- | --- |
| OAuth client id | yes | Google Cloud Console → APIs & Services → Credentials → OAuth client id (Web application) |
| OAuth client secret | yes | The same OAuth client |
| Refresh token | yes | OAuth 2.0 Playground with `adwords` + `analytics.readonly` |
| Customer id | yes | Google Ads account picker (`123-456-7890` is accepted) |
| Manager account id | optional | Only when the customer sits under an MCC |
| API version | optional | Defaults to `v26` |
| GA4 property id | optional | GA4 Admin → Property settings |
| Conversion action id | optional | Stored only; offline upload is not implemented yet |
| Developer token | legacy | **Not required** — Google sunset developer tokens on 9 Sep 2026. The API ignores the header; the field is kept only for old saved values. |

Enable both APIs in the Cloud project: **Google Ads API** and **Google
Analytics Data API**. The refresh token must be issued for scopes:

- `https://www.googleapis.com/auth/adwords`
- `https://www.googleapis.com/auth/analytics.readonly`

### API access levels (post developer-token sunset)

API access is now granted to the **Google Cloud project behind the OAuth
client**, not to a developer token.

| Level | Access | How to get it |
| --- | --- | --- |
| Test | Test accounts only, 15,000 ops/day | **Automatic** when the Google Ads API is enabled |
| Explorer | Production accounts, 2,880 ops/day | Apply on the [Google Ads API Overview](https://console.cloud.google.com/google/ads-apis/overview); automated approval in most cases |
| Basic | Production, 15,000 ops/day | Brand verification + application on the same page |
| Standard | Unlimited | Manual review |

A production account call from a Test-access project fails with
`AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (v25+). The
Connection test surfaces this with the Explorer application link.

If the customer sits under a manager account, keep `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
set to the MCC id. A manager account is no longer required just to use the API.

Credentials are edited only through the Connection tab; they are not read from
`backend/.env`. Use the UI to add or change them.

## Sync and cache

- `POST /api/google-ads/sync` pulls campaign, device, geo and keyword metrics for
  the chosen window. Each scope is independent: a rejected GAQL query is recorded
  in the sync state and the other scopes still land.
- A boot kickoff (60 s) and a six-hour sweep keep the cache warm when the
  connection is configured; **Sync now** forces a pull.
- `google_ads_metrics_daily` is keyed by `(customer_id, scope, dimension_id,
  metric_date)` and replaced per scope/window on each successful pull.
- `google_ads_sync_state` holds the last run, customer name/currency, per-scope
  counts and errors.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/google-ads/status` | Checklist, masked fields, last sync, customer |
| GET | `/api/google-ads/overview?days=30` | KPIs, trend, campaigns, devices, geo, keywords, GA4, leads |
| GET | `/api/google-ads/overview?days=30&sample=1` | Deterministic sample preview (no Google calls) |
| GET | `/api/google-ads/leads` | CRM rows with Google attribution |
| GET | `/api/google-ads/config` | Masked credential view |
| POST | `/api/google-ads/config` | Save + verify OAuth, then persist |
| DELETE | `/api/google-ads/config` | Remove the saved DB copy |
| POST | `/api/google-ads/test` | OAuth / Ads / GA4 checks |
| POST | `/api/google-ads/sync` | Pull metrics |

Read access: `accounts`, `super_admin`, `admin`, `master`, `user`.
Write access: `accounts`, `super_admin`, `admin`.

## Lead attribution

`ensureGoogleAdsSchema` adds `gclid`, `gbraid`, `wbraid`,
`google_campaign_id`, `google_campaign_name`, `google_ad_group_id`,
`google_keyword` and `google_match_type` to `leads`. The Leads tab lists rows
whose `source` mentions Google/AdWords or that carry those columns. Nothing is
fabricated — an empty list means the CRM has not captured an attributed lead yet.

## Sample preview

The Connection tab has “Preview the dashboard with sample data”. It calls
`/overview?sample=1`, which generates deterministic numbers locally and labels
the page **Sample preview**. Uncheck it (or save real credentials) to see live
data. The sample path never contacts Google and never writes the cache.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `invalid_grant` | Refresh token revoked or issued for another OAuth client |
| `DEVELOPER_TOKEN_NOT_APPROVED` | Token is still at test level; apply for Basic access |
| `USER_PERMISSION_DENIED` | Google account cannot read the customer id, or the MCC header is missing |
| `401` on GA4 | Refresh token lacks `analytics.readonly`, or the property id is wrong |
| `No metrics cached` | Connection saved but no successful sync yet — press **Sync now** |
| Empty geo labels | `geo_target_constant` lookup failed; IDs are stored as `Country <id>` |
