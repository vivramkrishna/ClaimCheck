import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildInput, graphDataDir } from './input.js';
import { graphView } from './graph-view.js';
import { computeDeterministic } from './analyze.js';
import { cacheKey, get as getCache, getReplay, listReplays, set as setCache } from './cache.js';
import { listOpenIssues, listOpenPRs, resolveLinkedIssue } from './github.js';
import { fitScore, rankByFit } from './evidence.js';
import { loadAnalyzer } from './load-analyzer.js';
import {
  createRateLimiter,
  graphSandboxHeaders,
  noStoreApi,
  requestContext,
  securityHeaders
} from './security.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const indexTemplate = await readFile(path.join(root, 'public', 'index.html'), 'utf8');

const { analyzer, kind: loadedKind } = await loadAnalyzer();
export const analyzerKind = loadedKind;

export const app = express();
const inFlightAnalyses = new Map();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestContext);
app.use(securityHeaders);
app.use('/api', noStoreApi, createRateLimiter());
app.use(express.json({ limit: '32kb' }));

function jsonError(request, response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error(`[${request.requestId ?? 'no-request-id'}]`, error);
  response.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    status,
    requestId: request.requestId
  });
}

function validatedRequest(request) {
  const number = Number(request.params.n);
  if (!/^\d+$/.test(request.params.n) || !Number.isSafeInteger(number) || number < 1) {
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
  return { number, mode };
}

function withMode(card, mode) {
  const copy = structuredClone(card);
  copy.provenance ??= {};
  copy.provenance.mode = mode;
  return copy;
}

async function analyzeOnce(number, mode, key, input) {
  const inFlightKey = `${number}:${mode}:${key}`;
  if (inFlightAnalyses.has(inFlightKey)) return inFlightAnalyses.get(inFlightKey);
  const pending = (async () => {
    const card = await analyzer.analyze(input);
    const modelAnswered = card?.provenance?.assessmentSource !== 'fallback';
    if (modelAnswered || !process.env.GEMINI_API_KEY) await setCache(number, mode, key, card);
    return card;
  })();
  inFlightAnalyses.set(inFlightKey, pending);
  try {
    return await pending;
  } finally {
    inFlightAnalyses.delete(inFlightKey);
  }
}

/** Attach the measured fit score (graph mode only); never changes the server-owned verdict. */
function withFit(card) {
  if (!card || card.mode === 'diffonly') return card;
  return { ...card, fit: fitScore(card) };
}

// ---------------- Issues → ranked PRs ----------------
// Deterministic only (no model call), memoized by PR head SHA + issue + open-PR snapshot,
// so the issue board is cheap to load and never spends Gemma quota.
const summaryMemo = new Map();

function summaryRow(pr, linkedIssue, d) {
  const fit = fitScore(d);
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? 'unknown',
    url: pr.html_url ?? null,
    linkedIssue,
    fit,
    relevance: d.metrics?.relevance ?? null,
    issueAreaHit: d.metrics?.issueAreaHit ?? null,
    rulePriority: d.rule?.priority ?? 'needs_context',
    testsChanged: (d.coverage?.testsChanged ?? []).length,
    godNodesTouched: (d.metrics?.godNodesTouched ?? []).length,
    unexplained: (d.metrics?.unexplained ?? []).length,
    duplicates: (d.overlaps ?? []).filter((o) => o.kind === 'possible_duplicate').map((o) => o.pr)
  };
}

async function summarizePR(pr, snapshot) {
  const key = `${pr.number}:${pr.head?.sha}:${snapshot}`;
  if (!summaryMemo.has(key)) {
    summaryMemo.set(key, (async () => {
      const input = await buildInput(pr.number, 'graph');
      return summaryRow(pr, input.issue?.number ?? null, computeDeterministic(input));
    })().catch((error) => { summaryMemo.delete(key); throw error; }));
  }
  return summaryMemo.get(key);
}

