import db from '../config/db.js';
import config from '../config/whatsappConfig.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
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

  return { project: accountProject, fetched: templates.length, inserted, updated };
}
