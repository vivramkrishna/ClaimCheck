# CODEX PROMPT — PR Reality Check: app shell, GitHub I/O, UI, demo repo, docs

You are **Codex**, one of two coding agents building **PR Reality Check** in parallel at MLH Hacktoberfest Hack Day Hyderabad (today, Oct 31 2026, code freeze 3:30 PM IST).
The full design is in `docs/FINAL_HLD.md`. Read it once, but **this prompt overrides it on who builds what**.

The other agent (**Claude**) builds the *brain*: graph engine, issue anchors, metrics, evidence records, Gemma 4 call, validation. **You build everything around it**: the demo fixture repo, the Express app, GitHub fetching, cache/replay, the UI, deploy config, and docs. You must be able to finish and run your whole part **without waiting for Claude**, using a stub.

---

## 1. Ground rules

- Node 22, **ESM** (`"type": "module"`), **no build step**. Express + one `public/index.html` (Tailwind CDN + vanilla JS). No React, no Vite, no TypeScript, no bundler.
- Work on git branch **`codex/app-shell`**. Commit small and often with clear messages.
- **Only create/edit files you own (table below).** If you need something from a Claude-owned file, code against the contract in §3 — never edit Claude's files, never create them, never write "temporary" versions of them.
- Never change the shared contract (§3). If you think it is wrong, write the problem in `docs/HANDOFF_CODEX.md` under "Contract questions" and keep going with the contract as written.
- Never put secrets in code or commits. `.env` is git-ignored; only `.env.example` is committed.
- Product rules you must respect in UI and copy: the tool **never closes or merges PRs**, never claims a PR is "correct", never claims to detect AI authorship. Wording is "may affect", not "breaks". Fixtures are labeled **synthetic**.

## 2. File ownership

| Path | Owner |
|---|---|
| `package.json`, `.env.example`, `.gitignore`, `LICENSE` (MIT), `README.md` | **Codex** |
| `server/index.js`, `server/github.js`, `server/input.js`, `server/cache.js`, `server/analyze.stub.js` | **Codex** |
| `public/index.html` (and any `public/*` assets) | **Codex** |
| `data/graph.json`, `data/graph.html`, `data/manifest.json` (copied in by the user), `data/cache/`, `data/replay/`, `data/fixtures/` | **Codex** |
| `skills/pr-reality-check/SKILL.md` | **Codex** |
| `scripts/warm-cache.js` | **Codex** |
| `test/app/**` | **Codex** |
| `docs/HANDOFF_CODEX.md` | **Codex** |
| Whole sibling repo `../pr-reality-check-demo/` | **Codex** |
| `server/analyze.js`, `server/schema.js`, `server/graph.js`, `server/issue.js`, `server/evidence.js`, `server/gemma.js` | Claude — **do not touch** |
| `prompts/review.txt`, `scripts/check.js`, `test/core/**`, `docs/DECISIONS.md`, `docs/HANDOFF_CLAUDE.md` | Claude — **do not touch** |
| `docs/FINAL_HLD.md` | User — read only |

## 3. Shared contract (identical in both agents' prompts — do not change)

**Dependencies (you put all of these in `package.json` now, Claude needs them too):** `express`, `zod`, `@google/genai`, `dotenv`. Scripts: `"start": "node server/index.js"`, `"test": "node --test"`, `"check": "node scripts/check.js"`. `"engines": {"node": ">=20"}`.

**Env vars:** `PORT` (default 3000), `GITHUB_TOKEN` (fine-grained, read-only, demo repo only), `GEMINI_API_KEY`, `GEMMA_MODEL` (default `gemma-4-26b-a4b-it`), `DEMO_REPO_OWNER`, `DEMO_REPO_NAME` (default `pr-reality-check-demo`).

**Claude exports (from `server/analyze.js`):**
```js
export const PROMPT_VERSION;               // string, used in your cache key
export async function analyze(input);      // → Card. Never throws on Gemma failure (returns a fallback card).
```

**You export (from `server/input.js`) — Claude's `scripts/check.js` imports this, so keep the signature exact:**
```js
export async function buildInput(prNumber, mode /* 'graph' | 'diffonly' */) // → AnalyzeInput
```

