import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';

const buf = readFileSync(new URL('../.env', import.meta.url));
const env = buf.toString('utf8');
const secret = env.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, '')).find((l) => l.startsWith('JWT_SECRET='))?.slice(11).trim();

const sa = jwt.sign({ sub: 'login:24c09374-2180-4e07-9d50-2d9fda9f0151', id: '24c09374-2180-4e07-9d50-2d9fda9f0151', role: 'super_admin', name: 'SA' }, secret, { expiresIn: '10m' });
const hr = jwt.sign({ sub: 'email:deepak.karkera46@gmail.com', email: 'deepak.karkera46@gmail.com', role: 'hr', name: 'Deepak' }, secret, { expiresIn: '10m' });

async function call(path, token) {
  const r = await fetch('http://127.0.0.1:5000/api/chat' + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const saConvos = await call('/conversations', sa);
console.log('SA conversations:', saConvos.status);
for (const c of saConvos.body || []) console.log(' ', c.id, c.kind, JSON.stringify(c.title), 'members=' + c.member_count);

const hrConvos = await call('/conversations', hr);
console.log('\nDeepak conversations:', hrConvos.status);
for (const c of hrConvos.body || []) console.log(' ', c.id, c.kind, JSON.stringify(c.title), 'members=' + c.member_count);

// Test image upload
const form = new FormData();
form.append('body', 'test image');
form.append('isNotice', 'true');
form.append('files', new Blob([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], { type: 'image/png' }), 'test.png');
const up = await fetch('http://127.0.0.1:5000/api/chat/conversations/12/messages', {
  method: 'POST',
  headers: { Authorization: `Bearer ${sa}` },
  body: form,
});
const upBody = await up.json().catch(() => null);
console.log('\nImage upload:', up.status, JSON.stringify(upBody).slice(0, 250));
