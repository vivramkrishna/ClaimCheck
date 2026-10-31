# Round 1 judging guide

This page maps the project directly to the five Round 1 criteria and provides a repeatable demo.

## Two-minute demo

1. Run `npm ci && npm run verify` to show reproducible installation, the full test suite, and deployment preflight.
2. Run `npm run dev:offline` and open `http://localhost:3000`.
3. Select the genuine fix and show the linked issue, touched symbols, graph path, impacted tests, evidence links, and `review_first` priority.
4. Select the polished off-target change and show the low relevance, changed god node, unexplained symbols, and `likely_off_target` priority.
5. Select the possible duplicate and show the overlap signal.
6. Toggle diff-only mode to demonstrate what a generic reviewer misses, then call out the limitations panel: the tool measures relevance, not correctness.

## Rubric mapping

### Alignment to problem

Maintainers need to decide where scarce review time should go. The product compares a PR's stated claim and linked issue with the symbols it actually changes, then exposes traceable evidence rather than an opaque score. It also identifies overlapping open work and tests that may be affected.

### Code quality

- The deterministic graph, issue, evidence, and priority logic is separated from model-owned wording.
- Zod validates both model output and the final card contract.
- Tests cover graph normalization, issue anchors, evidence, model repair, API routes, HTTP behavior, caching, and security middleware.
- `npm test` is scoped to tracked test files, so ignored archives cannot silently duplicate or skew results.

### Security features

- GitHub access is read-only and can be limited to the demo repository.
- Secrets remain server-side; health output exposes only booleans.
- Untrusted PR, issue, code, and model strings are inserted with `textContent`.
- Evidence links accept only `https://github.com/`.
- The app sends CSP, clickjacking, MIME-sniffing, referrer, permissions, and cross-origin isolation headers.
- API responses are `no-store`, requests are rate-limited, request IDs support incident tracing, and graph HTML is sandboxed.
- Upstream calls have time and size bounds, and clients never receive raw internal server errors.

### Production readiness

- `package-lock.json`, GitHub Actions CI, Dependabot, and `npm run preflight` make builds repeatable.
- Graph assets and their source commit are committed and validated.
- Cache writes are atomic and concurrent identical analyses are deduplicated.
- The server handles termination signals and has a health endpoint.
- Replay and deterministic fallbacks keep the demo useful during Wi-Fi or model failures.

### Red flags avoided

- No automatic PR closure, comments, merge, or other write action.
- No AI-authorship detection claim.
- No claim that relevance proves correctness.
- No hidden fallback presented as a model answer; provenance is visible.
- No placeholder graph assets or unpinned dependency install in the judging path.
- No committed credentials; leaked credentials must be rotated even after history is rewritten.

## Verification commands

```bash
npm run verify
npm run dev:offline
curl -s http://localhost:3000/api/health
```

For a live-data demo, copy `.env.example` to `.env`, add a repository-scoped read-only GitHub token and a Gemini key, then use `npm start`.
