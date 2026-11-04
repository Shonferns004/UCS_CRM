import { createTemplateForAccount } from './src/services/templateSyncService.js';
const res = await createTemplateForAccount(14, { name: 'test_template_good', language: 'en', category: 'UTILITY', body: 'Hello {{1}}, this is a test message for our community members with enough length to satisfy Meta ratio requirements.' });
console.log('created:', JSON.stringify(res));
process.exit(0);
