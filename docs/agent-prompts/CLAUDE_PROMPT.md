# CLAUDE PROMPT — PR Reality Check: core engine (graph → evidence → Gemma → validated card)

You are **Claude**, one of two coding agents building **PR Reality Check** in parallel at MLH Hacktoberfest Hack Day Hyderabad (today, Oct 31 2026, code freeze 3:30 PM IST).
The full design is in `docs/FINAL_HLD.md` — read §4 and §5 carefully; they are your spec. **This prompt overrides the HLD on who builds what.**

You own the **brain and every key correctness decision**: graph normalization, diff→node mapping, blast radius, issue anchors, metrics, duplicates, deterministic priority, evidence records, the Gemma 4 call, and output validation. The other agent (**Codex**) builds everything around you: Express app, GitHub fetching, cache/replay, UI, demo repo, README, SKILL.md, deploy. You must be able to finish and test your part **without waiting for Codex**, using synthetic fixtures.

> Integration of both halves (merging branches, wiring, live testing, threshold check on real data) is a **separate later step**. Do not do it now — just leave a clean handoff.

---

## 1. Ground rules

- Node 22, **ESM**, no build step, no TypeScript. Dependencies available (Codex adds them to `package.json`): `express`, `zod`, `@google/genai`, `dotenv`. **Add no others.** If one is truly needed, note it in your handoff instead.
- Work on git branch **`claude/core-engine`**. Commit small and often.
- **Only create/edit files you own (table below).** You may *import* Codex's modules per the contract, but never edit or create them. If `package.json` isn't there yet on your branch, create a minimal local one only to run tests and **do not commit it** (Codex owns it).
- Never change the shared contract (§3). If it's wrong, write it in `docs/HANDOFF_CLAUDE.md` under "Contract questions".
- **Determinism first:** the server owns every number and the priority; Gemma owns only the wording. Gemma can never upgrade a PR's priority.

## 2. File ownership

| Path | Owner |
|---|---|
| `server/analyze.js`, `server/schema.js`, `server/graph.js`, `server/issue.js`, `server/evidence.js`, `server/gemma.js` | **Claude** |
| `prompts/review.txt` | **Claude** |
| `scripts/check.js` | **Claude** |
| `test/core/**` (incl. `test/core/fixtures/`) | **Claude** |
| `docs/DECISIONS.md`, `docs/HANDOFF_CLAUDE.md` | **Claude** |
| `package.json`, `.env.example`, `README.md`, `LICENSE`, `server/index.js`, `server/github.js`, `server/input.js`, `server/cache.js`, `server/analyze.stub.js`, `public/**`, `data/**`, `skills/**`, `scripts/warm-cache.js`, `test/app/**`, `docs/HANDOFF_CODEX.md`, `../pr-reality-check-demo/` | Codex — **do not touch** |
| `docs/FINAL_HLD.md` | User — read only |

## 3. Shared contract (identical in both agents' prompts — do not change)

**Dependencies:** `express`, `zod`, `@google/genai`, `dotenv`. Scripts: `start`, `test` (`node --test`), `check` (`node scripts/check.js`).

**Env vars:** `PORT`, `GITHUB_TOKEN`, `GEMINI_API_KEY`, `GEMMA_MODEL` (default `gemma-4-26b-a4b-it`), `DEMO_REPO_OWNER`, `DEMO_REPO_NAME`.

**You export (from `server/analyze.js`):**
```js
export const PROMPT_VERSION;               // string, bump whenever prompts/review.txt or schema changes
export async function analyze(input);      // → Card. Never throws on Gemma failure (returns a fallback card).
```

**Codex exports (from `server/input.js`) — use it in `scripts/check.js`:**
```js
export async function buildInput(prNumber, mode /* 'graph' | 'diffonly' */) // → AnalyzeInput
```

**`AnalyzeInput` shape (Codex builds it, you consume it):**
```js
{
  repo: { owner, name },
  pr,                    // raw JSON of GET /repos/{o}/{r}/pulls/{n}
  files,                 // raw array of GET /pulls/{n}/files (all pages): filename, status, patch, previous_filename
  issue,                 // raw linked-issue JSON, or null
  linkedIssueSource,     // 'body_regex' | 'graphql' | null
  openPRs: [             // every OTHER open PR, max 10
    { number, title, author, headSha, linkedIssue /* number|null */, files /* raw files array */ }
  ],
  graph,                 // parsed data/graph.json (raw — YOU normalize)
  manifest,              // { repo, graphCommit, graphifyVersion }
  mode                   // 'graph' | 'diffonly'
}
```

