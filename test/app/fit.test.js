import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitScore, rankByFit, FIT_OFF_TARGET_CAP } from '../../server/evidence.js';

const card = (relevance, extra = {}) => ({
  metrics: { relevance, issueAreaHit: relevance > 0, communityOverlap: extra.community ?? 1, godNodesTouched: extra.hubs ?? [] },
  coverage: { testsChanged: extra.tests ? ['tests/x.test.js'] : [] },
});

test('fit score is a weighted sum of measured facts, not just 0 or 1', () => {
  assert.equal(fitScore(card(1, { tests: true })).score, 1);
  assert.equal(fitScore(card(0.5)).score, 0.55);                                         // partial fix, no tests
  assert.equal(fitScore(card(0.67, { community: 0.5, tests: true, hubs: ['login'] })).score, 0.63);
});

test('fit score is null when relevance is unknown, and capped when off target', () => {
  assert.equal(fitScore(card(null)), null);
  const off = fitScore({ metrics: { relevance: 0.1, issueAreaHit: false, communityOverlap: 1, godNodesTouched: [] }, coverage: { testsChanged: ['t'] } });
  assert.equal(off.score, FIT_OFF_TARGET_CAP);
  assert.equal(off.capped, true);
});

test('rankByFit orders best fit first and puts unscored PRs last', () => {
  const ranked = rankByFit([
    { number: 3, fit: { score: 0.2 }, relevance: 0.3 },
    { number: 4, fit: null, relevance: null },
    { number: 2, fit: { score: 0.85 }, relevance: 1 },
  ]);
  assert.deepEqual(ranked.map((r) => [r.number, r.rank]), [[2, 1], [3, 2], [4, 3]]);
});
