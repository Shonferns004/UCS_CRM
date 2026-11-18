// ---------------------------------------------------------------------------
// Admin "SS Leads" inbox — the reply triage screen.
//
// The FRO dropdown is gone. Every reply already carries the NGO in its
// [Account:] tag, so the only decision is "put it in the station" or "delete".
// Adding is idempotent: once a reply is on a station we report it as
// already-placed instead of creating a second lead.
// ---------------------------------------------------------------------------
import db from '../config/db.js';
import { getLeadById } from '../models/leadModel.js';
import { materializeReplyLead, scoreSsReply, stationFor, SS_STATIONS, ALL_LEAD_STATIONS, sourceKeyOf } from '../services/ssLeadService.js';
import { aiScoreSsReply, SS_AI_VERSION } from '../services/ssLeadAiService.js';
import { createLeadAlert } from '../services/leadAlertService.js';
import { META_LEAD_SOURCE, ngoToAccount } from '../services/metaAdsService.js';

// Both inbox sources share the same triage screen: a WhatsApp template reply
// and a Meta Lead Ad lead both carry a mobile + [Account:] tag and both are
// placed with materializeReplyLead().
const SS_INBOX_SOURCES = ['WhatsApp Bulk Reply', META_LEAD_SOURCE, 'Email Lead'];

const parseReply = (notes) => {
  const text = String(notes || '');
  const button = (text.match(/\[(?:Button|Reply):\s*([^\]]+)\]/i) || [])[1] || '';
  const template = (text.match(/\[Template:\s*([^\]]+)\]/i) || [])[1] || '';
  const message = text
    .split('\n')
    .filter((l) => !/^\[(Template|Account|Button|Reply|Lead|Meta Lead|Platform|Campaign|Form):/i.test(l.trim()))
    .join('\n')
    .trim();
  return { button, template, message };
};

const normalizeNgo = (value) => {
  const acct = String(value || '').toLowerCase().trim();
  if (acct.startsWith('bsct')) return 'BSCT';
  if (acct.startsWith('aflf')) return 'AFLF';
  if (acct.startsWith('mann')) return 'MANN';
  return null;
};

const ngoOf = (notes) => normalizeNgo((notes || '').match(/\[Account:\s*([^\]]+)\]/)?.[1]);

const metaAccountForForm = async (formId) => {
  if (!formId) return '';
  const { data } = await db
    .from('meta_lead_forms')
    .select('ngo, account, active')
    .eq('form_id', String(formId))
    .maybeSingle();
  if (!data || data.active === false) return '';
  return data.account || ngoToAccount(data.ngo);
};

