import db from '../config/db.js';

export async function listAgentsForAccount(whatsappAccountId) {
  const { data, error } = await db
    .from('fro_whatsapp_assignments')
    .select('id, fro_worker_id, is_active, created_at, workers!inner(id, name, email, phone)')
    .eq('whatsapp_account_id', whatsappAccountId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function assignAgentToAccount(froWorkerId, whatsappAccountId) {
  const { data, error } = await db
    .from('fro_whatsapp_assignments')
    .insert({ fro_worker_id: froWorkerId, whatsapp_account_id: whatsappAccountId })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('This FRO is already assigned to this account');
    throw error;
  }

  // Keep the worker -> agent `users` mapping in step so the FRO WhatsApp panel
  // resolves this grant immediately (migration 189 owns the resolution rules).
  // Best-effort: the grant already succeeded, and get_worker_agents() heals the
  // mapping on the next panel load regardless.
  try {
    await db.rpc('ensure_worker_agents', { p_worker_id: froWorkerId });
  } catch { /* self-heals at panel load */ }

  return data;
}

export async function removeAgentFromAccount(froWorkerId, whatsappAccountId) {
  const { error } = await db
    .from('fro_whatsapp_assignments')
    .delete()
    .eq('fro_worker_id', froWorkerId)
    .eq('whatsapp_account_id', whatsappAccountId);
  if (error) throw error;
}

export async function getAccountForFro(froWorkerId) {
  const { data, error } = await db
    .from('fro_whatsapp_assignments')
    .select('whatsapp_account_id, is_active, whatsapp_accounts!inner(id, name, project, phone_number_id)')
    .eq('fro_worker_id', froWorkerId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Only FROs can be WhatsApp agents. The department is stored as 'FRO' in the
// live table but a few older rows carry 'fro', so match case-insensitively.
const ASSIGNABLE_DEPARTMENT = 'FRO';

// The roster is small (a few hundred FROs), so it is returned in one response
// and filtered in the browser. This is what makes the assign panel feel
// instant: no request per keystroke, and no 20-row server cap hiding the
// agent the admin is actually looking for.
const ASSIGNABLE_LIMIT = 500;

// The search term is interpolated into an `or()` filter string, which the
// query builder parses with its own mini-grammar: a comma would split the
// condition and parentheses would unbalance it, and '*' would be turned into
// a SQL wildcard. Strip the characters the parser treats as syntax.
function sanitizeSearchTerm(term) {
  return String(term || '').replace(/[,()*%]/g, ' ').trim();
}

/**
 * Every FRO that can be assigned to a WhatsApp account.
 *
 * With no term the whole roster comes back (the assign panel lists it and
 * filters in the browser); with a term the same roster is narrowed by
 * name / email / phone / login id.
 */
export async function listAssignableWorkers(query) {
  const term = sanitizeSearchTerm(query);
  let req = db
    .from('workers')
    .select('id, name, email, phone, login_id, department, is_active')
    .ilike('department', ASSIGNABLE_DEPARTMENT);

  if (term) {
    req = req.or(
      `name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*,login_id.ilike.*${term}*`
    );
  }

  const { data, error } = await req.order('name', { ascending: true }).limit(ASSIGNABLE_LIMIT);
  if (error) throw error;
  return data || [];
}

// Kept for the search endpoint, which is documented as "search for FRO
// workers to assign". An empty term returns the full roster.
export async function searchWorkers(query) {
  return listAssignableWorkers(query);
}

/**
 * Assign several FROs to one account in a single statement.
 *
 * Rows already assigned are skipped instead of failing the whole batch
 * (ON CONFLICT DO NOTHING on the (fro_worker_id, whatsapp_account_id) unique
 * index), so the panel can send the whole selection in one request.
 */
export async function assignAgentsToAccount(froWorkerIds, whatsappAccountId) {
  const ids = [...new Set((froWorkerIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = ids.map((id) => ({ fro_worker_id: id, whatsapp_account_id: whatsappAccountId }));
  const { data, error } = await db
    .from('fro_whatsapp_assignments')
    // The conflict target must be the pair unique index, not the row id:
    // "ON CONFLICT (id) DO NOTHING" would let the duplicate assignment raise
    // 23505 instead of being skipped.
    .upsert(rows, { onConflict: 'fro_worker_id,whatsapp_account_id', ignoreDuplicates: true })
    .select('id, fro_worker_id');
  if (error) throw error;

  const inserted = data || [];

  // Keep the worker -> agent `users` mapping in step so the FRO WhatsApp panel
  // resolves these grants immediately (migration 189 owns the resolution
  // rules). Best-effort: the grants already succeeded, and get_worker_agents()
  // heals the mapping on the next panel load regardless.
  await Promise.all(
    inserted.map((row) =>
      db.rpc('ensure_worker_agents', { p_worker_id: row.fro_worker_id })
    )
  );

  return inserted;
}
