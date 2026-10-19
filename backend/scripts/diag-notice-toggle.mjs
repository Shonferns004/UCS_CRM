process.env.PGHOST='127.0.0.1';
process.env.PGPORT='15432';
process.env.PGUSER='ucs_admin';
process.env.PGPASSWORD='ucscompany123';
process.env.PGDATABASE='postgres';
process.env.PGSSLMODE='require';
process.env.DATABASE_URL='';
process.env.DATABASE_SSL='false';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
const buf = readFileSync(new URL('../.env', import.meta.url));
const env = buf.toString('utf8');
const secret = env.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, '')).find((l) => l.startsWith('JWT_SECRET='))?.slice(11).trim();
const adminEmail = (env.split(/\r?\n/).find(l=>l.startsWith('ADMIN_EMAIL='))||'').slice('ADMIN_EMAIL='.length).trim();

async function call(path, token, method='GET', body=null) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  const r = await fetch('http://127.0.0.1:5000/api/chat' + path, opts);
  const t = await r.text(); let j; try{j=JSON.parse(t);}catch{j=t;} return {status:r.status,body:j};
}
const saToken = jwt.sign({ id: 0, email: adminEmail, role: 'super_admin', name: 'SA' }, secret, { expiresIn: '10m' });
const dir = await call('/directory', saToken);
const f = (dir.body||[]).find(d=>d.role==='fro');
const created = await call('/conversations/group', saToken, 'POST', {
  title: 'NoticeToggleTest',
  notices_enabled: false,
  members: [f].map(x=>({uid:x.uid,role:x.role,name:x.name,email:x.email,subject_id:x.id,can_post:true})),
});
console.log('created notices_enabled:', created.body?.notices_enabled);
if (created.body?.id) {
  const upd = await call('/conversations/'+created.body.id+'/settings', saToken, 'PATCH', { notices_enabled: true });
  console.log('after patch notices_enabled:', upd.body?.notices_enabled);
  // set back false
  const upd2 = await call('/conversations/'+created.body.id+'/settings', saToken, 'PATCH', { notices_enabled: false });
  console.log('after patch2 notices_enabled:', upd2.body?.notices_enabled);
  await call('/conversations/'+created.body.id, saToken, 'DELETE');
}
process.exit(0);