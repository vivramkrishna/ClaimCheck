# PR Reality Check: one-day build brief

Planning document, 31 October 2026. This is a proposed implementation, not a built or deployed application. Follow the event's start-time rule for project code. Account quotas, graph format, and prize eligibility still need an on-site check.

## 1. High-level design

Build one React + TypeScript screen, served by an Express API on Cloudways Velocity. Support one small public demo repository. Generate its Graphify graph locally, record its source commit, and ship the graph as data. Node fetches PR/issue evidence, computes structural metrics, and sends one bounded evidence packet to Gemma 4. The UI renders an evidence card with source links and uncertainty. No database is necessary.

```text
Public PR URL -> Node: PR + issue + diff + other open PRs
                         |
Pinned repo -> Graphify -> graph.json -> match symbols / traverse / compare
                                               |
                                  evidence packet + code snippets
                                               |
                                           Gemma 4
                                               |
                                    validate JSON + evidence IDs
                                               |
                                 React evidence card -> maintainer
```

Gemma model ID and JavaScript SDK are documented: `gemma-4-26b-a4b-it`, `@google/genai`. Validate one real account call immediately. [Google documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)

## 2. Unique angle

The product checks a promise against its implementation and shows the evidence. A plausible description is not enough; a large change is not automatically bad. Show the issue quote, changed function, a dependency path, and the next review action together.