**`AnalyzeInput` shape (you build it, Claude consumes it):**
```js
{
  repo: { owner, name },
  pr,                    // raw JSON of GET /repos/{o}/{r}/pulls/{n}
  files,                 // raw array of GET /pulls/{n}/files?per_page=100 (all pages)
  issue,                 // raw JSON of GET /issues/{m} for the linked issue, or null
  linkedIssueSource,     // 'body_regex' | 'graphql' | null
  openPRs: [             // every OTHER open PR (exclude this one), max 10
    { number, title, author, headSha, linkedIssue /* number|null */, files /* raw files array */ }
  ],
  graph,                 // parsed data/graph.json (raw, un-normalized — Claude normalizes)
  manifest,              // parsed data/manifest.json: { repo, graphCommit, graphifyVersion }
  mode                   // 'graph' | 'diffonly'
}
```

**`Card` shape** = HLD §5.2, plus a top-level `"mode": "graph" | "diffonly"`. In `diffonly` mode these are `null`: `coverage`, `metrics`, `rulePriority`; and `evidence`, `testsToRun`, `overlaps` are `[]`. `analyze()` always sets `provenance.mode = "live"`; **your app layer overwrites it** to `"cached"` or `"replay"` when serving from disk. UI must handle every nullable field without crashing.

## 4. Your tasks, in order (deploy-first)

### T1 — Hello-world deploy (do first, ~10 min)
- `package.json` per §3, `server/index.js` with `GET /api/health` → `{ ok: true, version, graphCommit|null, analyzer: "real"|"stub" }`, static `public/`, `app.listen(process.env.PORT || 3000)`.
- Placeholder `public/index.html` that says "PR Reality Check" and calls `/api/health`.
- `.env.example`, `.gitignore` (`node_modules`, `.env`), MIT `LICENSE`.
- In `README.md` add a **Deploy (Cloudways Velocity)** section: choose framework preset manually, Node 22, root `/`, start command `npm start`, env vars added as *Sensitive*, `PORT` comes from env. Done when `npm start` → `curl localhost:3000/api/health` returns ok.

