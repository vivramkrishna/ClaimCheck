
Here's the plan. I checked one thing first: graph.json format. It's networkx node-link output: nodes have id, label, community, community_name, source_file, source_location, file_type and norm_label, and links have source, target, relation, confidence and source_file. source_location is a start-line string like "L42". Two caveats: some extractors leave it empty (a Dart repo had ~25,000 nodes with no position at all), and you should read edges from `links` or `edges`, whichever exists. Python and TS repos should have line numbers.

---

## 1. High-level design

A Node/Express app on Cloudways loads a **precomputed graph.json** (built on the PR's **base** branch) into memory. For a PR, it:

1. Fetches the diff, PR body, linked issue and other open PRs from GitHub.
2. Maps changed lines to graph nodes and walks callers to get the blast radius.
3. Maps code names in the issue to nodes and scores the overlap between the two.
4. Gives Gemma 4 a compact **evidence pack**. Gemma writes the verdict, and every claim must cite a node ID.
5. A validator checks the JSON and citations, and the UI renders the card.

The graph decides; the model explains.

```
 GitHub API ─ files+patch, body, issue, open PRs      graphify extract --code-only (laptop)
      │                                                        │ graph.json (committed)
      ▼                                                        ▼
┌──────────────────── Node/Express @ Cloudways Velocity ─────────────────────┐
│ Diff parser ─► touched nodes ─► blast radius (reverse BFS, depth 2)        │
│ Issue mapper ─► claim nodes ──► overlap score ─► dup check (other PRs)     │
│                        ▼                                                   │
│          Evidence pack (deterministic scores + node IDs)                   │
│                        ▼                                                   │
│   Gemma 4 (gemma-4-26b-a4b-it) ⇄ tools: get_node / get_neighbors           │
│                        ▼                                                   │
│        Validator: schema + "every citation exists in graph"                │
└───────────────┬──────────────────────────────┬─────────────────────────────┘
                ▼                              ▼
         Evidence card UI              PR comment bot (stretch)
```

## 2. Unique angle

| Tool                       | Checks                                                              | Misses                                                       |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| anti-slop Action           | Size, account age, description length                               | Whether the code matches the claim                           |
| Generic AI PR reviewer     | Diff text only                                                      | Codebase structure; easily fooled by a confident description |
| **PR Reality Check** | Claim vs **graph-verified** reality, blast radius, duplicates | —                                                           |

- **Pitch:** "Others judge the author or the text. We check whether the change does what it says, using the codebase's own structure."
- **Demo proof:** a "Without graph / With graph" toggle on the off-target PR. Without the graph, Gemma believes the confident description. With it, Gemma flags "touches no login code; changes Router (131 dependents)."
- **Trust:** it never auto-closes PRs, every claim links to a node, and confidence comes from edge labels (EXTRACTED / INFERRED / AMBIGUOUS).

## 3. Core algorithm

**a) Diff → nodes**

- Parse each file's `patch` hunk headers `@@ -oldStart,oldLen +newStart,newLen @@`.
- The graph is built on base, so use **old-side line numbers**: deleted and changed lines directly, and for pure additions, the hunk's oldStart.
- Index: `file → [symbol nodes sorted by parseInt(source_location.slice(1))]`. A changed line maps to the **nearest preceding symbol** in that file.
- No source_location, or a new file → use the file-level node and mark confidence "file-level". For new files, also match their `import` lines in the patch to existing nodes.

```ts
// line → node (nearest preceding definition)
const syms = byFile[file]; // sorted by line
let hit = null; for (const s of syms) { if (s.line <= ln) hit = s; else break; }
touched.add(hit?.id ?? fileNode[file]);
```

**b) Blast radius**

- Reverse BFS from touched nodes over relations like calls, imports, uses and inherits. Depth ≤ 2, cap 50 nodes.
- Weight edges EXTRACTED 1, INFERRED 0.5, AMBIGUOUS 0.25.
- Report: dependent count, communities hit, and **tests to run** (dependents where `source_file` matches `/test|spec/`).
- ⚠️ Check edge direction on one known function first. If "A calls B" is stored as source=A, then callers are edges whose target is the touched node.

