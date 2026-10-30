import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from '../config/db.js';
import { getFroStationPairs, getAllowedProjectsByStations } from './froStationScope.js';

async function findLinkedAgent(workerId) {
  const { data } = await db
    .from('worker_agent_assignments')
    .select('user_id')
    .eq('worker_id', workerId)
    .order('user_id')
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

async function findEmailAgent(worker) {
  const email = String(worker?.email || worker?.login_id || '').trim();
  if (!email) return null;
  const { data } = await db
    .from('users')
    .select('id')
    .ilike('email', email)
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function findSameNameAgent(worker) {
  const name = String(worker?.name || '').trim();
  if (!name) return null;
  try {
    const { rows } = await db._pool.query(
      `SELECT u.id
         FROM public.users u
        WHERE u.role = 'agent'
          AND lower(u.name) = lower($1)
          AND NOT EXISTS (
            SELECT 1 FROM public.worker_agent_assignments w2 WHERE w2.user_id = u.id
          )`,
      [name],
    );
    return rows?.length === 1 ? rows[0].id : null;
  } catch {
    return null;
  }
}

async function stationAccountIds(workerId) {
  const ids = new Set();
  try {
    const pairs = await getFroStationPairs(workerId);
    const projects = [...getAllowedProjectsByStations(pairs)];
    if (projects.length > 0) {
      const { data } = await db
        .from('whatsapp_accounts')
        .select('id')
        .in('project', projects)
        .eq('is_active', true);
      for (const acct of data || []) {
        if (acct?.id) ids.add(acct.id);
      }
    }
  } catch { /* stations unavailable */ }

  try {
    const { data } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_account_id')
      .eq('fro_worker_id', workerId)
      .eq('is_active', true);
    for (const grant of data || []) {
      if (grant?.whatsapp_account_id) ids.add(grant.whatsapp_account_id);
    }
  } catch { /* grants unavailable */ }

  return [...ids].sort();
}

async function persistLink(workerId, userId) {
  const accountIds = await stationAccountIds(workerId);
  const account_id = accountIds[0] || null;
  const { error } = await db
    .from('worker_agent_assignments')
    .upsert({ worker_id: workerId, user_id: userId, account_id }, { onConflict: 'worker_id,user_id' });
  if (error) {
    console.warn('[froWhatsappIdentity] link upsert failed:', error.message);
  }
}

export async function resolveWhatsappAgentUserId(callerId, { create = false } = {}) {
  const id = String(callerId || '').trim();
  if (!id) return null;

  const { data: directUser } = await db.from('users').select('id').eq('id', id).maybeSingle();
  if (directUser?.id) return directUser.id;

  const { data: worker } = await db
    .from('workers')
    .select('id, name, email, login_id')
    .eq('id', id)
    .maybeSingle();
  if (!worker?.id) return null;

  const linked = await findLinkedAgent(worker.id);
  if (linked) return linked;

  let userId = await findEmailAgent(worker);
  if (!userId) userId = await findSameNameAgent(worker);

  if (!userId && create) {
    const email = String(worker.email || worker.login_id || '').trim() || `${worker.id}@fro.local`;
    const password_hash = await bcrypt.hash(randomUUID(), 10);
    const { data: inserted, error } = await db
      .from('users')
      .insert({
        name: String(worker.name || '').trim() || email,
        email,
        password_hash,
        role: 'agent',
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      const existing = await findEmailAgent(worker);
      userId = existing || null;
    } else {
      userId = inserted?.id || null;
    }
  }

  if (userId) await persistLink(worker.id, userId);
  return userId;
}

export async function ensureWhatsappAgentUserId(workerId) {
  return resolveWhatsappAgentUserId(workerId, { create: true });
}
