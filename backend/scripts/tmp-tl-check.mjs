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
    console.log(text.slice(0, 800));
    return null;
  }
  const data = JSON.parse(text);
  console.log(`\n===== ${label} =====`);
  console.log('performance_targets:', JSON.stringify(data.performance_targets));
  const rows = data.performance || [];
  const scored = rows.filter(r => typeof r.performance_score?.score === 'number');
  const unscored = rows.filter(r => r.performance_score?.score === null || r.performance_score?.score === undefined);
  console.log(`rows=${rows.length} scored=${scored.length} unscored=${unscored.length}`);
  const withIdle = rows.filter(r => (r.performance_score?.components || []).some(c => c.key === 'idle' && c.available));
  console.log(`rows with an AVAILABLE idle component: ${withIdle.length}`);
  const top = [...scored].sort((a, b) => b.performance_score.score - a.performance_score.score);
  console.log('top 3:', top.slice(0, 3).map(r => `${r.fro_name}=${r.performance_score.score}`).join(', '));
  console.log('bottom 3:', top.slice(-3).map(r => `${r.fro_name}=${r.performance_score.score}`).join(', '));
  if (unscored.length) console.log('unscored names:', unscored.slice(0, 6).map(r => r.fro_name).join(', '));
  // One full row for inspection
  const sample = withIdle[0] || scored[0];
  if (sample) {
    console.log(`\nSAMPLE ${sample.fro_name}:`);
    console.log('  ', JSON.stringify(sample.performance_score, null, 2).replace(/\n/g, '\n   '));
    console.log('   row period_collection:', sample.period_collection, 'period_target:', sample.period_target);
    console.log('   row connected_calls_range:', sample.connected_calls_range, 'ld:', sample.connectedStatuses_range?.lead_done);
  }
  return data;
}

const istDay = (d) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const now = new Date();

const cases = {
  today: [{ label: 'TODAY (client-style)', params: { from: istDay(now), to: istDay(now) } }],
  ledger: [{ label: '2026-10-03 (day with ledger rows)', params: { from: '2026-10-03', to: '2026-10-03' } }],
  week: [{ label: 'WEEK containing 2026-10-03', params: { from: '2026-09-27', to: '2026-10-03' } }],
  month: [{ label: 'MONTH 2026-09', params: { from: '2026-09-01', to: '2026-09-30' } }],
  custom: [{ label: 'CUSTOM 2026-08-14..2026-08-20', params: { from: '2026-08-14', to: '2026-08-20' } }],
  sunday: [{ label: 'SUNDAY 2026-10-04', params: { from: '2026-10-04', to: '2026-10-04' } }],
  legacy: [{ label: 'LEGACY default (no from/to)', params: {} }],
};

const which = process.argv[2] || 'all';
const list = which === 'all' ? Object.values(cases).flat() : cases[which];
for (const c of list) await fetchRange(c.label, c.params);
