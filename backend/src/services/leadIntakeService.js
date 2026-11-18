import db from '../config/db.js';
import { materializeReplyLead, scoreSsReply } from './ssLeadService.js';
import { createLeadAlert } from './leadAlertService.js';
import { ngoToAccount } from './metaAdsService.js';
import { isValidIndianMobile } from '../utils/phone.js';

// ---------------------------------------------------------------------------
// One intake decision for every channel: where does this lead go, and who
// should be told?
//
// Meta leads are placed regardless of intent — every valid Indian mobile goes
// to the station of its mapped form (or the default NGO when the form is not
// mapped). Other channels keep the score gate so junk replies stay in the
// admin inbox. A model call is never made here: this runs inside webhooks that
// Meta expects to answer fast.
// ---------------------------------------------------------------------------

export function autoPlaceEnabled() {
  return String(process.env.LEAD_AUTO_PLACE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function autoPlaceMinScore() {
  const raw = Number.parseInt(process.env.LEAD_AUTO_PLACE_MIN_SCORE ?? '', 10);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 100) : 70;
}

const META_SOURCE = 'Meta Lead Ad';

const isMetaLead = (lead) => String(lead?.source || '') === META_SOURCE;

// Kept as a re-export so the intake tests and any older caller keep one import.
export { isValidIndianMobile };

export function metaAutoPlaceAll() {
  return String(process.env.META_AUTO_PLACE_ALL ?? 'true').toLowerCase() !== 'false';
}

export function metaDefaultNgo() {
  return String(process.env.META_DEFAULT_NGO || 'BSCT').trim().toUpperCase();
}

const labelOf = (score) => (score >= 70 ? 'interested' : score >= 40 ? 'review' : 'low');

// A Meta lead ingested before its form was mapped has no [Account:] tag, and
// materializeReplyLead keys the NGO off that tag. A mapped form wins; an
// unmapped Meta form falls back to the default NGO so the lead still reaches a
// station instead of waiting for an admin.
async function resolveAccountTag(lead) {
  if (/\[Account:/i.test(String(lead?.notes || ''))) return { lead };
  const formId = lead?.meta_form_id;
  if (formId) {
    try {
      const { data } = await db
        .from('meta_lead_forms')
        .select('ngo, account, active')
        .eq('form_id', String(formId))
        .maybeSingle();
      if (data) {
        // A paused form is an explicit "stop routing this" from the admin.
        if (data.active === false) return { blocked: true, reason: 'form paused' };
        const account = data.account || ngoToAccount(data.ngo);
        if (account) return { lead: { ...lead, notes: `${lead.notes || ''}\n[Account: ${account}]` } };
      }
    } catch {
      // fall through to the default below
    }
  }
  if (isMetaLead(lead)) {
    return { lead: { ...lead, notes: `${lead.notes || ''}\n[Account: ${metaDefaultNgo().toLowerCase()}]` } };
  }
  return { lead };
}

/**
 * Place a lead on its NGO's station.
 *
 * Meta leads ignore the score gate (every valid-phone lead goes to a station);
 * other channels keep the score threshold. `silent` suppresses the FRO bell for
 * backfills of old leads.
 *
 * Returns { placed, reason?, merged?, station?, assignmentId?, froWorkerId? }.
 * Never throws for a normal unplaceable lead — callers run inside webhooks.
 */
export async function placeLeadIfValuable(lead, { score = null, ignoreScore = false, silent = false } = {}) {
  if (!lead?.id) return { placed: false, reason: 'lead has no id' };
  if (!autoPlaceEnabled()) return { placed: false, reason: 'auto-place disabled' };

  const rule = score == null
    ? scoreSsReply(lead.notes)
    : { score: Number(score), label: labelOf(Number(score)) };
  const numericScore = Number.isFinite(Number(rule.score)) ? Math.round(Number(rule.score)) : 0;

  const meta = isMetaLead(lead);
  const skipScore = ignoreScore || (meta && metaAutoPlaceAll());

  if (!isValidIndianMobile(lead.phone)) {
    return { placed: false, reason: 'invalid phone', score: numericScore, label: rule.label };
  }

  if (!skipScore) {
    const min = autoPlaceMinScore();
    if (numericScore < min) {
      return { placed: false, reason: `score ${numericScore} below ${min}`, score: numericScore, label: rule.label };
    }
  }

  const resolved = await resolveAccountTag(lead);
  if (resolved.blocked) {
    return { placed: false, reason: resolved.reason, score: numericScore, label: rule.label };
  }

  const placed = await materializeReplyLead(resolved.lead, {});
  if (!placed.ok) {
    return { placed: false, reason: placed.reason, score: numericScore, label: rule.label };
  }

  // A merged reply means the donor already had a live assignment; that is not
  // a new lead, so it must not ring the bell again.
  if (!silent && !placed.merged && placed.froWorkerId) {
    try {
      await createLeadAlert({
        workerId: placed.froWorkerId,
        assignmentId: placed.assignmentId,
        leadId: lead.id,
        ngoId: placed.ngoId,
        station: placed.station,
        source: lead.source,
        score: numericScore,
        label: rule.label,
        name: lead.name,
        phone: lead.phone,
      });
    } catch (e) {
      console.warn('lead alert skipped:', e?.message || e);
    }
  }

  return {
    placed: true,
    ...placed,
    score: numericScore,
    label: rule.label,
    alerted: Boolean(!silent && !placed.merged && placed.froWorkerId),
  };
}

/**
 * Place Meta leads that are still unplaced. Used after a form is mapped (so the
 * existing leads follow the new route) and by the manual backfill action.
 * Silent by default: these are old leads and must not ring every FRO's bell.
 */
export async function placeUnplacedMetaLeads({ formId = null, days = 90, limit = 500, silent = true } = {}) {
  const span = Math.min(Math.max(Number(days) || 90, 1), 365);
  const size = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  const sqlParams = [META_SOURCE, span];
  let sqlWhere = `l.source = $1
      and l.created_at >= now() - ($2::int || ' days')::interval
      and not exists (
        select 1 from fro_assignments a
         where a.notes like '%[Lead:' || l.id::text || ']%'
           and (a.status is null or a.status <> 'reassigned')
      )
      and not exists (
        select 1 from meta_lead_forms f
         where f.form_id = l.meta_form_id and f.active = false
      )`;
  if (formId) {
    sqlParams.push(String(formId));
    sqlWhere += ` and l.meta_form_id = $${sqlParams.length}`;
  }
  sqlParams.push(size);
  const limitParam = sqlParams.length;

  const { rows } = await db._pool.query(
    `select l.* from leads l
      where ${sqlWhere}
      order by l.created_at desc
      limit $${limitParam}`,
    sqlParams,
  );

  let placed = 0;
  let skipped = 0;
  const reasons = {};
  for (const row of rows) {
    const result = await placeLeadIfValuable(row, { ignoreScore: true, silent });
    if (result.placed) {
      placed += 1;
    } else {
      skipped += 1;
      const key = String(result.reason || 'unknown').slice(0, 80);
      reasons[key] = (reasons[key] || 0) + 1;
    }
  }

  return { scanned: rows.length, placed, skipped, reasons };
}
