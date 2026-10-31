import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildInput, graphDataDir } from './input.js';
import { cacheKey, get as getCache, getReplay, listReplays, set as setCache } from './cache.js';
import { listOpenPRs, resolveLinkedIssue } from './github.js';
import { loadAnalyzer } from './load-analyzer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const { analyzer, kind: loadedKind } = await loadAnalyzer();
export const analyzerKind = loadedKind;

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

function jsonError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  response.status(status).json({
    error: status === 500 && !error?.message ? 'Internal server error' : error.message,
    status
  });
}

function validatedRequest(request) {
  if (!/^\d+$/.test(request.params.n) || Number(request.params.n) < 1) {
    const error = new Error('PR number must be a positive integer.');
    error.status = 400;
    throw error;
  }
  const mode = request.query.mode ?? 'graph';
  if (!['graph', 'diffonly'].includes(mode)) {
    const error = new Error('mode must be graph or diffonly.');
    error.status = 400;
    throw error;
  }
  return { number: Number(request.params.n), mode };
}

function withMode(card, mode) {
  const copy = structuredClone(card);
  copy.provenance ??= {};
  copy.provenance.mode = mode;
  return copy;
}

app.get('/api/health', async (_request, response) => {
  let manifest = null;
  let graphNodes = null;
  try {
    manifest = JSON.parse(await readFile(path.join(graphDataDir(), 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') return jsonError(response, error);
  }
  try {
    const graph = JSON.parse(await readFile(path.join(graphDataDir(), 'graph.json'), 'utf8'));
    graphNodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  } catch (error) {
    if (error.code !== 'ENOENT') return jsonError(response, error);
  }
  // Booleans only: never echo secrets or their lengths.
  response.json({
    ok: true,
    version: packageJson.version,
    analyzer: analyzerKind,
    promptVersion: analyzer.PROMPT_VERSION,
    model: process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it',
    graphCommit: manifest?.graphCommit ?? null,
    graphLoaded: graphNodes !== null && graphNodes > 0,
    graphNodes,
    repo: process.env.DEMO_REPO_OWNER
      ? `${process.env.DEMO_REPO_OWNER}/${process.env.DEMO_REPO_NAME || 'pr-reality-check-demo'}`
      : null,
    githubTokenSet: Boolean(process.env.GITHUB_TOKEN),
    geminiKeySet: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.get('/api/prs', async (_request, response) => {
  try {
    const prs = await listOpenPRs();
    const result = await Promise.all(prs.map(async (pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      headSha: pr.head?.sha ?? '',
      linkedIssue: (await resolveLinkedIssue(pr))?.number ?? null,
      url: pr.html_url
    })));
    response.json(result);
  } catch (error) {
    // Wi-Fi / GitHub backup: if replay cards exist, list those PRs so replay mode still works.
    const replays = await listReplays().catch(() => []);
    if (replays.length) {
      response.set('X-PR-Source', 'replay');
      return response.json(replays);
    }
    jsonError(response, error);
  }
});

app.get('/api/analyze/:n', async (request, response) => {
  try {
    const { number, mode } = validatedRequest(request);
    if (request.query.replay === '1') {
      const replay = await getReplay(number, mode);
      if (!replay) {
        const error = new Error(`Replay not found for PR #${number} in ${mode} mode.`);
        error.status = 404;
        throw error;
      }
      return response.json(withMode(replay, 'replay'));
    }

    const input = await buildInput(number, mode);
    const key = cacheKey(input, { promptVersion: analyzer.PROMPT_VERSION });
    if (request.query.refresh !== '1') {
      const cached = await getCache(number, mode, key);
      if (cached) return response.json(withMode(cached, 'cached'));
    }

    const card = await analyzer.analyze(input);
    const modelAnswered = card?.provenance?.assessmentSource !== 'fallback';
    if (modelAnswered || !process.env.GEMINI_API_KEY) await setCache(number, mode, key, card);
    response.json(card);
  } catch (error) {
    jsonError(response, error);
  }
});

app.get('/graph', (_request, response) => {
  response.sendFile(path.join(graphDataDir(), 'graph.html'), (error) => {
    if (!error || response.headersSent) return;
    response.status(error.statusCode === 404 ? 404 : 500).type('html').send(
      '<!doctype html><title>Graph unavailable</title><main><h1>Graph unavailable</h1><p>Copy Graphify\'s graph.html into data/ and try again.</p></main>'
    );
  });
});

app.use(express.static(path.join(root, 'public')));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.', status: 404 });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`PR Reality Check listening on http://localhost:${port}`);
  });
}