export const listSsReplyLeads = async (req, res) => {
  try {
    const { data: leads, error } = await db
      .from('leads')
      .select('*')
      .in('source', SS_INBOX_SOURCES)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Where each reply ended up: the [Lead:<id>] marker is written onto the
    // assignment when it is placed, and survives even if it was later removed.
    const { rows: marked } = await db._pool.query(
      `select a.id, a.station, a.status, a.fro_worker_id, a.notes,
              w.name as fro_name, n.name as ngo_name
         from fro_assignments a
         left join workers w on w.id = a.fro_worker_id
         left join ngos n on n.id = a.ngo_id
        where a.notes like '%[Lead:%'`,
    );
    const placedBy = new Map();
    for (const row of marked) {
      const matches = String(row.notes || '').matchAll(/\[Lead:([^\]]+)\]/g);
      for (const m of matches) {
        const cur = placedBy.get(m[1]);
        // Prefer a live row over a removed one.
        if (!cur || (cur.status === 'reassigned' && row.status !== 'reassigned')) {
          placedBy.set(m[1], row);
        }
      }
    }

    // SS station owners, so the admin sees who will work the lead.
    const { rows: owners } = await db._pool.query(
      `select sa.station, sa.ngo_id, sa.fro_worker_id, w.name as fro_name, n.name as ngo_name
         from fro_station_assignments sa
         left join workers w on w.id = sa.fro_worker_id
         left join ngos n on n.id = sa.ngo_id
        where sa.station = any($1::text[])`,
      [ALL_LEAD_STATIONS],
    );
    const ownerBy = new Map(owners.map((o) => [`${o.ngo_name}|${o.station}`, o]));

    // A form is often mapped after its first leads have already arrived, so the
    // station suggestion also consults the live form mapping instead of only
    // the [Account:] tag baked into the notes at ingest time.
    const formIds = [...new Set((leads || []).map((l) => l.meta_form_id).filter(Boolean))];
    const formAccountBy = new Map();
    if (formIds.length) {
      const { data: forms } = await db
        .from('meta_lead_forms')
        .select('form_id, ngo, account, active')
        .in('form_id', formIds);
      for (const f of forms || []) {
        if (f.active === false) continue;
        formAccountBy.set(f.form_id, f.account || ngoToAccount(f.ngo));
      }
    }

    const sourceFilter = String(req.query.source || '').trim().toLowerCase();
    const ngoFilter = normalizeNgo(req.query.ngo);

    const result = (leads || []).map((l) => {
      const ngo = ngoOf(l.notes) || normalizeNgo(formAccountBy.get(l.meta_form_id));
      // Source decides the station: WhatsApp replies, Meta lead ads and email
      // leads each have their own queue per NGO.
      const suggestedStation = ngo ? (stationFor(ngo, l.source) || SS_STATIONS[ngo]) : null;
      const placed = placedBy.get(l.id) || null;
      const owner = suggestedStation ? ownerBy.get(`${ngo}|${suggestedStation}`) : null;
      const rule = scoreSsReply(l.notes);
      const suggestion = (l.ai_label && l.ai_at)
        ? {
          label: l.ai_label,
          score: Number.isFinite(l.ai_score) ? l.ai_score : rule.score,
          reasons: [l.ai_reason || 'AI suggestion'],
          source: 'ai',
          model: l.ai_model || null,
          at: l.ai_at,
        }
        : { ...rule, source: 'rules', at: null };
      return {
        ...l,
        account_ngo: ngo,
        source_key: sourceKeyOf(l.source),
        suggested_station: suggestedStation,
        station_owner_missing: Boolean(suggestedStation && !owner?.fro_worker_id),
        suggestion,
        in_station: !!placed && placed.status !== 'reassigned',
        placed_station: placed?.station || null,
        placed_status: placed?.status || null,
        placed_fro_name: placed?.fro_name || null,
        station_owner_name: owner?.fro_name || null,
      };
    });

    const filtered = result.filter((lead) => {
      if (sourceFilter && lead.source_key !== sourceFilter) return false;
      if (ngoFilter && lead.account_ngo !== ngoFilter) return false;
      return true;
    });

    return res.json(filtered);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

export const addSsReplyLeadToStation = async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!SS_INBOX_SOURCES.includes(lead.source)) {
      return res.status(400).json({ message: 'Only inbox reply leads can be placed' });
    }
    // Meta leads route themselves; there is no admin placement step for them.
    if (lead.source === META_LEAD_SOURCE) {
      return res.status(400).json({ message: 'Meta leads are placed automatically' });
    }

    let placementLead = lead;
    if (!ngoOf(lead.notes) && lead.meta_form_id) {
      const account = await metaAccountForForm(lead.meta_form_id);
      if (account) {
        placementLead = { ...lead, notes: `${lead.notes || ''}\n[Account: ${account}]` };
      }
    }

    const placed = await materializeReplyLead(placementLead, {});
    if (!placed.ok) return res.status(400).json({ message: placed.reason });

    // A manual "Add to station" is the same event for the FRO as an automatic
    // placement: ring the bell once, on a new assignment only.
    if (!placed.merged && placed.froWorkerId) {
      const rule = scoreSsReply(placementLead.notes);
      await createLeadAlert({
        workerId: placed.froWorkerId,
        assignmentId: placed.assignmentId,
        leadId: lead.id,
        ngoId: placed.ngoId,
        station: placed.station,
        source: lead.source,
        score: rule.score,
        label: rule.label,
        name: lead.name,
        phone: lead.phone,
      }).catch(() => {});
    }

    return res.json({
      ...placed,
      message: placed.merged
        ? `Already in ${placed.station}${placed.reason ? ` — ${placed.reason}` : ''}`
        : `Added to ${placed.station}`,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// Score one reply with the AI model and cache the answer on the lead row.
export const aiScoreSsLead = async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!SS_INBOX_SOURCES.includes(lead.source)) {
      return res.status(400).json({ message: 'Only inbox reply leads can be scored' });
    }

    try {
      const ai = await aiScoreSsReply(parseReply(lead.notes));
      await db.from('leads').update({
        ai_label: ai.label,
        ai_score: ai.score,
        ai_reason: ai.reasons?.[0] || null,
        ai_model: ai.model || null,
        ai_version: SS_AI_VERSION,
        ai_at: new Date().toISOString(),
      }).eq('id', lead.id);
      return res.json({ ok: true, suggestion: ai });
    } catch (e) {
      // AI unavailable: answer with the rule score so the screen keeps working.
      return res.status(502).json({
        ok: false,
        message: e?.message || 'AI unavailable',
        suggestion: { ...scoreSsReply(lead.notes), source: 'rules' },
      });
    }
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// Score a small batch of un-scored replies. Bounded on purpose: the admin
// presses this once and gets an answer in a few seconds instead of waiting for
// 80+ sequential model calls.
export const aiScoreSsLeadsBatch = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 12, 1), 20);
    const { data: rows, error } = await db
      .from('leads')
      .select('id, notes')
      .in('source', SS_INBOX_SOURCES)
      .is('ai_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    let scored = 0;
    let failed = 0;
    const errors = [];
    for (const row of rows || []) {
      try {
        const ai = await aiScoreSsReply(parseReply(row.notes));
        await db.from('leads').update({
          ai_label: ai.label,
          ai_score: ai.score,
          ai_reason: ai.reasons?.[0] || null,
          ai_model: ai.model || null,
          ai_version: SS_AI_VERSION,
          ai_at: new Date().toISOString(),
        }).eq('id', row.id);
        scored += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 2) errors.push(e?.message || String(e));
        if (/not configured/i.test(e?.message || '')) break;
      }
    }

    const { count } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('source', SS_INBOX_SOURCES)
      .is('ai_at', null);

    return res.json({ scored, failed, remaining: count ?? null, errors });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// Per-source counts for the Leads Hub tabs. One query; the UI does not need to
