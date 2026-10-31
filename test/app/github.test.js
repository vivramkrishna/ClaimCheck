import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedIssueFromBody } from '../../server/github.js';

test('linkedIssueFromBody recognizes closing keywords case-insensitively', () => {
  const cases = [
    ['Fixes #1', 1],
    ['fixed #22', 22],
    ['FIX #9', 9],
    ['Closes #31', 31],
    ['closed #4', 4],
    ['Resolve #88', 88],
    ['RESOLVED #101', 101]
  ];
  for (const [body, expected] of cases) assert.equal(linkedIssueFromBody(body), expected, body);
});

test('linkedIssueFromBody does not treat a bare issue mention as closing', () => {
  assert.equal(linkedIssueFromBody('Related to #1, but this is exploratory.'), null);
  assert.equal(linkedIssueFromBody('prefixes #7'), null);
  assert.equal(linkedIssueFromBody(''), null);
  assert.equal(linkedIssueFromBody(null), null);
});
