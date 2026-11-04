import db from './src/config/db.js';
import { getAccountById } from './src/models/whatsappAccountModel.js';
const account = await getAccountById(14);
const payload = { name: 'test_template_xyz', language: 'en', category: 'UTILITY', components: [{ type: 'BODY', text: 'Hello {{1}}' }] };
const res = await fetch(`https://graph.facebook.com/v20.0/${account.waba_id}/message_templates`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const result = await res.json();
console.log('status', res.status);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
