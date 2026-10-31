// End-to-end: real Express server + real analyzer + synthetic Graphify graph,
// with GitHub mocked from the A/B/C fixtures. No network, no model call.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const fixtures = path.join(root, 'test/core/fixtures');
const load = async (name) => JSON.parse(await readFile(path.join(fixtures, name), 'utf8'));

const inputs = { 2: await load('input.A.json'), 3: await load('input.B.json'), 4: await load('input.C.json') };
const graphDir = await mkdtemp(path.join(tmpdir(), 'prc-graph-'));
await writeFile(path.join(graphDir, 'graph.json'), await readFile(path.join(fixtures, 'graph.synthetic.json')));
await writeFile(path.join(graphDir, 'manifest.json'), JSON.stringify({
  repo: { owner: 'demo-owner', name: 'pr-reality-check-demo' },
  graphCommit: inputs[2].manifest.graphCommit,
  graphifyVersion: 'synthetic'
}));
await writeFile(path.join(graphDir, 'graph.html'), '<!doctype html><title>graph</title><p>synthetic graph view</p>');

process.env.GRAPH_DATA_DIR = graphDir;
process.env.DEMO_REPO_OWNER = 'demo-owner';
process.env.DEMO_REPO_NAME = 'pr-reality-check-demo';
process.env.GITHUB_TOKEN = 'test-token';
process.env.GEMINI_API_KEY = '';

const realFetch = globalThis.fetch;
const github = (url) => {
  const u = new URL(url);
  const m = u.pathname.match(/^\/repos\/demo-owner\/pr-reality-check-demo\/(.*)$/);
  if (!m) return null;
  const rest = m[1];
  let mm;
  if (rest === 'pulls' && u.searchParams.get('state') === 'open') return Object.values(inputs).map((i) => i.pr);
  if ((mm = rest.match(/^pulls\/(\d+)\/files$/))) return Number(u.searchParams.get('page') ?? 1) > 1 ? [] : inputs[mm[1]]?.files;
  if ((mm = rest.match(/^pulls\/(\d+)$/))) return inputs[mm[1]]?.pr;
  if ((mm = rest.match(/^issues\/(\d+)$/))) return Number(mm[1]) === 1 ? inputs[2].issue : undefined;
  return undefined;
};
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('https://api.github.com')) {
    const body = github(target);
    if (body === undefined || body === null) return Response.json({ message: 'Not Found' }, { status: 404 });
    return Response.json(body);
  }
  return realFetch(url, options);
};

const { app } = await import('../../server/index.js');
let server;
let base;
before(async () => {
  server = app.listen(0);
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  const cacheDir = path.join(root, 'data', 'cache');
  for (const name of await readdir(cacheDir)) {
    if (/^[234]-(graph|diffonly)-/.test(name)) {
      const card = JSON.parse(await readFile(path.join(cacheDir, name), 'utf8'));
      if (String(card?.pr?.headSha).match(/^(a0a0|b0b0|c0c0)/)) await unlink(path.join(cacheDir, name));
    }
  }
});

const getJson = async (p) => {
  const res = await realFetch(base + p);
  return { status: res.status, headers: res.headers, json: await res.json() };
};

test('health: real analyzer, graph loaded, keys reported as booleans', async () => {
  const { headers, json } = await getJson('/api/health');
  assert.equal(json.analyzer, 'real');
  assert.equal(json.graphLoaded, true);
  assert.equal(json.graphCommit, inputs[2].manifest.graphCommit);
  assert.equal(json.githubTokenSet, true);
  assert.equal(json.geminiKeySet, false);
  assert.ok(!JSON.stringify(json).includes('test-token'));
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.match(headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.match(headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.ok(Number(headers.get('ratelimit-remaining')) >= 0);
});

test('GET /api/prs lists the three demo PRs with linked issue #1', async () => {
  const { status, json } = await getJson('/api/prs');
  assert.equal(status, 200);
  assert.deepEqual(json.map((p) => p.number), [2, 3, 4]);
  assert.ok(json.every((p) => p.linkedIssue === 1));
});

test('PR A (genuine) -> review_first through the HTTP route', async () => {
  const { json } = await getJson('/api/analyze/2?mode=graph&refresh=1');
  assert.equal(json.mode, 'graph');
  assert.equal(json.finalPriority, 'review_first');
  assert.equal(json.metrics.issueAreaHit, true);
  assert.ok(json.testsToRun.some((t) => t.includes('session.test')));
  assert.ok(json.evidence.length > 0 && json.evidence.every((e) => e.url.startsWith('https://github.com/demo-owner/')));
  assert.equal(json.provenance.assessmentSource, 'fallback');
});

test('PR B (off-target) -> likely_off_target, dispatch god node', async () => {
  const { json } = await getJson('/api/analyze/3?mode=graph&refresh=1');
  assert.equal(json.finalPriority, 'likely_off_target');
  assert.equal(json.metrics.issueAreaHit, false);
  assert.ok(json.metrics.godNodesTouched.some((id) => /dispatch/i.test(id)));
  assert.ok(json.coverage.unmappedAdditions.includes('retryDispatch'));
});

test('PR C -> possible duplicate of PR A', async () => {
  const { json } = await getJson('/api/analyze/4?mode=graph&refresh=1');
  assert.ok(json.overlaps.some((o) => o.pr === 2 && o.kind === 'possible_duplicate'));
});

test('diff-only mode has the documented nulls', async () => {
  const { json } = await getJson('/api/analyze/3?mode=diffonly&refresh=1');
  assert.equal(json.mode, 'diffonly');
  assert.equal(json.metrics, null);
  assert.equal(json.coverage, null);
  assert.deepEqual(json.evidence, []);
});

test('second request is served from cache with provenance.mode=cached', async () => {
  // No GEMINI_API_KEY -> deterministic card, so it is cacheable.
  await getJson('/api/analyze/2?mode=graph');
  const { json } = await getJson('/api/analyze/2?mode=graph');
  assert.equal(json.provenance.mode, 'cached');
});

test('/graph serves graph.html and / serves the UI', async () => {
  const graph = await realFetch(`${base}/graph`);
  assert.equal(graph.status, 200);
  assert.match(graph.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.match(graph.headers.get('content-security-policy'), /https:\/\/unpkg\.com/);
  assert.match(await graph.text(), /synthetic graph view/);
  const ui = await realFetch(`${base}/`);
  assert.equal(ui.status, 200);
  const csp = ui.headers.get('content-security-policy');
  const body = await ui.text();
  const nonce = body.match(/<script nonce="([^"]+)">/)?.[1];
  assert.match(body, /PR Reality Check/);
  assert.ok(nonce);
  assert.ok(csp.includes(`'nonce-${nonce}'`));
});

test('bad input returns JSON errors, not HTML', async () => {
  const { status, json } = await getJson('/api/analyze/999?mode=graph');
  assert.equal(status, 404);
  assert.match(json.error, /not found/i);
  const unknown = await getJson('/api/nope');
  assert.equal(unknown.status, 404);
});