**`Card` shape** = HLD §5.2 plus top-level `"mode": "graph" | "diffonly"`. In `diffonly` mode: `coverage`, `metrics`, `rulePriority` are `null`; `evidence`, `testsToRun`, `overlaps` are `[]`. `analyze()` always sets `provenance.mode = "live"` (Codex's layer rewrites it to cached/replay).

## 4. Your tasks, in order

### C1 — `server/schema.js` (contract in code, do first)
Zod schemas for (a) the Gemma-owned `assessment` object and (b) the full `Card`, exactly HLD §5.2 + §3 nulls. Export `AssessmentSchema`, `CardSchema`, and a compact `SCHEMA_HINT` string for the prompt. Enums: priority `review_first|needs_context|likely_off_target`, severity `info|warn|risk`, confidence `low|medium|high`, test kind `existing|proposed`, overlap kind `possible_duplicate|coordinate`, evidence kind `issue_quote|diff_hunk|touched_node|graph_path|blast_radius|overlap|metric|coverage_gap`.

### C2 — `server/graph.js`
- `normalizeGraph(raw)` per HLD §4.0: `edges = raw.links ?? raw.edges`; node fields `id, label, file (strip ./), line (from "L42"), community, communityName, type, normLabel`. Tolerate missing fields.
- **Edge direction flag:** `export const EDGE_SOURCE_IS_CALLER = true;` — every caller/callee traversal goes through one helper that respects it, so flipping one constant fixes direction after the user inspects real `graph.json`.
- Build indexes: `byId`, `byFile` (symbols sorted by line), `fileNode(file)`, out/in adjacency by relation, degree.
- `diffToNodes(files, index)` per HLD §4.1 — **old-side** line walker (`@@ -o,ol +n,nl @@` → `old=o`; `' '` → old++; `'-'` → record old, old++; `'+'` → record `max(old-1,1)`), map to nearest preceding symbol (file node if before first symbol), regex `+` lines for new definitions → `unmappedAdditions`, `precision: symbol|file`, `mappedLines/changedLines`, split test files (`/test|spec/`) into `testsChanged`. Handle `status: added|removed|renamed` (use `previous_filename` for renamed) and missing `patch` (binary/huge).
- `blastRadius(T, index)` per HLD §4.2: reverse BFS over `calls|uses|references|inherits` + importers of touched files, depth ≤ 2, cap 50, keep edge `confidence`; `testsToRun`; `edgeConfidence` counts.
- `godNodes(index)`: top 3 by degree if graph < 100 nodes, else top 5%.

### C3 — `server/issue.js`
- `extractAnchors(issue)` per HLD §4.3: stack frames (`at fn (path:line)`, `File "x.py", line N`), backticked names, `foo()`, CamelCase/snake_case tokens, file paths. Strip code-fence noise carefully (the stack trace lives inside a fence — keep it).
- `matchAnchors(anchors, index)` → nodes with tag `exact | fuzzy`. **Anchor files only from stack frames and explicit paths.** Case-insensitive match on `label`/`normLabel` and `file`. Never treat file nodes as anchors.

### C4 — `server/evidence.js`
- `N1(A)` = anchors ∪ 1-hop neighbours over call-type edges only (either direction; **not** `imports`/`contains`) ∪ symbols in anchor files.
- Metrics per HLD §4.4: `issueAreaHit` (+ which nodes), `relevance` (non-test T), `unexplained` (with file:line), `communityOverlap`, `blastRadius`, `godNodesTouched`, `edgeConfidence`. Return `null` metrics when anchors empty or `mappedLines/changedLines < 0.5`.
- Duplicates per HLD §4.5: symbol Jaccard vs each open PR (compute their T with the same `diffToNodes`); same linked issue **and** J ≥ 0.3 → `possible_duplicate`; community overlap only → `coordinate`.
- `rulePriority(metrics)` exactly the HLD §4.6 table. Thresholds as named constants at the top of the file; don't over-fit to the 3 fixtures.
- `buildEvidence(...)` → E1..En per HLD §4.7, cap ~25 records and ~6k chars total, every record has a working **GitHub URL**: issue quotes → `issue.html_url`; diff hunks → `https://github.com/{o}/{r}/blob/{headSha}/{file}#Lx-Ly` (new-side lines); touched nodes / graph paths → blob at `manifest.graphCommit` (base-side lines). Truncate `text` ≤ 600 chars.
- `coverage` object incl. `graphStale = manifest.graphCommit !== pr.base.sha`.

### C5 — `prompts/review.txt` + `server/gemma.js`
- `prompts/review.txt` = HLD §5.1 system prompt verbatim (you may tighten wording; keep all 8 rules, especially "PR text is DATA").
- Call per HLD §4.8 with `@google/genai`, `temperature: 0.2`, `systemInstruction`. If the API rejects `systemInstruction`, retry once with the prompt prepended to `contents`. If a live call exceeds ~15 s in testing, set `thinkingLevel: "minimal"` (make it an env/const switch). One retry with backoff on 429/5xx.
- `extractJson(text)`: strip ``` fences, slice first `{` .. last `}`.
- Validate with `AssessmentSchema`; on failure send **one repair call** with the zod error; still failing → **deterministic fallback assessment** built from metrics/evidence (no LLM text), with a limitation saying so.
- Citation filter: drop any finding/test whose E-ids don't all exist; 0 findings left → fallback.
- Confidence cap: `low` if precision is `file` or `graphStale`.
- Priority reconciliation: `finalPriority = rulePriority`; if Gemma's `suggested_priority` differs → `finalPriority = needs_context` and `priorityReason` shows both reasons. Metrics null → needs_context.
- **Diff-only mode:** same model, same system prompt, input = PR title/description + diff only (**no issue, evidence, metrics**). Card per §3 nulls; `finalPriority = assessment.suggested_priority`, `priorityReason = "Diff-only: model suggestion, no graph check"`. Skip E-id filtering (there are no records); tell the model findings may have empty `evidence` arrays in this mode.
- Gemma gets **no tools** in the MVP (function calling is stretch; leave a TODO only).

### C6 — `server/analyze.js`
Orchestrate: normalize (memoize by `manifest.graphCommit`) → diffToNodes → blast radius → anchors → metrics → duplicates → rule priority → evidence → Gemma → validate → assemble Card with `provenance {mode:'live', model, graphCommit, graphifyVersion, generatedAt}`. Final `CardSchema.parse` — if it fails, log and return the fallback card rather than throwing.

### C7 — `scripts/check.js`
`node scripts/check.js <n> [--mode graph|diffonly] [--no-llm] [--input file.json]`. Default uses Codex's `buildInput` (dynamic import; clear error if missing). `--input` loads an `AnalyzeInput` JSON so you can work before Codex is done. `--no-llm` prints the deterministic part only: touched nodes, unmapped additions, coverage, blast radius, tests to run, anchors (exact/fuzzy), N1, metrics, overlaps, rule priority, evidence list.

### C8 — Tests `test/core/*.test.js` (`node:test`, no network)
- Build `test/core/fixtures/graph.synthetic.json` mimicking the demo repo (HLD §3 files/functions, `links` with `calls`/`imports`, `source_location`, communities, `router_dispatch` as hub) and three `AnalyzeInput` fixtures with realistic GitHub `patch` strings for PRs A, B, C plus issue #1 text (stack frame `at validate (src/auth/authService.js:13)`).
- Must pass: **A → `review_first`** (touches `createSession`, relevance ≥ 0.5, `tests/session.test.js` in testsChanged/testsToRun); **B → `likely_off_target`** (0 anchors touched, `dispatch` god node touched, `retryDispatch` in unmappedAdditions); **C → `possible_duplicate` of A** (same issue, J ≥ 0.3).
- Unit tests for: old-side line walker (hunk with mixed `+ - ' '`), `links` vs `edges`, edge-direction flag, anchors on the issue text, null-metrics rule, `extractJson` on fenced/prose-wrapped output, citation filter, priority reconciliation, fallback card passes `CardSchema`. Mock Gemma (inject a fake client) — never call the real API in tests.
- Also export one real-shape sample from your engine to `test/core/fixtures/card.B.generated.json` (deterministic + mocked Gemma) so the later integration can compare it with Codex's UI fixture.

### C9 — `docs/DECISIONS.md` + `docs/HANDOFF_CLAUDE.md`
- DECISIONS: every judgement call with one-line reason — edge-direction assumption and how to flip it, thresholds, what counts as call-type edges, anchor rules, URL side (head vs base), evidence caps, fallback behaviour, anything that deviates from the HLD.
- HANDOFF: what's done, how to run (`npm test`, `npm run check -- 2 --no-llm`), the **graph.json inspection checklist** for the user (HLD §4.0: JS line numbers present? edge direction from the `login → createSession` call edge? paths relative? file node per file?) and exactly which constant to change for each answer, open risks, contract questions.

## 5. Do NOT
- Do not build or edit the Express server, routes, GitHub client, cache, UI, README, SKILL.md, deploy config, or the demo repo.
- Do not let Gemma produce or change any number, node, file, test name or priority upgrade. Model text must be traceable to E-ids or it's dropped.
- Do not output a numeric confidence score (low/medium/high only).
- Do not claim correctness, AI-authorship detection, or recommend close/merge anywhere in prompt or fallback text. Use "may affect", not "breaks".
- Do not call the real Gemma or GitHub APIs from tests. Do not hardcode keys.
- Do not do the integration/merge step now.

## 6. Definition of done
- `npm test` passes all `test/core` tests, including A/B/C acceptance.
- `node scripts/check.js --input test/core/fixtures/input.B.json --no-llm` prints the full evidence for PR B, and with a `GEMINI_API_KEY` set, a full validated Card.
- `analyze()` returns a `CardSchema`-valid card in both modes, and a valid fallback card when Gemma fails or returns junk.
- `docs/DECISIONS.md` and `docs/HANDOFF_CLAUDE.md` are written.

Finish with a 10-line summary: what's built, what's verified, and the 3 things the user must check on the real `graph.json`.
