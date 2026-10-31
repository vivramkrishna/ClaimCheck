# PR Reality Check

> Does this PR do what it claims? Graph-grounded evidence for maintainers. Never auto-closes.

Hacktoberfest maintainers need more than surface signals such as PR size or description quality. PR Reality Check compares a pull request's claim and linked issue with the part of the codebase it actually changes, then presents a traceable evidence card. It checks relevance, not correctness, and never claims to detect AI authorship.

**Demo:** run `npm run dev:offline` for a zero-credential walkthrough, or follow the live setup below.

**Judge fast:** `npm ci && npm run verify`, then open the offline demo at `http://localhost:3000`.

Graphify gives us the structure; our contribution is checking the claim against the code, with a traceable evidence card.

## How it works

```text
 demo repo @ base SHA ──(laptop) graphify extract --code-only──► data/graph.json + graph.html + manifest.json
                                                                        │ committed to app repo
 GitHub REST/GraphQL ── PR, files+patch, issue, open PRs                ▼
        │                                         ┌───────── Express @ Cloudways Velocity ───────────┐
        └────────────────────────────────────────►│ normalize graph ─► index (file → symbols by line) │
                                                  │ diff → touched nodes (+ unmapped additions)       │
                                                  │ blast radius: reverse BFS ≤2 hops, cap 50         │
                                                  │ issue → anchors (stack frames, `names`, paths)    │
                                                  │ metrics + duplicates + rule priority              │
                                                  │ evidence records E1..En (each has a GitHub URL)   │
                                                  │            ▼                                      │
                                                  │ Gemma 4 (gemma-4-26b-a4b-it) → JSON w/ E-ids      │
                                                  │            ▼                                      │
                                                  │ validate (zod + every E-id exists) → cache by SHA │
                                                  └───────────────┬───────────────────────────────────┘
                                                                  ▼
                                   Evidence card UI (with/without graph, graph.html link) │ PR comment (stretch)
```

The app shell fetches GitHub data, assembles the shared analyzer input, caches cards by source state, and serves a mobile-first interface. The graph, anchor, metric, evidence, validation, and Gemma implementation lives behind `server/analyze.js`; a deterministic evidence-only fallback keeps the product usable when the model is unavailable.

## Round 1 rubric evidence

| Criterion | Evidence in this repository |
| --- | --- |
| Alignment to problem | Claim-versus-reality cards, linked-issue anchors, code-graph paths, overlap detection, and explicit “relevance ≠ correctness” limits. |
| Code quality | Contract-first Zod schemas, deterministic engine modules, bounded inputs, and core/app/end-to-end tests. |
| Security features | Read-only least-privilege tokens, CSP and browser hardening headers, API rate limiting, sandboxed graph HTML, safe evidence links, secret-safe health checks, and private vulnerability reporting. |
| Production readiness | Pinned dependencies, CI, preflight checks, health endpoint, upstream timeouts, atomic cache writes, request IDs, graceful shutdown, offline fallback, and committed graph assets. |
| Red-flag control | No auto-actions, no secret in client responses, no raw model verdict, no HTML injection of untrusted text, and no silent guessing when evidence is missing. |

See [`docs/JUDGING.md`](docs/JUDGING.md) for a two-minute demo script and verification checklist.

## Evidence card

Each card shows:

- the PR claim beside the evidence-grounded reality summary;
- cited findings whose E-id chips open exact GitHub evidence;
- graph coverage, unmapped additions, and stale-graph warnings;
- raw issue-area hit, relevance, community overlap, blast radius, god-node, and edge-confidence values;
- impacted tests, other open work, contributor questions, and limitations;
- deterministic and model priorities when they differ; and
- live, cached, or replay provenance with model and graph commit.

## Metrics and limits

`issueAreaHit` asks whether a mapped changed symbol intersects the issue area. `relevance` is the fraction of non-test touched symbols inside that area. `communityOverlap` is a secondary structural signal. `blastRadius` counts graph dependents that may be affected.

**Relevance ≠ correctness.** A highly relevant patch can still be wrong, and an apparently distant patch may be valid. Missing anchors, low graph coverage, new definitions, or a stale graph trigger honest limitations or `needs_context`. Wording is deliberately “may affect,” never “breaks.”

## Local setup

Requires Node 22 (Node 20 or newer is supported by the package metadata).

```bash
npm ci
cp .env.example .env
npm start
```

Configure these environment variables:

- `PORT` — HTTP port, default `3000`.
- `GITHUB_TOKEN` — fine-grained, read-only, and limited to the demo repository.
- `GEMINI_API_KEY` — consumed only by the real analyzer.
- `GEMMA_MODEL` — default `gemma-4-26b-a4b-it`.
- `DEMO_REPO_OWNER` — GitHub owner of the demo repository.
- `DEMO_REPO_NAME` — default `pr-reality-check-demo`.

Optional: `EDGE_SOURCE_IS_CALLER` (default `true`), `GEMMA_THINKING_LEVEL` (set `minimal` if calls are slow), `GEMMA_TIMEOUT_MS` (default `45000`), `GITHUB_TIMEOUT_MS` (default `10000`), `GITHUB_MAX_FILE_PAGES` (default `10`), and `API_RATE_LIMIT` (default `120` requests per client per minute). `GET /api/health` reports `graphLoaded`, `githubTokenSet` and `geminiKeySet` as booleans so you can see what is missing without exposing secrets.

Generate the base graph from the synthetic demo repository (after its `main` is pushed) on a trusted laptop:

```bash
uv tool install graphifyy
scripts/import-graph.sh ../pr-reality-check-demo
```

