import db from '../config/db.js';

// whatsapp_accounts was originally created by hand on some databases, not from
// the migration history, so the template slots the account model writes are not
// guaranteed to exist. Writing one of them (create/update/auto-seed) then fails
// with 'column "template_name" of relation "whatsapp_accounts" does not exist'.
// The HR slots already self-heal through migration 159; this covers the rest so
// every database converges on boot. Reruns safely via ADD COLUMN IF NOT EXISTS.
export async function ensureWhatsAppAccountSchema() {
  const columns = [
    'template_name TEXT',
    'template_language TEXT DEFAULT \'en\'',
    'hr_letter_template TEXT',
    'hr_warning_template TEXT',
  ];
  for (const column of columns) {
    await db._pool.query(`ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS ${column}`);
  }
}

export default ensureWhatsAppAccountSchema;
