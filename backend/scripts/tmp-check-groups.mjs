import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';

const buf = readFileSync(new URL('../.env', import.meta.url));
const env = buf.toString('utf8');
const secret =
  env
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, ''))
    .find((l) => l.startsWith('JWT_SECRET='))
    ?.slice('JWT_SECRET='.length)
    .trim();
if (!secret) throw new Error('JWT_SECRET missing');

const BASE = 'http://127.0.0.1:5000/api/chat';

async function call(path, token) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

// Find an HR user uid via the directory as super admin.
const saToken = jwt.sign(
  { sub: 'login:24c09374-2180-4e07-9d50-2d9fda9f0151', id: '24c09374-2180-4e07-9d50-2d9fda9f0151', role: 'super_admin', name: 'SA' },
  secret,
  { expiresIn: '10m' }
);

const dir = await call('/directory', saToken);
console.log('directory status', dir.status);
const dirList = Array.isArray(dir.body) ? dir.body : dir.body?.people || [];
const hrUsers = dirList.filter((p) => String(p.role).toLowerCase() === 'hr');
console.log('HR people found:', JSON.stringify(hrUsers, null, 2));

const convos = await call('/conversations', saToken);
console.log('\nSA conversations:', convos.status);
for (const c of Array.isArray(convos.body) ? convos.body : []) {
  console.log(' ', c.id, c.kind, JSON.stringify(c.title), 'members=' + c.member_count, 'write_mode=' + c.write_mode);
}

// If we found an HR user, mint a token for them and list THEIR conversations.
for (const hr of hrUsers.slice(0, 2)) {
  const uid = String(hr.uid || '');
  let token;
  if (uid.startsWith('login:')) {
    token = jwt.sign({ sub: uid, id: uid.slice(6), role: hr.role, name: hr.name }, secret, { expiresIn: '10m' });
  } else {
    token = jwt.sign({ sub: uid, email: uid.slice(6), role: hr.role, name: hr.name }, secret, { expiresIn: '10m' });
  }
  const hrConvos = await call('/conversations', token);
  console.log(`\n${hr.name} (${uid}) conversations:`, hrConvos.status);
  if (hrConvos.status !== 200) {
    console.log('  body:', JSON.stringify(hrConvos.body));
    continue;
  }
  for (const c of hrConvos.body || []) {
    console.log(' ', c.id, c.kind, JSON.stringify(c.title), 'members=' + c.member_count, 'my_can_post=' + c.my_can_post);
  }
}
