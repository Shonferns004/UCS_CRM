import { getAccountById } from './src/models/whatsappAccountModel.js';
const account = await getAccountById(14);
const payload = {
  name: 'test_img_header2',
  language: 'en',
  category: 'UTILITY',
  components: [
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'BODY', text: 'Hello {{1}}, here is your image update with enough length to satisfy ratio requirements.', example: { body_text: [['John']] } }
  ]
};
const res = await fetch(`https://graph.facebook.com/v23.0/${account.waba_id}/message_templates`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const result = await res.json();
console.log('status', res.status, JSON.stringify(result));
process.exit(0);
