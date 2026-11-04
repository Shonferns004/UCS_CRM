import { listTemplatesForAccountAll } from './src/services/templateSyncService.js';
const t = await listTemplatesForAccountAll(14);
console.log('count', t.length);
console.log(t.find(x => x.name === 'test_template_good'));
process.exit(0);
