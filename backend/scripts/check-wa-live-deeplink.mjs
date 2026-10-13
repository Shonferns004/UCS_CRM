// End-to-end check of the reported bug against the live database: a donor
// record that canonicalises to `bsct`, opened by an FRO whose only assigned
// WhatsApp account is `bsct2` (Ankita Chavan). Read-only.
//
// Run from backend/:  node scripts/check-wa-live-deeplink.mjs
//
// db.js prefers DATABASE_URL over PGHOST/PGPORT when both are set, so when
// DATABASE_URL exists it points straight at the RDS address and this script has
// to redirect it at the local tunnel (127.0.0.1:15432) or it gets ECONNRESET on
// a network that cannot reach the RDS IP directly. Only the host and port are
// rewritten; credentials are untouched.
const tunneled = new URL(process.env.DATABASE_URL)
if (process.env.DATABASE_URL && !['127.0.0.1', 'localhost'].includes(tunneled.hostname)) {
  process.env.DATABASE_URL = `postgresql://${tunneled.username}:${tunneled.password}@127.0.0.1:15432${tunneled.pathname}`
}

import assert from 'node:assert/strict'
import { default as db } from '../src/config/db.js'
import { getWhatsAppChatUrl, resolveWhatsAppProject, getWhatsAppProject } from '../../client/src/panels/fro/utils/whatsappProject.js'

const store = {}
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v },
  removeItem: (k) => { delete store[k] },
}

const ANKITA = '81d0eab8-edf2-44d9-a286-5e1da61502d6'

const heldFor = async (workerId) => {
  const { rows } = await db._pool.query(`
    select a.project from fro_whatsapp_assignments f
    join whatsapp_accounts a on a.id = f.whatsapp_account_id
    where f.fro_worker_id = $1 and f.is_active = true and a.is_active = true`, [workerId])
  return rows.map(r => r.project)
}

// A real Being Sevak donor: either project_supported says bsct/bsct2, or the
// assignment is filed under the BSCT NGO. Either is the canonical 'bsct'.
const donor = await db._pool.query(`
  select d.id, d.mobile_number, d.project_supported, n.name as ngo_name
  from fro_assignments fa
  join donor_profiles d on d.id = fa.donor_id
  left join ngos n on n.id = fa.ngo_id
  where d.mobile_number is not null and d.mobile_number <> ''
    and (lower(coalesce(d.project_supported,'')) like 'bsct%' or n.name = 'BSCT')
  limit 1`)
const d = donor.rows[0]

console.log('donor:', JSON.stringify(d))

const held = await heldFor(ANKITA)
store.wa_agents = JSON.stringify(held.map(project => ({ project })))

console.log('ankita holds:', JSON.stringify(held))
console.log('canonical donor project:', JSON.stringify(getWhatsAppProject(d)))

const url = getWhatsAppChatUrl({ ...d, donor_mobile: d.mobile_number })
console.log('deep link:', url)

const resolved = new URL(`http://x${url}`).searchParams.get('project')
console.log('resolved project:', resolved)

// The bug: a bsct canonical value with no bsct session used to fail the gate.
assert.equal(resolved, 'bsct2', 'should bridge to the account she actually holds')
assert.ok(held.includes(resolved), 'resolved project must be one she is assigned to')

// The mirror case: the FRO still on account 4 must resolve to bsct, not bsct2.
const bsctHeld = await heldFor('38a51614-7c40-4b99-957e-165472ea086e')
store.wa_agents = JSON.stringify(bsctHeld.map(project => ({ project })))
const bsctUrl = getWhatsAppChatUrl({ ...d, donor_mobile: d.mobile_number })
const bsctResolved = new URL(`http://x${bsctUrl}`).searchParams.get('project')
console.log('account-4 FRO deep link:', bsctUrl, '->', bsctResolved)
assert.equal(bsctResolved, 'bsct', 'should stay on bsct for the FRO who holds it')
assert.ok(bsctHeld.includes(bsctResolved), 'resolved project must be one they are assigned to')

// An agent with no WhatsApp account must not be pinned to anything.
store.wa_agents = '[]'
const noAcctUrl = getWhatsAppChatUrl({ ...d, donor_mobile: d.mobile_number })
console.log('no-assignment deep link:', noAcctUrl)
assert.equal(new URL(`http://x${noAcctUrl}`).searchParams.get('project'), null)

console.log('\nAll live-data checks passed')
await db._pool.end()