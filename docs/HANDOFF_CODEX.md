# Codex handoff — app shell and demo fixture

## What is done

- Node ESM Express app with health, open-PR, analyze, replay, static UI, and graph routes.
- Plain-fetch GitHub REST/GraphQL client with linked-issue regex first, pagination, retry, and clear errors.
- Exact `buildInput(prNumber, mode)` assembly contract, graph/manifest memory loading, and open-PR file memoization by head SHA.
- SHA-1 cache keyed by PR, issue, open PRs, graph commit, prompt version, model, and mode.
- Stub analyzer plus explicitly synthetic graph and diff-only cards.
- Mobile-first, one-file evidence UI with safe text rendering and GitHub-only evidence links.
- Replay warmer, contributor skill, tests, deploy instructions, MIT license, and synthetic demo repository.

## Run it

```bash
npm install
cp .env.example .env
npm test
npm start
curl http://localhost:3000/api/health
```

Exact environment variables:

- `PORT` (default `3000`)
- `GITHUB_TOKEN` (fine-grained, read-only, demo repo only)
- `GEMINI_API_KEY`
- `GEMMA_MODEL` (default `gemma-4-26b-a4b-it`)
- `DEMO_REPO_OWNER`
- `DEMO_REPO_NAME` (default `pr-reality-check-demo`)

## What is stubbed

`server/index.js` attempts to load `server/analyze.js` and automatically falls back to `server/analyze.stub.js` while Claude's analyzer is absent. The stub fills PR identity from the live input and renders `_synthetic` fixture cards. It does not implement graph mapping, anchors, metrics, duplicate detection, priority logic, evidence generation, model calls, or validation.

`data/graph.json`, `data/graph.html`, and `data/manifest.json` are intentionally absent until the user runs Graphify against the pushed demo `main` branch. The app reports a null graph commit and provides an empty graph/manifest fallback for stub operation.

## Contract questions

- The prompt referenced `docs/FINAL_HLD.md`, but the repository stores the read-only design at `HLD/FINAL_HLD.md`. Implementation used that file.
- No shared-contract changes were required.

## User checklist

1. Push the demo repository's `main` branch.
2. On the demo `main`, run `uv tool install graphifyy` and `GRAPHIFY_BACKEND=none graphify extract . --code-only`.
3. Copy generated `graph.json` and `graph.html` into this app's `data/` directory.
4. Write `data/manifest.json` as `{ "repo": { "owner": "...", "name": "pr-reality-check-demo" }, "graphCommit": "<main sha>", "graphifyVersion": "<version>" }`.
5. Create GitHub issue #1 from `GITHUB_TEXT.md`.
6. Push `fix/session-ttl-ms`, `fix/login-timeout`, and `fix-expiry-units`, then open PRs A, B, and C from the prepared text.
7. **Never push to demo `main` after the PRs are open.** The graph and all three PRs must retain that shared base.
8. Merge Claude's analyzer files without changing the app contract, run `npm test`, and verify health reports `analyzer: "real"`.
9. Deploy on Cloudways Velocity with Node 22, root `/`, start command `npm start`, and all secrets marked Sensitive.
10. Run `node scripts/warm-cache.js https://<cloudways-url>` and commit the genuine replay cards for the demo.
