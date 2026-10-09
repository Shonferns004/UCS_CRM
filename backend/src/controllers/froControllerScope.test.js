// Guards the mistake that actually shipped: a use of `agentCtx` inside a function
// that never destructured it. `node --check` cannot see an undefined identifier,
// and the call sat inside a try/catch that swallowed the ReferenceError and fell
// back to a legacy figure — so every FRO's idle read 0 on their own strip while
// the admin board, reading the ledger directly, showed the truth.
//
// This is a source-level scope check, because the failure mode is a scoping bug
// and there is no runtime assertion that catches it before deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'controllers', 'froController.js'), 'utf8');
const lines = src.split(/\r?\n/);

// Top-level function boundaries: `const`/`function` starting at column 0.
const boundaries = [];
lines.forEach((l, i) => {
  if (/^(export\s+)?(async\s+)?(const|function)\s/.test(l)) boundaries.push(i + 1);
});
const ownerOf = (ln) => {
  let best = 0;
  for (const b of boundaries) { if (b <= ln) best = b; else break; }
  return best;
};

const USES = ['agentCtx', 'dataCtx', 'humanCtx'];
const DECL = (name) => new RegExp(`const\\s*\\{[^}]*\\b${name}\\b`);

test('every destructured identity is declared in the function that uses it', () => {
  const undeclared = [];
  lines.forEach((l, i) => {
    const ln = i + 1;
    for (const name of USES) {
      const uses = new RegExp(`\\b${name}\\b`).test(l);
      const declares = DECL(name).test(l);
      if (!uses || declares) continue;
      const from = ownerOf(ln);
      const body = lines.slice(from - 1, ln).join('\n');
      if (!DECL(name).test(body)) {
        undeclared.push(`line ${ln}: ${name} (enclosing block starts line ${from})`);
      }
    }
  });
  assert.deepEqual(undeclared, [], `undeclared identity use(s):\n${undeclared.join('\n')}`);
});

test('the performance strip destructures agent, or an agent session cannot read it', () => {
  // The strip passes agentId into computeTimeStatus; without this destructuring it
  // threw for EVERY FRO, not just agents, which is what made idle read 0.
  const stripLine = lines.findIndex((l) => /computeTimeStatus\(\{[^}]*agentId/.test(l));
  assert.ok(stripLine > -1, 'strip must pass an agentId to computeTimeStatus');
  const from = ownerOf(stripLine + 1);
  const body = lines.slice(from - 1, stripLine + 1).join('\n');
  assert.match(body, DECL('agentCtx'), 'the strip function must destructure agent');
});