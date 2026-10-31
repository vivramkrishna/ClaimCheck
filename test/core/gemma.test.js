import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJson, validateAssessment, filterCitations, runAssessment, callModel, _resetGemmaState, SYSTEM_PROMPT,
} from '../../server/gemma.js';
import { analyze } from '../../server/analyze.js';
import { CardSchema } from '../../server/schema.js';
import { loadInput, fakeClient, noSleep, gemmaAnswerB } from './helpers.js';

beforeEach(() => _resetGemmaState());

test('extractJson: fenced, prose-wrapped, trailing commas, junk', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here it is: {"a":{"b":2}} hope this helps'), { a: { b: 2 } });
  assert.deepEqual(extractJson('{"a":[1,2,],}'), { a: [1, 2] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(undefined), null);
});

test('validateAssessment coerces near-misses and reports zod errors', () => {
  const ok = validateAssessment(JSON.parse(gemmaAnswerB({ fenced: false, priority: 'Likely Off Target' })));
  assert.ok(ok.ok);
  assert.equal(ok.value.suggested_priority, 'likely_off_target');
  const bad = validateAssessment({ claim_summary: 'x' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /reality_summary|findings/);
});

test('citation filter drops uncited / unknown-id findings and invented existing tests', () => {
  const a = validateAssessment(JSON.parse(gemmaAnswerB({ fenced: false }))).value;
  const ids = Array.from({ length: 15 }, (_, i) => `E${i + 1}`);
  const { assessment, dropped } = filterCitations(a, ids, ['tests/router.test.js', 'tests/auth.test.js']);
  assert.equal(assessment.findings.length, 3);
  assert.deepEqual(assessment.tests.map((t) => t.name), ['tests/router.test.js', 'session stays valid 5 s after login']);
  assert.equal(dropped, 3);
  assert.equal(filterCitations({ ...a, findings: [a.findings[3]] }, ids).assessment, null);
});

test('runAssessment: one repair round, then gives up', async () => {
  const good = gemmaAnswerB();
  const c1 = fakeClient('garbage', good);
  const r1 = await runAssessment({ client: c1, contents: '{}', sleep: noSleep });
  assert.ok(r1.assessment);
  assert.equal(r1.attempts, 2);
  assert.match(c1.calls[1].contents, /failed validation/);
  const c2 = fakeClient('garbage', 'still garbage');
  const r2 = await runAssessment({ client: c2, contents: '{}', sleep: noSleep });
  assert.equal(r2.assessment, null);
  assert.equal(c2.calls.length, 2);
});

test('callModel retries once on 429 and falls back when systemInstruction is rejected', async () => {
  const e429 = Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 });
  const c = fakeClient(e429, 'ok');
  assert.equal(await callModel(c, 'x', { sleep: noSleep }), 'ok');
  assert.equal(c.calls.length, 2);

  const e400 = Object.assign(new Error('400 Developer instruction is not enabled for this model'), { status: 400 });
  const c2 = fakeClient(e400, 'ok2');
  assert.equal(await callModel(c2, 'payload', { sleep: noSleep }), 'ok2');
  assert.equal(c2.calls[1].system, null);
  assert.ok(c2.calls[1].contents.startsWith(SYSTEM_PROMPT));
});

test('priority reconciliation: model disagreement -> needs_context with both reasons; model never upgrades', async () => {
  const card = await analyze(loadInput('B'), { client: fakeClient(gemmaAnswerB({ priority: 'review_first' })), sleep: noSleep });
  assert.equal(card.rulePriority, 'likely_off_target');
  assert.equal(card.assessment.suggested_priority, 'review_first');
  assert.equal(card.finalPriority, 'needs_context');
  assert.match(card.priorityReason, /Rule says likely_off_target/);
  assert.match(card.priorityReason, /model suggested review_first/i);

  const agree = await analyze(loadInput('B'), { client: fakeClient(gemmaAnswerB()), sleep: noSleep });
  assert.equal(agree.finalPriority, 'likely_off_target');
  assert.equal(agree.provenance.assessmentSource, 'model');
});

test('fallback card passes CardSchema when Gemma fails, returns junk, or no key', async () => {
  const boom = await analyze(loadInput('B'), { client: fakeClient(new Error('network down')), sleep: noSleep });
  const junk = await analyze(loadInput('B'), { client: fakeClient('nope'), sleep: noSleep });
  const nollm = await analyze(loadInput('A'), { noLlm: true });
  for (const card of [boom, junk, nollm]) {
    assert.ok(CardSchema.safeParse(card).success);
    assert.equal(card.provenance.assessmentSource, 'fallback');
    assert.ok(card.assessment.findings.length > 0);
    assert.ok(card.assessment.findings.every((f) => f.evidence.length && f.evidence.every((id) => card.evidence.some((e) => e.id === id))));
    assert.ok(card.assessment.limitations.some((l) => /deterministic evidence only/.test(l)));
  }
  assert.equal(boom.finalPriority, 'likely_off_target');
  assert.equal(nollm.finalPriority, 'review_first');
  // Even a broken input yields a valid card instead of a throw.
  const broken = await analyze({ mode: 'graph', pr: { number: 7, title: 't' }, files: 'nope', graph: null }, { noLlm: true });
  assert.ok(CardSchema.safeParse(broken).success);
});

test('confidence is capped by coverage (file precision / stale graph -> low)', async () => {
  const input = loadInput('B');
  input.pr.base.sha = '0000000000000000000000000000000000000000';
  const card = await analyze(input, { client: fakeClient(gemmaAnswerB()), sleep: noSleep });
  assert.equal(card.coverage.graphStale, true);
  assert.equal(card.assessment.confidence, 'low');
});

test('diff-only mode: nulls per contract, no issue/evidence sent to the model', async () => {
  const answer = JSON.stringify({
    claim_summary: 'Raises timeout', reality_summary: 'Changes timeout and dispatch retry.',
    findings: [{ text: 'Plausible fix for slow networks.', severity: 'info', evidence: [] }],
    suggested_priority: 'review_first', confidence: 'medium',
  });
  const client = fakeClient(answer);
  const card = await analyze(loadInput('B', 'diffonly'), { client, sleep: noSleep });
  assert.ok(CardSchema.safeParse(card).success);
  assert.equal(card.mode, 'diffonly');
  assert.equal(card.coverage, null);
  assert.equal(card.metrics, null);
  assert.equal(card.rulePriority, null);
  assert.deepEqual(card.evidence, []);
  assert.deepEqual(card.testsToRun, []);
  assert.deepEqual(card.overlaps, []);
  assert.equal(card.finalPriority, 'review_first');
  assert.equal(card.priorityReason, 'Diff-only: model suggestion, no graph check');
  const sent = JSON.parse(client.calls[0].contents);
  assert.equal(sent.issue, undefined);
  assert.equal(sent.evidence, undefined);
  assert.ok(sent.diff.length === 3);
});