The script runs `GRAPHIFY_BACKEND=none graphify extract . --code-only` on the demo repo's `main`, copies `graph.json` / `graph.html` into `data/`, writes `data/manifest.json` (`repo`, `graphCommit`, `graphifyVersion`) and prints the graph checklist (`node scripts/check.js --inspect data/graph.json`). Do not push to the demo repository's `main` after opening the three PRs; they must keep the same graph base.

Useful commands:

```bash
npm run verify                             # tests plus deployment/security preflight
npm test                                   # engine, routes, HTTP, security, and Gemini SDK wiring
npm run dev:offline                        # full app on SYNTHETIC fixtures, no tokens or network needed
npm run check -- 3 --no-llm                # deterministic evidence for a real PR
npm run check -- 3                         # + Gemma 4
node scripts/warm-cache.js https://<cloudways-url>   # record replay cards for the demo
```

If GitHub is unreachable during the demo, `/api/prs` falls back to the recorded replay cards and the UI switches to the amber REPLAY mode automatically.

## Project structure

```
server/                    Node ESM, no build step
  index.js                 Express: /api/health, /api/prs, /api/analyze/:n, /graph, static UI
  input.js                 buildInput(pr, mode): PR + files + linked issue + open PRs + graph
  github.js                GitHub REST/GraphQL via fetch (read-only)
  cache.js                 cache key, data/cache, data/replay
  security.js              CSP, hardening headers, request IDs, no-store API, rate limiting
  load-analyzer.js         loads analyze.js (stub only if the file is missing)
  analyze.js               core engine orchestrator: AnalyzeInput -> Card (never throws)
  graph.js                 Graphify graph.json normalize, diff -> nodes, blast radius, god nodes
  issue.js                 issue anchors (stack frames, `names`, paths)
  evidence.js              metrics, rule priority, duplicates, E1..En evidence with URLs
  gemma.js                 Gemma 4 call, JSON repair, citation filter, fallback
  schema.js                zod Card / Assessment schemas
  analyze.stub.js          synthetic stand-in (unused while analyze.js exists)
prompts/review.txt         Gemma system prompt
public/index.html          evidence card UI (Tailwind CDN + vanilla JS)
data/
  graph.json graph.html manifest.json   from Graphify (scripts/import-graph.sh)
  cache/                   runtime cache (git-ignored)
  replay/                  recorded genuine cards for ?replay=1 (committed)
  fixtures/                synthetic sample cards for the stub
scripts/
  import-graph.sh          Graphify on demo main -> data/ + manifest + graph checklist
  check.js                 debug CLI: npm run check -- <pr> [--no-llm] | --inspect data/graph.json
  warm-cache.js            record replay cards from a live URL
  dev-offline.js           whole app on synthetic fixtures, no keys
  preflight.js             deployment, graph, lockfile, and secret-safety checks
skills/pr-reality-check/   contributor agent skill (SKILL.md)
test/core/                 engine tests + synthetic Graphify graph and PR A/B/C inputs
test/app/                  routes, GitHub, cache, end-to-end HTTP tests
docs/                      setup checklist, HLD, decisions, handoffs, research (see docs/README.md)
archive/                   git-ignored reference copies of the core-engine downloads
```

Scripts: `npm start`, `npm test` (or `test:core` / `test:app`), `npm run dev:offline`, `npm run check -- <pr>`, `npm run graph:import -- ../pr-reality-check-demo`, `npm run replay:warm -- https://<url>`.

## Contributor agent skill

[`skills/pr-reality-check/SKILL.md`](skills/pr-reality-check/SKILL.md) is a reusable self-check for contributors preparing a PR that claims to fix an issue. It asks for anchors, changed functions, paths, callers, unexplained changes, and tests before a PR is opened.

## Synthetic demo fixtures

The sibling `pr-reality-check-demo` repository is intentionally synthetic, not a real project. Its `main` branch contains a controlled seconds-versus-milliseconds session-expiry bug. Three one-commit branches demonstrate a relevant fix, a polished off-target change, and a possible duplicate. `GITHUB_TEXT.md` contains the exact issue and PR copy.

The sample cards under `data/fixtures/` are also labeled `_synthetic: true`; replay cards should be warmed from actual analyzer responses before a demo.

## Security

- Use a fine-grained GitHub token with read-only access to the demo repository only.
- Store deployment secrets as sensitive environment variables; never commit `.env`.
- PR, issue, code, author, and model text are untrusted data. The browser inserts them using `textContent`, never data-derived HTML.
- Evidence links are enabled only for `https://github.com/`.
- The model has no write tools, and the product exposes no action that changes a pull request.
- API calls are rate-limited, GitHub calls have bounded timeouts and pagination, and internal server errors are not sent to clients.
- The main UI uses a per-response CSP nonce; generated graph HTML runs in a sandboxed context with network access disabled.
- See [`SECURITY.md`](SECURITY.md) for private reporting guidance and the documented trust boundaries.

## Deploy (Cloudways Velocity)

1. Connect this repository and choose the framework preset manually.
2. Select Node 22, repository root `/`, and start command `npm start`.
3. Add `GITHUB_TOKEN`, `GEMINI_API_KEY`, `GEMMA_MODEL`, `DEMO_REPO_OWNER`, and `DEMO_REPO_NAME` as **Sensitive** environment variables.
4. Do not hard-code `PORT`; Cloudways supplies it through the environment.
5. Deploy, then verify `https://<cloudways-url>/api/health` and open the UI at the root URL.

There is no build step.

## Credits

Built with [Graphify / graphifyy](https://pypi.org/project/graphifyy/), Gemma 4 through `@google/genai`, Express, zod, Tailwind CSS CDN, GitHub REST and GraphQL APIs, Cloudways Velocity, and Major League Hacking.

Built at MLH Hacktoberfest Hack Day Hyderabad, Oct 31 2026.

## License

[MIT](LICENSE)
