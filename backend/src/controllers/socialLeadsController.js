// Social Media panel → Leads Report.
//
// The Social team wants one read-only overview of the leads their digital work
// brings in: Meta lead ads, Google lead forms and the related outreach channels
// (WhatsApp bulk replies, bulk email, LinkedIn). Everything is aggregated from
// the shared `leads` table, so the counts are the same numbers the Recruiter /
// Accounts panels work from — this screen only slices them by source, campaign,
// form, NGO and day.
//
// Intent (hot / review / low) is scored with the same `scoreSsReply` used by the
// Meta panel, so a lead is never labelled one way here and another way there.
// Spend / CPL are read from Meta insights best-effort: when no ad account is
// configured the cards simply come back empty and the lead numbers still work.
import db from '../config/db.js';
import { istDateString } from '../utils/ist.js';
import { scoreSsReply } from '../services/ssLeadService.js';
import {
  getInsightsSummary,
  getMetaFunnel,
  isMetaInsightsConfigured,
} from '../services/metaAdsService.js';

// The digital sources shown in the Social panel. Job Portal / Walk-in / Referral
// are deliberately excluded: they are not produced by the social team.
const SOCIAL_SOURCES = [
  'Meta Lead Ad',
  'Google Ads Lead Form',
  'WhatsApp Bulk Reply',
  'Bulk Email',
  'LinkedIn',
];

const SOURCE_KEY = {
  'Meta Lead Ad': 'meta',
  'Google Ads Lead Form': 'google',
  'WhatsApp Bulk Reply': 'whatsapp',
  'Bulk Email': 'email',
  LinkedIn: 'linkedin',
};

const SOURCE_META = SOCIAL_SOURCES.map((source) => ({
  source,
  key: SOURCE_KEY[source],
}));

// Only these sources carry a real buying signal in their notes (Meta forms and
// WhatsApp button replies). Scoring an email/LinkedIn row with no answers would
// mark it "low" and drown the real quality mix, so those count as unscored.
const SCORED_SOURCES = new Set(['Meta Lead Ad', 'WhatsApp Bulk Reply']);

const clampDays = (value) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(n, 1), 365);
};

// Date-only arithmetic on a YYYY-MM-DD key. Using UTC here is safe because we
// only ever add whole days to a calendar key, never touch a wall-clock instant.
const addDays = (ymd, n) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const diffDays = (fromYmd, toYmd) =>
  Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400000);

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const notesCampaign = (notes) => {
  const text = String(notes || '');
  const tagged = text.match(/\[Campaign:\s*([^\]]+)\]/i);
  if (tagged) return tagged[1].trim();
  // Bulk-email leads carry their campaign as "Bulk email campaign #12: Subject".
  const bulk = text.match(/Bulk email campaign #\d+:\s*([^\n]+)/i);
  return bulk ? bulk[1].trim() : '';
};

// A row is written for EVERY bulk-email recipient when the campaign is sent, so
// the "Bulk Email" source in `leads` is mostly the outbound "sent" list. The
// Social leads report wants only people who actually replied, which the reply
// importer marks with status='replied' and a "--- Reply received …" note.
// Bounce/auto-responder mailboxes (mailer-daemon, postmaster, no-reply) are not
// a person replying, so they are left out too.
const EMAIL_REPLY_SQL = `(l.source <> 'Bulk Email' or (
  (l.status = 'replied' or l.notes like '%--- Reply received%')
  and lower(coalesce(l.email, '')) not like '%mailer-daemon%'
  and lower(coalesce(l.email, '')) not like '%mailerdaemon%'
  and lower(coalesce(l.email, '')) not like '%postmaster%'
  and lower(coalesce(l.email, '')) not like '%no-reply%'
  and lower(coalesce(l.email, '')) not like '%noreply%'
))`;
// For a replied bulk email the meaningful date is when the reply arrived, not
// when the original campaign went out; `updated_at` moves when the reply lands.
const EFFECTIVE_AT_SQL = `coalesce(case when l.source = 'Bulk Email' and (l.status = 'replied' or l.notes like '%--- Reply received%') then l.updated_at end, l.created_at)`;

