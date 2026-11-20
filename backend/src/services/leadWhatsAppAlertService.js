import cron from 'node-cron';
import db from '../config/db.js';
import { leadAnswers } from './metaAdsService.js';
import { resolveAccount, sendTextMessage } from './whatsappService.js';

// ---------------------------------------------------------------------------
// New-lead WhatsApp alert.
//
// One hook for every lead source: the Meta webhook/poller and the Google Ads
// poller/CSV import all call notifyNewLead(). Delivery is per number and logged,
// so a webhook retry, the poller picking the same lead up again, or a CSV
// re-import can never message the operator twice.
//
// Text-only mode: WhatsApp Cloud API allows free-form text only inside the
// 24-hour customer-service window. Outside it Meta answers 131047, which this
// records as `window_closed` and retries for a day — the moment that number
// messages the business, the next retry lands. A template can be plugged in
// later without touching any caller.
// ---------------------------------------------------------------------------

const SETTINGS = {
  enabled: 'lead_alert_enabled',
  phones: 'lead_alert_phones',
  project: 'lead_alert_project',
  mode: 'lead_alert_mode',
};

const DEFAULT_PROJECT = 'bsct2';
const CONFIG_TTL_MS = 60 * 1000;

let configCache = null;
let configAt = 0;

export function normalizePhoneNumber(raw) {
  let digits = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  // Reject fragments like "+91 98123..." split into "91": a real number with
  // country code is 10–15 digits.
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

export function normalizePhones(input) {
  // Only real separators: a space inside "+91 98123 45678" belongs to the
  // number, not to the list.
  const list = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[,;\n\r]+/);
  return [...new Set(list.map(normalizePhoneNumber).filter(Boolean))];
}

export async function getLeadAlertConfig({ fresh = false } = {}) {
  if (!fresh && configCache && Date.now() - configAt < CONFIG_TTL_MS) return configCache;

  const keys = Object.values(SETTINGS);
  let stored = new Map();
  try {
    const { rows } = await db._pool.query(
      `select key, value from settings where key = any($1::text[])`,
      [keys],
    );
    stored = new Map(rows.map((r) => [r.key, r.value == null ? '' : String(r.value)]));
  } catch {
    // Settings table missing (fresh DB): behave like an unconfigured feature.
  }

  const phones = normalizePhones(stored.get(SETTINGS.phones) || '');
  const config = {
    enabled: /^(1|true|yes|on)$/i.test(stored.get(SETTINGS.enabled) || ''),
    phones,
    phones_text: phones.join(','),
    project: stored.get(SETTINGS.project) || DEFAULT_PROJECT,
    mode: (stored.get(SETTINGS.mode) || 'text').toLowerCase(),
  };
  configCache = config;
  configAt = Date.now();
  return config;
}

export async function saveLeadAlertConfig(patch = {}) {
  const entries = [];
  if (patch.enabled !== undefined) entries.push([SETTINGS.enabled, patch.enabled ? '1' : '0']);
  if (patch.phones !== undefined) entries.push([SETTINGS.phones, normalizePhones(patch.phones).join(',')]);
  if (patch.project !== undefined) {
    const project = String(patch.project || '').trim() || DEFAULT_PROJECT;
    entries.push([SETTINGS.project, project]);
  }
  if (patch.mode !== undefined) {
    entries.push([SETTINGS.mode, String(patch.mode || 'text').trim().toLowerCase() || 'text']);
  }

  for (const [key, value] of entries) {
    if (!value) await db.from('settings').delete().eq('key', key);
    else {
      const { error } = await db.from('settings').upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    }
  }

  configCache = null;
  configAt = 0;
  return getLeadAlertConfig({ fresh: true });
}

const istTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function notesTag(notes, tag) {
  const match = new RegExp(`\\[${tag}:\\s*([^\\]]+)\\]`, 'i').exec(String(notes || ''));
  return match ? match[1].trim() : '';
}

function sourceLabel(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('google')) return 'Google';
  if (value.includes('meta')) return 'Meta';
  return 'New';
}