**c) Issue → claim nodes**

- Extract from the issue title and body: `backticked` names, CamelCase, snake_case, `foo()`, file paths, and stack-trace lines (`File "x.py", line N`).
- Match on `norm_label` or `label` (case-insensitive) and on path segments of `source_file`.
- Expand by 1 hop to get the claim set C, plus its communities.
- Fallback for vague issues: one cheap Gemma call ("list likely code symbols / areas"), then match those.

**d) Claim-vs-reality score** (T = touched nodes)

- `nodeOverlap = |T ∩ C| / |T|`
- `commOverlap = |comms(T) ∩ comms(C)| / |comms(T)|`
- `align = 0.6·nodeOverlap + 0.4·commOverlap`
- Labels: ≥ 0.5 aligned · 0.2–0.5 partial · < 0.2 off-target
- If C is empty (no issue, or a vague one), the label is **needs context**, never "off-target".
- Also list **unexplained changes**: T − C.

**e) Duplicates**

- Compute T for each open PR, cached by head SHA.
- Flag if node Jaccard ≥ 0.3, community Jaccard ≥ 0.5, or the same linked issue.
- Cross-check with `graphify prs --conflicts` if it runs locally (optional).

**f) Priority (deterministic, then Gemma explains)**

- **Review first:** align ≥ 0.5 and blast radius < 30.
- **Likely off-target:** align < 0.2 with a non-empty C, or a god node touched without being mentioned.
- **Needs context:** everything else.
- Duplicate is a separate badge.
- If Gemma disagrees with the rule, show "needs context" plus both reasons.

**g) Gemma**

- **Input:** a system prompt (below) plus the evidence pack as JSON. Include only the top 20 nodes with label, file, line, community and dependent count, plus trimmed patch snippets (≤ 3k chars).
- **Tools (stretch):** `get_node(id)`, `get_neighbors(id, depth)`, `search_symbol(name)`. Max 3 tool rounds.
- **Output:** the schema in section 10.
- **Validation:** drop any claim citing an ID not in the graph, and lower confidence.

## 4. MVP vs stretch

**Must work by 3:30 PM**

- `/analyze?pr=N` on the demo repo, using the precomputed graph
- Touched nodes, blast radius, issue mapping, score, priority
- Gemma verdict with a JSON fallback
- Card UI with the with/without-graph toggle
- Live on Cloudways
- 3 demo PRs; README with credits

**Stretch, in order**

1. Duplicate check live
2. PR comment bot
3. SKILL.md
4. Function-calling tools
5. Ollama local mode
6. Webhook

**Cut first if behind:** webhook → function calling → Ollama → live duplicates (hardcode precomputed) → Gemma itself. The deterministic card still demos.

## 5. Timeline

| Time         | Do                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10:30–10:45 | Repo init, README skeleton with credits. Express "hello world", push, **deploy on Cloudways Velocity**, set env vars. Confirm the public URL works. |
| 10:45–11:15 | Run graphify on the forked demo repo and inspect graph.json (fields, edge direction, line numbers). Create 3 issues and 3 PR branches in the fork.        |
| 11:15–12:15 | Graph engine: load, index, diff→nodes, blast radius. GitHub fetch with a PAT. Test on PR #1.                                                             |
| 12:15–1:00  | Issue mapper, score, priority, duplicate check.                                                                                                           |
| 1:00–1:30   | Gemma call, JSON validation, fallback. **Redeploy.**                                                                                                |
| 2:30–3:15   | Card UI (Tailwind CDN, one HTML file), with/without toggle, SHA cache.                                                                                    |
| 3:15–3:30   | Deploy, test all 3 PRs on the live URL, **record a backup video**.                                                                                  |
| 3:30–3:50   | SKILL.md, comment bot, README, Devpost text.                                                                                                              |
| 3:50–4:00   | Rehearse the 2-minute script twice.                                                                                                                       |

## 6. Value-adds to show judges