// The NGO a lead belongs to, derived from what each source actually carries:
//   - Meta: meta_lead_forms.ngo (the form is mapped to an NGO on import)
//   - WhatsApp: the "[Account: mann 2]" tag on the reply
//   - Bulk email: the subject/base text names the NGO (e.g. "Being Sevak")
//   - Google Ads: all Google lead-form campaigns run under BSCT
//   - LinkedIn: no NGO signal → Unmapped
// Returns an upper-cased code, or '' for Unmapped.
const NGO_CODES = { bsct: 'BSCT', aflf: 'AFLF', mann: 'MANN' };
const ngoCodeFromTag = (tag) => {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return '';
  const key = Object.keys(NGO_CODES).find((code) => t.startsWith(code) || t.includes(code));
  return key ? NGO_CODES[key] : '';
};
const deriveNgo = (row) => {
  const fromForm = String(row?.ngo || '').trim().toUpperCase();
  if (fromForm) return fromForm;
  // Google lead-form campaigns are all run for BSCT.
  if (row?.source === 'Google Ads Lead Form') return 'BSCT';
  const notes = String(row?.notes || '');
  const account = (notes.match(/\[Account:\s*([^\]]+)\]/i) || [])[1];
  const fromAccount = ngoCodeFromTag(account);
  if (fromAccount) return fromAccount;
  if (/being\s*sevak/i.test(notes)) return 'BSCT';
  return '';
};

const NGO_ORDER = ['BSCT', 'AFLF', 'MANN'];

