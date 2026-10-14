// The privacy rule, pinned.
//
// These are the assertions that would have caught every leak the WhatsApp panel
// had, and they are written against the PURE helpers rather than the database so
// they run without a scratch RDS. The SQL layer is exercised by the same two
// decisions -- which contact ids are mine, and who owns the thread -- so testing
// the composition here is what keeps the query and the helper from drifting.
//
//   an agent may see and message only their allotted donors;
//   a thread another agent owns stays hidden even if the donor is mine;
//   the WhatsApp admin is unbounded.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isConversationOwnedBy,
  conversationOwnershipOr,
  normalizeDonorPhone,
  phoneVariantsFor,
} from './whatsappScope.js';

const ME = 'agent-uuid-1';
const OTHER = 'agent-uuid-2';
const MY_CONTACTS = ['contact-a', 'contact-b'];

// ── Phone matching ──────────────────────────────────────────────────────────

test('phoneVariantsFor expands both stored spellings of a donor number', () => {
  // donors.mobile_number is hand-authored off imports: 10 digits, 91+10, and
  // with separators. contacts.phone_normalized is always digits-only from the
  // webhook, so both sides have to be expanded before they can be compared.
  assert.deepEqual([...phoneVariantsFor(['9876543210'])].sort(), ['919876543210', '9876543210'].sort());
  assert.deepEqual([...phoneVariantsFor(['919876543210'])].sort(), ['919876543210', '9876543210'].sort());
  assert.deepEqual([...phoneVariantsFor(['+91 98765-43210'])].sort(), ['919876543210', '9876543210'].sort());
});

test('phoneVariantsFor ignores blanks instead of emitting an empty variant', () => {
  // An empty string in the variant set would match a contact row with an empty
  // phone_normalized and hand over its conversations.
  const out = phoneVariantsFor(['9876543210', null, '', '   ']);
  assert.equal(out.has(''), false);
  assert.equal(out.size, 2);
});

test('normalizeDonorPhone matches the service-side rule', () => {
  assert.equal(normalizeDonorPhone('9876543210'), '919876543210');
  assert.equal(normalizeDonorPhone('919876543210'), '919876543210');
  assert.equal(normalizeDonorPhone('+91 98765 43210'), '919876543210');
});

// ── The ownership rule ──────────────────────────────────────────────────────

test('an unassigned thread on my donor is mine to take', () => {
  assert.equal(isConversationOwnedBy({ contactId: 'contact-a', assignedAgentId: null }, MY_CONTACTS, ME), true);
  assert.equal(isConversationOwnedBy({ contactId: 'contact-a', assignedAgentId: '' }, MY_CONTACTS, ME), true);
});

test('a thread I already own is mine', () => {
  assert.equal(isConversationOwnedBy({ contactId: 'contact-a', assignedAgentId: ME }, MY_CONTACTS, ME), true);
});

test('a thread another agent owns is hidden even when the donor is mine', () => {
  // This is the handover case: two agents are allotted the same station, so my
  // donor pool overlaps theirs. The donor being mine does not outrank the
  // thread having an owner -- otherwise the claim on it is meaningless and one
  // agent can read another agent's conversation by replying to it.
  assert.equal(isConversationOwnedBy({ contactId: 'contact-a', assignedAgentId: OTHER }, MY_CONTACTS, ME), false);
});

test('a thread on a donor outside my allotment is never mine', () => {
  assert.equal(isConversationOwnedBy({ contactId: 'contact-z', assignedAgentId: null }, MY_CONTACTS, ME), false);
  // ...and not mine even when I somehow wrote my own id onto it. Otherwise an
  // id that leaked through any other write path would self-authorise.
  assert.equal(isConversationOwnedBy({ contactId: 'contact-z', assignedAgentId: ME }, MY_CONTACTS, ME), false);
});

test('ownership comparison is string-based, not reference-based', () => {
  // ids arrive as uuid strings from pg and as strings from a JWT claim. A
  // strict === would make ownership depend on whether the driver happened to
  // parse the column.
  assert.equal(isConversationOwnedBy({ contactId: 'contact-a', assignedAgentId: ME }, MY_CONTACTS, String(ME)), true);
});

// ── The SQL predicate ───────────────────────────────────────────────────────

test('an empty allotment produces a predicate that matches nothing', () => {
  // Emitting `contact_id.eq.` with no values would be a syntax error, and
  // omitting the filter entirely would silently mean "everything" -- the exact
  // failure this module exists to prevent.
  assert.equal(conversationOwnershipOr([], ME), '1=0');
  assert.equal(conversationOwnershipOr(null, ME), '1=0');
});

test('the predicate requires both the allotment and the owner', () => {
  const or = conversationOwnershipOr(MY_CONTACTS, ME);
  assert.match(or, /contact_id\.eq\.contact-a/);
  assert.match(or, /contact_id\.eq\.contact-b/);
  assert.match(or, new RegExp(`assigned_agent_id\\.eq\\.${ME}`));
  assert.match(or, /assigned_agent_id\.is\.null/);
  // The whole thing must be one and()-ed unit, otherwise the or() below it
  // would let the owner clause float free of the donor clause.
  assert.ok(or.startsWith('and('));
});

test('a caller with no id still gets the donor clause enforced', () => {
  const or = conversationOwnershipOr(MY_CONTACTS, null);
  assert.match(or, /contact_id\.eq\.contact-a/);
  assert.match(or, /assigned_agent_id\.is\.null/);
  assert.equal(or.includes('assigned_agent_id.eq.'), false);
});