1. **"Without graph vs with graph" toggle.** The most convincing 15 seconds of the demo.
2. **Grounded citations.** Every claim links to node, file and line; uncited claims are removed.
3. **Agent skill `pr-reality-check/SKILL.md`.** Contributors run it locally before opening a PR: "does my diff hit the issue's area?" This puts the fix upstream and fits "AI belongs to everyone."
4. **PR comment bot.** Posts the card as a PR comment on your fork.
5. **Confidence labels.** Derived from EXTRACTED / INFERRED / AMBIGUOUS edges and file-level-only matches.
6. **Cache by head SHA.** Repeat analyses are instant and save Gemma quota.
7. **Local mode** (`LLM_PROVIDER=ollama`). Only if a Gemma 4 tag is available in Ollama; check before promising it.

## 7. Prize fit

| Category       | Why it qualifies                                                                           | Say to judges                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Open-Source AI | MIT repo, open-weight model, agent skill, built on open-source Graphify                    | "An open-source tool that protects open-source maintainers from AI slop, with an open-weight model." |
| Gemma 4        | Gemma does claim extraction, grounded reasoning and the JSON verdict (plus tools if built) | "Gemma reasons over graph evidence; it's not used as a generic chatbot."                             |
| Graphify       | graph.json drives touched nodes, blast radius, communities and duplicates                  | "Without Graphify this is guessing; with it, every verdict has structural proof."                    |
| Cloudways      | Live on Velocity with Git deploy and env vars                                              | Open the live URL on stage; don't use localhost.                                                     |

## 8. Demo plan

- **Demo repo:** fork **psf/requests** (Python, mid-size, good line numbers, natural "timeout" bugs). Enable Issues on the fork.
- **Issue #1:** "Session timeout ignored when passed via Session."
- **PR A (genuine):** "Fixes #1", touches `sessions.py` / `adapters.py`. Expected card: aligned, review first, tests listed.
- **PR B (off-target AI-style):** a confident, polished description saying "Fixes #1", but it refactors a utils helper or `structures.py`. Expected card: off-target, large blast radius.
- **PR C (duplicate):** a different author's attempt at #1, touching the same functions as A. Expected card: duplicate of PR A.

**2-minute script**

| Time       | Say / show                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | Problem: "Maintainers drown in AI PRs. Filters check account age, not whether the code does what it claims."                                                                   |
| 0:15–0:40 | PR B with the **graph off**: "Generic AI review says looks good." Toggle **graph on**: "Claims a timeout fix, touches no timeout code, changes X used by N parts." |
| 0:40–1:05 | PR A: aligned, tests to run, cited nodes. Click one node to show file and line.                                                                                                |
| 1:05–1:20 | PR C: duplicate of A. "Review one, not both."                                                                                                                                  |
| 1:20–1:40 | SKILL.md: contributors check themselves before opening a PR. Comment bot.                                                                                                      |
| 1:40–2:00 | Stack: Gemma 4 + Graphify + live on Cloudways. "It never closes PRs; maintainers decide."                                                                                      |

**Backup if wifi fails:** a `?offline=1` mode that serves cached JSON cards for all 3 PRs, the recorded video, and screenshots in the README.

## 9. Risks and quick fixes

| Risk                          | Fix                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No line numbers in graph.json | Fall back to file-level nodes plus symbol names found in the patch text (`def foo`, `function foo`) matched against labels. Mark the result "file-level".                                                  |
| Gemma rate limits             | SHA cache, one call per PR, precompute the 3 demo PRs, show the deterministic card if a call fails.                                                                                                            |
| Bad JSON from the model       | Try `responseMimeType: "application/json"` (unverified for Gemma; drop it if it errors). Extract the first `{…}`, validate with zod, retry once with the error, then fall back to the deterministic card. |
| System instructions rejected  | Prepend the system prompt to the user turn.                                                                                                                                                                    |
| Cloudways deploy issues       | Deploy hello world at 10:30. Read `PORT` from env, set `engines.node`, commit graph.json, watch logs. Last resort: show it live elsewhere and explain, but that risks the Cloudways prize.                 |
| GitHub API limits             | Fine-grained read-only PAT (5,000 req/hr instead of 60), plus caching.                                                                                                                                         |
| Edge direction wrong          | Check one known call pair at 10:50 before writing BFS.                                                                                                                                                         |
| Graph stale vs PR             | Build the graph on the fork's base commit; mention "rebuild in CI" as future work.                                                                                                                             |

