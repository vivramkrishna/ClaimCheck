import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey } from '../../server/cache.js';

function input() {
  return {
    pr: { head: { sha: 'head-a' } },
    issue: { updated_at: '2026-10-31T00:00:00Z' },
    openPRs: [
      { number: 3, headSha: 'head-c' },
      { number: 2, headSha: 'head-b' }
    ],
    manifest: { graphCommit: 'graph-a' },
    mode: 'graph'
  };
}

const options = { promptVersion: 'prompt-a', model: 'model-a' };

test('cache key is stable when open PR ordering changes', () => {
  const first = input();
  const second = input();
  second.openPRs.reverse();
  assert.equal(cacheKey(first, options), cacheKey(second, options));
  assert.match(cacheKey(first, options), /^[a-f0-9]{40}$/);
});

test('cache key changes when any source component changes', () => {
  const base = cacheKey(input(), options);
  const mutations = [
    (copy) => { copy.pr.head.sha = 'head-z'; },
    (copy) => { copy.issue.updated_at = '2026-11-01T00:00:00Z'; },
    (copy) => { copy.openPRs[0].headSha = 'head-z'; },
    (copy) => { copy.manifest.graphCommit = 'graph-z'; },
    (copy) => { copy.mode = 'diffonly'; }
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(input());
    mutate(copy);
    assert.notEqual(cacheKey(copy, options), base);
  }
  assert.notEqual(cacheKey(input(), { ...options, promptVersion: 'prompt-z' }), base);
  assert.notEqual(cacheKey(input(), { ...options, model: 'model-z' }), base);
});
