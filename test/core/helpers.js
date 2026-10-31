// Shared test helpers (not a test file itself; node --test runs it harmlessly).
import fs from 'node:fs';

export const loadInput = (k, mode = 'graph') => {
  const input = JSON.parse(fs.readFileSync(new URL(`./fixtures/input.${k}.json`, import.meta.url), 'utf8'));
  input.mode = mode;
  return input;
};
export const loadGraph = () => JSON.parse(fs.readFileSync(new URL('./fixtures/graph.synthetic.json', import.meta.url), 'utf8'));

/** Fake Gemma client: returns queued responses (string or Error) in order. */
export function fakeClient(...responses) {
  const calls = [];
  return {
    model: 'fake-gemma',
    calls,
    async generate(args) {
      calls.push(args);
      const r = responses.length > 1 ? responses.shift() : responses[0];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(args) : r;
    },
  };
}
export const noSleep = async () => {};

/** A model answer for PR B that cites real evidence ids plus one uncited finding. */
export function gemmaAnswerB({ priority = 'likely_off_target', fenced = true } = {}) {
  const obj = {
    claim_summary: 'The PR says the 5 s request timeout causes the logout in issue #1 and raises it to 30 s with a retry.',
    reality_summary: 'The change touches dispatch(), withTimeout() and REQUEST_TIMEOUT_MS, none of which are in the issue area around validate(), isExpired() and createSession().',
    findings: [
      { text: 'Relevance is 0.00: none of the 3 changed symbols are in the issue area.', severity: 'risk', evidence: ['E3'] },
      { text: 'dispatch() is a god node; changing it may affect every route.', severity: 'warn', evidence: ['E7', 'E14'] },
      { text: 'The issue stack frame points at validate() in src/auth/authService.js:13.', severity: 'info', evidence: ['E1', 'E2'] },
      { text: 'This finding cites nothing and must be dropped.', severity: 'info', evidence: [] },
      { text: 'This one cites a record that does not exist.', severity: 'warn', evidence: ['E99'] },
    ],
    tests: [
      { kind: 'existing', name: 'tests/router.test.js', reason: 'Imports the changed router.', evidence: ['E14'] },
      { kind: 'existing', name: 'tests/made-up.test.js', reason: 'Invented test name.', evidence: ['E14'] },
      { kind: 'proposed', name: 'session stays valid 5 s after login', reason: 'Reproduces issue #1.', evidence: ['E1'] },
    ],
    questions_for_contributor: ['How does a longer request timeout change when isExpired() returns true?'],
    suggested_priority: priority,
    confidence: 'high',
    limitations: ['Relevance only; correctness not checked.'],
  };
  const json = JSON.stringify(obj, null, 2);
  return fenced ? `Here is the review:\n\`\`\`json\n${json}\n\`\`\`` : json;
}
