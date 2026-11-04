import { createTemplateForAccount, listTemplatesForAccountAll } from './src/services/templateSyncService.js';
const res = await createTemplateForAccount(14, { name: 'test_template_xyz', language: 'en', category: 'UTILITY', body: 'Hello {{1}}' });
console.log('created:', JSON.stringify(res));
const t = await listTemplatesForAccountAll(14);
console.log('list includes test?', t.find(x => x.name === 'test_template_xyz'));
process.exit(0);