function groupByIssue(issues, rows) {
  const byIssue = new Map(issues.map((i) => [i.number, {
    number: i.number,
    title: i.title,
    url: i.html_url ?? null,
    author: i.user?.login ?? null,
    excerpt: String(i.body ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
    prs: []
  }]));
  const unlinked = [];
  for (const row of rows) {
    if (row.linkedIssue == null) { unlinked.push(row); continue; }
    if (!byIssue.has(row.linkedIssue)) {
      byIssue.set(row.linkedIssue, { number: row.linkedIssue, title: `Issue #${row.linkedIssue}`, url: null, author: null, excerpt: '', closedOrMissing: true, prs: [] });
    }
    byIssue.get(row.linkedIssue).prs.push(row);
  }
  const list = [...byIssue.values()].map((i) => ({ ...i, prs: rankByFit(i.prs) }))
    .sort((a, b) => a.number - b.number);
  return { issues: list, unlinked: rankByFit(unlinked) };
}

app.get('/api/issues', async (request, response) => {
  try {
    const [issues, prs] = await Promise.all([listOpenIssues(), listOpenPRs()]);
    const snapshot = prs.map((p) => `${p.number}@${p.head?.sha}`).sort().join(',')
      + '|' + issues.map((i) => `${i.number}@${i.updated_at}`).join(',');
    if (summaryMemo.size > 500) summaryMemo.clear();
    const rows = await Promise.all(prs.map((pr) => summarizePR(pr, snapshot).catch((error) => ({
      number: pr.number, title: pr.title, author: pr.user?.login ?? 'unknown', url: pr.html_url ?? null,
      linkedIssue: null, fit: null, relevance: null, rulePriority: 'needs_context', error: error.message
    }))));
    response.json({ source: 'live', ...groupByIssue(issues, rows) });
  } catch (error) {
    // GitHub unreachable: rebuild the board from recorded replay cards so the demo still works.
    try {
      const replays = await listReplays();
      if (!replays.length) throw error;
      const rows = [];
      for (const r of replays) {
        const card = await getReplay(r.number, 'graph');
        if (!card) continue;
        rows.push(summaryRow({ number: r.number, title: r.title, user: { login: r.author } }, r.linkedIssue,
          { metrics: card.metrics, coverage: card.coverage, overlaps: card.overlaps, rule: { priority: card.rulePriority } }));
      }
      const issues = [...new Set(rows.map((x) => x.linkedIssue).filter((n) => n != null))].map((n) => ({ number: n, title: `Issue #${n}` }));
      response.set('X-PR-Source', 'replay');
      response.json({ source: 'replay', ...groupByIssue(issues, rows) });
    } catch {
      jsonError(request, response, error);
    }
  }
});

app.get('/api/health', async (_request, response) => {
  let manifest = null;
  let graphNodes = null;
  try {
    manifest = JSON.parse(await readFile(path.join(graphDataDir(), 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') return jsonError(_request, response, error);
  }
  try {
    const graph = JSON.parse(await readFile(path.join(graphDataDir(), 'graph.json'), 'utf8'));
    graphNodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  } catch (error) {
    if (error.code !== 'ENOENT') return jsonError(_request, response, error);
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
      ? `${process.env.DEMO_REPO_OWNER}/${process.env.DEMO_REPO_NAME || 'unknown'}`
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
    jsonError(_request, response, error);
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
      return response.json(withFit(withMode(replay, 'replay')));
    }

    const input = await buildInput(number, mode);
    const key = cacheKey(input, { promptVersion: analyzer.PROMPT_VERSION });
    if (request.query.refresh !== '1') {
      const cached = await getCache(number, mode, key);
      if (cached) return response.json(withFit(withMode(cached, 'cached')));
    }

    const card = await analyzeOnce(number, mode, key, input);
    response.json(withFit(card));
  } catch (error) {
    jsonError(request, response, error);
  }
});

app.get('/api/graph', async (request, response) => {
  try {
    let raw;
    try {
      raw = JSON.parse(await readFile(path.join(graphDataDir(), 'graph.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return response.json({ total: 0, nodes: [], edges: [] });
      throw error;
    }
    let focus = null;
    const number = Number(request.query.pr);
    if (Number.isSafeInteger(number) && number > 0 && number < 10_000_000) {
      try {
        const d = computeDeterministic(await buildInput(number, 'graph'));
        focus = { changed: d.diff.touchedIds, issueArea: [...d.area], impacted: d.blast.dependents.map((x) => x.id) };
      } catch {
        focus = null; // GitHub unreachable: still show the plain graph.
      }
    }
    response.json(graphView(raw, focus));
  } catch (error) {
    jsonError(request, response, error);
  }
});

app.get('/graph', graphSandboxHeaders, (_request, response) => {
  response.sendFile(path.join(graphDataDir(), 'graph.html'), (error) => {
    if (!error || response.headersSent) return;
    response.status(error.statusCode === 404 ? 404 : 500).type('html').send(
      '<!doctype html><title>Graph unavailable</title><main><h1>Graph unavailable</h1><p>Copy Graphify\'s graph.html into data/ and try again.</p></main>'
    );
  });
});

app.get('/', (_request, response) => {
  const nonce = response.locals.cspNonce;
  response.type('html').send(indexTemplate.replace('<script>', `<script nonce="${nonce}">`));
});

app.use(express.static(path.join(root, 'public')));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.', status: 404 });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`PR Reality Check listening on http://localhost:${port}`);
  });
  const shutdown = (signal) => {
    console.log(`${signal} received; closing HTTP server.`);
    server.close((error) => {
      if (error) {
        console.error('Graceful shutdown failed:', error);
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