## 10. Sample artifacts

**Gemma system prompt**

```
You are PR Reality Check, a review assistant for open-source maintainers.
You receive an EVIDENCE PACK computed from a code knowledge graph: the PR's claim,
the linked issue, nodes the diff touches, nodes the issue refers to, overlap scores,
blast radius, and overlapping PRs.
Rules:
- Use ONLY the evidence. Every finding must cite node IDs from the pack.
- Never recommend closing a PR. Recommend a review priority only.
- If the issue is vague or missing, say "needs context", not "off-target".
- Be concrete and short: name functions, files, counts.
- Output ONLY JSON matching the schema. No markdown.
```

**Evidence-card schema**

```json
{
  "pr": 42,
  "claim": "Fixes #1: session timeout ignored",
  "verdict": "aligned | partial | off_target | needs_context",
  "priority": "review_first | needs_context | likely_off_target",
  "alignment_score": 0.12,
  "confidence": "high | medium | low",
  "claim_vs_reality": [{ "finding": "string", "cites": ["node_id"] }],
  "unexplained_changes": [{ "node": "node_id", "file": "x.py", "line": 120 }],
  "blast_radius": { "dependents": 131, "communities": ["Routing"], "top": ["node_id"] },
  "tests_to_run": ["tests/test_sessions.py"],
  "duplicates": [{ "pr": 43, "overlap": 0.6, "shared": ["node_id"] }],
  "summary": "One or two sentences for the maintainer."
}
```

**Folder structure**

```
pr-reality-check/
├─ server/
│  ├─ index.ts        # Express routes: /api/analyze, /webhook, static UI
│  ├─ github.ts       # PR files, body, issue, open PRs
│  ├─ graph.ts        # load, index, diff→nodes, BFS, communities
│  ├─ issue.ts        # symbol extraction + matching
│  ├─ score.ts        # overlap, priority, duplicates
│  ├─ gemma.ts        # @google/genai call, tools, validation, fallback
│  └─ cache.ts
├─ public/index.html  # card UI
├─ data/graph.json    # graphify output for demo repo (+ graph.html)
├─ skills/pr-reality-check/SKILL.md
├─ demo/cached/*.json # offline mode
└─ README.md
```

**README outline:** Problem → What it does (screenshot) → How it works (diagram) → Live URL → Quickstart (graphify command, env vars) → Agent skill → Limits ("evidence, not judgment") → Credits (Graphify, Gemma 4 / @google/genai, Express, Octokit, zod, Tailwind, Cloudways, MLH) → License (MIT).

**Pitch:** *PR Reality Check tells maintainers whether a pull request actually does what it claims. Graphify maps exactly which parts of the codebase a PR touches and what depends on them; Gemma 4 compares that with the PR description and linked issue, and produces an evidence card with claim vs reality, blast radius, tests to run and duplicate PRs. Every finding cites real code. It never closes a PR; it helps maintainers decide what to review first. Open source, open-weight, and live on Cloudways.*

---

## First 3 things to do right now (before 10:30, no project code)

1. **Accounts and keys:** create the Cloudways account with CWFEST20 and get Velocity ready. Get a Gemini API key, a read-only GitHub PAT, and run `gh auth login`.
2. **Test the tool on the demo repo:** fork `psf/requests`, run `GRAPHIFY_BACKEND=none graphify extract . --code-only`, and confirm that `source_location` is filled, whether edges are under `links` or `edges`, and which direction calls go.
3. **Draft demo text:** write the issue #1 text and the 3 PR descriptions in a notes app, especially PR B's convincing description. Create the branches after 10:30.

Sources:

- [contexo graph.json types (pkg.go.dev)](https://pkg.go.dev/github.com/sugihAF/contexo/internal/generate)
- [agent-notes issue #7 (graphify node example)](https://github.com/rubakas/agent-notes/issues/7)
- [Graphify issue #3365 (missing source_location)](https://github.com/Graphify-Labs/graphify/issues/3365)
