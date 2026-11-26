import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Coins, Download, Eye, EyeOff,
  Info, KeyRound, Link2, LogOut, MousePointerClick, Pencil, Percent, RefreshCw, Rocket,
  Search, Settings, Target, TrendingUp, UserPlus, Users, Wallet, X, XCircle,
} from 'lucide-react';
import {
  Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiDelete, apiGet, apiPost } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';
import { toast } from '../../../components/Toast';
import './googleAds.css';

const TABS = ['Overview', 'Campaigns', 'Leads', 'GA4', 'Connection'];
const RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
];

const METRIC_OPTIONS = [
  { key: 'conversionValue', label: 'Conversion value' },
  { key: 'spend', label: 'Spend' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'impressions', label: 'Impressions' },
];

const CHANNEL_COLORS = ['#004ac6', '#006c4a', '#824500', '#737686', '#7c3aed', '#c2410c'];

const CONFIG_FIELDS = [
  {
    key: 'GOOGLE_ADS_CLIENT_ID',
    label: 'OAuth client id',
    required: true,
    placeholder: '1234567890-abc.apps.googleusercontent.com',
    hint: 'Google Cloud Console → APIs & Services → Credentials → OAuth client id (Web application).',
  },
  {
    key: 'GOOGLE_ADS_CLIENT_SECRET',
    label: 'OAuth client secret',
    secret: true,
    required: true,
    hint: 'The secret that belongs to the OAuth client above.',
  },
  {
    key: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    label: 'Developer token (legacy)',
    secret: true,
    advanced: true,
    hint: 'Sunset by Google on 9 Sep 2026. Not required and ignored by the API; kept only so older saved values can be viewed or cleared.',
  },
  {
    key: 'GOOGLE_ADS_REFRESH_TOKEN',
    label: 'Refresh token',
    secret: true,
    required: true,
    hint: 'Issued once for the Google account that can read the ad account. It does not expire like an access token.',
  },
  {
    key: 'GOOGLE_ADS_CUSTOMER_ID',
    label: 'Customer id',
    required: true,
    placeholder: '123-456-7890',
    hint: 'The ad account to report on. Dashes are fine; they are stored as digits.',
  },
  {
    key: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    label: 'Manager account id',
    advanced: true,
    placeholder: '123-456-7890',
    hint: 'Only when the customer is under an MCC manager account.',
  },
  {
    key: 'GOOGLE_ADS_API_VERSION',
    label: 'API version',
    advanced: true,
    placeholder: 'v26',
    hint: 'Leave the default unless Google has retired it.',
  },
  {
    key: 'GOOGLE_ADS_CONVERSION_ACTION_ID',
    label: 'Conversion action id',
    advanced: true,
    hint: 'Optional. Stored for a future offline conversion upload; not used by this dashboard.',
  },
  {
    key: 'GA4_PROPERTY_ID',
    label: 'GA4 property id',
    advanced: true,
    placeholder: '123456789',
    hint: 'Powers the GA4 tab. Accepts properties/123456789. Needs the analytics.readonly scope on the same refresh token.',
  },
];

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compact = (value) => {
  const v = n(value);
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
};

