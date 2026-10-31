# DECISIONS — core engine (Claude)

Every judgement call in `server/{graph,issue,evidence,gemma,analyze,schema}.js`, with the reason.

## Graph normalization (`server/graph.js`)
| Decision | Reason |
|---|---|
| Edges from `raw.links ?? raw.edges`; source/target may be ids or `{id}` objects | networkx node-link uses `links`; some exporters use `edges` |
| Relation names lower-cased and aliased (`call→calls`, `import→imports`, `extends→inherits`, …) in `RELATION_ALIASES` | Unknown relation names would silently drop out of traversal; `check.js --inspect` lists any still unknown |
| `source_location` parsed as `L42`, `L42-L60`, or a number; end line kept when present | End line stops "nearest preceding symbol" from swallowing code after a function ends |
| File nodes detected by `kind/node_type` = file/module, or label = basename / path; if a file has none, a virtual `file:<path>` node is used | Graphify's file-node shape is unverified for JS |
| **Edge direction**: `EDGE_SOURCE_IS_CALLER` defaults to `true`; overridable by env `EDGE_SOURCE_IS_CALLER=false` with no code change | All caller/callee logic goes through `dependentsOf` / `dependenciesOf`, so one switch flips everything |
| Degree for god nodes ignores structural edges (`contains`, `method`, `defines`); file nodes are never god nodes | Otherwise file nodes with many `contains` edges win |
| God nodes: top 3 when graph < 100 nodes, else top 5% of symbols; ties broken by id | HLD §4.2 |

## Diff → touched nodes
| Decision | Reason |
|---|---|
| Old-side walker exactly as HLD §4.1 (`'+'` → insertion point `max(old-1,1)`) | Graph is pinned to the base commit |
| Blank / whitespace-only changed lines are ignored (not counted, not mapped) | A blank `+` line after `now()` was being mapped to `now()` |
| **Definition-aware mapping**: a changed line that defines a top-level name (column 0: `function x`, `const X =`, `class X`; Python `def`) maps to that symbol if it exists in the file; if not, to the file node and the name goes to `unmappedAdditions`. The following `+` lines of a new definition also go to the file node | Pure "nearest preceding symbol" mapped `REQUEST_TIMEOUT_MS` to `SESSION_TTL_SECONDS` and `retryDispatch`'s body to `health()` — both would corrupt relevance |
| Indented `const x = …` is never a definition | Locals inside functions are not symbols |
| New-definition lines in a file the graph knows count as **mapped (file level)** | Otherwise any PR adding a helper (PR B, PR C) drops below 50% coverage and goes to needs_context |
| Lines in files the graph does not know (status `added`, or path not in graph) count as **unmapped** | Honest coverage; > 50% unknown → metrics null |
| Files with no line numbers: use git's hunk-header function context (`@@ … @@ function foo(`) to pick the symbol, else the file node; precision `file` | HLD §11 fallback |
| No `patch` (binary/huge): file-level touch, `changes` counted as mapped if the file is in the graph; `removed` touches all its symbols | GitHub omits patches for large files |
| Renamed files use `previous_filename` for the base-graph lookup, `filename` for head URLs | Old-side lines belong to the old path |
| Test files: `TEST_RE` = `tests?/`, `__tests__/`, `specs?/` dirs, `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py|go` | HLD's `/test|spec/` matches `attestation.js` |
| Test files are excluded from T, relevance and coverage; listed as `coverage.testsChanged` and added to `testsToRun` | A changed test should be run |

## Blast radius
| Decision | Reason |
|---|---|
| Reverse BFS over `calls|uses|references|inherits` + importers of the touched node's file (edges may target the file node or any symbol in it); importers collapse to their file node | Import edges in Graphify may point at files or symbols |
| Depth ≤ 2, cap 50, `truncated` flag; `edgeConfidence` counts the confidence of each edge actually traversed | HLD §4.2 |
| `testsToRun` = test files among dependents ∪ tests changed | |

## Issue anchors (`server/issue.js`)
| Decision | Reason |
|---|---|
| Code-fence marker lines are removed but their contents are kept | The stack trace lives inside the fence |
| Exact anchors: JS frames `at fn (path:line)`, Python `File "x", line N, in fn`, backticked identifiers/paths, `foo()` calls. Fuzzy: CamelCase / snake_case words in prose (≥ 4 chars, minus a stop list) | HLD §4.3 |
| Anchor **files** only from frames and explicit paths (with an extension) | A prose word must not make a whole file "relevant" |
| Symbols match on bare name (`createSession()` → `createsession`) or `norm_label`; a frame's symbol prefers nodes in the frame's file | Disambiguates same-named functions |
| Fuzzy matches count as anchors (tagged `fuzzy`) | HLD: "fuzzy word matches add symbols only" |
| File nodes are never anchors | HLD §4.4 |

