import db from '../config/db.js';
import config from '../config/whatsappConfig.js';
import { getAccountByProject, getAccountById } from '../models/whatsappAccountModel.js';
import { ngoIdFromProjectId } from '../models/bankAuditModel.js';

export async function syncTemplatesForProject(accountProject) {
  const account = await getAccountByProject(accountProject);
  if (!account?.waba_id || !account?.access_token) {
    throw new Error(`WhatsApp account for project "${accountProject}" needs waba_id and access_token`);
  }

  const templates = [];
  let url = `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates?fields=name,status,category,language,components,id&limit=200`;
  for (let page = 0; page < 5 && url; page++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Meta API error while fetching templates');
    templates.push(...(result.data || []));
    url = result.paging?.next || null;
  }

  let inserted = 0;
  let updated = 0;

  for (const tpl of templates) {
    const { data: existing } = await db
      .from('whatsapp_templates')
      .select('id')
      .eq('project', accountProject)
      .eq('name', tpl.name)
      .eq('language', tpl.language || 'en')
      .maybeSingle();

    let ngoId = await ngoIdFromProjectId(accountProject);
    if (!ngoId) {
      const { data: ngos } = await db.from('ngos').select('id').limit(1);
      ngoId = ngos?.[0]?.id || null;
    }
    const row = {
      name: tpl.name,
      language: tpl.language || 'en',
      category: tpl.category || null,
      status: (tpl.status || '').toUpperCase(),
      meta_template_id: tpl.id ? String(tpl.id) : null,
      components: tpl.components || null,
      project: accountProject,
      ngo_id: ngoId,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updErr } = await db.from('whatsapp_templates').update(row).eq('id', existing.id);
      if (updErr) throw updErr;
      updated++;
    } else {
      const { error: insErr } = await db.from('whatsapp_templates').insert(row);
      if (insErr) throw insErr;
      inserted++;
    }
  }

  const fetchedNames = new Set(templates.map((t) => t.name));

  // Templates that no longer exist on Meta (or are no longer approved) must
  // stop appearing as sendable: mark any DB row for this project whose name is
  // not in the freshly fetched set as PAUSED so getTemplates filters it out.
  try {
    const { data: existingRows } = await db
      .from('whatsapp_templates')
      .select('id, name, status')
      .eq('project', accountProject);
    const staleIds = (existingRows || [])
      .filter((r) => !fetchedNames.has(r.name) && String(r.status || '').toUpperCase() === 'APPROVED')
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await db.from('whatsapp_templates').update({ status: 'PAUSED', updated_at: new Date().toISOString() }).in('id', staleIds);
    }
  } catch (e) {
    console.warn('[templateSync] stale-mark failed:', e?.message || e);
  }

  return { project: accountProject, fetched: templates.length, inserted, updated };
}

export async function createTemplateForAccount(accountId, input) {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('WhatsApp account not found');
  if (!account.waba_id || !account.access_token) {
    throw new Error('WhatsApp account needs waba_id and access_token');
  }

  const name = String(input?.name || '').trim().toLowerCase().replace(/\s+/g, '_');
  const language = String(input?.language || 'en').trim() || 'en';
  const category = String(input?.category || 'UTILITY').trim().toUpperCase();
  const body = String(input?.body || '').trim();
  const headerType = String(input?.headerType || 'NONE').toUpperCase();
  const headerText = String(input?.headerText || input?.header || '').trim();
  const footer = String(input?.footer || '').trim();
  if (!name) throw new Error('Template name is required');
  if (!body) throw new Error('Template body is required');

  const components = [];
  if (headerType === 'TEXT' && headerText) {
    components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
    components.push({ type: 'HEADER', format: headerType });
  }
  components.push({ type: 'BODY', text: body });
  if (footer) components.push({ type: 'FOOTER', text: footer });

  const buttons = Array.isArray(input?.buttons) ? input.buttons : [];
  const btnComponents = buttons.map((b) => {
    const type = String(b?.type || 'QUICK_REPLY').toUpperCase();
    const text = String(b?.text || '').trim();
    if (!text) return null;
    if (type === 'URL') return { type: 'URL', text, url: String(b?.url || '').trim() };
    if (type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text, phone_number: String(b?.phone_number || b?.phone || '').trim() };
    if (type === 'COPY_CODE') return { type: 'COPY_CODE', text };
    return { type: 'QUICK_REPLY', text };
  }).filter(Boolean);
  if (btnComponents.length) components.push({ type: 'BUTTONS', buttons: btnComponents });

  const payload = { name, language, category, components };

  const res = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result?.error?.message || 'Meta API error while creating template');
  }

  let ngoId = null;
  try { ngoId = await ngoIdFromProjectId(account.project); } catch { ngoId = null; }
  if (!ngoId) {
    const { data: ngos } = await db.from('ngos').select('id').limit(1);
    ngoId = ngos?.[0]?.id || null;
  }

  const row = {
    name,
    language,
    category,
    status: String(result?.status || 'PENDING').toUpperCase(),
    meta_template_id: result?.id ? String(result.id) : null,
    components,
    project: account.project,
    ngo_id: ngoId,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from('whatsapp_templates')
    .select('id')
    .eq('project', account.project)
    .eq('name', name)
    .eq('language', language)
    .maybeSingle();

  if (existing) {
    await db.from('whatsapp_templates').update(row).eq('id', existing.id);
  } else {
    await db.from('whatsapp_templates').insert(row);
  }

  return { ...result, name, language, category, status: row.status };
}

export async function listTemplatesForAccountAll(accountId) {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('WhatsApp account not found');
  if (!account.waba_id || !account.access_token) {
    throw new Error('WhatsApp account needs waba_id and access_token');
  }
  const res = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates?fields=name,language,status,category&limit=200`,
    { headers: { Authorization: `Bearer ${account.access_token}` } }
  );
  const result = await res.json();
  if (!res.ok) throw new Error(result?.error?.message || 'Meta API error while listing templates');
  return (result?.data || []).map(t => ({
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
  }));
}

export async function deleteTemplateForAccount(accountId, templateName) {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('WhatsApp account not found');
  if (!account.waba_id || !account.access_token) {
    throw new Error('WhatsApp account needs waba_id and access_token');
  }
  const name = String(templateName || '').trim();
  if (!name) throw new Error('Template name is required');

  const res = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates?name=${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.access_token}` },
    }
  );
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result?.error?.message || 'Meta API error while deleting template');

  await db
    .from('whatsapp_templates')
    .delete()
    .eq('project', account.project)
    .eq('name', name);

  return { success: true };
}
