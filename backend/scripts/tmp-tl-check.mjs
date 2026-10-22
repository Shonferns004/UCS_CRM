import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: 'C:/Users/ADMIN/Desktop/Projects/UCS_CRM/backend/.env' });

const USER_ID = '136df656-b838-4a33-99a0-0081cd51a343';
const token = jwt.sign(
  { id: USER_ID, user_id: USER_ID, role: 'admin', name: 'perf-check' },
  process.env.JWT_SECRET,
  { expiresIn: '2h' }
);

const BASE = 'http://localhost:5000/api/ngo-admin/tl-dashboard';

async function fetchRange(label, params) {
  const qs = new URLSearchParams({ fresh: '1', ...params });
  const res = await fetch(`${BASE}?${qs}`, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    console.log(`\n### ${label} -> HTTP ${res.status}`);
    console.log(text.slice(0, 500));
    return null;
  }
  const data = JSON.parse(text);
  console.log(`\n===== ${label} =====`);
  console.log('performance_targets:', JSON.stringify(data.performance_targets));
  console.log('range:', JSON.stringify(data.range));
  const rows = data.performance || [];
  console.log('rows:', rows.length);
  for (const p of rows.slice(0, 4)) {
    console.log(`\n-- ${p.fro_name} (${p.fro_id})`);
    console.log('   period_collection:', p.period_collection, '| period_target:', p.period_target);
    console.log('   monthly:', p.collected_amount, '/', p.monthly_target);
    console.log('   connected_calls_range:', p.connected_calls_range, '| ld:', p.connectedStatuses_range?.lead_done);
    console.log('   today_idle_seconds:', p.today_idle_seconds);
    console.log('   performance_score:', JSON.stringify(p.performance_score));
  }
  // summary of all rows
  const scored = rows.filter(r => typeof r.performance_score?.score === 'number');
  const nulls = rows.filter(r => r.performance_score?.score === null || r.performance_score?.score === undefined);
  console.log(`\nSUMMARY ${label}: total=${rows.length} scored=${scored.length} unscored=${nulls.length}`);
  console.log('  scores:', scored.map(r => `${r.fro_name}=${r.performance_score.score}`).join(', '));
  return data;
}

const args = process.argv.slice(2);
const mode = args[0] || 'today';

if (mode === 'today') {
  await fetchRange('TODAY', {});
} else if (mode === 'periods') {
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const t = new Date().toISOString().slice(0, 10);
  await fetchRange('YESTERDAY', { from: y, to: y });
  await fetchRange('THIS WEEK', { from: y, to: t });
  const mStart = new Date(); mStart.setDate(1);
  await fetchRange('THIS MONTH', { from: mStart.toISOString().slice(0, 10), to: t });
  await fetchRange('CUSTOM 3d', { from: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), to: t });
} else if (mode === 'all') {
  await fetchRange('TODAY', {});
  await fetchRange('YESTERDAY', {});
}
