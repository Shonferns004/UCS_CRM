// READ-ONLY PREVIEW. Sends nothing.
//
// Runs the real previewTestSend() for each configured organisation so the
// operator can see, BEFORE approving anything, which business number would send
// and under whose name. Only GETs are issued against Meta (the number's
// display_phone_number and its approved template list). No /messages POST.
//
// It also reports why the authorised test number is currently un-sendable.

import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = '127.0.0.1';
  u.port = process.env.DB_TUNNEL_LOCAL_PORT || '15432';
  process.env.DATABASE_URL = u.toString();
}

const { previewTestSend, findMatchingDonor } = await import('../src/services/whatsappTestSend.js');
const { getActiveAccounts } = await import('../src/models/whatsappAccountModel.js');

const TEST_PHONE = process.env.TEST_PHONE || '7054996353';

console.log('=== who is the test number, in our own records? ===');
const donor = await findMatchingDonor(TEST_PHONE);
console.log(donor
  ? { is_real_donor: true, id: donor.id, name: donor.name, project_supported: donor.project_supported }
  : { is_real_donor: false });

const accounts = await getActiveAccounts();
console.log(`\n=== preview for each configured organisation (recipient ${TEST_PHONE}) ===`);

for (const a of accounts) {
  for (const kind of (a.project === 'bsct' ? ['text', 'template'] : ['text'])) {
    try {
      const p = await previewTestSend({ project: a.project, phone: TEST_PHONE, kind });
      console.log(`\n--- ${p.organisation} (${a.project}) / ${kind} ---`);
      console.log(JSON.stringify({
        organisation: p.organisation,
        account_name: p.account_name,
        from_number: p.from_number,
        from_number_id: p.from_number_id,
        recipient: p.recipient,
        recipient_is_real_donor: p.recipient_is_real_donor,
        approved_templates: p.approved_templates.map(t => `${t.name} (${t.language})`),
        will_send: p.will_send,
      }, null, 2));
    } catch (e) {
      console.log(`\n--- ${a.project} / ${kind} --- REFUSED: ${e.message}`);
    }
  }
}

process.exit(0);