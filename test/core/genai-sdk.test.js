// Exercises the REAL @google/genai SDK path in createGemmaClient with the HTTP layer mocked,
// so we know the request shape and response parsing work before the first live call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.GEMINI_API_KEY = 'fake-key-for-sdk-test';
process.env.GEMMA_MODEL = 'gemma-4-26b-a4b-it';

const input = JSON.parse(await readFile(new URL('./fixtures/input.B.json', import.meta.url), 'utf8'));
const { analyze } = await import('../../server/analyze.js');

test('createGemmaClient -> @google/genai -> card with assessmentSource=model', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url instanceof Request ? url.url : url);
    const body = options.body ?? (url instanceof Request ? await url.text() : null);
    calls.push({ url: target, body: body ? JSON.parse(body) : null, headers: options.headers });
    const assessment = {
      claim_summary: 'Claims to fix issue #1 by raising the request timeout.',
      reality_summary: 'Changes dispatch and the timeout constant; touches none of the session code the issue names.',
      findings: [{ text: 'The diff changes the router hub, not createSession/isExpired.', severity: 'risk', evidence: ['E1'] }],
      tests: [],
      questions_for_contributor: ['How does the timeout relate to the 401 in validate?'],
      suggested_priority: 'likely_off_target',
      confidence: 'medium',
      limitations: []
    };
    return Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: '```json\n' + JSON.stringify(assessment) + '\n```' }] }, finishReason: 'STOP' }],
      modelVersion: 'gemma-4-26b-a4b-it'
    });
  };
  try {
    const card = await analyze(structuredClone(input));
    assert.equal(calls.length, 1, 'exactly one model call');
    assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/.*models\/gemma-4-26b-a4b-it:generateContent/);
    assert.ok(calls[0].body.systemInstruction, 'system prompt sent as systemInstruction');
    assert.equal(calls[0].body.generationConfig.temperature, 0.2);
    assert.equal(card.provenance.assessmentSource, 'model');
    assert.equal(card.finalPriority, 'likely_off_target');
    assert.deepEqual(card.assessment.findings[0].evidence, ['E1']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
