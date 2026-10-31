# PR Reality Check

> Does this PR do what it claims? Graph-grounded evidence for maintainers. Never auto-closes.

Hacktoberfest maintainers need more than surface signals such as PR size or description quality. PR Reality Check compares a pull request's claim and linked issue with the part of the codebase it actually changes, then presents a traceable evidence card. It checks relevance, not correctness, and never claims to detect AI authorship.

**Live demo:** `https://<cloudways-url>`

**Screenshot:** _Add a mobile evidence-card screenshot after deployment._

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

The app shell fetches GitHub data, assembles the shared analyzer input, caches cards by source state, and serves a mobile-first interface. The graph, anchor, metric, evidence, validation, and Gemma implementation lives behind `server/analyze.js`; until that module is merged, the app automatically uses an explicitly synthetic stub card.

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
npm install
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

Generate the base graph from the synthetic demo repository on a trusted laptop:

```bash
uv tool install graphifyy
GRAPHIFY_BACKEND=none graphify extract . --code-only
```

Copy `graph.json` and `graph.html` into `data/`, then write `data/manifest.json` with `repo`, `graphCommit`, and `graphifyVersion`. Do not push to the demo repository's `main` after opening the three PRs; they must keep the same graph base.

Useful commands:

```bash
npm test
npm run check -- 2
node scripts/warm-cache.js https://<cloudways-url>
```

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
