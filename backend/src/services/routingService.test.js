// Routing-rule assignability, pinned.
//
// The failure this prevents is silent and total. conversations.assigned_agent_id
// is `uuid`; whatsapp_routing_rules.assignee_id is free text an operator types.
// A rule with a name in that field matched every inbound, threw
// `invalid input syntax for type uuid`, and the throw was swallowed -- so
// routing did nothing at all while the rule looked enabled and configured.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isAssignableOwnerId } from './routingService.js';

test('a real uuid is assignable', () => {
  assert.equal(isAssignableOwnerId('356742e0-1c2d-4a3f-8b9e-0d1e2f3a4b5c'), true);
  assert.equal(isAssignableOwnerId('356742E0-1C2D-4A3F-8B9E-0D1E2F3A4B5C'), true, 'uppercase is valid uuid text');
  assert.equal(isAssignableOwnerId('  356742e0-1c2d-4a3f-8b9e-0d1e2f3a4b5c  '), true, 'padded form still parses');
});

test('an agent NAME is not assignable', () => {
  // This is what the admin form actually produces when an operator types a
  // label instead of pasting the id.
  for (const name of ['Agent 1', 'anjana.vyas@ufs', 'UFS 12', 'Agent One']) {
    assert.equal(isAssignableOwnerId(name), false, name);
  }
});

test('near-miss uuid shapes are rejected', () => {
  // Postgres would reject each of these with the same error the swallowed
  // catch was hiding.
  for (const bad of [
    '356742e0-1c2d-4a3f-8b9e-0d1e2f3a4b5',      // one char short
    '356742e0-1c2d-4a3f-8b9e-0d1e2f3a4b5cd',    // one char long
    '356742e01c2d4a3f8b9e0d1e2f3a4b5c',          // no dashes
    '356742e0-1c2d-4a3f-8b9e-0d1e2f3a4b5g',      // non-hex
    '',
  ]) {
    assert.equal(isAssignableOwnerId(bad), false, JSON.stringify(bad));
  }
});

test('non-strings are rejected without throwing', () => {
  for (const junk of [null, undefined, 0, 123, {}, [], true]) {
    assert.equal(isAssignableOwnerId(junk), false, JSON.stringify(junk));
  }
});