/**
 * One-off: copy every template from the aflf2 WABA into the aflf3 WABA.
 *
 * WhatsApp templates are WABA-scoped and Meta has no cross-WABA copy endpoint,
 * so each source template is read from aflf2 and re-submitted to aflf3.
 *
 * Usage:
 *   node scripts/copy-aflf2-templates-to-aflf3.mjs            # dry-run
 *   node scripts/copy-aflf2-templates-to-aflf3.mjs --apply    # create on Meta
 */
import 'dotenv/config';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const SOURCE_PROJECT = 'aflf2';
const TARGET_PROJECT = 'aflf3';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

function log(...args) {
  console.log(...args);
}

async function graphGet(path, token) {
  const response = await fetch(`${GRAPH}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, json };
}

async function loadAccount(project) {
  const { rows } = await client.query(
    `select id, project, name, waba_id, phone_number_id, access_token
       from whatsapp_accounts
      where lower(project) = $1
      limit 1`,
    [project],
  );
  return rows[0] || null;
}

async function fetchTemplates(account) {
  const templates = [];
  let url = `${GRAPH}/${account.waba_id}/message_templates`
    + '?fields=name,status,category,language,components&limit=200';
  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = json?.error || {};
      throw new Error(`Meta ${error.code || ''}/${error.error_subcode || ''}: ${error.message || 'template fetch failed'}`);
    }
    templates.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return templates;
}

function exampleMediaUrl(header) {
  const sample = header?.example?.header_handle;
  const first = Array.isArray(sample) ? sample[0] : sample;
  return typeof first === 'string' && /^https?:\/\//i.test(first) ? first : null;
}

function buildPayload(template) {
  const components = [];
  for (const component of Array.isArray(template.components) ? template.components : []) {
    const type = String(component?.type || '').toUpperCase();

    if (type === 'HEADER') {
      const format = String(component.format || 'TEXT').toUpperCase();
      if (format === 'TEXT') {
        if (!component.text) continue;
        const header = { type: 'HEADER', format: 'TEXT', text: component.text };
        if (component.example?.header_text) header.example = { header_text: component.example.header_text };
        components.push(header);
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
        const url = exampleMediaUrl(component);
        if (!url) throw new Error(`header ${format} has no usable sample URL`);
        components.push({ type: 'HEADER', format, example: { header_handle: [url] } });
      }
    } else if (type === 'BODY') {
      if (!component.text) continue;
      const body = { type: 'BODY', text: component.text };
      if (component.example?.body_text) body.example = { body_text: component.example.body_text };
      components.push(body);
    } else if (type === 'FOOTER') {
      if (component.text) components.push({ type: 'FOOTER', text: component.text });
    } else if (type === 'BUTTONS') {
      const buttons = (Array.isArray(component.buttons) ? component.buttons : [])
        .map((button) => {
          const text = String(button?.text || '').trim();
          if (!text) return null;
          const copy = { type: String(button.type || 'QUICK_REPLY').toUpperCase(), text };
          if (button.url) copy.url = button.url;
          if (button.phone_number) copy.phone_number = button.phone_number;
          if (button.example) copy.example = button.example;
          return copy;
        })
        .filter(Boolean);
      if (buttons.length) components.push({ type: 'BUTTONS', buttons });
    }
  }

  if (!components.some((component) => component.type === 'BODY')) {
    throw new Error('template has no BODY component');
  }

  return {
    name: template.name,
    language: template.language || 'en',
    category: template.category || 'UTILITY',
    components,
  };
}

async function resolveNgoId() {
  const { rows: aflf } = await client.query("select id from ngos where lower(name) = 'aflf' limit 1");
  if (aflf[0]?.id) return aflf[0].id;
  const { rows: first } = await client.query('select id from ngos order by created_at nulls last limit 1');
  return first[0]?.id || null;
}

function isDuplicate(result) {
  return /already\s+exists/i.test(JSON.stringify(result?.error || {})) || /duplicate/i.test(JSON.stringify(result?.error || {}));
}

async function upsertMirror({ ngoId, project, payload, created }) {
  const { rows } = await client.query(
    'select id from whatsapp_templates where project = $1 and name = $2 and language = $3 limit 1',
    [project, payload.name, payload.language],
  );
  const status = String(created?.status || 'PENDING').toUpperCase();
  const metaId = created?.id ? String(created.id) : null;
  if (rows[0]?.id) {
    await client.query(
      `update whatsapp_templates
          set category = $1, status = $2, meta_template_id = $3, components = $4, ngo_id = $5, updated_at = now()
        where id = $6`,
      [payload.category, status, metaId, JSON.stringify(payload.components), ngoId, rows[0].id],
    );
    return 'updated';
  }
  await client.query(
    `insert into whatsapp_templates
       (ngo_id, name, language, category, status, meta_template_id, components, project, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [ngoId, payload.name, payload.language, payload.category, status, metaId, JSON.stringify(payload.components), project],
  );
  return 'inserted';
}

async function main() {
  await client.connect();

  const source = await loadAccount(SOURCE_PROJECT);
  const target = await loadAccount(TARGET_PROJECT);
  if (!source) throw new Error(`WhatsApp account "${SOURCE_PROJECT}" not found`);
  if (!target) throw new Error(`WhatsApp account "${TARGET_PROJECT}" not found`);

  log(`mode        : ${APPLY ? 'APPLY (will create templates)' : 'DRY-RUN (no changes)'}`);
  log(`source      : ${source.project} (${source.name}) WABA ${source.waba_id}`);
  log(`target      : ${target.project} (${target.name}) WABA ${target.waba_id}`);

  const templates = await fetchTemplates(source);
  log(`source list : ${templates.length} template(s)`);
  for (const template of templates) {
    const header = (template.components || []).find((component) => component.type === 'HEADER');
    log(`  - ${template.name} (${template.language || 'en'}) ${template.status || ''}`
      + ` header=${header ? (header.format || 'TEXT') : 'none'}`);
  }
  log('');

  const targetWaba = await graphGet(`${target.waba_id}?fields=id,name`, target.access_token);
  if (!targetWaba.ok) {
    const phone = await graphGet(`${String(target.phone_number_id).trim()}?fields=id,display_phone_number`, target.access_token);
    log('');
    log('TARGET WABA ACCESS FAILED — Meta did not authorize this token for the WABA.');
    log(`  WABA:  ${target.waba_id}`);
    log(`  error: ${JSON.stringify(targetWaba.json?.error || targetWaba.json)}`);
    log(`  phone: ${phone.ok ? JSON.stringify(phone.json) : `also failed (${phone.status})`}`);
    log('');
    log('Fix in Meta Business Settings:');
    log('  Business Settings -> Users -> System Users -> the user behind this token');
    log(`  -> Add Assets -> WhatsApp Accounts -> ${target.waba_id} -> Full control`);
    log('  (or generate a System User token in the business that owns that WABA and');
    log(`   paste it into CRM -> WhatsApp Accounts -> ${target.project} -> Edit -> Access Token)`);
    process.exitCode = 2;
    return;
  }
  log(`target WABA : ${targetWaba.json.name || '(unnamed)'} — access OK`);

  const existing = await fetchTemplates(target).catch(() => []);
  const existingKeys = new Set(existing.map((template) => `${template.name}::${template.language || 'en'}`));

  let ngoId = null;
  if (APPLY) {
    ngoId = await resolveNgoId();
    if (!ngoId) throw new Error('No NGO row found for whatsapp_templates.ngo_id');
    const trimmed = String(target.phone_number_id || '').trim();
    if (trimmed !== target.phone_number_id) {
      await client.query('update whatsapp_accounts set phone_number_id = $1 where id = $2', [trimmed, target.id]);
      log(`phone id    : trimmed leading/trailing space -> ${trimmed}`);
    }
  }

  const report = { created: 0, skipped: 0, failed: [], planned: [] };

  for (const template of templates) {
    const label = `${template.name} (${template.language || 'en'})`;
    let payload;
    try {
      payload = buildPayload(template);
    } catch (error) {
      report.failed.push({ label, error: error.message });
      log(`  FAIL  ${label} — ${error.message}`);
      continue;
    }

    const key = `${payload.name}::${payload.language}`;
    if (existingKeys.has(key)) {
      report.skipped += 1;
      log(`  SKIP  ${label} — already exists on target WABA`);
      continue;
    }

    if (!APPLY) {
      report.planned.push(label);
      log(`  PLAN  ${label} [${template.status || '?'}] ${template.category || ''}`
        + ` components=${payload.components.map((component) => component.type).join(',')}`);
      continue;
    }

    const response = await fetch(`${GRAPH}/${target.waba_id}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const created = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (isDuplicate(created)) {
        report.skipped += 1;
        log(`  SKIP  ${label} — already exists on target WABA`);
        continue;
      }
      const message = created?.error?.message || `HTTP ${response.status}`;
      report.failed.push({ label, error: message });
      log(`  FAIL  ${label} — ${message}`);
      continue;
    }

    try {
      await upsertMirror({ ngoId, project: target.project, payload, created });
    } catch (error) {
      report.failed.push({ label, error: `created on Meta but DB mirror failed: ${error.message}` });
      log(`  WARN  ${label} — created on Meta (${created.status || 'PENDING'}) but DB mirror failed: ${error.message}`);
      report.created += 1;
      continue;
    }
    report.created += 1;
    log(`  ADD   ${label} — Meta status ${created.status || 'PENDING'}`);
  }

  log('');
  if (!APPLY) {
    log(`dry-run: ${report.planned.length} planned, ${report.skipped} already present, ${report.failed.length} failed`);
    log('Re-run with --apply to create the planned templates.');
  } else {
    log(`done: ${report.created} created, ${report.skipped} skipped, ${report.failed.length} failed`);
    const verify = await fetchTemplates(target).catch(() => []);
    log(`target now has ${verify.length} template(s):`);
    for (const template of verify) {
      log(`  - ${template.name} (${template.language || 'en'}) ${template.status || ''}`);
    }
  }
  if (report.failed.length) {
    log('');
    log('failures:');
    for (const failure of report.failed) log(`  - ${failure.label}: ${failure.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
