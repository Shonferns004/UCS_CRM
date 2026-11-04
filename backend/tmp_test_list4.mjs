import { listMyAccounts } from './src/controllers/froWhatsAppController.js';
for (const id of ['6158d741-e26d-4a6e-9645-62f8405f564e','03adaed2-1af1-45ad-b117-b0dcd5586c29']) {
  const mockReq = { user: { id, role: 'fro' } };
  const mockRes = { json: (d) => console.log(id, '->', d.length, d.map(x=>x.id).join(',')), status: (c)=>({json:(d)=>console.log('ERR',c,d)}) };
  await listMyAccounts(mockReq, mockRes);
}
process.exit(0);
