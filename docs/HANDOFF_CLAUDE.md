# HANDOFF — core engine (Claude, branch `claude/core-engine`)

## What's done
- `server/schema.js` — zod `AssessmentSchema`, `CardSchema`, `SCHEMA_HINT` (HLD §5.2 + contract nulls).
- `server/graph.js` — normalize (`links`/`edges`), index, edge-direction switch, old-side diff walker, definition-aware diff→node mapping, unmapped additions, blast radius, god nodes, shortest call path.
- `server/issue.js` — anchors (JS/Python frames, backticks, `foo()`, paths, fuzzy Camel/snake tokens) and matching.
- `server/evidence.js` — N1 issue area, metrics, null rule, rule priority, duplicates/coordinate, E1..En evidence with GitHub URLs, coverage.
- `server/gemma.js` + `prompts/review.txt` — Gemma 4 call (system-instruction fallback, retry, timeout, thinking switch), JSON extraction, coercion, zod validation, one repair, citation filter, confidence cap, deterministic fallback, diff-only contents.
- `server/analyze.js` — `PROMPT_VERSION`, `analyze(input)` (never throws), `computeDeterministic(input)` for debugging.
- `scripts/check.js` — debug CLI incl. `--inspect <graph.json>` for the 11:25 checklist.
- `test/core/**` — 33 tests (+1 opt-in generator), synthetic graph and A/B/C inputs, `card.B.generated.json` sample.

**Verified:** `npm test` green (A→review_first, B→likely_off_target, C→possible_duplicate of A; fallback + diff-only cards pass `CardSchema`).
**Not verified:** a live Gemma call. `@google/genai` could not be installed in my sandbox (registry blocked), so `createGemmaClient` is untested against the real API. First thing to run once merged with a key set:
`node scripts/check.js --input test/core/fixtures/input.B.json` → expect `"assessmentSource": "model"`.

## How to run
```bash
npm test                                                   # all tests (core + app)
node --test test/core/                                     # if your node needs files: node --test test/core/*.test.js
node scripts/check.js --input test/core/fixtures/input.B.json --no-llm   # deterministic evidence for PR B
node scripts/check.js --input test/core/fixtures/input.B.json            # + Gemma (needs GEMINI_API_KEY)
npm run check -- 3 --no-llm                                # real PR via Codex's buildInput (after merge)
npm run check -- 3 --mode diffonly
node scripts/check.js --inspect data/graph.json            # graph.json checklist below
node test/core/fixtures/build-fixtures.js --write          # regenerate synthetic fixtures
WRITE_SAMPLE=1 node --test test/core/acceptance.test.js    # regenerate card.B.generated.json
```
Fixture PR numbers: A = #2, B = #3, C = #4, issue #1 (real numbers depend on the order you open them).

## graph.json inspection checklist (11:25) — `node scripts/check.js --inspect data/graph.json`
| Check | If the answer is… | Change |
|---|---|---|
| 1. JS symbols have `source_location` (line numbers)? | No | Nothing to edit: mapping falls back to hunk-header function names, `precision: "file"`, confidence capped `low`. Expect weaker cards; consider `graphify update` / a newer graphify |
| 2. Edge direction: `login → createSession` call edge has source = caller? | Source is the **callee** | Set env `EDGE_SOURCE_IS_CALLER=false` (local `.env` and Cloudways), or edit the default in `server/graph.js` |
| 3. Paths relative to repo root (`src/session/sessionStore.js`)? | Absolute or prefixed with the repo folder | Re-run Graphify from inside the demo repo root (`graphify extract . --code-only`). Leading `./` is already stripped |
| 4. A file-level node per file? | No | Nothing to edit: virtual file nodes are used. Check that `--inspect` shows `imports` edges; if import edges are missing, `testsToRun` will come only from call edges |
| (extra) Relation names | `--inspect` prints "Unknown relations" | Add aliases to `RELATION_ALIASES` in `server/graph.js` (e.g. `"invokes": "calls"`) |
| (extra) God nodes | `dispatch` not in the top 3 | Fine for the logic (badge only); the demo script mentions it, so check the wording |

After any change: `npm run check -- <B's number> --no-llm` must still print `likely_off_target`.

## Open risks
1. **Real graph shape** — labels like `createSession()` and `module.fn` are handled; anything else shows up as anchors with ✗ in `check.js`. Fix by aliasing, not by changing thresholds.
2. **Live Gemma untested** (see above). If `systemInstruction` is rejected, the code already retries with the prompt prepended. If calls are slow, set `GEMMA_THINKING_LEVEL=minimal`.
3. **Model disagreement** turns A or B into `needs_context`. That is by design; if it happens on the demo PRs, look at `priorityReason`, and consider bumping prompt wording (then bump `PROMPT_VERSION`).
4. **Demo repo line numbers** — my fixtures assume `validate` throws on line 13 of `authService.js` and the layout in `test/core/fixtures/build-fixtures.js`. The engine doesn't depend on that, but evidence links will reflect the real repo.
5. `node --test` with no args runs every `.js` under `test/` (Node's default glob). My `helpers.js` / `build-fixtures.js` are safe to load (no writes without `--write`).

## Contract questions (for the integration step; the contract itself was not changed)
1. **Metrics nulls:** in graph mode I return a metrics object with `issueAreaHit/relevance/communityOverlap = null` and `nullReason` set, instead of `metrics: null`, so the card still shows blast radius and god nodes. `metrics: null` only happens in diff-only mode or `errorCard`. The UI must handle null numeric fields inside metrics.
2. **Additive card fields:** `metrics.issueAreaNodes`, `metrics.unexplained[] {id,label,file,line,url}`, `metrics.nullReason`, `coverage.testsChanged`, `overlaps[].sameIssue`, `provenance.assessmentSource` (`model|fallback`), `provenance.promptVersion`. Suggest the UI shows `assessmentSource` next to the LIVE/CACHED/REPLAY badge ("model" vs "evidence only").
3. **New optional env vars** for `.env.example` (Codex's file): `EDGE_SOURCE_IS_CALLER` (default true), `GEMMA_THINKING_LEVEL` (unset), `GEMMA_TIMEOUT_MS` (45000).
4. `analyze(input, opts)` accepts an optional second argument (`{ client, noLlm, sleep }`); the app should keep calling `analyze(input)`.
5. Claim text comes from `input.pr.title` / `input.pr.body` (raw PR JSON) — please keep the raw `pr` object as the contract says.
6. Codex's hand-written fixture cards may lack `provenance.assessmentSource` / `promptVersion`; that's fine for rendering, but they will not pass my `CardSchema` if anyone validates them.
