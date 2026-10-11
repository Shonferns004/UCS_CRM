import db from '../config/db.js';
import config from '../config/whatsappConfig.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';

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

  // whatsapp_templates.ngo_id is NOT NULL with no default, so an insert that
  // omits it never lands. Reuse the ngo already recorded for this project, or
  // match ngos.code (bsct2 falls back to BSCT by prefix).
  let ngoId = null;
  {
    const { data: existing } = await db
      .from('whatsapp_templates')
      .select('ngo_id')
      .eq('project', accountProject)
      .limit(1);
    ngoId = existing?.[0]?.ngo_id || null;

    if (!ngoId) {
      const { data: ngos } = await db.from('ngos').select('id, code');
      const want = String(accountProject || '').toUpperCase();
      const hit =
        (ngos || []).find((n) => String(n.code).toUpperCase() === want) ||
        (ngos || []).find((n) => want && want.startsWith(String(n.code).toUpperCase()));
      ngoId = hit?.id || null;
    }
  }
  if (!ngoId) throw new Error(`No ngo_id resolvable for project "${accountProject}" -- cannot sync templates`);

  let inserted = 0;
  let updated = 0;
  const failed = [];

  for (const tpl of templates) {
    const language = tpl.language || 'en';
    const { data: existing } = await db
      .from('whatsapp_templates')
      .select('id')
      .eq('project', accountProject)
      .eq('name', tpl.name)
      .eq('language', language)
      .maybeSingle();

    const row = {
      ngo_id: ngoId,
      name: tpl.name,
      language,
      category: tpl.category || null,
      status: (tpl.status || '').toUpperCase(),
      meta_template_id: tpl.id ? String(tpl.id) : null,
      components: tpl.components || null,
      project: accountProject,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await db.from('whatsapp_templates').update(row).eq('id', existing.id);
      if (error) failed.push(`${tpl.name}: ${error.message}`); else updated++;
    } else {
      const { error } = await db.from('whatsapp_templates').insert(row);
      if (error) failed.push(`${tpl.name}: ${error.message}`); else inserted++;
    }
  }

  if (failed.length) {
    throw new Error(`Sync incomplete, nothing pruned. ${failed.slice(0, 3).join(' | ')}`);
  }

  // Anything Meta no longer reports is removed rather than left behind. Without
  // this the table only ever grew, so templates that had been deleted at Meta
  // kept being offered in the library.
  const liveNames = new Set(templates.filter((t) => t.status === 'APPROVED').map((t) => t.name));
  const { data: stored } = await db
    .from('whatsapp_templates')
    .select('id, name, language')
    .eq('project', accountProject);

  let removed = 0;
  for (const row of stored || []) {
    const stillLive = templates.some(
      (t) => t.name === row.name && (t.language || 'en') === (row.language || 'en'),
    );
    if (!stillLive || !liveNames.has(row.name)) {
      await db.from('whatsapp_templates').delete().eq('id', row.id);
      removed++;
    }
  }

  return { project: accountProject, fetched: templates.length, inserted, updated, removed };
}