### T2 — Demo fixture repo `../pr-reality-check-demo/` (separate git repo)
Build exactly HLD §3: JavaScript ESM, `node:test`, zero dependencies, ~9 source files + 3 test files.
- `main` contains the **seconds-added-to-ms bug** in `createSession` (`expiresAt: now() + ttlSeconds`).
- `src/auth/authService.js`: `validate(id)` must throw `new Error('401 Session expired')` on **line 13** exactly (the issue's stack frame points there). Verify with `grep -n`.
- `src/http/router.js` `dispatch` is the hub calling `handleLogin`, `handleProfile`, `health`. `middleware.js` `requireAuth` → `validate`; `withTimeout` uses `REQUEST_TIMEOUT_MS`.
- Tests on `main` must **pass** (they must not already catch the bug).
- README: "Synthetic demo fixtures for PR Reality Check — not a real project."
- Create three branches off `main`, one commit each:
  - `fix/session-ttl-ms` (PR A): `ttlSeconds * 1000` + a regression test in `tests/session.test.js`.
  - `fix/login-timeout` (PR B): `REQUEST_TIMEOUT_MS` 5000→30000, add retry in `dispatch` (a new `retryDispatch` helper), tweak `withTimeout`. **Must not touch** `sessionStore.js`, `authService.js` or `isExpired`.
  - `fix-expiry-units` (PR C): add `toMs(seconds)` to `src/utils/time.js`, use it in `createSession`.
- Write `../pr-reality-check-demo/GITHUB_TEXT.md` with the exact Issue #1 title/body (HLD §3, including the stack trace in a code block) and the three PR titles + descriptions (PR B's description is the polished misleading one). Add optional `gh` commands to create the issue and PRs.
- **Do not push anything.** The user pushes `main`, runs Graphify on their laptop, then opens the PRs. Note in the handoff: *never push to demo `main` after the PRs are open.*

### T3 — `server/github.js`
Plain `fetch`, no SDK. Header `Authorization: Bearer ${GITHUB_TOKEN}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- `getPR(n)`, `getPRFiles(n)` (paginate `per_page=100`), `getIssue(m)`, `listOpenPRs()` (`/pulls?state=open&per_page=10`).
- `resolveLinkedIssue(pr)` → `{ number, source } | null`:
  1. Regex on PR body: `/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i` → `source: 'body_regex'`.
  2. Fallback GraphQL `POST https://api.github.com/graphql`: `repository(owner,name){ pullRequest(number:$n){ closingIssuesReferences(first:5){ nodes{ number } } } }` → `source: 'graphql'`.
  3. **Never use `pr.issue_url`** — that is the PR's own issue record, not the linked issue. Add a comment saying so.
- Errors: throw an `Error` with `status` and a short message; surface 401/403/404/rate-limit clearly. One retry with backoff on 5xx.

### T4 — `server/input.js` → `buildInput(prNumber, mode)`
Assemble `AnalyzeInput` exactly per §3. Load `data/graph.json` + `data/manifest.json` once and keep in memory. For `openPRs`, fetch files of each other open PR (cap 10), and memoize per `headSha` in memory.

### T5 — `server/cache.js` + replay
- `cacheKey(input)` = sha1 of `pr.head.sha + issue?.updated_at + sorted(openPRs.map(p => p.number+':'+p.headSha)).join(',') + manifest.graphCommit + PROMPT_VERSION + GEMMA_MODEL + mode`.
- Store at `data/cache/<n>-<mode>-<hash>.json`. `get(key)`, `set(key, card)`.
- Replay files: `data/replay/<n>-<mode>.json`.

### T6 — `server/analyze.stub.js` + fixtures
- Same exports as Claude's `analyze.js` (`PROMPT_VERSION = 'stub'`, `analyze(input)`), returns a fixture card with `pr` fields filled from the real input.
- Hand-write `data/fixtures/card.graph.sample.json` (a PR-B-like `likely_off_target` card with 6–8 evidence records, a god node, tests, a coordinate overlap, a `needs_context` limitation) and `data/fixtures/card.diffonly.sample.json`, both matching HLD §5.2 + §3 nulls. Mark them `"_synthetic": true`.
- `index.js` loads the analyzer like this, so Claude's file replaces the stub automatically when merged:
```js
let analyzer, analyzerKind = 'real';
try { analyzer = await import('./analyze.js'); } catch { analyzer = await import('./analyze.stub.js'); analyzerKind = 'stub'; }
```

### T7 — Routes in `server/index.js`
- `GET /api/health` (above).
- `GET /api/prs` → `[{ number, title, author, headSha, linkedIssue, url }]`.
- `GET /api/analyze/:n?mode=graph|diffonly&refresh=1&replay=1`:
  - `replay=1` → serve `data/replay/<n>-<mode>.json` with `provenance.mode = 'replay'`, 404 JSON if missing.
  - else build input → cache hit (and not `refresh`) → serve with `provenance.mode = 'cached'`; miss → `analyze()` → save → serve.
  - Validate `n` is a positive integer and `mode` is one of two values. Errors → JSON `{ error, status }`, never an HTML stack trace.
- `GET /graph` → serve `data/graph.html`; friendly 404 page if missing.

### T8 — `public/index.html` (the evidence card UI)
Tailwind CDN + vanilla JS, mobile-friendly (judges open it on a phone), one file.
- Header with one-line pitch: *"Does this PR do what it claims? Graph-grounded evidence for maintainers. Never auto-closes."*
- PR list from `/api/prs`; click → load card. URL keeps state (`?pr=2&mode=graph`).
- **Mode toggle:** "Graph evidence" vs **"Diff-only review (what generic reviewers see)"** — use that exact label.
- Card sections: priority banner (`finalPriority` + `priorityReason`; if `rulePriority` ≠ `assessment.suggested_priority`, show both), claim vs reality, findings (severity colour + **E-id chips that link to `evidence[].url` in a new tab**), metrics shown **raw** (issueAreaHit, relevance, communityOverlap, blastRadius, god nodes, EXTRACTED/INFERRED edge badges), coverage (precision, mapped/changed lines, unmapped additions, stale-graph warning), tests to run, overlaps (badge "Possible duplicate of #N" vs "Coordinate with #N"), questions for the contributor, limitations, full evidence list, link to `/graph`.
- **Provenance badge** always visible: LIVE / CACHED / REPLAY + model + short graph commit + generatedAt. REPLAY must be loud (amber).
- "Refresh" button (`refresh=1`) and a small "Replay mode" switch (`replay=1`).
- **Security:** PR/issue/model text is untrusted. Render with `textContent` / created elements only — **no `innerHTML` with data**. Only allow `https://github.com/` URLs in evidence links.
- No "close", "merge", "approve" or "reject" buttons anywhere.
- Loading and error states (Gemma can take ~15 s: show "Analyzing with Gemma 4…").

### T9 — `scripts/warm-cache.js`
`node scripts/warm-cache.js <baseUrl>` → for every open PR × both modes, call `/api/analyze/:n?refresh=1` on that URL, save each response to `data/replay/<n>-<mode>.json` (keeping `provenance.mode` as returned). Print a summary table.

### T10 — `skills/pr-reality-check/SKILL.md` + `README.md`
- SKILL.md: copy HLD §5.5 exactly (frontmatter + steps); leave `<cloudways-url>` as a placeholder.
- README per HLD §5.6: problem → live URL placeholder + screenshot placeholder → how it works (copy the ASCII diagram from HLD §1) → evidence card fields → metrics and limits ("relevance ≠ correctness") → setup (`uv tool install graphifyy`, `GRAPHIFY_BACKEND=none graphify extract . --code-only`, env vars) → agent skill → demo fixtures (synthetic) → security (read-only token, PR text is data) → Deploy section → credits (Graphify/graphifyy, Gemma 4 via `@google/genai`, Express, zod, Tailwind CDN, GitHub REST/GraphQL, Cloudways Velocity, MLH) → "Built at MLH Hacktoberfest Hack Day Hyderabad, Oct 31 2026" → MIT.
- Positioning line (use it): *"Graphify gives us the structure; our contribution is checking the claim against the code, with a traceable evidence card."* Do not claim `graphify prs` features as new.

### T11 — Tests `test/app/*.test.js` (`node:test`, no network)
Linked-issue regex (Fixes/closes/resolves, case-insensitive, no false hit on `#1` alone), cache key stability and change on each part, routes with the stub (mock `fetch`), param validation, replay 404.

## 5. Do NOT
- Do not write any graph, diff-mapping, anchor, metric, duplicate, priority, evidence-record, prompt or Gemma code. Not even "just to test". Use the stub.
- Do not call the Gemini/Gemma API anywhere.
- Do not compute or invent numbers in the UI — render only what the card contains.
- Do not use `pr.issue_url` for the linked issue.
- Do not add frameworks, a build step, or dependencies beyond §3 (dev-only test helpers are not needed — use `node:test`).
- Do not push the demo repo, open real issues/PRs, or use a write-scoped token.
- Do not commit `.env`, tokens, or `node_modules`.

## 6. Definition of done
- `npm start` works; `/api/health` reports `analyzer: "stub"` today; `/api/prs`, `/api/analyze/2?mode=graph|diffonly`, `?replay=1` and `/graph` all respond correctly.
- UI renders both sample fixture cards fully, on desktop and at 375 px width, with working E-id links and provenance badge.
- Demo repo has `main` + 3 branches, tests pass on `main`, line 13 check verified, `GITHUB_TEXT.md` ready.
- `npm test` passes for `test/app`.
- `docs/HANDOFF_CODEX.md` written: what's done, how to run, exact env vars, what's stubbed, contract questions, and a checklist for the user (push demo `main` → run Graphify → copy `graph.json`/`graph.html` + write `manifest.json {repo, graphCommit, graphifyVersion}` into `data/` → open issue #1 and PRs A/B/C → deploy).

Finish by printing a 10-line summary of what you built and anything blocked.
