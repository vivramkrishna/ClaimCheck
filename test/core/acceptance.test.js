// HLD §3 acceptance: A -> review_first, B -> likely_off_target, C -> possible duplicate of A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyze, computeDeterministic, PROMPT_VERSION } from '../../server/analyze.js';
import { CardSchema } from '../../server/schema.js';
import { loadInput, fakeClient, noSleep, gemmaAnswerB } from './helpers.js';

test('PR A (genuine) -> review_first, touches createSession, session test listed', () => {
  const d = computeDeterministic(loadInput('A'));
  assert.equal(d.rule.priority, 'review_first');
  assert.ok(d.diff.symbolIds.includes('sessionstore_createsession'));
  assert.ok(d.metrics.issueAreaHit);
  assert.ok(d.metrics.relevance >= 0.5);
  assert.ok(d.coverage.testsChanged.includes('tests/session.test.js'));
  assert.ok(d.testsToRun.includes('tests/session.test.js'));
});

test('PR B (off-target) -> likely_off_target, dispatch god node, retryDispatch unmapped', () => {
  const d = computeDeterministic(loadInput('B'));
  assert.equal(d.rule.priority, 'likely_off_target');
  assert.equal(d.metrics.issueAreaHit, false);
  assert.equal(d.metrics.issueAreaNodes.length, 0);
  assert.equal(d.metrics.relevance, 0);
  assert.ok(d.metrics.godNodesTouched.includes('router_dispatch'));
  assert.ok(d.coverage.unmappedAdditions.includes('retryDispatch'));
  assert.deepEqual(d.overlaps, []);
});

test('PR C -> possible_duplicate of A (same issue, Jaccard >= 0.3), and A sees C', () => {
  const dc = computeDeterministic(loadInput('C'));
  const dup = dc.overlaps.find((o) => o.pr === 2);
  assert.equal(dup.kind, 'possible_duplicate');
  assert.ok(dup.jaccard >= 0.3);
  assert.ok(dup.shared.includes('sessionstore_createsession'));
  assert.ok(dc.coverage.unmappedAdditions.includes('toMs'));
  const da = computeDeterministic(loadInput('A'));
  assert.equal(da.overlaps.find((o) => o.pr === 4)?.kind, 'possible_duplicate');
});

test('full cards for A/B/C validate against CardSchema in both modes', async () => {
  for (const k of ['A', 'B', 'C']) {
    for (const mode of ['graph', 'diffonly']) {
      const card = await analyze(loadInput(k, mode), { noLlm: true });
      const r = CardSchema.safeParse(card);
      assert.ok(r.success, `${k}/${mode}: ${JSON.stringify(r.error?.issues?.slice(0, 3))}`);
      assert.equal(card.provenance.mode, 'live');
      assert.equal(card.provenance.promptVersion, PROMPT_VERSION);
    }
  }
});

test('committed sample card.B.generated.json matches the current schema', () => {
  const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/card.B.generated.json', import.meta.url), 'utf8'));
  assert.ok(CardSchema.safeParse(sample).success);
  assert.equal(sample.finalPriority, 'likely_off_target');
});

// Regenerate with: WRITE_SAMPLE=1 node --test test/core/acceptance.test.js
test('card sample generation (mocked Gemma)', { skip: !process.env.WRITE_SAMPLE }, async () => {
  const card = await analyze(loadInput('B'), { client: fakeClient(gemmaAnswerB()), sleep: noSleep });
  fs.writeFileSync(new URL('./fixtures/card.B.generated.json', import.meta.url), `${JSON.stringify({ ...card, _synthetic: true }, null, 2)}\n`);
});
