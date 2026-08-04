import supabase from './src/config/supabase.js';

const results = {};
const ok = (name, cond, extra) => { results[name] = cond ? 'OK' : 'FAIL'; if (!cond) console.error('  ->', name, JSON.stringify(extra)); };

try {
  const { data, error } = await supabase.from('workers').select('*').limit(2);
  ok('basic-select', !error && Array.isArray(data) && data.length === 2 && data[0].id, { error });

  const { count, error: e2 } = await supabase.from('workers').select('*', { count: 'exact', head: true });
  ok('head-count', !e2 && typeof count === 'number' && count > 0, { count, error: e2 });

  const { data: d3, error: e3 } = await supabase.from('fro_assignments')
    .select('*, donor_profiles!inner(id, name, mobile_number, city)').limit(2);
  ok('embed-inner', !e3 && Array.isArray(d3) && d3.every(r => r.donor_profiles && r.donor_profiles.name), { error: e3 });

  const { data: w0, error: ew } = await supabase.from('workers').select('id').limit(1);
  const workerId = w0?.[0]?.id;
  ok('worker-fetch', !ew && workerId, { error: ew });

  if (workerId) {
    const { data: d4, error: e4 } = await supabase.from('fro_donor_logs')
      .select('id, amount_collected, fro_assignments!inner(fro_worker_id, donor_profiles!inner(id, name, mobile_number, city))')
      .eq('fro_assignments.fro_worker_id', workerId)
      .order('created_at', { ascending: false })
      .limit(3);
    ok('nested-embed-qualified-filter', !e4 && Array.isArray(d4), { error: e4, sample: d4?.[0] });
  }

  const { data: d5, error: e5 } = await supabase.from('fro_donor_logs')
    .select('id')
    .or('action.eq.donation,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified)')
    .limit(3);
  ok('or-and-groups', !e5 && Array.isArray(d5), { error: e5 });

  const { data: d6, error: e6 } = await supabase.from('users').select('role, count', { count: 'exact', head: false });
  ok('grouped-count', !e6 && Array.isArray(d6) && d6.length >= 1 && typeof d6[0].count === 'number', { error: e6, sample: d6?.[0] });

  const { data: d6b, error: e6b } = await supabase.from('fro_assignments').select('count').limit(1);
  ok('select-count', !e6b && Array.isArray(d6b) && typeof d6b[0]?.count === 'number', { error: e6b, sample: d6b?.[0] });

  const { data: d7, error: e7 } = await supabase.from('bank_audit_entries')
    .select('id, payment_id, bank_audit_sources(name), donor_profiles!donor_id(name, station)')
    .limit(2);
  ok('column-hint-embed', !e7 && Array.isArray(d7), { error: e7, sample: d7?.[0] });

  const { data: d8, error: e8 } = await supabase.from('conversations')
    .select('*, contact:contacts!inner(id, phone_normalized, project)').limit(2);
  ok('alias-embed', !e8 && Array.isArray(d8) && d8.every(r => r.contact !== undefined), { error: e8, sample: d8?.[0] });

  const { data: d9, error: e9 } = await supabase.from('developer_tickets').select('*').limit(1);
  ok('unknown-table-errors-gracefully', !!e9 && e9.code === '42P01', { error: e9 });

  const { data: d10, error: e10 } = await supabase.from('workers').select('*').eq('id', null);
  ok('eq-null-match-nothing', !e10 && Array.isArray(d10) && d10.length === 0, { error: e10, data: d10 });

  const { data: d11, error: e11 } = await supabase.from('agent_phone_assignments')
    .select('user_id, account_id, whatsapp_accounts!inner(id, name, project, phone_number_id)').limit(1)
    .catch(() => ({ data: null, error: { message: 'caught', code: 'X' } }));
  ok('no-fk-heuristic-embed', !e11 && Array.isArray(d11) && d11.every(r => r.whatsapp_accounts !== undefined), { error: e11, sample: d11?.[0] });

  const { data: d12, error: e12 } = await supabase.from('generated_letters')
    .select('*, worker:worker_id(name, email), template:template_id(title, category)').limit(2);
  ok('alias-column-rel-embed', !e12 && Array.isArray(d12), { error: e12, sample: d12?.[0] });

  const { data: u, error: eu } = await supabase.from('users').select('id').limit(1);
  if (!eu && u?.[0]) {
    const { data: d13, error: e13 } = await supabase.rpc('get_whatsapp_user', { p_id: u[0].id });
    ok('rpc-get_whatsapp_user', !e13 && d13 && d13.id === u[0].id, { error: e13, data: d13 });
  }

  const { data: ngo, error: engo } = await supabase.from('ngos').select('id').limit(1);
  if (!engo && ngo?.[0]) {
    const { data: d14, error: e14 } = await supabase.rpc('get_station_disposition_stats', {
      p_ngo_id: ngo[0].id, p_from: null, p_to: null,
    });
    ok('rpc-table-return', !e14 && Array.isArray(d14), { error: e14, sample: d14?.[0] });
  }

  const { data: d15, error: e15 } = await supabase.from('users')
    .select('id, email').ilike('email', '%@%').limit(2);
  ok('ilike-filter', !e15 && Array.isArray(d15), { error: e15 });

  const { data: d16, error: e16 } = await supabase.from('fro_assignments')
    .select('station, id', { count: 'exact', head: false })
    .not('status', 'eq', 'reassigned')
    .limit(5);
  ok('count-exact-not', !e16 && Array.isArray(d16) && typeof d16[0]?.station === 'string', { error: e16, sample: d16?.[0] });

  const { data: d17, error: e17 } = await supabase.from('conversations')
    .select('*, phone_number:whatsapp_phone_numbers(*)').limit(2);
  ok('whatsapp-alias-embed', !e17 && Array.isArray(d17) && d17.every(r => r.phone_number !== undefined), { error: e17, sample: d17?.[0] });

  await supabase.from('settings').upsert({ key: 'smoke_test_key', value: 'hello' }, { onConflict: 'key' });
  const { data: d18, error: e18 } = await supabase.from('settings').select('*').eq('key', 'smoke_test_key').maybeSingle();
  ok('upsert+select', !e18 && d18?.value === 'hello', { error: e18, data: d18 });
  await supabase.from('settings').delete().eq('key', 'smoke_test_key');

} catch (err) {
  console.error('SMOKE TEST CRASHED:', err);
  results.crash = 'FAIL';
}

for (const [k, v] of Object.entries(results)) console.log(`${v === 'OK' ? '[PASS]' : v === 'SKIP' ? '[SKIP]' : '[FAIL]'} ${k}`);
const fails = Object.values(results).filter((v) => v === 'FAIL').length;
console.log(`\n${Object.keys(results).length - fails}/${Object.keys(results).length} passed`);
process.exit(fails ? 1 : 0);