export function buildLeadAlertMessage(lead = {}) {
  const answers = leadAnswers(lead.payload, lead.notes);
  const campaign = lead.meta_campaign_name
    || lead.event_campaign_name
    || lead.google_campaign_name
    || notesTag(lead.notes, 'Campaign');
  const form = lead.form_name || lead.meta_form_id || '';
  const state = answers.state || notesTag(lead.notes, 'State') || '';
  const city = answers.city || notesTag(lead.notes, 'City') || '';

  const lines = [`🚨 New ${sourceLabel(lead.source)} lead`];
  if (lead.name) lines.push(`Name: ${lead.name}`);
  if (lead.phone) lines.push(`Phone: +${String(lead.phone).replace(/[^0-9]/g, '')}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (campaign) lines.push(`Campaign: ${campaign}`);
  if (form) lines.push(`Form: ${form}`);
  if (city && city !== state) lines.push(`City: ${city}`);
  if (state) lines.push(`State: ${state}`);
  lines.push(`Time: ${istTime(lead.created_at)}`);

  return lines.join('\n');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadLead(leadId) {
  if (!UUID_RE.test(String(leadId || ''))) return null;
  const { rows } = await db._pool.query(
    `select l.id, l.name, l.phone, l.email, l.source, l.notes, l.created_at,
            l.meta_form_id, l.meta_campaign_name,
            l.google_campaign_id, l.google_campaign_name,
            f.form_name,
            e.campaign_name as event_campaign_name, e.payload
       from leads l
       left join meta_lead_forms f on f.form_id = l.meta_form_id
       left join meta_lead_events e on e.meta_lead_id = l.meta_lead_id
      where l.id = $1
      limit 1`,
    [leadId],
  );
  return rows[0] || null;
}

function classifyError(error) {
  const code = error?.metaCode || (/(\d{5,6})/.exec(String(error?.message || '')) || [])[1] || '';
  const message = error?.message || String(error || 'send failed');
  const windowClosed = String(code) === '131047'
    || /re-engagement|24-hour|24 hour/i.test(message);
  return { windowClosed, message: code && !message.includes(String(code)) ? `(${code}) ${message}` : message };
}

async function sendToPhone(phone, text, account) {
  try {
    await sendTextMessage(phone, text, account);
    return { ok: true };
  } catch (error) {
    const { windowClosed, message } = classifyError(error);
    return { ok: false, windowClosed, error: message };
  }
}

async function claimDelivery({ leadId, source, dedupeKey, phone }) {
  const { rows } = await db._pool.query(
    `insert into lead_alert_deliveries (lead_id, source, dedupe_key, phone, status)
     values ($1, $2, $3, $4, 'pending')
     on conflict (dedupe_key, phone) do nothing
     returning id`,
    [String(leadId || ''), String(source || ''), String(dedupeKey), String(phone)],
  );
  return rows[0]?.id || null;
}

async function recordDelivery(id, outcome) {
  const status = outcome.ok ? 'sent' : outcome.windowClosed ? 'window_closed' : 'failed';
  await db._pool.query(
    `update lead_alert_deliveries
        set status = $2,
            error = $3,
            attempts = attempts + 1,
            last_attempt_at = now(),
            sent_at = case when $2 = 'sent' then now() else sent_at end
      where id = $1`,
    [id, status, outcome.ok ? null : String(outcome.error || '')],
  );
}

// Fire-and-forget hook used by every ingest path. Never throws: a WhatsApp
// outage must not fail a lead insert.
export async function notifyNewLead({ leadId, source = '', dedupeKey } = {}) {
  try {
    const config = await getLeadAlertConfig();
    if (!config.enabled || !config.phones.length || !leadId) {
      return { ok: true, skipped: true, reason: 'alerts disabled or no numbers' };
    }

    const lead = await loadLead(leadId);
    if (!lead) return { ok: true, skipped: true, reason: 'lead not found' };

    const text = buildLeadAlertMessage(lead);
    const key = String(dedupeKey || `lead:${leadId}`);

    let account = null;
    let accountError = '';
    try {
      account = await resolveAccount(config.project);
    } catch (error) {
      accountError = error?.message || String(error);
    }

    const results = [];
    for (const phone of config.phones) {
      const deliveryId = await claimDelivery({ leadId, source, dedupeKey: key, phone }).catch(() => null);
      if (!deliveryId) {
        results.push({ phone, skipped: 'already alerted' });
        continue;
      }
      if (accountError) {
        await recordDelivery(deliveryId, { ok: false, error: accountError }).catch(() => {});
        results.push({ phone, ok: false, error: accountError });
        continue;
      }
      const outcome = await sendToPhone(phone, text, account);
      await recordDelivery(deliveryId, outcome).catch(() => {});
      results.push({ phone, ...outcome });
    }

    return { ok: true, sent: results.filter((r) => r.ok).length, results };
  } catch (error) {
    console.error('lead alert failed:', error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function sendTestAlert({ phones, text } = {}) {
  const config = await getLeadAlertConfig({ fresh: true });
  const targets = normalizePhones(phones || config.phones);
  if (!targets.length) throw new Error('Add at least one WhatsApp number first.');

  let account;
  try {
    account = await resolveAccount(config.project || DEFAULT_PROJECT);
  } catch (error) {
    throw new Error(error?.message || 'WhatsApp account is not configured');
  }

  const body = text || [
    '✅ Lead alert test',
    'CRM se ye test message hai.',
    `Time: ${istTime()}`,
    'Meta aur Google leads par automatic alert isi number par aayega.',
  ].join('\n');

  const results = [];
  for (const phone of targets) {
    results.push({ phone, ...(await sendToPhone(phone, body, account)) });
  }
  return { ok: results.every((r) => r.ok), results };
}

// Retry sweep. A transient API error is retried quickly (3 attempts); a closed
// 24-hour window is retried every 30 minutes for a day, because the delivery
// will start working the moment that operator replies to the business number.
export async function sweepLeadAlerts({ limit = 50 } = {}) {
  try {
    const config = await getLeadAlertConfig({ fresh: true });
    if (!config.enabled || !config.phones.length) return { ok: true, skipped: true };

    const { rows } = await db._pool.query(
      `select id, lead_id, phone, status, attempts
         from lead_alert_deliveries
        where sent_at is null
          and created_at > now() - interval '24 hours'
          and (
            (status in ('pending', 'failed') and attempts < 3
              and (last_attempt_at is null or last_attempt_at < now() - interval '2 minutes'))
            or (status = 'window_closed' and attempts < 48
              and (last_attempt_at is null or last_attempt_at < now() - interval '30 minutes'))
          )
        order by created_at
        limit $1`,
      [Math.min(Math.max(Number(limit) || 50, 1), 200)],
    );
    if (!rows.length) return { ok: true, retried: 0 };

    let account = null;
    let accountError = '';
    try {
      account = await resolveAccount(config.project);
    } catch (error) {
      accountError = error?.message || String(error);
    }

    const texts = new Map();
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      if (!texts.has(row.lead_id)) {
        const lead = await loadLead(row.lead_id).catch(() => null);
        texts.set(row.lead_id, lead ? buildLeadAlertMessage(lead) : '');
      }
      const text = texts.get(row.lead_id);
      if (!text) {
        await recordDelivery(row.id, { ok: false, error: 'lead row missing' }).catch(() => {});
        failed += 1;
        continue;
      }
      const outcome = accountError
        ? { ok: false, error: accountError }
        : await sendToPhone(row.phone, text, account);
      await recordDelivery(row.id, outcome).catch(() => {});
      if (outcome.ok) sent += 1;
      else failed += 1;
    }
    return { ok: true, retried: rows.length, sent, failed };
  } catch (error) {
    console.error('lead alert sweep failed:', error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function listLeadAlertDeliveries({ limit = 25 } = {}) {
  const size = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const { rows } = await db._pool.query(
    `select d.id, d.lead_id, d.source, d.phone, d.status, d.error, d.attempts,
            d.sent_at, d.created_at, l.name as lead_name, l.phone as lead_phone
       from lead_alert_deliveries d
       left join leads l on l.id::text = d.lead_id
      order by d.created_at desc
      limit $1`,
    [size],
  );
  const { rows: counts } = await db._pool.query(
    `select
        count(*) filter (where sent_at is null)::int as pending,
        count(*) filter (where status = 'window_closed' and sent_at is null)::int as window_closed,
        count(*) filter (where sent_at is not null)::int as sent_24h,
        count(*)::int as total_24h
       from lead_alert_deliveries
      where created_at > now() - interval '24 hours'`,
  );
  return {
    rows,
    pending: counts[0]?.pending || 0,
    window_closed: counts[0]?.window_closed || 0,
    sent_24h: counts[0]?.sent_24h || 0,
    total_24h: counts[0]?.total_24h || 0,
  };
}

let sweeperStarted = false;

export function startLeadAlertSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  cron.schedule('*/5 * * * *', () => {
    sweepLeadAlerts().catch(() => {});
  });
  const kickoff = setTimeout(() => {
    sweepLeadAlerts().catch(() => {});
  }, 45000);
  if (typeof kickoff.unref === 'function') kickoff.unref();
}
