import { listAccounts } from './src/models/whatsappAccountModel.js';
import { listTemplatesForAccountAll } from './src/services/templateSyncService.js';
const accs = await listAccounts();
console.log('accounts:', accs.map(a => ({ id: a.id, name: a.name, project: a.project, waba_id: a.waba_id })));
const ash = accs.find(a => /ashray/i.test(a.name));
if (ash) {
  try {
    const t = await listTemplatesForAccountAll(ash.id);
    console.log('ashray templates:', JSON.stringify(t));
  } catch (e) {
    console.error('err:', e.message);
  }
}
process.exit(0);