Avoid claiming nobody else does this. Graphify already provides PR impact, triage, and community conflicts. Your addition is the issue-to-diff comparison, evidence provenance, and explicit abstention when context is missing. [Graphify source and README](https://github.com/Graphify-Labs/graphify)

Demo the genuine and off-target PRs with equally polished descriptions. The distinction should come from code, not author/account heuristics. Describe a bad fixture as deliberately off-target; do not claim to detect AI authorship.

## 3. Core algorithm

1. **Collect:** PR title/body, head SHA, diff, linked issue, and open-PR file lists. For the MVP accept an explicit issue URL or an unambiguous `Fixes #N`; disclose this limited link detection. GitHub's PR `issue_url` refers to the PR itself, not its linked bug. Paginate file lists and record truncation. [GitHub API](https://docs.github.com/en/rest/pulls/pulls)
2. **Normalize:** inspect the real Graphify JSON once; adapt to your own `{id,name,file,startLine?,endLine?,community?}` and `{from,to,relation,confidence}`. These are application fields, not asserted Graphify field names. Record producer/schema version, graph hash, source SHA, and coverage.
3. **Align revisions:** old diff lines belong to the comparison base, new lines to the PR head. Build the shared graph at the merge base for the three fixtures. Never compare head line numbers to a base graph. Use old paths for renames. Added symbols missing from the base graph remain explicitly unmapped; optionally build head graphs later.
4. **Map changes:** parse hunk headers and track old/new cursors; `-` advances old, `+` advances new, context advances both. Map changed lines to the smallest containing symbol. Addition-only hunks can use the old-side insertion boundary to find an enclosing function, but label that approximation. Missing ranges means file-level mapping, not invented precision.
5. **Blast radius:** verify edge direction using one known caller. If A calls B, a change to B potentially affects A: walk incoming call/import edges, depth <= 2, visited set, cap 50 nodes. Start with EXTRACTED edges; show inferred/ambiguous paths separately. Report unique reachable dependents and truncation, not a breakage prediction. Recommend actual discovered tests; missing test links produce suggestions, not asserted coverage.
6. **Anchor the claim:** extract backticked symbols, filenames, stack frames, routes, and error strings from issue + PR. Match exact paths/symbols first; search literal strings in the indexed source for a file anchor. Preserve ambiguous candidates. No reliable anchor means unknown overlap. A manually supplied anchor is allowed only if visibly labeled.
7. **Score relevance:** let I be reliable issue anchors and C changed symbols. Per anchor: 1 if directly changed, 0.5 if a verified one-hop call/import path links it to C, otherwise 0. Structural overlap = 100 × sum / |I|. Return null if I is empty or mapping is insufficient. This is an explanatory heuristic, not a correctness probability; community co-membership alone earns no points.
8. **Find overlap:** compare changed symbol sets with Jaccard, |A ∩ B| / |A ∪ B|, plus shared files and communities. Empty sets produce unknown. Same issue + same symbols = possible duplicate; shared community alone = possible coordination need. Compare all three demo PRs; cap general use at 20 and display scanned/total.
9. **Gemma judgment:** send claim + issue + bounded diff/source snippets + numbered paths + metrics + limitations. One model call; validate schema and all cited IDs. Keep server-computed metrics separate from generated prose. Permit likely_off_target only with cited mismatch evidence, never simply score = 0.

**Optional function calling:** declare app-owned read-only functions `find_symbol(query)`, `get_neighbors(nodeId,direction,depth)` and `get_snippet(file,start,end)`. Server validates arguments, restricts files to indexed snapshots, caps depth at 2 and snippets at 80 lines, and allows at most 2 tool rounds. These are wrappers over your stored data, not assumed Graphify MCP method signatures. Precompute the packet for the MVP.

## 4. Scope and cuts

**By 15:30:** public Cloudways UI; one indexed repo; three real PR fixtures; claim/reality and priority; source-linked graph evidence; bounded impact; overlap with other fixtures; Gemma output validation; clearly marked saved-result fallback.

**Cut in order:** Ollama/local inference; webhooks/comment bot; function-calling loop; arbitrary repository indexing; graph animation; polished charts. Keep a compact dependency path rather than a large interactive graph. Never cut the public deployment or the visible Graphify/Gemma evidence.

**Acceptance:** real Gemma run on all three; genuine fix plausibly relevant; off-target fixture exposes a concrete mismatch; duplicate fixture links the competing PR; missing-anchor input yields needs_context; refresh the public URL in a fresh browser. Check rename/deletion handling if the demo uses them.

## 5. Timeline — IST, 270 minutes excluding lunch

- **10:30–10:50 (20m):** scaffold app + health endpoint; push and deploy hello world to Cloudways. Test one Gemma call. Confirm submission deadline and multi-category entry with organizers.
- **10:50–11:20 (30m):** create tiny demo repo, bug issue, and three branches/PRs; freeze common base. Generate Graphify JSON; inspect schema and one known dependency.
- **11:20–12:00 (40m):** graph adapter, diff mapping, traversal, issue anchoring, overlap metrics. Fallback to labeled file-level evidence if ranges are unavailable.
- **12:00–12:30 (30m):** GitHub reads + evidence packet + Gemma + validation. Get first end-to-end card.
- **12:30–13:00 (30m):** React card, fixture selector, source links, priority, uncertainty, overlap. Redeploy.
- **13:00–13:30 (30m):** run all fixtures; fix misleading evidence; save real outputs and record a backup.
- **13:30–14:30:** lunch, no planned work.
- **14:30–15:00 (30m):** harden live deployment, cache, timeouts, failure states, one carefully chosen value-add.
- **15:00–15:30 (30m):** README, attribution/license, submission assets, public-browser verification. Freeze features.
- **15:30–16:00 (30m):** rehearse twice; verify URL, backup, and submission receipt; use remaining time for defects only.

Velocity documents Git deployment, build settings, environment variables, and a temporary public domain. Use that domain today. Confirm runtime secrets and the platform's assigned port; bind the server to 0.0.0.0. [Cloudways guide](https://support.cloudways.com/en/articles/15550368-how-to-launch-an-application-on-cloudways-velocity)

## 6. Six value-adds, ranked

1. **Evidence links:** every conclusion opens a commit-pinned snippet or an issue quote.
2. **Honest confidence:** display symbol/file mapping, graph age, unmapped changes, and unknown results.
3. **With/without graph:** same model, prompt, diff, and fixture; remove only graph evidence for baseline. Show a measured difference, not a predetermined winner.
4. **Cache/provenance:** display model, source SHAs, generation time, and live/cached/replay state. Cache key includes graph hash, PR head/comparison base, issue/body content hashes, other-PR snapshot, prompt and model versions.
5. **Contributor skill:** later package a SKILL.md that asks for a claim, checks the diff, and proposes evidence/test additions before submission. It never posts automatically.
6. **Test checklist:** separate discovered test paths from proposed regression tests, with reasons.

Implement 1, 2, and 4 first. The comment bot and full local mode are lower-value time risks today.

## 7. Prize evidence and judge lines

- **Open-source AI:** publish source, license, setup, library/model credits, and meaningful open-weight-model use. “Anyone can inspect and reuse this maintainer workflow.”
- **Gemma 4:** show the actual configured model ID and one genuine response. “Gemma compares the promise with code and cited context.”
- **Graphify:** show generated graph provenance and a real dependency path influencing the card. “Graphify exposes relationships outside the patch.”
- **Cloudways:** run the working application at a public Cloudways URL during judging; show health and cache behavior. “This is the live deployed product.”

These are evidence plans, not eligibility guarantees. Existing event research records the four categories and unresolved multi-category rules. [Local event notes](event.md)

## 8. Demo repository and two-minute script

Create your own public `pr-reality-check-demo` during the event: roughly 8 TypeScript files, direct imports/calls, Node's built-in test runner. A `SessionStore.isExpired` seconds/milliseconds bug is called by `AuthService.login`; `Router` is shared by login and profile handlers. Use the actual assigned issue number in PR descriptions.

- **PR A / genuine:** fixes expiry unit conversion in SessionStore; adds regression test.
- **PR B / off-target:** claims the same expiry fix but only changes Router response text. The expiry predicate stays unchanged. Avoid a routing refactor that might plausibly fix the bug.
- **PR C / possible duplicate:** independently fixes the same SessionStore bug and links the same issue. Keep all PRs open on separate branches from the common base.

Label all three as synthetic demo fixtures. Do not send them to upstream maintainers. Assert no invented dependent count; display the measured graph count. Useful preparation: test the known bug/fix in your own demo branches and retain output; the deployed service must not execute arbitrary submitted code.

**0:00–0:15** — “A convincing PR description can still miss the bug. PR Reality Check compares the promise with the patch, then gives maintainers evidence for deciding what deserves attention. These are three controlled demo PRs.”

**0:15–0:40** — “This issue reports session expiry during login. Here is the genuine fix. The changed SessionStore function matches the issue, and this graph path connects it to login. The card recommends review and names the regression test. That is review guidance, not approval.”

**0:40–1:10** — “Now the description claims the same fix, but the patch changes Router response text. The expiry predicate is unchanged. Open the evidence to compare the claim, diff, and dependency path. This is why the card flags a mismatch. It makes no guess about who wrote the code.”

**1:10–1:30** — “A third PR changes the same expiry function for the same issue. We flag possible duplication and link both PRs. Maintainers can coordinate the work; shared code alone would not prove duplication.”

**1:30–1:45** — “Graphify provides structural evidence. Gemma 4 interprets the claim and patch. Missing context remains visible instead of becoming a confident verdict.”

**1:45–2:00** — “This is running at our public Cloudways URL. The source and setup are open. Our next step is evaluation on maintainer-labeled PRs. The goal is faster, better-informed human review.”

**Wi-Fi backup:** save all three input packets and real model outputs, run the UI locally in clearly marked replay mode, and keep a 90-second recording. Use a hotspot to let judges reach the already-live Cloudways URL. A recording/local replay alone does not meet the supplied Cloudways live-URL requirement.

## 9. Risks and quick fixes

- **Graph has no line ranges:** map by file, show lower precision, cite actual diff lines separately. Do not invent symbol ranges.
- **Graph stale/new symbols:** compare SHAs; report unmapped additions. Rebuild the small fixture graph when possible. Unknown evidence must not become zero relevance.
- **Gemma quota/429:** one bounded call per uncached PR, honor Retry-After, one retry within a timeout; then show saved results as replay or deterministic facts with needs_context.
- **Bad JSON or invented IDs:** schema validation plus evidence-ID validation; one repair attempt with errors. On failure use deterministic card and model_unavailable. Structured-output API support must be tested for this exact model.
- **Cloudways failure:** inspect build/start/port and runtime variables; drop custom domain and serve React from the Node process. Ask the event sponsor for account/provisioning issues. Another host preserves the demo but not the stated Cloudways criterion. Verify coupon eligibility before relying on it.
- **GitHub limits/missing patches:** server-side read token, pagination, cache, bounded 20-PR scan; use recorded fixtures on failure. Missing/binary/truncated patches reduce coverage, never silently disappear.
- **Prompt injection/untrusted PRs:** treat source and prose as data; tools stay read-only and bounded. The backend constructs URLs and metrics; do not execute submitted code.

## 10. Sample artifacts

- System prompt: `pr-reality-check-system-prompt.txt` beside this brief.
- Valid JSON Schema: `pr-reality-check-evidence.schema.json` beside this brief. Send only `$defs.assessment` to the model; the server builds the rest. Schema checks shape; code must additionally enforce evidence-ID membership, trusted URLs, consistent SHAs, caps, and coverage rules.

Proposed project layout:

```text
src/client/                 # React page + EvidenceCard
src/server/index.ts         # Express, health, analyze endpoint
src/server/github.ts        # bounded read-only retrieval
src/server/graph.ts         # normalize, map, traverse
src/server/evidence.ts      # metrics, evidence IDs, provenance
src/server/gemma.ts         # prompt, call, validate, fallback
schemas/evidence.schema.json
prompts/review.txt
data/demo/                  # graph, manifest, recorded packets
tests/                     # targeted mapping/coverage checks
skills/pr-reality-check/SKILL.md  # optional stretch
README.md
LICENSE
.env.example
```

README outline: problem and screenshot → public demo → architecture → local setup/environment → graph generation and source SHA → three fixtures → scoring/limitations → validation results → deployment → library/model/data credits and licenses → event build disclosure → future work.

**Submission pitch:** PR Reality Check helps open-source maintainers see whether a pull request addresses what it claims. Graphify traces the changed code and its dependencies; Gemma 4 compares that evidence with the PR and linked issue. A source-linked card highlights mismatches, potential impact, tests to consider, and overlapping PRs. The open-source application runs on Cloudways and keeps every review decision with the maintainer.

## First 3 things to do right now.

1. At the permitted start time, deploy hello world to Cloudways and confirm a real Gemma response.
2. Create the tiny expiry-bug repository and three PRs; freeze their shared base.
3. Extract Graphify JSON, inspect one node and edge, and get one source-linked evidence card working end to end.