const fmtNum = (value) => n(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtPct = (value, digits = 2) => `${n(value).toFixed(digits)}%`;
const fmtX = (value) => `${n(value).toFixed(2)}x`;
const fmtDay = (value) => {
  const date = value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—';
};
const fmtDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
};
const timeAgo = (value) => {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
const fmtDuration = (seconds) => {
  const total = Math.round(n(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

function deltaPill(current, previous, { invert = false, neutral = false } = {}) {
  const cur = n(current);
  const prev = n(previous);
  if (!prev) {
    return { text: cur ? 'new' : '—', cls: 'flat' };
  }
  const change = ((cur - prev) / prev) * 100;
  if (Math.abs(change) < 0.05) return { text: '0.0%', cls: 'flat' };
  const up = change > 0;
  const good = invert ? !up : up;
  return {
    text: `${up ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`,
    cls: neutral ? 'flat' : (good ? 'up' : 'down'),
  };
}

function Sparkline({ values, color = '#004ac6' }) {
  const points = (values || []).slice(-16).map((v) => n(v));
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const path = points
    .map((v, i) => `${(i / (points.length - 1)) * 100},${20 - ((v - min) / span) * 17}`)
    .join(' L ');
  return (
    <svg width="66" height="18" viewBox="0 0 100 22" aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d={`M ${path}`} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({ delta }) {
  if (!delta) return null;
  return <span className={`gads-delta ${delta.cls}`}>{delta.text}</span>;
}

function KpiCard({ icon: Icon, label, value, delta, foot, accent, spark }) {
  return (
    <div className="gads-kpi">
      <div className="gads-kpi-top">
        <span className="gads-kpi-label">{label}</span>
        <Icon size={15} strokeWidth={1.9} className="gads-kpi-icon" aria-hidden="true" />
      </div>
      <div className="gads-kpi-value-row">
        <span className={`gads-kpi-value${accent ? ` is-${accent}` : ''}`}>{value}</span>
        <Delta delta={delta} />
      </div>
      <div className="gads-kpi-foot">
        <span>{foot}</span>
        {spark && <Sparkline values={spark} color={accent === 'green' ? '#006c4a' : '#004ac6'} />}
      </div>
    </div>
  );
}

function EmptyState({ title, text, action }) {
  return (
    <div className="gads-empty">
      <Link2 size={28} strokeWidth={1.6} className="gads-empty-icon" aria-hidden="true" />
      <div className="gads-empty-title">{title}</div>
      <div className="gads-empty-text">{text}</div>
      {action}
    </div>
  );
}

function LoadingBlock({ label = 'Loading Google Ads data…' }) {
  return (
    <div className="gads-empty" role="status">
      <RefreshCw size={24} strokeWidth={1.8} className="gads-empty-icon gads-spin" aria-hidden="true" />
      <div className="gads-empty-text">{label}</div>
    </div>
  );
}

// ---- Overview -------------------------------------------------------------

function InsightCards({ insights, onGo }) {
  if (!insights?.length) return null;
  return (
    <div className="gads-grid gads-grid-4">
      {insights.map((insight, index) => {
        const Icon = insight.tone === 'success' ? TrendingUp
          : insight.tone === 'warning' ? AlertTriangle
            : insight.tone === 'error' ? CircleDollarSign : Rocket;
        const tone = insight.tone === 'primary' ? 'info' : insight.tone;
        return (
          <div key={`${insight.title}-${index}`} className={`gads-insight${tone === 'info' ? '' : ` is-${tone}`}`}>
            <div className={`gads-insight-icon${tone === 'info' ? '' : ` is-${tone}`}`}>
              <Icon size={17} strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <div className="gads-insight-title">{insight.title}</div>
              <div className="gads-insight-body">{insight.body}</div>
              {insight.action && (
                <button
                  type="button"
                  className="gads-insight-link"
                  onClick={() => onGo?.(insight.action.tab)}
                >
                  {insight.action.label} →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ overview, metricKey, onMetric, money }) {
  const current = overview?.trend?.current || [];
  const previous = overview?.trend?.previous || [];
  const data = current.map((row, index) => ({
    label: fmtDay(row.date),
    current: n(row[metricKey]),
    previous: n(previous[index]?.[metricKey]),
  }));

  const metricLabel = METRIC_OPTIONS.find((m) => m.key === metricKey)?.label || 'Value';
  const formatValue = (value) => {
    if (metricKey === 'conversionValue' || metricKey === 'spend') return money.format(n(value));
    if (metricKey === 'conversions' || metricKey === 'clicks' || metricKey === 'impressions') return fmtNum(value);
    return fmtNum(value);
  };

  const currentTotal = current.reduce((sum, row) => sum + n(row[metricKey]), 0);
  const previousTotal = previous.reduce((sum, row) => sum + n(row[metricKey]), 0);
  const totalsDelta = deltaPill(currentTotal, previousTotal);

  if (!current.length) {
    return (
      <div className="gads-card">
        <div className="gads-card-head">
          <div>
            <div className="gads-card-title">Performance trend</div>
            <div className="gads-card-sub">Daily movement against the previous period</div>
          </div>
        </div>
        <EmptyState title="No daily series yet" text="Once a sync has cached a few days, this chart compares the current window with the preceding one." />
      </div>
    );
  }

  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Performance trend</div>
          <div className="gads-card-sub">
            {fmtDay(overview.range.from)} – {fmtDay(overview.range.to)} vs {fmtDay(overview.range.prevFrom)} – {fmtDay(overview.range.prevTo)}
          </div>
        </div>
        <div className="gads-tabs" role="tablist" aria-label="Chart metric">
          {METRIC_OPTIONS.map((metric) => (
            <button
              key={metric.key}
              type="button"
              role="tab"
              aria-selected={metric.key === metricKey}
              className={`gads-tab${metric.key === metricKey ? ' is-active' : ''}`}
              onClick={() => onMetric(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="gads-legend">
        <span><span className="swatch" style={{ background: '#004ac6' }} /> Current period · {metricLabel}</span>
        <span><span className="dash" /> Previous period</span>
        <span className="gads-spacer" />
        <span className="gads-muted">Current total <b className="gads-strong" style={{ color: '#131b2e' }}>{formatValue(currentTotal)}</b></span>
        <Delta delta={totalsDelta} />
      </div>

      <div className="gads-chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gadsTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#004ac6" stopOpacity={0.26} />
                <stop offset="100%" stopColor="#004ac6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#737686' }} tickLine={false} axisLine={false} minTickGap={26} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#737686' }} tickLine={false} axisLine={false} width={56} tickFormatter={compact} />
            <Tooltip
              formatter={(value, name) => [formatValue(value), name]}
              labelStyle={{ fontSize: 11, fontWeight: 700 }}
              contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e2e6f2', boxShadow: '0 8px 22px rgba(19,27,46,.12)' }}
            />
            <Area type="monotone" dataKey="current" name="Current period" stroke="#004ac6" strokeWidth={2.6} fill="url(#gadsTrendFill)" dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="previous" name="Previous period" stroke="#737686" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FunnelCard({ overview, ga4 }) {
  const kpi = overview?.kpis?.current || {};
  const stages = [
    { key: 'impressions', label: 'Impressions', value: n(kpi.impressions) },
    { key: 'clicks', label: 'Ad clicks', value: n(kpi.clicks) },
    { key: 'sessions', label: 'Website sessions', value: n(ga4?.totals?.sessions) },
    { key: 'conversions', label: 'Conversions', value: n(kpi.conversions) },
  ].filter((stage, index) => index < 2 || stage.value > 0);

  const top = stages[0]?.value || 0;
  const rate = (value, base) => (base > 0 ? (value / base) * 100 : 0);

  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Click → conversion funnel</div>
          <div className="gads-card-sub">Google Ads clicks and GA4 sessions against attributed conversions</div>
        </div>
        <span className="gads-badge gads-badge-blue">Last-touch</span>
      </div>

      {!top ? (
        <EmptyState title="Funnel needs a sync" text="Impressions, clicks and conversions appear after the first successful Google Ads pull." />
      ) : (
        <div className="gads-funnel">
          {stages.map((stage, index) => {
            const width = top > 0 ? Math.max(2, (stage.value / top) * 100) : 0;
            const previousStage = stages[index - 1];
            return (
              <div key={stage.key} className="gads-funnel-stage">
                <div className="gads-funnel-head">
                  <span className="gads-strong">{stage.label}</span>
                  <b>{fmtNum(stage.value)}</b>
                </div>
                <div className="gads-bar-track">
                  <div
                    className="gads-bar-fill"
                    style={{
                      width: `${width}%`,
                      background: index >= stages.length - 1 ? '#006c4a' : `rgba(0, 74, 198, ${1 - index * 0.16})`,
                    }}
                  />
                </div>
                <div className="gads-bar-foot">
                  <span>
                    {index === 0 ? '100% of impressions' : `${rate(stage.value, previousStage.value).toFixed(2)}% from ${previousStage.label.toLowerCase()}`}
                  </span>
                  <span>{rate(stage.value, top).toFixed(2)}% of top</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ devices, money }) {
  const totalSpend = devices.reduce((sum, d) => sum + n(d.spend), 0);
  const max = Math.max(...devices.map((d) => n(d.spend)), 1);

  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Device breakdown</div>
          <div className="gads-card-sub">Spend and conversion efficiency by screen</div>
        </div>
        <span className="gads-badge gads-badge-grey">{devices.length} devices</span>
      </div>
      {!devices.length ? (
        <EmptyState title="No device rows" text="Device segmentation arrives with the campaign sync." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {devices.map((device) => {
            const spend = n(device.spend);
            const share = totalSpend > 0 ? (spend / totalSpend) * 100 : 0;
            return (
              <div key={device.dimension_id} className="gads-bar-row">
                <div className="gads-bar-head">
                  <span className="gads-strong">{device.dimension_label || device.dimension_id}</span>
                  <span className="gads-muted">{share.toFixed(0)}% · {money.format(spend)}</span>
                </div>
                <div className="gads-bar-track">
                  <div className="gads-bar-fill" style={{ width: `${Math.max(2, (spend / max) * 100)}%` }} />
                </div>
                <div className="gads-bar-foot">
                  <span>{fmtNum(device.conversions)} conversions · CPA {money.format(n(device.cpa))}</span>
                  <span className="gads-green gads-strong">{fmtX(device.roas)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GeoCard({ geo, money }) {
  const rows = (geo || []).slice(0, 5);
  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Top locations</div>
          <div className="gads-card-sub">Where the ad spend is producing conversions</div>
        </div>
        <span className="gads-badge gads-badge-blue">{geo?.length || 0} markets</span>
      </div>
      {!rows.length ? (
        <EmptyState title="No location rows" text="Location names are resolved from the geo target constants during a sync." />
      ) : (
        <div className="gads-list">
          {rows.map((row, index) => (
            <div key={`${row.dimension_id}-${index}`} className="gads-list-row">
              <div className="gads-list-main">
                <span className="gads-rank">{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="gads-list-title">{row.dimension_label || 'Unknown location'}</div>
                  <div className="gads-list-sub">{money.format(n(row.spend))} spend · {fmtNum(row.clicks)} clicks</div>
                </div>
              </div>
              <div className="gads-list-right">
                <div className="big">{fmtNum(row.conversions)} conv.</div>
                <div className="small">{fmtX(row.roas)} ROAS</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeywordCard({ keywords, money }) {
  const rows = (keywords || []).slice(0, 6);
  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Keyword intelligence</div>
          <div className="gads-card-sub">Highest spending search terms in this window</div>
        </div>
        <span className="gads-badge gads-badge-grey">{keywords?.length || 0} terms</span>
      </div>
      {!rows.length ? (
        <EmptyState title="No keyword rows" text="Keyword performance is cached separately; a sync will fill it in when the account has search campaigns." />
      ) : (
        <div className="gads-list">
          {rows.map((row, index) => (
            <div key={`${row.dimension_id}-${index}`} className="gads-list-row">
              <div className="gads-list-main" style={{ minWidth: 0 }}>
                <span className="gads-code" title={row.dimension_label}>{row.dimension_label}</span>
                <span className="gads-list-sub">{row.status || 'match'} · {money.format(n(row.spend))}</span>
              </div>
              <div className="gads-list-right">
                <div className="big">{fmtNum(row.conversions)} conv.</div>
                <div className="small">{money.format(n(row.conversionValue))}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewTab({ overview, ga4, money, metricKey, setMetricKey, goTab }) {
  const current = overview?.kpis?.current || {};
  const previous = overview?.kpis?.previous || {};
  const trend = overview?.trend?.current || [];
  const dailyBudget = (overview?.campaigns || [])
    .filter((c) => String(c.status).toUpperCase() !== 'PAUSED')
    .reduce((sum, c) => sum + n(c.budget), 0);
  const activeCampaigns = (overview?.campaigns || []).filter((c) => String(c.status).toUpperCase() === 'ENABLED').length;

  const cards = [
    { label: 'Ad spend', value: money.format(n(current.spend)), delta: deltaPill(current.spend, previous.spend, { neutral: true }), foot: `Prior ${money.format(n(previous.spend))}`, icon: Wallet, spark: trend.map((r) => r.spend) },
    { label: 'Impressions', value: fmtNum(current.impressions), delta: deltaPill(current.impressions, previous.impressions), foot: 'Search, PMax and display', icon: Eye, spark: trend.map((r) => r.impressions) },
    { label: 'Clicks', value: fmtNum(current.clicks), delta: deltaPill(current.clicks, previous.clicks), foot: `Prior ${fmtNum(previous.clicks)}`, icon: MousePointerClick, spark: trend.map((r) => r.clicks) },
    { label: 'Click-through rate', value: fmtPct(current.ctr), delta: deltaPill(current.ctr, previous.ctr), foot: `Prior ${fmtPct(previous.ctr)}`, icon: Percent, spark: trend.map((r) => (n(r.clicks) / (n(r.impressions) || 1)) * 100) },
    { label: 'Average CPC', value: money.format(n(current.cpc)), delta: deltaPill(current.cpc, previous.cpc, { invert: true }), foot: `Prior ${money.format(n(previous.cpc))}`, icon: Coins },
    { label: 'Conversions', value: fmtNum(current.conversions), delta: deltaPill(current.conversions, previous.conversions), foot: `Prior ${fmtNum(previous.conversions)}`, icon: UserPlus, spark: trend.map((r) => r.conversions) },
    { label: 'Cost per conversion', value: money.format(n(current.cpa)), delta: deltaPill(current.cpa, previous.cpa, { invert: true }), foot: 'Lower is better', icon: Target },
    { label: 'Conversion rate', value: fmtPct(current.cvr), delta: deltaPill(current.cvr, previous.cvr), foot: 'Conversions ÷ clicks', icon: Activity },
    { label: 'Conversion value', value: money.format(n(current.conversionValue)), delta: deltaPill(current.conversionValue, previous.conversionValue), foot: `Prior ${money.format(n(previous.conversionValue))}`, icon: CircleDollarSign, accent: 'primary', spark: trend.map((r) => r.conversionValue) },
    { label: 'Return on ad spend', value: fmtX(current.roas), delta: deltaPill(current.roas, previous.roas), foot: `Prior ${fmtX(previous.roas)}`, icon: TrendingUp, accent: 'green' },
    { label: 'Daily budget', value: money.format(dailyBudget), delta: null, foot: `${activeCampaigns} enabled campaign${activeCampaigns === 1 ? '' : 's'}`, icon: Wallet },
    { label: 'GA4 sessions', value: ga4?.ok ? fmtNum(ga4?.totals?.sessions) : '—', delta: null, foot: ga4?.ok ? `Engagement ${fmtPct((ga4?.totals?.engagementRate || 0) * 100, 1)}` : 'GA4 not connected', icon: Users },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <InsightCards insights={overview?.insights} onGo={goTab} />

      <div>
        <div className="gads-section-title" style={{ marginBottom: 10 }}>Marketing KPIs</div>
        <div className="gads-grid gads-grid-4">
          {cards.map((card) => <KpiCard key={card.label} {...card} />)}
        </div>
      </div>

      <TrendChart overview={overview} metricKey={metricKey} onMetric={setMetricKey} money={money} />

      <div className="gads-grid gads-grid-2">
        <FunnelCard overview={overview} ga4={ga4} />
        <DeviceCard devices={overview?.devices || []} money={money} />
      </div>

      <div className="gads-grid gads-grid-2">
        <GeoCard geo={overview?.geo || []} money={money} />
        <KeywordCard keywords={overview?.keywords || []} money={money} />
      </div>
    </div>
  );
}

// ---- Campaigns ------------------------------------------------------------

function CampaignsTab({ overview, money, search, setSearch, statusFilter, setStatusFilter }) {
  const campaigns = overview?.campaigns || [];
  const query = search.trim().toLowerCase();
  const visible = campaigns.filter((campaign) => {
    if (statusFilter !== 'ALL' && String(campaign.status || '').toUpperCase() !== statusFilter) return false;
    if (!query) return true;
    return String(campaign.dimension_label || '').toLowerCase().includes(query);
  });

  const totals = visible.reduce((acc, row) => ({
    spend: acc.spend + n(row.spend),
    clicks: acc.clicks + n(row.clicks),
    conversions: acc.conversions + n(row.conversions),
    value: acc.value + n(row.conversionValue),
  }), { spend: 0, clicks: 0, conversions: 0, value: 0 });

  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Campaign performance</div>
          <div className="gads-card-sub">
            {visible.length} of {campaigns.length} campaigns · {fmtNum(totals.conversions)} conversions · {money.format(totals.value)} value
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="gads-search">
            <Search size={14} strokeWidth={2} className="gads-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search campaigns"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search campaigns"
            />
          </div>
          <div className="gads-field">
            <Target size={13} strokeWidth={2} aria-hidden="true" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Campaign status">
              <option value="ALL">All statuses</option>
              <option value="ENABLED">Enabled</option>
              <option value="PAUSED">Paused</option>
            </select>
          </div>
        </div>
      </div>

      {!campaigns.length ? (
        <EmptyState title="No campaigns cached" text="Run Sync now from the header. The first pull stores one row per campaign per day." />
      ) : !visible.length ? (
        <EmptyState title="No campaigns match" text="Clear the search or choose another status." />
      ) : (
        <div className="gads-table-wrap">
          <table className="gads-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th className="num">Budget / day</th>
                <th className="num">Spend</th>
                <th className="num">Impressions</th>
                <th className="num">Clicks</th>
                <th className="num">CTR</th>
                <th className="num">CPC</th>
                <th className="num">Conversions</th>
                <th className="num">CPA</th>
                <th className="num">Conv. value</th>
                <th className="num">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((campaign) => (
                <tr key={campaign.dimension_id}>
                  <td>
                    <div className="strong">{campaign.dimension_label || `Campaign ${campaign.dimension_id}`}</div>
                    <div className="muted">ID {campaign.dimension_id}</div>
                  </td>
                  <td>
                    <span className={`gads-badge ${String(campaign.status).toUpperCase() === 'ENABLED' ? 'gads-badge-green' : 'gads-badge-grey'}`}>
                      <span className="gads-dot" />
                      {String(campaign.status || 'UNKNOWN').toLowerCase()}
                    </span>
                  </td>
                  <td className="num">{campaign.budget ? money.format(n(campaign.budget)) : '—'}</td>
                  <td className="num strong">{money.format(n(campaign.spend))}</td>
                  <td className="num">{fmtNum(campaign.impressions)}</td>
                  <td className="num">{fmtNum(campaign.clicks)}</td>
                  <td className="num">{fmtPct(campaign.ctr)}</td>
                  <td className="num">{money.format(n(campaign.cpc))}</td>
                  <td className="num strong gads-primary">{fmtNum(campaign.conversions)}</td>
                  <td className="num">{campaign.conversions ? money.format(n(campaign.cpa)) : '—'}</td>
                  <td className="num strong">{money.format(n(campaign.conversionValue))}</td>
                  <td className="num"><span className={n(campaign.roas) >= 1 ? 'gads-green gads-strong' : 'gads-red gads-strong'}>{fmtX(campaign.roas)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="gads-bar-foot" style={{ borderTop: '1px solid #edf0fa', paddingTop: 10 }}>
          <span>Window: {fmtDay(overview.range.from)} – {fmtDay(overview.range.to)}</span>
          <span>Blended ROAS <b className="gads-green">{fmtX(totals.spend ? totals.value / totals.spend : 0)}</b></span>
        </div>
      )}
    </div>
  );
}

// ---- Leads ----------------------------------------------------------------

function leadTone(status) {
  const value = String(status || '').toLowerCase();
  if (['closed', 'won', 'converted', 'closed_won'].includes(value)) return 'gads-badge-green';
  if (['assigned', 'contacted', 'qualified', 'follow_up'].includes(value)) return 'gads-badge-blue';
  if (['rejected', 'lost', 'dropped'].includes(value)) return 'gads-badge-red';
  return 'gads-badge-grey';
}

function LeadsTab({ overview, reloadLeads, loadingLeads, days }) {
  const leads = overview?.leads || { rows: [], total: 0 };
  const [syncing, setSyncing] = useState(false);

  const syncLeads = async () => {
    setSyncing(true);
    try {
      const result = await apiPost('/google-ads/leads/sync', { days: Number(days) || 30 });
      const skipped = Number(result.skipped) || 0;
      const duplicates = Number(result.duplicates) || 0;
      if (result.ok === false) {
        toast(result.error || 'Could not fetch leads from Google Ads', 'error');
      } else {
        toast(
          `Fetched ${result.ingested || 0} new lead(s)`
          + (result.backfilled ? ` · ${result.backfilled} placed` : '')
          + (duplicates ? ` · ${duplicates} already present` : '')
          + (skipped ? ` · ${skipped} skipped` : ''),
          'success',
        );
      }
      await reloadLeads();
    } catch (e) {
      toast(e?.message || 'Could not fetch leads from Google Ads', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="gads-card">
      <div className="gads-card-head">
        <div>
          <div className="gads-card-title">Google-attributed leads</div>
          <div className="gads-card-sub">
            Live lead-form submissions from the Google Ads API, plus leads carrying a gclid / campaign attribution
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="gads-badge gads-badge-blue">{fmtNum(leads.total)} in window</span>
          <button type="button" className="gads-btn gads-btn-sm" onClick={syncLeads} disabled={syncing}>
            <RefreshCw size={13} strokeWidth={2} className={syncing ? 'gads-spin' : ''} aria-hidden="true" />
            {syncing ? 'Fetching…' : 'Fetch leads'}
          </button>
          <button type="button" className="gads-btn gads-btn-sm" onClick={reloadLeads} disabled={loadingLeads}>
            <RefreshCw size={13} strokeWidth={2} className={loadingLeads ? 'gads-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {leads.error && <div className="gads-note is-bad"><XCircle size={14} /> {leads.error}</div>}
      {leads.note && !leads.rows?.length && (
        <div className="gads-note is-info"><Info size={14} /> {leads.note}</div>
      )}

      {!leads.rows?.length ? (
        <EmptyState
          title="No attributed leads yet"
          text="Press Fetch leads to pull lead-form submissions from the Google Ads API. They also land automatically every 5 minutes once Google Ads is connected."
        />
      ) : (
        <div className="gads-table-wrap">
          <table className="gads-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Source</th>
                <th>Campaign</th>
                <th>Answer</th>
                <th>Keyword</th>
                <th>Created</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {leads.rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className="strong">{lead.name}</div>
                    <div className="muted">{[lead.phone, lead.email].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td><span className="gads-badge gads-badge-blue">{lead.source || 'Google Ads'}</span></td>
                  <td>{lead.campaign || <span className="gads-muted">—</span>}</td>
                  <td>{lead.answer || <span className="gads-muted">—</span>}</td>
                  <td>
                    {lead.keyword ? (
                      <span className="gads-code" title={lead.keyword}>{lead.keyword}</span>
                    ) : <span className="gads-muted">—</span>}
                  </td>
                  <td className="gads-nowrap">{fmtDateTime(lead.createdAt)}</td>
                  <td><span className={`gads-badge ${leadTone(lead.status)}`}>{lead.status || 'new'}</span></td>
                  <td>{lead.owner ? `#${lead.owner}` : <span className="gads-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- GA4 ------------------------------------------------------------------

function Ga4Panel({ ga4 }) {
  if (!ga4) {
    return (
      <div className="gads-card">
        <EmptyState title="GA4 not loaded" text="Save a GA4 property id in the Connection tab and run a sync to see web behaviour." />
      </div>
    );
  }

  if (!ga4.ok) {
    return (
      <div className="gads-card">
        <div className="gads-card-head">
          <div>
            <div className="gads-card-title">Google Analytics 4</div>
            <div className="gads-card-sub">Web behavioural intelligence for the same window</div>
          </div>
          <span className="gads-badge gads-badge-amber">{ga4.configured ? 'Not readable' : 'Not connected'}</span>
        </div>
        <div className="gads-note is-warn"><AlertTriangle size={14} /> {ga4.message || 'GA4 did not answer.'}</div>
        <EmptyState title="GA4 needs one more step" text="Add the GA4 property id under Connection. The refresh token must include the analytics.readonly scope, and the Google account must be able to read that property." />
      </div>
    );
  }

  const totals = ga4.totals || {};
  const channels = ga4.channels || [];
  const landingPages = ga4.landingPages || [];
  const totalChannelSessions = channels.reduce((sum, channel) => sum + n(channel.sessions), 0) || 1;

  const micro = [
    { label: 'Total users', value: fmtNum(totals.users) },
    { label: 'Sessions', value: fmtNum(totals.sessions) },
    { label: 'New users', value: fmtNum(totals.newUsers) },
    { label: 'Engaged sessions', value: fmtNum(totals.engagedSessions) },
    { label: 'Engagement rate', value: fmtPct(n(totals.engagementRate) * 100, 1), green: true },
    { label: 'Avg engagement', value: fmtDuration(totals.averageSessionDuration) },
    { label: 'Key events', value: fmtNum(totals.keyEvents), primary: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="gads-card" style={{ paddingBottom: 10 }}>
        <div className="gads-card-head">
          <div>
            <div className="gads-card-title">Google Analytics 4</div>
            <div className="gads-card-sub">
              Property {ga4.propertyId} · {fmtDay(ga4.range?.from)} – {fmtDay(ga4.range?.to)}
              {ga4.sample ? ' · sample preview' : ''}
            </div>
          </div>
          <span className="gads-badge gads-badge-green"><span className="gads-dot gads-dot-live" /> Stream readable</span>
        </div>
        <div className="gads-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {micro.map((item) => (
            <div key={item.label} style={{ padding: '4px 2px' }}>
              <div className="gads-meta-label">{item.label}</div>
              <div className={item.green ? 'gads-kpi-value is-green' : item.primary ? 'gads-kpi-value is-primary' : 'gads-kpi-value'} style={{ fontSize: 18 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="gads-grid gads-grid-2">
        <div className="gads-card">
          <div className="gads-card-head">
            <div>
              <div className="gads-card-title">Traffic acquisition</div>
              <div className="gads-card-sub">Default channel group share of sessions</div>
            </div>
          </div>
          {!channels.length ? (
            <EmptyState title="No channel rows" text="GA4 returned no sessions for this window." />
          ) : (
            <div className="gads-grid gads-grid-2" style={{ alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={channels} dataKey="sessions" nameKey="channel" innerRadius={52} outerRadius={74} paddingAngle={2} stroke="none">
                      {channels.map((channel, index) => (
                        <Cell key={channel.channel} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmtNum(value)} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e2e6f2' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 800 }}>{compact(totals.sessions)}</span>
                  <span className="gads-meta-label">Sessions</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {channels.map((channel, index) => (
                  <div key={channel.channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: CHANNEL_COLORS[index % CHANNEL_COLORS.length], flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.channel}</span>
                    </span>
                    <span className="gads-strong">{((n(channel.sessions) / totalChannelSessions) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="gads-card">
          <div className="gads-card-head">
            <div>
              <div className="gads-card-title">Top landing pages</div>
              <div className="gads-card-sub">Entry pages ranked by sessions</div>
            </div>
          </div>
          {!landingPages.length ? (
            <EmptyState title="No landing page rows" text="GA4 returned no landing page sessions for this window." />
          ) : (
            <div className="gads-table-wrap">
              <table className="gads-table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Landing page</th>
                    <th className="num">Sessions</th>
                    <th className="num">Engagement</th>
                    <th className="num">Key events</th>
                  </tr>
                </thead>
                <tbody>
                  {landingPages.map((page) => (
                    <tr key={page.page}>
                      <td><span className="gads-code" title={page.page}>{page.page}</span></td>
                      <td className="num strong">{fmtNum(page.sessions)}</td>
                      <td className="num gads-green">{fmtPct(n(page.engagementRate) * 100, 1)}</td>
                      <td className="num">{fmtNum(page.keyEvents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Connection -----------------------------------------------------------

const SOURCE_LABEL = { database: 'saved', default: 'default', missing: 'not set' };

function ConfigField({ field, info, value, onChange }) {
  const source = info?.source || 'missing';
  const isSet = Boolean(info?.set);
  const isSecret = Boolean(field.secret);
  const savedValue = info?.value || '';
  const maskedValue = info?.masked || '';
  const [editing, setEditing] = useState(!isSet);
  const [revealed, setRevealed] = useState(false);
  const [revealedValue, setRevealedValue] = useState('');
  const [revealing, setRevealing] = useState(false);
  const inputRef = useRef(null);

  // When the field transitions between saved and unsaved (after Save or
  // Disconnect), reset the local edit/reveal state so the field reflects the
  // new truth instead of an old draft.
  const savedRef = useRef(isSet);
  useEffect(() => {
    if (isSet !== savedRef.current) {
      savedRef.current = isSet;
      setEditing(!isSet);
      setRevealed(false);
      setRevealedValue('');
    }
  }, [isSet]);

  const draftValue = value !== undefined ? value : '';
  const readOnly = isSecret && isSet && !editing;
  const shownValue = isSecret
    ? (readOnly
      ? (revealed ? (revealedValue || maskedValue) : '••••••••••••')
      : draftValue)
    : (value !== undefined ? draftValue : savedValue);
  // A hidden saved secret is rendered as literal dots (not a password input
  // wrapping more bullets); an editable secret is a password input.
  const inputType = isSecret && !readOnly && !revealed ? 'password' : 'text';

  const toggleReveal = async () => {
    if (!isSecret) return;
    if (revealed) {
      setRevealed(false);
      return;
    }
    setRevealed(true);
    if (!readOnly || revealedValue) return;
    setRevealing(true);
    try {
      const result = await apiPost('/google-ads/config/reveal', { field: field.key });
      setRevealedValue(result?.value || '');
      if (!result?.value) {
        setRevealed(false);
        toast('No saved value to reveal', 'info');
      }
    } catch (e) {
      setRevealed(false);
      toast(e.message || 'Could not reveal the saved secret', 'error');
    } finally {
      setRevealing(false);
    }
  };

  const startEditing = () => {
    setEditing(true);
    setRevealed(false);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  const cancelEditing = () => {
    onChange(undefined);
    setEditing(false);
    setRevealed(false);
    setRevealedValue('');
  };

  const effectiveValue = value !== undefined ? value : savedValue;
  const invalidClientId = field.key === 'GOOGLE_ADS_CLIENT_ID'
    && Boolean(effectiveValue)
    && !String(effectiveValue).endsWith('.apps.googleusercontent.com');

  return (
    <div className="gads-field-block">
      <div className="gads-field-label">
        {field.label}
        {field.required && <span className="req">*</span>}
        <span className={`src ${isSet ? 'is-set' : 'is-missing'}`}>{SOURCE_LABEL[source] || source}</span>
      </div>
      <div className="gads-input-wrap">
        <input
          ref={inputRef}
          className={`gads-input has-actions${isSecret ? ' has-two-actions' : ''}`}
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            editing || !isSet
              ? (isSecret ? 'Enter new secret' : (field.placeholder || ''))
              : ''
          }
          value={shownValue}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          aria-label={field.label}
        />
        <div className="gads-input-actions">
          {isSecret && (
            <button
              type="button"
              className={`gads-icon-btn${revealed ? ' is-on' : ''}`}
              onClick={toggleReveal}
              disabled={revealing}
              title={revealed ? 'Hide secret' : 'Show secret'}
              aria-label={revealed ? 'Hide secret' : 'Show secret'}
            >
              {revealing
                ? <RefreshCw size={14} className="gads-spin" />
                : revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          {isSecret && isSet && !editing && (
            <button
              type="button"
              className="gads-icon-btn"
              onClick={startEditing}
              title="Edit secret (leave blank to keep)"
              aria-label="Edit secret"
            >
              <Pencil size={14} />
            </button>
          )}
          {isSecret && editing && isSet && (
            <button
              type="button"
              className="gads-icon-btn"
              onClick={cancelEditing}
              title="Cancel editing"
              aria-label="Cancel editing"
            >
              <X size={14} />
            </button>
          )}
          {!isSecret && (
            <button
              type="button"
              className="gads-icon-btn"
              onClick={() => {
                inputRef.current?.focus();
                inputRef.current?.select?.();
              }}
              title="Edit value"
              aria-label="Edit value"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>
      <span className="gads-hint">{field.hint}</span>
      {invalidClientId && (
        <span className="gads-hint gads-red">
          This does not look like an OAuth client id — it must end with <code>.apps.googleusercontent.com</code>.
        </span>
      )}
    </div>
  );
}

function CheckRow({ label, ok, optional = false }) {
  const tone = ok ? 'ok' : (optional ? '' : 'bad');
  return (
    <div className={`gads-check ${tone}`.trim()}>
      <span className="mark">{ok ? '✓' : optional ? '–' : '✕'}</span>
      {label}
    </div>
  );
}

function ConnectionPanel({
  status, config, draft, setDraft, showAdvanced, setShowAdvanced,
  saving, testing, testResult, syncing, disconnecting,
  onSave, onTest, onSync, onDisconnect, sample, setSample, days, configVersion,
}) {
  const checks = status?.requirements || {};
  const fields = config?.fields || status?.fields || {};

  const updateDraft = (key, value) => setDraft((prev) => {
    const next = { ...prev };
    // undefined removes the draft entry, which restores the saved display;
    // an empty string is a real "clear this saved value" intent.
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={`gads-conn-banner ${status?.configured ? 'is-ok' : 'is-warn'}`}>
        {status?.configured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <span>
          {status?.configured
            ? `Google Ads is connected${status?.customer?.name ? ` — ${status.customer.name}` : ''}.`
            : 'Google Ads is not connected yet. Save the OAuth credentials below to start syncing.'}
        </span>
        <span className="gads-spacer" />
        {status?.last_sync?.at && <span className="gads-mini">Last sync {timeAgo(status.last_sync.at)}</span>}
      </div>

      <div className="gads-card">
        <div className="gads-card-head">
          <div>
            <div className="gads-card-title">Connection checklist</div>
            <div className="gads-card-sub">
              Google Ads needs the OAuth trio and a customer id. Developer tokens were sunset on 9 Sep 2026 —
              API access is now granted to the Google Cloud project that owns the OAuth client.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="gads-btn gads-btn-sm" onClick={onTest} disabled={testing || !checks.client_id}>
              {testing ? <RefreshCw size={13} className="gads-spin" /> : <Activity size={13} />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button type="button" className="gads-btn gads-btn-primary gads-btn-sm" onClick={onSync} disabled={syncing || !status?.configured || sample}>
              {syncing ? <RefreshCw size={13} className="gads-spin" /> : <RefreshCw size={13} />}
              {syncing ? 'Syncing…' : `Sync ${days} days`}
            </button>
          </div>
        </div>

        <div className="gads-check-list">
          <CheckRow label="OAuth client id" ok={checks.client_id} />
          <CheckRow label="OAuth client secret" ok={checks.client_secret} />
          <CheckRow label="Refresh token" ok={checks.refresh_token} />
          <CheckRow label="Customer id" ok={checks.customer_id} />
          <CheckRow label="GA4 property (optional)" ok={checks.ga4_property_id} optional />
        </div>

        <div className="gads-note is-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <Info size={14} /> API access level
          </div>
          <span>
            New Google Cloud projects start with <b>Test access</b> (test accounts only). To read a production ad
            account, apply for <b>Explorer access</b> in the Google Ads API Overview page — approval is automated in
            most cases.
          </span>
          <a href="https://console.cloud.google.com/google/ads-apis/overview" target="_blank" rel="noreferrer">
            Open Google Ads API Overview →
          </a>
        </div>

        {testResult && (
          <div className={`gads-note ${testResult.ok ? 'is-ok' : 'is-warn'}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              Connection test {testResult.ok ? 'passed' : 'needs attention'}
            </div>
            <div>OAuth: {testResult.checks?.oauth?.ok ? 'ok' : 'failed'} — {testResult.checks?.oauth?.message}</div>
            <div>Ads API: {testResult.checks?.ads?.ok ? 'ok' : 'failed'} — {testResult.checks?.ads?.message}</div>
            <div>GA4: {testResult.checks?.ga4?.ok ? 'ok' : 'failed'} — {testResult.checks?.ga4?.message}</div>
            {testResult.checks?.ads?.customer && (
              <div className="gads-mono gads-mini">
                {testResult.checks.ads.customer.name} · {testResult.checks.ads.customer.id} · {testResult.checks.ads.customer.currency} · {testResult.checks.ads.customer.timeZone}
              </div>
            )}
          </div>
        )}
      </div>

      <form
        key={configVersion}
        className="gads-card"
        onSubmit={(event) => { event.preventDefault(); if (!saving) onSave(); }}
      >
        <div className="gads-card-head">
          <div>
            <div className="gads-card-title">Google connection</div>
            <div className="gads-card-sub">
              Credentials are stored in the settings table and masked on read. The database is the only source —
              <code> .env</code> is not consulted for Google Ads.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="gads-btn gads-btn-danger gads-btn-sm" onClick={onDisconnect} disabled={disconnecting}>
              <LogOut size={13} /> {disconnecting ? 'Removing…' : 'Disconnect'}
            </button>
            <button type="submit" className="gads-btn gads-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save connection'}
            </button>
          </div>
        </div>

        <div className="gads-form-grid">
          {CONFIG_FIELDS.filter((field) => !field.advanced).map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              info={fields[field.key.toLowerCase()]}
              value={draft[field.key]}
              onChange={(value) => updateDraft(field.key, value)}
            />
          ))}
        </div>

        <div style={{ borderTop: '1px solid #edf0fa', paddingTop: 10 }}>
          <button
            type="button"
            className="gads-btn gads-btn-ghost gads-btn-sm"
            onClick={() => setShowAdvanced((value) => !value)}
            style={{ paddingLeft: 0 }}
          >
            {showAdvanced ? '− Hide optional settings' : '+ Optional settings (manager id, API version, GA4, conversion action)'}
          </button>
          {showAdvanced && (
            <div className="gads-form-grid" style={{ marginTop: 10 }}>
              {CONFIG_FIELDS.filter((field) => field.advanced).map((field) => (
                <ConfigField
                  key={field.key}
                  field={field}
                  info={fields[field.key.toLowerCase()]}
                  value={draft[field.key]}
                  onChange={(value) => updateDraft(field.key, value)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="gads-note is-info">
          <Info size={14} />
          <span>
            Leave a secret blank to keep the saved value. Saving new OAuth credentials verifies them against Google before
            anything is stored — a rejected token never replaces a working one.
          </span>
        </div>

        <label className="gads-toggle">
          <input type="checkbox" checked={sample} onChange={(event) => setSample(event.target.checked)} />
          Preview the dashboard with sample data (clearly labelled, no Google calls)
        </label>
      </form>

      <div className="gads-grid gads-grid-2">
        <div className="gads-card">
          <div className="gads-card-title">How to get the OAuth values</div>
          <ol className="gads-steps">
            <li>In Google Cloud Console create (or reuse) a project and enable the <b>Google Ads API</b> and <b>Google Analytics Data API</b>. Enabling the Ads API grants <b>Test access</b> automatically.</li>
            <li>Create an <b>OAuth client id</b> of type “Web application”. Add <code>https://developers.google.com/oauthplayground</code> as an authorised redirect URI while generating the token.</li>
            <li>Open the OAuth 2.0 Playground, choose “Use your own OAuth credentials”, and authorise <code>https://www.googleapis.com/auth/adwords</code> and <code>https://www.googleapis.com/auth/analytics.readonly</code>.</li>
            <li>Exchange the code for tokens and copy the <b>refresh token</b> here. It is reusable until the Google account revokes it.</li>
            <li>For a production account, apply for <b>Explorer access</b> on the <a href="https://console.cloud.google.com/google/ads-apis/overview" target="_blank" rel="noreferrer">Google Ads API Overview</a> page. No developer token is needed — it was sunset on 9 Sep 2026.</li>
          </ol>
        </div>
        <div className="gads-card">
          <div className="gads-card-title">What each scope unlocks</div>
          <div className="gads-list">
            <div className="gads-list-row">
              <div className="gads-list-main"><KeyRound size={14} className="gads-primary" /><span className="gads-list-title">adwords</span></div>
              <span className="gads-list-sub">Campaigns, spend, devices, geo, keywords</span>
            </div>
            <div className="gads-list-row">
              <div className="gads-list-main"><Users size={14} className="gads-green" /><span className="gads-list-title">analytics.readonly</span></div>
              <span className="gads-list-sub">GA4 users, sessions, channels, landing pages</span>
            </div>
            <div className="gads-list-row">
              <div className="gads-list-main"><Settings size={14} className="gads-muted" /><span className="gads-list-title">Sync cache</span></div>
              <span className="gads-list-sub">One row per campaign / day — fast page loads</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Page -----------------------------------------------------------------

export default function GoogleAdsAnalytics() {
  const [tab, setTab] = useState('Overview');
  const [days, setDays] = useState(30);
  const [sample, setSample] = useState(false);
  const [metricKey, setMetricKey] = useState('conversionValue');
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [configVersion, setConfigVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const exportRef = useRef(null);

  const currency = overview?.customer?.currency || status?.customer?.currency || 'INR';
  const money = useMemo(() => {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      // Google returns an ISO code, but a malformed cached value must not take
      // the whole page down.
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    }
  }, [currency]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    const [statusResult, overviewResult, configResult] = await Promise.allSettled([
      apiGet('/google-ads/status'),
      apiGet(`/google-ads/overview?days=${days}${sample ? '&sample=1' : ''}`),
      apiGet('/google-ads/config'),
    ]);

    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    } else {
      setError(overviewResult.reason?.message || 'Could not load Google Ads data.');
    }
    if (configResult.status === 'fulfilled') setConfig(configResult.value);
    setLoading(false);
  }, [days, sample]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showExport) return undefined;
    const onDown = (event) => {
      if (exportRef.current && !exportRef.current.contains(event.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showExport]);

  const refreshOverview = useCallback(async () => {
    try {
      const fresh = await apiGet(`/google-ads/overview?days=${days}${sample ? '&sample=1' : ''}`);
      setOverview(fresh);
    } catch (e) {
      toast(e.message || 'Could not refresh the dashboard', 'error');
    }
  }, [days, sample]);

  const handleSync = async () => {
    if (!status?.configured) {
      toast('Add the Google Ads credentials first', 'error');
      setTab('Connection');
      return;
    }
    setSyncing(true);
    try {
      const result = await apiPost('/google-ads/sync', { days });
      const errors = Array.isArray(result.errors) ? result.errors.length : 0;
      toast(
        `Synced ${fmtNum(result.rowCount)} rows${errors ? ` · ${errors} scope${errors === 1 ? '' : 's'} reported an error` : ''}`,
        errors ? 'warning' : 'success',
      );
      await load({ quiet: true });
    } catch (e) {
      toast(e.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    if (!Object.keys(draft).length) {
      toast('Nothing changed', 'info');
      return;
    }
    setSaving(true);
    try {
      const result = await apiPost('/google-ads/config', draft);
      setConfig(result.config);
      setStatus((prev) => ({ ...prev, ...(result.status || {}) }));
      setDraft({});
      setConfigVersion((value) => value + 1);
      setTestResult(null);
      toast(result.verification?.ok ? 'Connection saved and OAuth verified' : 'Connection saved', 'success');
      await load({ quiet: true });
    } catch (e) {
      toast(e.message || 'Could not save the connection', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiPost('/google-ads/test', {});
      setTestResult(result);
      toast(result.ok ? 'Google Ads is reachable' : 'Some checks failed', result.ok ? 'success' : 'warning');
    } catch (e) {
      toast(e.message || 'Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Remove the saved Google Ads credentials? The dashboard will show no live data until they are added again.')) return;
    setDisconnecting(true);
    try {
      const result = await apiDelete('/google-ads/config');
      setConfig(result.config);
      setStatus((prev) => ({ ...prev, ...(result.status || {}) }));
      setDraft({});
      setConfigVersion((value) => value + 1);
      toast('Google Ads credentials removed', 'success');
      await load({ quiet: true });
    } catch (e) {
      toast(e.message || 'Could not disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const reloadLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const result = await apiGet(`/google-ads/leads?days=${days}&limit=100`);
      setOverview((prev) => (prev ? { ...prev, leads: result } : prev));
    } catch (e) {
      toast(e.message || 'Could not load leads', 'error');
    } finally {
      setLoadingLeads(false);
    }
  }, [days]);

  // Live list: the backend pulls lead-form submissions every 5 minutes and the
  // new rows arrive on the socket, so the tab updates without pressing Fetch.
  // The 60s poll is the fallback for a dropped socket.
  useEffect(() => {
    const timer = setInterval(() => { reloadLeads(); }, 60000);
    return () => clearInterval(timer);
  }, [reloadLeads]);

  useRealtime('leads', {
    event: 'INSERT',
    onInsert: (row) => {
      if (/google/i.test(String(row?.source || ''))) reloadLeads();
    },
  });

  const exportCsv = (kind) => {
    setShowExport(false);
    const rows = kind === 'keywords' ? (overview?.keywords || []) : (overview?.campaigns || []);
    if (!rows.length) {
      toast('Nothing to export for this window', 'info');
      return;
    }
    const header = kind === 'keywords'
      ? ['Keyword', 'Match type', 'Spend', 'Clicks', 'Conversions', 'Conversion value', 'CPC', 'ROAS']
      : ['Campaign', 'Status', 'Daily budget', 'Spend', 'Impressions', 'Clicks', 'CTR %', 'CPC', 'Conversions', 'CPA', 'Conversion value', 'ROAS'];
    const lines = rows.map((row) => (kind === 'keywords'
      ? [
        row.dimension_label, row.status || '', n(row.spend).toFixed(2), Math.round(n(row.clicks)),
        n(row.conversions).toFixed(2), n(row.conversionValue).toFixed(2), n(row.cpc).toFixed(2), n(row.roas).toFixed(2),
      ]
      : [
        row.dimension_label, row.status || '', n(row.budget).toFixed(2), n(row.spend).toFixed(2),
        Math.round(n(row.impressions)), Math.round(n(row.clicks)), n(row.ctr).toFixed(2), n(row.cpc).toFixed(2),
        n(row.conversions).toFixed(2), n(row.cpa).toFixed(2), n(row.conversionValue).toFixed(2), n(row.roas).toFixed(2),
      ]));
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...lines].map((line) => line.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `google-ads-${kind}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const connected = Boolean(status?.configured);
  const syncedOnce = Boolean(status?.last_sync?.customer || overview?.lastSync?.detail?.customer);
  const lastSyncAt = status?.last_sync?.at || overview?.lastSync?.at || overview?.lastSync?.last_run_at;
  const customer = overview?.customer || status?.customer || null;
  const fields = status?.fields || config?.fields || {};
  const envOnly = ['GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_REFRESH_TOKEN']
    .filter((key) => fields[key.toLowerCase()]?.set).length;

  return (
    <div className="gads-page">
      <header className="gads-head">
        <div className="gads-head-main">
          <div>
            <div className="gads-title-row">
              <h1>Google Ads &amp; Analytics</h1>
              {sample ? (
                <span className="gads-badge gads-badge-amber"><span className="gads-dot" /> Sample preview</span>
              ) : connected ? (
                <span className="gads-badge gads-badge-green">
                  <span className={`gads-dot${syncedOnce ? ' gads-dot-live' : ''}`} />
                  {syncedOnce ? 'Google connected' : 'Google configured'}
                </span>
              ) : (
                <span className="gads-badge gads-badge-grey"><span className="gads-dot" /> Not connected</span>
              )}
              <span className="gads-meta">
                <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
                Last synced {lastSyncAt ? `${timeAgo(lastSyncAt)} (${fmtDateTime(lastSyncAt)})` : 'never'}
              </span>
            </div>
            <p className="gads-sub">
              Advertising performance, website traffic and attributed leads in one place. Spend, clicks and conversions
              come from a cached Google Ads pull; the GA4 tab reads the property directly with a five-minute cache.
            </p>
          </div>

          <div className="gads-head-actions">
            <button type="button" className="gads-btn gads-btn-primary" onClick={handleSync} disabled={syncing || sample}>
              <RefreshCw size={14} strokeWidth={2} className={syncing ? 'gads-spin' : ''} aria-hidden="true" />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <div style={{ position: 'relative' }} ref={exportRef}>
              <button type="button" className="gads-btn" onClick={() => setShowExport((value) => !value)}>
                <Download size={14} strokeWidth={2} aria-hidden="true" />
                Export
              </button>
              {showExport && (
                <div
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, width: 190,
                    background: '#fff', border: '1px solid #e2e6f2', borderRadius: 10,
                    boxShadow: '0 12px 28px rgba(19,27,46,.16)', padding: 4,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <button type="button" className="gads-btn gads-btn-ghost gads-btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => exportCsv('campaigns')}>
                    Campaign CSV
                  </button>
                  <button type="button" className="gads-btn gads-btn-ghost gads-btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => exportCsv('keywords')}>
                    Keyword CSV
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="gads-btn" onClick={() => setTab('Connection')}>
              <Settings size={14} strokeWidth={2} aria-hidden="true" />
              Connection
            </button>
            <button type="button" className="gads-btn gads-btn-ghost gads-btn-sm" onClick={() => setShowMeta((value) => !value)}>
              {showMeta ? 'Hide meta' : 'Account meta'}
            </button>
          </div>
        </div>

        {showMeta && (
          <div className="gads-meta-grid">
            <div className="gads-meta-tile">
              <div className="gads-meta-avatar"><Wallet size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="gads-meta-label">Ad account</div>
                <div className="gads-meta-value">{customer?.name || 'Not connected'}</div>
                <div className="gads-meta-sub">{customer?.id || '—'} · {customer?.currency || currency}</div>
              </div>
            </div>
            <div className="gads-meta-tile">
              <div className="gads-meta-avatar is-green"><Users size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="gads-meta-label">GA4 property</div>
                <div className="gads-meta-value">{overview?.ga4?.propertyId || status?.fields?.ga4_property_id?.value || 'Not configured'}</div>
                <div className="gads-meta-sub">{overview?.ga4?.ok ? 'Readable' : 'Add in Connection'}</div>
              </div>
            </div>
            <div className="gads-meta-tile">
              <div className="gads-meta-avatar is-amber"><KeyRound size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="gads-meta-label">Credential source</div>
                <div className="gads-meta-value">{envOnly ? `${envOnly} secret${envOnly === 1 ? '' : 's'} on file` : 'None saved'}</div>
                <div className="gads-meta-sub">Masked on read · stored in database</div>
              </div>
            </div>
            <div className="gads-meta-tile">
              <div className="gads-meta-avatar"><Activity size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="gads-meta-label">API version</div>
                <div className="gads-meta-value">{status?.fields?.google_ads_api_version?.value || 'v26'}</div>
                <div className="gads-meta-sub">{status?.last_sync?.errors?.length ? `${status.last_sync.errors.length} sync warning(s)` : 'No sync errors'}</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {sample && (
        <div className="gads-note is-warn">
          <AlertTriangle size={15} />
          <span>
            <b>Sample preview.</b> These numbers are generated locally to demonstrate the dashboard. Uncheck
            “Preview the dashboard with sample data” in Connection, or save real credentials, to see live data.
          </span>
        </div>
      )}

      {error && <div className="gads-note is-bad"><XCircle size={15} /> {error}</div>}

      {(() => {
        const syncErrors = status?.last_sync?.errors || [];
        if (!syncErrors.length) return null;
        const accessIssue = syncErrors.some((entry) => /test accounts|does not have permission|Explorer|Basic|Standard access/i.test(entry?.message || ''));
        return (
          <div className="gads-note is-warn">
            <AlertTriangle size={15} />
            <span>
              {accessIssue ? (
                <>
                  <b>Google Ads API access is still at test level for this Cloud project.</b>{' '}
                  The OAuth keys are working; the project itself needs Explorer/Basic access before it can read the real ad account.{' '}
                  <a href="https://console.cloud.google.com/google/ads-apis/overview" target="_blank" rel="noreferrer">
                    Apply for access
                  </a>{' '}
                  with the manager account that owns this customer id, then press <b>Sync now</b>.
                  {' '}Until approval lands, use <b>Sample</b> to preview the dashboard.
                </>
              ) : (
                <>
                  Last sync reported {syncErrors.length} scope problem{syncErrors.length === 1 ? '' : 's'}:
                  {' '}
                  {syncErrors.slice(0, 3).map((entry) => `${entry.scope}: ${entry.message}`).join(' · ')}
                </>
              )}
            </span>
          </div>
        );
      })()}

      <div className="gads-tabs" role="tablist" aria-label="Google Ads sections">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={`gads-tab${tab === name ? ' is-active' : ''}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab !== 'Connection' && (
        <div className="gads-filters">
          <div className="gads-field">
            <Search size={13} strokeWidth={2} aria-hidden="true" />
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Date range">
              {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <span className="gads-badge gads-badge-blue">
            vs previous {days} days
          </span>
          {overview?.range && (
            <span className="gads-meta">
              {fmtDay(overview.range.from)} – {fmtDay(overview.range.to)}
            </span>
          )}
          <span className="gads-spacer" />
          <label className="gads-toggle">
            <input type="checkbox" checked={sample} onChange={(event) => setSample(event.target.checked)} />
            Sample
          </label>
          <button type="button" className="gads-btn gads-btn-sm" onClick={() => load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'gads-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : tab === 'Overview' ? (
        overview?.hasData || overview?.sample ? (
          <OverviewTab
            overview={overview}
            ga4={overview?.ga4}
            money={money}
            metricKey={metricKey}
            setMetricKey={setMetricKey}
            goTab={setTab}
          />
        ) : (
          <EmptyState
            title={connected ? 'No metrics cached for this window' : 'Connect Google Ads to begin'}
            text={overview?.message || 'Save the OAuth credentials in Connection, then press Sync now. The first pull can take a minute.'}
            action={(
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {connected ? (
                  <button type="button" className="gads-btn gads-btn-primary" onClick={handleSync} disabled={syncing}>
                    <RefreshCw size={14} className={syncing ? 'gads-spin' : ''} /> Sync now
                  </button>
                ) : (
                  <button type="button" className="gads-btn gads-btn-primary" onClick={() => setTab('Connection')}>
                    <Link2 size={14} /> Open connection
                  </button>
                )}
                <button type="button" className="gads-btn" onClick={() => setSample(true)}>
                  Preview sample dashboard
                </button>
              </div>
            )}
          />
        )
      ) : tab === 'Campaigns' ? (
        <CampaignsTab
          overview={overview}
          money={money}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      ) : tab === 'Leads' ? (
        <LeadsTab overview={overview} reloadLeads={reloadLeads} loadingLeads={loadingLeads} days={days} />
      ) : tab === 'GA4' ? (
        <Ga4Panel ga4={overview?.ga4} />
      ) : (
        <ConnectionPanel
          status={status}
          config={config}
          draft={draft}
          setDraft={setDraft}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          saving={saving}
          testing={testing}
          testResult={testResult}
          syncing={syncing}
          disconnecting={disconnecting}
          onSave={handleSave}
          onTest={handleTest}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
          sample={sample}
          setSample={setSample}
          days={days}
          configVersion={configVersion}
        />
      )}
    </div>
  );
}
