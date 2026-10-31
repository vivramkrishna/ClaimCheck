#!/usr/bin/env node
// Offline dev server: the real app + real analyzer, but GitHub is answered from the
// SYNTHETIC test fixtures (PRs #2/#3/#4, issue #1) and the graph is graph.synthetic.json.
// Use it to work on the UI without tokens or network. Never deploy this.
//   node scripts/dev-offline.js            -> http://localhost:3000
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'test/core/fixtures');
const load = async (name) => JSON.parse(await readFile(path.join(fixtures, name), 'utf8'));
const inputs = { 2: await load('input.A.json'), 3: await load('input.B.json'), 4: await load('input.C.json') };

const dir = await mkdtemp(path.join(tmpdir(), 'prc-offline-'));
await writeFile(path.join(dir, 'graph.json'), await readFile(path.join(fixtures, 'graph.synthetic.json')));
await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
  repo: { owner: 'demo-owner', name: 'pr-reality-check-demo' },
  graphCommit: inputs[2].manifest.graphCommit, graphifyVersion: 'synthetic'
}));
await writeFile(path.join(dir, 'graph.html'), '<!doctype html><meta charset="utf-8"><title>Synthetic graph</title><p>Offline mode: run Graphify on the demo repo to get the real graph.html.</p>');

Object.assign(process.env, {
  GRAPH_DATA_DIR: dir, CACHE_DIR: path.join(dir, 'cache'), DEMO_REPO_OWNER: 'demo-owner', DEMO_REPO_NAME: 'pr-reality-check-demo',
  GITHUB_TOKEN: 'offline', GEMINI_API_KEY: process.env.OFFLINE_USE_GEMINI === '1' ? (process.env.GEMINI_API_KEY ?? '') : '',
});

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (!target.startsWith('https://api.github.com/')) return realFetch(url, options);
  const u = new URL(target);
  const rest = u.pathname.replace('/repos/demo-owner/pr-reality-check-demo/', '');
  let m; let body;
  if (rest === 'pulls') body = Object.values(inputs).map((i) => i.pr);
  else if ((m = rest.match(/^pulls\/(\d+)\/files$/))) body = Number(u.searchParams.get('page') ?? 1) > 1 ? [] : inputs[m[1]]?.files;
  else if ((m = rest.match(/^pulls\/(\d+)$/))) body = inputs[m[1]]?.pr;
  else if (rest === 'issues/1') body = inputs[2].issue;
  return body ? Response.json(body) : Response.json({ message: 'Not Found' }, { status: 404 });
};

const { app } = await import('../server/index.js');
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`OFFLINE (synthetic fixtures) PR Reality Check on http://localhost:${port}`));
