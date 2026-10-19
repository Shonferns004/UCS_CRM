/**
 * WhatsApp keyword automations, ported from the standalone app
 * (whtsapp/backend/src/automation/*) onto the CRM's schema.
 *
 * SAFETY CONTRACT -- read this before changing anything:
 *   runAutomationForInbound() checks `enabled` FIRST and returns before it looks
 *   at a single rule. The row is seeded with enabled=false by migration 183, so
 *   deploying this file cannot send a message on its own. Enabling automations
 *   is always a deliberate admin action through the settings route.
 *
 * This module never assigns conversations or agents. It only decides whether an
 * automatic customer reply is sent, and records what happened.
 */

import db from '../config/db.js';
import config from '../config/whatsappConfig.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
import { isRoutableProject } from './whatsappOrgRouting.js';
import { postWhatsAppMessage } from '../lib/whatsappGraphSend.js';

const DEFAULT_WINDOW_HOURS = 24;

/** Case-insensitive keyword match. Pure -- no I/O -- so it is directly testable. */
export function matchesRule(text, keyword, matchType = 'contains') {
  const haystack = String(text ?? '').toLowerCase();
  const needle = String(keyword ?? '').toLowerCase().trim();
  if (!needle) return false;

  switch (matchType) {
    case 'exact':
      return haystack.trim() === needle;
    case 'starts_with':
      return haystack.trim().startsWith(needle);
    case 'ends_with':
      return haystack.trim().endsWith(needle);
    case 'whole_word':
      return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);
    case 'contains':
    default:
      return haystack.includes(needle);
  }
}

/* ------------------------------------------------------------------ settings */

