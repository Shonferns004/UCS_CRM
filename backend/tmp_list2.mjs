import { listTemplatesForAccountAll } from './src/services/templateSyncService.js';
const t = await listTemplatesForAccountAll(14);
console.log('id14 templates:', JSON.stringify(t));
process.exit(0);