// download every lead just to show a badge.
export const ssLeadStats = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const { rows } = await db._pool.query(
      `select source, count(*)::int as total
         from leads
        where source = any($1::text[])
          and created_at >= now() - ($2::int || ' days')::interval
        group by source`,
      [SS_INBOX_SOURCES, days],
    );
    const bySource = { whatsapp: 0, meta: 0, email: 0 };
    for (const row of rows) bySource[sourceKeyOf(row.source)] += Number(row.total) || 0;
    return res.json({ days, by_source: bySource });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// Bulk placement for the ids the operator can currently see. Bounded on
// purpose: one bad lead must not abort the rest, and cross-NGO rows stay
// untouched because each lead resolves its own station.
export const bulkAddSsReplyLeads = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 50) : [];
    if (!ids.length) return res.status(400).json({ message: 'ids is required (max 50)' });

    let placed = 0;
    let already = 0;
    const failed = [];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of ids) {
      // A malformed id must fail this one row, not the whole batch with a raw
      // Postgres uuid cast error.
      if (!UUID_RE.test(String(id))) {
        failed.push({ id, reason: 'Invalid lead id' });
        continue;
      }
      try {
        const lead = await getLeadById(id);
        if (!lead || !SS_INBOX_SOURCES.includes(lead.source)) {
          failed.push({ id, reason: 'Not an inbox lead' });
          continue;
        }
        let placementLead = lead;
        if (!ngoOf(lead.notes) && lead.meta_form_id) {
          const account = await metaAccountForForm(lead.meta_form_id);
          if (account) {
            placementLead = { ...lead, notes: `${lead.notes || ''}\n[Account: ${account}]` };
          }
        }
        const result = await materializeReplyLead(placementLead, {});
        if (!result.ok) failed.push({ id, reason: result.reason });
        else if (result.merged) already += 1;
        else placed += 1;
      } catch (e) {
        failed.push({ id, reason: e?.message || String(e) });
      }
    }

    return res.json({
      ok: placed > 0,
      placed,
      already,
      failed: failed.length,
      results: failed.slice(0, 10),
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
