import test, { after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.DEMO_REPO_OWNER = 'example';
process.env.DEMO_REPO_NAME = 'pr-reality-check-demo';
process.env.GEMINI_API_KEY = ''; // never call the real model from tests

const { app, analyzerKind } = await import('../../server/index.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

after(async () => {
  const cacheDir = path.join(root, 'data', 'cache');
  for (const filename of await readdir(cacheDir)) {
    if (filename.startsWith('907123-')) await unlink(path.join(cacheDir, filename));
  }
});

afterEach(() => mock.restoreAll());

function invoke(routePath, { params = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const layer = app.router.stack.find((candidate) => candidate.route?.path === routePath);
    if (!layer) return reject(new Error(`Route not found: ${routePath}`));
    const request = { params, query };
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, json: body }); return this; }
    };
    Promise.resolve(layer.route.stack[0].handle(request, response)).catch(reject);
  });
}

function githubFetch(url) {
  const target = String(url);
  const pr = {
    number: 907123,
    title: 'Synthetic route test PR',
    body: 'Fixes #1',
    user: { login: 'route-tester' },
    head: { sha: 'route-test-head' },
    base: { sha: 'route-test-base' },
    html_url: 'https://github.com/example/pr-reality-check-demo/pull/907123'
  };
  if (target.includes('/pulls/907123/files')) return Promise.resolve(Response.json([]));
  if (target.endsWith('/pulls/907123')) return Promise.resolve(Response.json(pr));
  if (target.includes('/pulls?state=open')) return Promise.resolve(Response.json([pr]));
  if (target.endsWith('/issues/1')) {
    return Promise.resolve(Response.json({ number: 1, updated_at: '2026-10-31T00:00:00Z', title: 'Synthetic issue' }));
  }
  return Promise.resolve(Response.json({ message: `Unexpected URL ${target}` }, { status: 500 }));
}

test('health reports the real analyzer and config flags without secrets', async () => {
  const response = await invoke('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.analyzer, 'real');
  assert.equal(analyzerKind, 'real');
  assert.equal(typeof response.json.githubTokenSet, 'boolean');
  assert.equal(typeof response.json.geminiKeySet, 'boolean');
  assert.ok(!JSON.stringify(response.json).includes(process.env.GITHUB_TOKEN || '\u0000none'));
});

test('analyze route returns a schema-valid evidence card with mocked GitHub fetch', async () => {
  mock.method(globalThis, 'fetch', githubFetch);
  const response = await invoke('/api/analyze/:n', {
    params: { n: '907123' }, query: { mode: 'graph', refresh: '1' }
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.mode, 'graph');
  assert.equal(response.json.pr.number, 907123);
  assert.equal(response.json.pr.linkedIssue, 1);
  assert.equal(response.json.provenance.mode, 'live');
  // No files and no graph: the engine must abstain, not guess.
  assert.equal(response.json.finalPriority, 'needs_context');
});

test('analyze route validates PR number and mode before network calls', async () => {
  const badNumber = await invoke('/api/analyze/:n', {
    params: { n: 'nope' }, query: { mode: 'graph' }
  });
  assert.equal(badNumber.status, 400);
  assert.match(badNumber.json.error, /positive integer/);
  const badMode = await invoke('/api/analyze/:n', {
    params: { n: '2' }, query: { mode: 'unknown' }
  });
  assert.equal(badMode.status, 400);
  assert.match(badMode.json.error, /graph or diffonly/);
});

test('missing replay returns a JSON 404', async () => {
  const response = await invoke('/api/analyze/:n', {
    params: { n: '987654' }, query: { mode: 'diffonly', replay: '1' }
  });
  assert.equal(response.status, 404);
  assert.equal(response.json.status, 404);
  assert.match(response.json.error, /Replay not found/);
});
