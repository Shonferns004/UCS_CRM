import db from '../config/db.js';
import { materializeReplyLead, scoreSsReply } from './ssLeadService.js';
import { createLeadAlert } from './leadAlertService.js';
import { ngoToAccount } from './metaAdsService.js';

// ---------------------------------------------------------------------------
// One intake decision for every channel: is this lead valuable enough to put
// on a station without a human, and if so, who should be told?
//
// The rules engine is the gate (deterministic, free). AI scores are cached on
// the lead row and are not consulted here: a model call inside a webhook would
// add latency to a response Meta expects fast. Ambiguous leads stay in the
// admin inbox, exactly as before.
// ---------------------------------------------------------------------------

export function autoPlaceEnabled() {
  return String(process.env.LEAD_AUTO_PLACE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function autoPlaceMinScore() {
  const raw = Number.parseInt(process.env.LEAD_AUTO_PLACE_MIN_SCORE ?? '', 10);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 100) : 70;
}

const labelOf = (score) => (score >= 70 ? 'interested' : score >= 40 ? 'review' : 'low');

// A Meta lead ingested before its form was mapped has no [Account:] tag, and
// materializeReplyLead keys the NGO off that tag. Resolve the live form mapping
// so a mapped lead can still auto-place without re-ingesting it.
async function withAccountFallback(lead) {
  if (/\[Account:/i.test(String(lead?.notes || ''))) return lead;
  const formId = lead?.meta_form_id;
  if (!formId) return lead;
  try {
    const { data } = await db
      .from('meta_lead_forms')
      .select('ngo, account, active')
      .eq('form_id', String(formId))
      .maybeSingle();
    if (!data || data.active === false) return lead;
    const account = data.account || ngoToAccount(data.ngo);
    if (!account) return lead;
    return { ...lead, notes: `${lead.notes || ''}\n[Account: ${account}]` };
  } catch {
    return lead;
  }
}

/**
 * Place a lead on its NGO's station when it clears the score gate.
 *
 * Returns { placed, reason?, merged?, station?, assignmentId?, froWorkerId? }.
 * Never throws for a normal "not valuable" lead — callers run inside webhooks
 * and must not fail because a lead stayed in the inbox.
 */
export async function placeLeadIfValuable(lead, { score = null } = {}) {
  if (!lead?.id) return { placed: false, reason: 'lead has no id' };
  if (!autoPlaceEnabled()) return { placed: false, reason: 'auto-place disabled' };

  const rule = score == null
    ? scoreSsReply(lead.notes)
    : { score: Number(score), label: labelOf(Number(score)) };
  const min = autoPlaceMinScore();
  const numericScore = Number.isFinite(Number(rule.score)) ? Math.round(Number(rule.score)) : 0;
  if (numericScore < min) {
    return { placed: false, reason: `score ${numericScore} below ${min}`, score: numericScore, label: rule.label };
  }

  const placed = await materializeReplyLead(await withAccountFallback(lead), {});
  if (!placed.ok) {
    return { placed: false, reason: placed.reason, score: numericScore, label: rule.label };
  }

  // A merged reply means the donor already had a live assignment; that is not
  // a new lead, so it must not ring the bell again.
  if (!placed.merged && placed.froWorkerId) {
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
    alerted: Boolean(!placed.merged && placed.froWorkerId),
  };
}