export async function getSettings() {
  const { data, error } = await db
    .from('whatsapp_automation_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  // The table not existing means migration 183 has not been applied. That is the
  // SAFE state, so it must read as disabled rather than throwing: the inbound
  // webhook calls this on every text message, and an uncaught error there would
  // log a failure for traffic that has nothing to do with automations.
  if (error?.code === '42P01') return { id: 1, enabled: false, tableMissing: true };
  if (error) throw error;
  if (data) return data;

  // Row absent (table exists but unseeded) -- also disabled.
  return { id: 1, enabled: false };
}

export async function setEnabled(enabled, updatedBy) {
  const current = await getSettings();
  const { data, error } = await db
    .from('whatsapp_automation_settings')
    .upsert(
      { id: 1, enabled: !!enabled, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select()
    .single();
  if (error) throw error;
  return { previous: current?.enabled ?? false, current: data };
}

/* --------------------------------------------------------------------- rules */

export async function listRules({ project } = {}) {
  let query = db
    .from('whatsapp_automation_rules')
    .select('*')
    .order('priority', { ascending: false })
    .order('id', { ascending: true });
  if (project) query = query.eq('project', project);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Only enabled rules, in evaluation order. The hot path for every inbound. */
async function listEnabledRules(project) {
  let query = db
    .from('whatsapp_automation_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: false })
    .order('id', { ascending: true });
  if (project) query = query.eq('project', project);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createRule(input) {
  const row = {
    project: input.project ?? null,
    name: String(input.name || '').trim(),
    keyword: String(input.keyword || '').trim(),
    match_type: input.match_type || 'contains',
    reply_text: String(input.reply_text || '').trim(),
    enabled: input.enabled !== false,
    priority: Number.isFinite(+input.priority) ? parseInt(input.priority, 10) : 0,
    cooldown_seconds: Math.max(0, parseInt(input.cooldown_seconds || 0, 10) || 0),
    template_name: input.template_name || null,
    template_language: input.template_language || null,
    created_by: input.created_by || null,
  };
  if (!row.name) throw new Error('Rule name is required');
  if (!row.keyword) throw new Error('Rule keyword is required');
  if (!row.reply_text) throw new Error('Rule reply text is required');

  const { data, error } = await db.from('whatsapp_automation_rules').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new Error(`A rule named "${row.name}" already exists`);
    throw error;
  }
  return data;
}

export async function updateRule(id, patch) {
  const row = {};
  for (const key of [
    'project', 'name', 'keyword', 'match_type', 'reply_text',
    'enabled', 'priority', 'cooldown_seconds', 'template_name', 'template_language',
  ]) {
    if (patch[key] !== undefined) row[key] = patch[key];
  }
  if (row.priority !== undefined) row.priority = parseInt(row.priority, 10) || 0;
  if (row.cooldown_seconds !== undefined) row.cooldown_seconds = Math.max(0, parseInt(row.cooldown_seconds, 10) || 0);
  row.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('whatsapp_automation_rules')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error(`A rule named "${row.name}" already exists`);
    throw error;
  }
  return data;
}

export async function deleteRule(id) {
  const { error } = await db.from('whatsapp_automation_rules').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------------------------------------------------------- logs */

export async function logEvent(entry) {
  // The duplicate-webhook backstop is a UNIQUE index, so a losing racer simply
  // finds no row inserted. That is a normal outcome, not an error.
  const { error } = await db.from('whatsapp_automation_logs').insert({
    action: 'keyword_reply',
    created_at: new Date().toISOString(),
    ...entry,
  });
  if (error && error.code === '23505') return null;
  if (error) throw error;
  return true;
}

export async function listLogs({ limit = 50, result, ruleId, project } = {}) {
  let query = db
    .from('whatsapp_automation_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  if (result) query = query.eq('result', result);
  if (ruleId) query = query.eq('rule_id', ruleId);
  if (project) query = query.eq('project', project);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/* -------------------------------------------------------------- 24h window */

async function lastInboundAt(conversationId) {
  const { data, error } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const at = data?.[0]?.created_at;
  return at ? new Date(at).getTime() : 0;
}

async function windowOpen(conversationId) {
  const at = await lastInboundAt(conversationId);
  return Boolean(at) && Date.now() - at < DEFAULT_WINDOW_HOURS * 60 * 60 * 1000;
}

/* ----------------------------------------------------------------- cooldown */

/**
 * Claims the cooldown slot for (conversation, rule). The composite primary key
 * means a concurrent burst can only ever win once; everyone else gets a
 * constraint violation and is treated as "already answered".
 */
async function claimCooldown(conversationId, rule) {
  if (!rule.cooldown_seconds || rule.cooldown_seconds <= 0) return true;

  const cutoff = new Date(Date.now() - rule.cooldown_seconds * 1000).toISOString();
  const { data: existing } = await db
    .from('whatsapp_automation_rule_state')
    .select('last_sent_at')
    .eq('conversation_id', conversationId)
    .eq('rule_id', rule.id)
    .maybeSingle();

  if (existing && new Date(existing.last_sent_at).getTime() > new Date(cutoff).getTime()) {
    return false;
  }

  const { error } = await db
    .from('whatsapp_automation_rule_state')
    .upsert(
      { conversation_id: conversationId, rule_id: rule.id, last_sent_at: new Date().toISOString() },
      { onConflict: 'conversation_id,rule_id' },
    );
  if (error) return false;
  return true;
}

/** Releases the cooldown when the send itself failed, so a real retry can happen. */
async function releaseCooldown(conversationId, ruleId) {
  await db
    .from('whatsapp_automation_rule_state')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('rule_id', ruleId);
}

/* ----------------------------------------------------------------- sending */

function normalizePhone(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

async function sendViaMeta({ to, project, text, template }) {
  // An UNATTENDED send. The `|| config.accessToken` fallback meant a rule
  // scoped to one organisation whose account was momentarily missing would
  // dispatch from whichever number the environment held -- the Being Sevak one.
  // Refuse instead: an automation must never answer as a different business.
  const account = await getAccountByProject(project);
  const accessToken = account?.access_token;
  const phoneNumberId = account?.phone_number_id;
  if (!accessToken || !phoneNumberId) {
    throw new Error(
      `WhatsApp account not configured for project "${project}". The automatic reply was NOT sent `
      + 'from another organisation\'s number.',
    );
  }

  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template.name, language: { code: template.language || 'en' } },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      };

  const data = await postWhatsAppMessage(
    `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/messages`,
    accessToken,
    body,
  );
  if (!data?.messages?.[0]?.id) {
    throw Object.assign(new Error('Meta API error'), { metaCode: null });
  }
  return data.messages[0].id;
}

/* ------------------------------------------------------------------ runner */

/**
 * Evaluates the rules against one inbound message.
 *
 * Order of checks is deliberate and is the safety property of this module:
 *   1. master switch  -- off means we never even look at rules
 *   2. duplicate guard-- a redelivered webhook cannot reply twice
 *   3. keyword match  -- highest priority first
 *   4. 24h window     -- free-form text is never sent outside it
 *   5. cooldown claim -- one reply per conversation per rule
 * Only then is anything sent.
 */
export async function runAutomationForInbound({
  conversationId,
  contactId,
  triggerMessageId,
  inboundText,
  recipientPhone,
  project,
}) {
  // 1. MASTER SWITCH. Everything below is unreachable while this is false.
  const settings = await getSettings();
  if (!settings?.enabled) return { ran: false, reason: 'automation_disabled' };

  if (!inboundText || !String(inboundText).trim()) return { ran: false, reason: 'empty_message' };

  const to = normalizePhone(recipientPhone);
  if (!to) return { ran: false, reason: 'no_recipient_phone' };

  // The organisation this inbound arrived on. No 'bsct' fallback.
  //
  // `project || 'bsct'` meant an inbound whose phone_number_id matched no
  // configured account was evaluated against the BEING SEVAK rule set and, on a
  // match, answered from the Being Sevak number -- an unattended reply, from a
  // different business identity, to somebody who never wrote to it. The webhook
  // already resolves this to null when it cannot attribute the number; an
  // unattributable inbound gets no automatic answer at all.
  if (!isRoutableProject(project)) {
    return { ran: false, reason: 'unroutable_project' };
  }
  const effectiveProject = project;
  const rules = await listEnabledRules(effectiveProject);
  if (!rules.length) return { ran: false, reason: 'no_rules' };

  const rule = rules.find((r) => matchesRule(inboundText, r.keyword, r.match_type));
  if (!rule) return { ran: false, reason: 'no_match' };

  // 2. Duplicate-webhook backstop. The UNIQUE index on
  // (trigger_message_id, rule_id) means a second run cannot insert its log row,
  // so a Meta redelivery cannot produce a second automatic reply.
  const claimed = await logEvent({
    result: 'processing',
    project: effectiveProject,
    conversation_id: conversationId,
    contact_id: contactId || null,
    trigger_message_id: triggerMessageId || null,
    rule_id: rule.id,
    rule_name: rule.name,
  });
  if (claimed === null) return { ran: false, reason: 'duplicate_trigger' };

  // 3. 24-hour window: free-form text is never sent outside it.
  const open = await windowOpen(conversationId);
  if (!open && !rule.template_name) {
    await logEvent({
      result: 'blocked', project: effectiveProject, conversation_id: conversationId,
      contact_id: contactId || null, trigger_message_id: triggerMessageId || null,
      rule_id: rule.id, rule_name: rule.name,
      detail: '24-hour window closed and rule has no template fallback',
    });
    return { ran: false, reason: 'window_closed' };
  }

  // 4. Cooldown.
  if (!(await claimCooldown(conversationId, rule))) {
    await logEvent({
      result: 'skipped', project: effectiveProject, conversation_id: conversationId,
      contact_id: contactId || null, trigger_message_id: triggerMessageId || null,
      rule_id: rule.id, rule_name: rule.name,
      detail: `cooldown ${rule.cooldown_seconds}s still active`,
    });
    return { ran: false, reason: 'cooldown' };
  }

  try {
    const waMessageId = await sendViaMeta({
      to,
      project: effectiveProject,
      text: rule.reply_text,
      template: open ? null : { name: rule.template_name, language: rule.template_language },
    });

    const { data: stored } = await db
      .from('messages')
      .insert({
        tenant_id: null,
        conversation_id: conversationId,
        contact_id: contactId || null,
        user_id: 'whatsapp-automation',
        direction: 'outbound',
        message_type: open ? 'text' : 'template',
        body_text: open ? rule.reply_text : `[Template] ${rule.template_name}`,
        wa_message_id: waMessageId,
        status: 'sent',
        message_category: 'automation',
        is_automated: true,
        created_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    await logEvent({
      result: 'sent', project: effectiveProject, conversation_id: conversationId,
      contact_id: contactId || null, trigger_message_id: triggerMessageId || null,
      message_id: stored?.id || null, rule_id: rule.id, rule_name: rule.name,
      wa_message_id: waMessageId,
    });

    return { ran: true, ruleId: rule.id, ruleName: rule.name, waMessageId };
  } catch (err) {
    await releaseCooldown(conversationId, rule.id);
    await logEvent({
      result: 'failed', project: effectiveProject, conversation_id: conversationId,
      contact_id: contactId || null, trigger_message_id: triggerMessageId || null,
      rule_id: rule.id, rule_name: rule.name,
      detail: String(err?.message || err).slice(0, 300),
    });
    // Never throw into the webhook: a failed auto-reply must not turn the
    // inbound delivery into a 500, which would make Meta redeliver it.
    return { ran: false, reason: 'send_failed', error: String(err?.message || err) };
  }
}

/** Dry run for the admin UI. Sends nothing and writes nothing. */
export function previewRules(text, rules) {
  return (rules || [])
    .filter((r) => r.enabled !== false)
    .map((r) => ({ ...r, matches: matchesRule(text, r.keyword, r.match_type) }))
    .filter((r) => r.matches)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id);
}