export const getSocialLeadsOverview = async (req, res) => {
  try {
    const today = istDateString(new Date());
    // An explicit from/to range wins over the rolling `days` window. A
    // half-specified range falls back to the rolling window; an inverted one is
    // swapped so the report never queries an empty interval.
    let fromDate = isIsoDate(req.query.from) ? String(req.query.from) : '';
    let toDate = isIsoDate(req.query.to) ? String(req.query.to) : '';
    if (fromDate && toDate && fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
    const custom = Boolean(fromDate && toDate);
    const days = clampDays(req.query.days);
    let start = custom ? fromDate : addDays(today, -(days - 1));
    const toDay = custom ? toDate : today;
    // Bound a custom range so an accidental multi-year pick cannot blow up the
    // daily series or scan the whole table; keep the most recent 366 days.
    const MAX_SPAN = 366;
    if (diffDays(start, toDay) + 1 > MAX_SPAN) start = addDays(toDay, -(MAX_SPAN - 1));
    const endExclusive = addDays(toDay, 1);
    const spanDays = diffDays(start, toDay) + 1;
    const prevStart = addDays(start, -spanDays);

    const sourceFilter = String(req.query.source || '').trim();
    const platformFilter = String(req.query.platform || '').trim().toLowerCase();
    const ngoRaw = String(req.query.ngo || '').trim();
    const ngoFilter = ngoRaw
      ? (ngoRaw.toLowerCase() === 'unmapped' ? 'Unmapped' : ngoRaw.toUpperCase())
      : '';
    const search = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

    const sources = SOCIAL_SOURCES.includes(sourceFilter) ? [sourceFilter] : SOCIAL_SOURCES;

    const params = [sources, prevStart, endExclusive];
    let where = `l.source = ANY($1) and ${EFFECTIVE_AT_SQL} >= $2::date and ${EFFECTIVE_AT_SQL} < $3::date and ${EMAIL_REPLY_SQL}`;
    if (platformFilter) {
      params.push(platformFilter);
      where += ` and lower(coalesce(l.meta_platform, '')) = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      where += ` and (l.name ilike $${p} or l.email ilike $${p} or l.phone like $${p}`
        + ` or l.meta_campaign_name ilike $${p} or l.google_campaign_name ilike $${p})`;
    }

    const { rows } = await db._pool.query(
      `select l.id, ${EFFECTIVE_AT_SQL} as effective_at, l.name, l.phone, l.email, l.status, l.source, l.notes,
              lower(coalesce(l.meta_platform, '')) as platform,
              l.meta_campaign_id, l.meta_campaign_name, l.meta_form_id,
              l.google_campaign_id, l.google_campaign_name,
              f.form_name, f.ngo
         from leads l
         left join meta_lead_forms f on f.form_id = l.meta_form_id
        where ${where}
        order by effective_at desc`,
      params,
    );

    // "Placed in SS station" is an assignment whose notes carry "[Lead:<id>]".
    // Resolving that per lead with a correlated EXISTS scans the 300k-row
    // fro_assignments table once per lead (~70s); one set-based pass is ~80ms.
    const placedIds = new Set();
    try {
      const placedRes = await db._pool.query(
        `select distinct substring(notes from '\\[Lead:([0-9a-fA-F-]{36})\\]') as lead_id
           from fro_assignments
          where notes like '%[Lead:%'
            and (status is null or status <> 'reassigned')`,
      );
      for (const r of placedRes.rows) if (r.lead_id) placedIds.add(String(r.lead_id));
    } catch {
      /* placement tracking is optional — the lead counts still work */
    }

    const totals = {
      leads: 0, today: 0, range_end: 0, previous: 0, change_pct: 0,
      hot: 0, review: 0, low: 0, unscored: 0, scored: 0, avg_score: 0,
      placed: 0, placed_rate: 0, mapped: 0,
      facebook: 0, instagram: 0, google: 0,
    };
    const bySource = new Map(SOCIAL_SOURCES.map((s) => [s, { source: s, key: SOURCE_KEY[s], leads: 0, hot: 0, placed: 0 }]));
    const byStatus = new Map();
    const byCampaign = new Map();
    const byForm = new Map();
    const byNgo = new Map();
    const byDate = new Map();
    const allNgoCounts = new Map();
    const recent = [];
    let scoreSum = 0;

    const bump = (map, key, init) => {
      let cur = map.get(key);
      if (!cur) { cur = init(); map.set(key, cur); }
      return cur;
    };

    for (const row of rows) {
      const created = row.effective_at ? new Date(row.effective_at) : null;
      const day = created && !Number.isNaN(created.getTime()) ? istDateString(created) : '';
      const effNgo = deriveNgo(row);
      const ngoCode = effNgo || 'Unmapped';
      // Previous window: keep it only for the period-over-period KPI, and only
      // when it is the same NGO the report is filtered to.
      if (!day || day < start) {
        if (day && day >= prevStart && (!ngoFilter || ngoCode === ngoFilter)) totals.previous += 1;
        continue;
      }
      // Option counts cover the whole window regardless of the NGO filter, so
      // the dropdown does not lose its options as soon as one is picked.
      bump(allNgoCounts, ngoCode, () => ({ ngo: ngoCode, count: 0 })).count += 1;
      if (ngoFilter && ngoCode !== ngoFilter) continue;

      const notes = String(row.notes || '').trim();
      const isPlaced = placedIds.has(String(row.id));
      const scored = SCORED_SOURCES.has(row.source) && Boolean(notes);
      const score = scored ? scoreSsReply(notes) : null;
      const label = score && ['interested', 'review', 'low'].includes(score.label) ? score.label : null;

      totals.leads += 1;
      if (day === today) totals.today += 1;
      if (day === toDay) totals.range_end += 1;
      if (isPlaced) totals.placed += 1;
      if (effNgo) totals.mapped += 1;
      if (row.platform === 'fb') totals.facebook += 1;
      else if (row.platform === 'ig') totals.instagram += 1;
      if (row.source === 'Google Ads Lead Form') totals.google += 1;
      if (scored) {
        totals.scored += 1;
        scoreSum += Number(score.score) || 0;
      } else {
        totals.unscored += 1;
      }
      if (label === 'interested') totals.hot += 1;
      else if (label === 'review') totals.review += 1;
      else if (label === 'low') totals.low += 1;

      const src = bump(bySource, row.source, () => ({ source: row.source, key: SOURCE_KEY[row.source] || 'other', leads: 0, hot: 0, placed: 0 }));
      src.leads += 1;
      if (label === 'interested') src.hot += 1;
      if (isPlaced) src.placed += 1;

      const statusKey = String(row.status || '').trim() || 'unknown';
      bump(byStatus, statusKey, () => ({ status: statusKey, count: 0 })).count += 1;

      const campaignId = String(row.meta_campaign_id || row.google_campaign_id || '');
      const campaignName = String(row.meta_campaign_name || row.google_campaign_name || notesCampaign(notes) || '').trim();
      if (campaignId || campaignName) {
        const ckey = `${row.source}|${campaignId || campaignName}`;
        const cur = bump(byCampaign, ckey, () => ({
          source: row.source, campaign_id: campaignId, campaign_name: campaignName,
          leads: 0, hot: 0, placed: 0,
        }));
        if (campaignName) cur.campaign_name = campaignName;
        cur.leads += 1;
        if (label === 'interested') cur.hot += 1;
        if (isPlaced) cur.placed += 1;
      }

      if (row.meta_form_id || row.form_name) {
        const fkey = `${row.source}|${row.meta_form_id || row.form_name}`;
        const cur = bump(byForm, fkey, () => ({
          source: row.source, form_id: row.meta_form_id || '', form_name: row.form_name || '',
          ngo: effNgo || '', leads: 0, hot: 0, placed: 0,
        }));
        cur.leads += 1;
        if (label === 'interested') cur.hot += 1;
        if (isPlaced) cur.placed += 1;
      }

      const ngoKey = ngoCode;
      const ngoRow = bump(byNgo, ngoKey, () => ({ ngo: ngoKey, leads: 0, placed: 0 }));
      ngoRow.leads += 1;
      if (isPlaced) ngoRow.placed += 1;

      const dayRow = bump(byDate, day, () => ({
        date: day, leads: 0, hot: 0, placed: 0,
        meta: 0, google: 0, whatsapp: 0, email: 0, linkedin: 0,
      }));
      dayRow.leads += 1;
      if (label === 'interested') dayRow.hot += 1;
      if (isPlaced) dayRow.placed += 1;
      const skey = SOURCE_KEY[row.source];
      if (skey) dayRow[skey] += 1;

      if (recent.length < limit) {
        recent.push({
          id: row.id,
          name: row.name || '',
          phone: row.phone || '',
          email: row.email || '',
          source: row.source,
          platform: row.platform === 'fb' ? 'Facebook' : row.platform === 'ig' ? 'Instagram' : '',
          campaign_name: campaignName,
          form_name: row.form_name || '',
          ngo: effNgo || '',
          status: statusKey,
          label: label || '',
          placed: Boolean(isPlaced),
          created_at: row.effective_at,
        });
      }
    }

    totals.avg_score = totals.scored ? Math.round((scoreSum / totals.scored) * 10) / 10 : 0;
    totals.placed_rate = totals.leads ? totals.placed / totals.leads : 0;
    totals.change_pct = totals.previous ? Math.round(((totals.leads - totals.previous) / totals.previous) * 1000) / 10 : null;

    const series = [];
    for (let i = spanDays - 1; i >= 0; i -= 1) {
      const key = addDays(toDay, -i);
      series.push(byDate.get(key) || {
        date: key, leads: 0, hot: 0, placed: 0,
        meta: 0, google: 0, whatsapp: 0, email: 0, linkedin: 0,
      });
    }

    // Paid-media spend / CPL. Best-effort: a panel that has no Meta ad account
    // still needs the lead report, so a failure here must never fail the whole
    // request. Insights are fetched on a rolling window only, so a custom date
    // range shows lead numbers without a (misleading) spend figure.
    let ads = { meta: { configured: isMetaInsightsConfigured(), custom } };
    if (!custom && isMetaInsightsConfigured()) {
      try {
        const [summary, funnel] = await Promise.all([getInsightsSummary({ days }), getMetaFunnel({ days })]);
        ads = {
          meta: {
            configured: true,
            totals: summary?.totals || null,
            funnel: funnel || null,
          },
        };
      } catch {
        ads = { meta: { configured: false } };
      }
    }

    // Dropdown options for the NGO filter. Counts are over the current window
    // and ignore the selected NGO so the list stays stable while filtering.
    const ngoCountOf = (code) => allNgoCounts.get(code)?.count || 0;
    const extraNgos = [...allNgoCounts.keys()].filter((c) => !NGO_ORDER.includes(c) && c !== 'Unmapped');
    const ngoOptions = [...NGO_ORDER, ...extraNgos, 'Unmapped'].map((code) => ({ ngo: code, count: ngoCountOf(code) }));

    return res.json({
      days: spanDays,
      from: start,
      to: toDay,
      custom,
      sources: SOURCE_META,
      ngo_options: ngoOptions,
      filters: { source: sourceFilter || '', platform: platformFilter, ngo: ngoFilter, q: search },
      totals,
      series,
      by_source: [...bySource.values()].sort((a, b) => b.leads - a.leads),
      by_status: [...byStatus.values()].sort((a, b) => b.count - a.count),
      by_campaign: [...byCampaign.values()].sort((a, b) => b.leads - a.leads).slice(0, 30),
      by_form: [...byForm.values()].sort((a, b) => b.leads - a.leads).slice(0, 30),
      by_ngo: [...byNgo.values()].sort((a, b) => b.leads - a.leads),
      quality: { interested: totals.hot, review: totals.review, low: totals.low, unscored: totals.unscored },
      ads,
      recent,
    });
  } catch (error) {
    console.error('getSocialLeadsOverview error:', error.message || error);
    return res.status(500).json({ message: error.message || 'Could not load the leads overview.' });
  }
};