## Metrics / priority (`server/evidence.js`)
| Decision | Reason |
|---|---|
| N1(A) = anchors ∪ 1-hop neighbours over call-type edges (either direction) ∪ symbols in anchor files. Only anchors are expanded, not anchor-file symbols | HLD §4.4; expanding anchor-file symbols would pull in most of the app |
| `relevance` = |T∩N1| / |T| over **non-test symbol** nodes. File-level touches are not in the denominator but are listed in `unexplained` unless they are an anchor file | An import-line tweak should not halve relevance |
| **Metrics object is never null in graph mode.** Issue-dependent fields (`issueAreaHit`, `relevance`, `communityOverlap`) become `null` and `nullReason` is set when: no linked issue / no anchors / no non-test changes / mapped < 50% / no symbol-level changes. Structural fields (blastRadius, godNodesTouched, edgeConfidence) stay | The card can still show impact; see Contract questions in HANDOFF |
| Priority table exactly HLD §4.6; thresholds are named constants at the top of `evidence.js` (0.5 / 0.25 / coverage 0.5 / Jaccard 0.3) | Not fitted to the 3 fixtures: A=1.0, B=0.0, C=1.0 sit far from both cut-offs |
| Duplicates: Jaccard over non-test **symbol** sets; same linked issue and J ≥ 0.3 → `possible_duplicate`; any shared symbol or shared community otherwise → `coordinate` | File nodes would inflate overlap on shared files |

## Evidence records
| Decision | Reason |
|---|---|
| Order: issue quotes → metric summary → touched nodes (≤8) → diff hunks (≤8) → graph paths (≤5) → blast radius → overlaps (≤4) → coverage gap | Most decision-relevant first; the cap drops the tail |
| Caps: 25 records, ~6000 chars total (first two always kept, later records skipped if they would overflow), 600 chars per record | HLD §4.7 |
| URLs: issue quotes → `issue.html_url`; diff hunks → blob at **head SHA**, new-side `#Lx-Ly`; touched nodes / graph paths → blob at **manifest.graphCommit**, base-side line; metric/blast/coverage → PR `/files`; overlaps → the other PR | Every record clickable; base lines only make sense at the graph commit |
| `graph_path` = shortest undirected call-graph path (≤ 4 hops) from each changed symbol to any anchor | Shows "how far" an off-target change is (B: withTimeout → dispatch → handleLogin → login → createSession) |

## Gemma (`server/gemma.js`)
| Decision | Reason |
|---|---|
| One call, `temperature 0.2`, `systemInstruction`; on a 400 mentioning system/instruction, retry once with the prompt prepended and remember that for the process | Gemma on the Gemini API may reject system instructions |
| One retry with backoff (2 s, 4 s for 429) on 429/5xx/timeouts; `httpOptions.timeout` 45 s (`GEMMA_TIMEOUT_MS`) | Hackathon Wi-Fi |
| `GEMMA_THINKING_LEVEL` env (e.g. `minimal`) adds `thinkingConfig.thinkingLevel` | Latency switch without code change |
| `extractJson`: strip fences, slice first `{`..last `}`, retry with trailing commas removed | |
| Light coercion before zod (lower-case enums, `"E3, E5"` strings → id arrays, string findings → objects) | Fewer pointless repair calls |
| One repair call with the zod error; still invalid → deterministic fallback | HLD §4.8 |
| Citation filter (graph mode): a finding/test needs ≥ 1 id and all ids must exist; `existing` tests must name a server-known test (testsToRun ∪ testsChanged); 0 findings left → fallback. Dropped count is reported in limitations | "Model text must be traceable to E-ids or it's dropped" |
| Confidence = min(model, server cap). Cap: `low` if precision `file`, graph stale, or relevance null; `high` only if ≥ 80% mapped and an exact anchor exists; else `medium`. Fallback uses the cap directly | No numeric score; confidence comes from coverage |
| Priority: `finalPriority = rulePriority`; if the model's suggestion differs → `needs_context` with both reasons. The rule priority is **not** sent to the model (only metrics + a priority guide in `SCHEMA_HINT`) | Keeps the model's view independent so disagreement means something |
| Diff-only: same model + system prompt, contents = PR title/description + diff (≤ 10k chars), no issue/evidence/metrics; no citation filter; `finalPriority` = model suggestion | HLD §4.8 |
| Fallback assessment uses only server strings and PR title; `provenance.assessmentSource = "fallback"` and a limitation says so | Honest badge |
| No tools in MVP (TODO in `createGemmaClient`) | Stretch |

## Card (`server/schema.js`, `server/analyze.js`)
| Decision | Reason |
|---|---|
| Added fields beyond HLD §5.2: `metrics.issueAreaNodes`, `metrics.unexplained` (with URLs), `metrics.nullReason`, `coverage.testsChanged`, `overlaps[].sameIssue`, `provenance.assessmentSource`, `provenance.promptVersion` | UI can show unexplained changes and an honest LLM/fallback badge; all additive |
| `analyze(input, opts?)` — optional `opts = { client, noLlm, sleep }` for tests and `check.js`; the app calls `analyze(input)` | Contract signature unchanged |
| Graph index memoized by `manifest.graphCommit` (max 2) | `graph.json` parsed once per commit |
| `analyze` never throws: any error or a card failing `CardSchema` → `errorCard` (valid, needs_context) | Contract |
| `PROMPT_VERSION = "core-v1"` | Part of Codex's cache key; bump on prompt/schema change |
