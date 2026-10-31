**Build a focused evidence checker for one demo repository.** Use React + Express on Cloudways, generate Graphify data locally, and make one Gemma call per review. Your strongest feature is a source-linked explanation of whether the patch supports its claim.

Saved: [complete build brief](/home/vivek/Work/code/mlh_hack_comms/resources/pr-reality-check-build-plan.md), [system prompt](/home/vivek/Work/code/mlh_hack_comms/resources/pr-reality-check-system-prompt.txt), and [validated JSON Schema](/home/vivek/Work/code/mlh_hack_comms/resources/pr-reality-check-evidence.schema.json). These are planning artifacts; the application is not built or deployed.

**1. High-level design**

Node fetches the PR, linked issue, diff, and competing PRs. It matches changes against a pinned Graphify snapshot and computes impact and overlap. Gemma interprets that evidence; the backend validates its response before showing the card. Keep credentials server-side.

```text
Repository → local Graphify → graph.json
                                  ↓
PR + issue + diff → Node → structural evidence
                                  ↓
                               Gemma 4
                                  ↓
                         validate JSON + citations
                                  ↓
                          evidence card → human
```

Use `gemma-4-26b-a4b-it` through `@google/genai`; Google documents this combination. Test your account immediately. [Google documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)

**2. Unique angle**

Your central question is **“Does the implementation support the promise?”**

- Put the issue quote, changed code, dependency path, and recommended action together.
- Demonstrate two equally convincing descriptions with different underlying changes.
- Expose uncertainty instead of treating missing evidence as misconduct.
- Avoid claiming AI-authorship detection or universal novelty.

Graphify already offers PR impact, triage, and community-conflict features. Your contribution is the **claim-to-code comparison and traceable evidence card**. [Graphify repository](https://github.com/Graphify-Labs/graphify)

**3. Core algorithm**

1. **Fetch evidence.** PR body, head SHA, diff, issue, other open PRs. For today, support an explicit issue URL or `Fixes #N`. GitHub’s PR `issue_url` points to the PR’s own issue record—not its linked bug. [GitHub API](https://docs.github.com/en/rest/pulls/pulls)
2. **Normalize Graphify.** Inspect actual JSON before coding an adapter. Your internal fields can be `id`, `name`, `file`, optional line range, community, and typed edges.
3. **Align revisions.** Old diff lines map to the comparison-base graph; new lines require head context. Never compare head line numbers against base locations. Track renamed paths and unmapped additions.
4. **Map changes.** Parse hunk cursors and find the smallest containing symbol. Without ranges, use file-level matching and label the reduced precision.
5. **Compute potential impact.** If A calls B, changing B may affect A: traverse incoming call/import edges, depth ≤2, maximum 50 unique nodes. Preserve edge confidence. Reachability does not prove breakage.
6. **Anchor the issue.** Extract exact symbols, filenames, stack frames, routes, and error strings. Resolve against the graph/source. Ambiguous or absent matches stay unknown.
7. **Compute structural relevance.** For each reliable issue anchor: direct change = 1; verified one-hop relationship = 0.5; otherwise = 0. Average ×100. No reliable anchors or inadequate mapping → `null`. This is a heuristic, not a correctness probability.
8. **Find competing work.** Compare changed-symbol sets using Jaccard overlap; also show shared files and communities. Same issue plus same symbols suggests a possible duplicate. Community overlap alone suggests coordination.
9. **Ask Gemma.** Send bounded snippets, numbered evidence records, metrics, and limitations. Require cited findings and validated JSON.

**Prompt packet:** claim → issue → diff → graph paths → calculated metrics → coverage gaps → output schema.

**Function calling, stretch only:** app-owned `find_symbol`, `get_neighbors`, `get_snippet`. Validate arguments, restrict snapshot paths, cap depth/snippet size, and allow two rounds maximum. Precompute evidence for the MVP.

**4. MVP and cuts**

**Must work by 15:30:**

- Public Cloudways application.
- One indexed repository and three PR fixtures.
- Claim/reality, source links, priority, confidence.
- Potential impact and competing-PR overlap.
- Genuine Gemma responses with validation.
- Clearly labeled saved-result fallback.

**Cut first:** Ollama → webhooks/comment bot → tool-calling loop → arbitrary repositories → graph animation.

Keep a small dependency path. A large graph visualization is unnecessary.

**5. Timeline — IST**

You have **270 minutes excluding lunch**; freezing at 15:30 leaves 30 minutes for rehearsal.

- **10:30–10:50:** deploy hello world; test Gemma; confirm submission deadline and multi-category eligibility.
- **10:50–11:20:** create demo repo, issue, three PRs; freeze their shared base; inspect Graphify output.
- **11:20–12:00:** implement mapping, traversal, issue anchors, overlap.
- **12:00–12:30:** GitHub retrieval → evidence packet → Gemma → validated card.
- **12:30–13:00:** build React card and source links; redeploy.
- **13:00–13:30:** exercise all fixtures; save real outputs and backup recording.
- **13:30–14:30:** lunch.
- **14:30–15:00:** deployment fixes, caching, timeouts, failure states.
- **15:00–15:30:** README, credits, submission assets; freeze.
- **15:30–16:00:** rehearse twice; verify public URL and submission receipt.

Velocity supports Git deployment, build settings, environment variables, and a temporary domain. Use that domain today. [Cloudways deployment guide](https://support.cloudways.com/en/articles/15550368-how-to-launch-an-application-on-cloudways-velocity)

**6. Six judge-friendly value-adds**

1. **Clickable evidence:** commit-pinned source and issue quotes.
2. **Honest confidence:** unmapped changes, graph freshness, file/symbol precision.
3. **With/without graph:** same model, prompt, and diff; change only graph context. Report actual results.
4. **Caching with provenance:** show model, source revision, generation time, and live/cached/replay status.
5. **Contributor skill:** check the claim and suggest missing evidence before opening a PR.
6. **Test checklist:** distinguish existing tests from proposed regression tests.

Prioritize **1, 2, and 4**. Cache keys must include graph, PR, issue, competing-PR snapshot, prompt, and model versions.

**7. Prize coverage**

Subject to organizer confirmation that one project can enter all four:

- **Open-source AI:** publish source, license, setup, credits. “Anyone can inspect and reuse this maintainer workflow.”
- **Gemma 4:** show configured model ID and genuine output. “Gemma compares the promise with implementation evidence.”
- **Graphify:** show a real generated dependency path affecting the assessment. “Graphify supplies context beyond the patch.”
- **Cloudways:** demonstrate working functionality at its public URL. “This is the live deployed product.”

Do not rely on a local recording to satisfy the supplied Cloudways requirement.

**8. Demo repository and exact two-minute script**

Create your own small public `pr-reality-check-demo` during the event:

- `AuthService.login` calls `SessionStore.isExpired`.
- Expiry has a seconds/milliseconds bug.
- `Router` serves login and profile routes.

Prepare separate branches from one base:

- **A — genuine:** fix expiry conversion; add regression test.
- **B — off-target:** claim the same fix; change only Router response text.
- **C — possible duplicate:** independently fix the same expiry function.

Label these synthetic fixtures. Display measured counts; do not invent “131 dependents.”

0:00–0:15 — “A convincing PR description can still miss the bug. PR Reality Check compares the promise with the patch, then gives maintainers evidence for deciding what deserves attention. These are three controlled demo PRs.”

0:15–0:40 — “This issue reports session expiry during login. Here is the genuine fix. The changed SessionStore function matches the issue, and this graph path connects it to login. The card recommends review and names the regression test. That is review guidance, not approval.”

0:40–1:10 — “Now the description claims the same fix, but the patch changes Router response text. The expiry predicate is unchanged. Open the evidence to compare the claim, diff, and dependency path. This is why the card flags a mismatch. It makes no guess about who wrote the code.”

1:10–1:30 — “A third PR changes the same expiry function for the same issue. We flag possible duplication and link both PRs. Maintainers can coordinate the work; shared code alone would not prove duplication.”

1:30–1:45 — “Graphify provides structural evidence. Gemma 4 interprets the claim and patch. Missing context remains visible instead of becoming a confident verdict.”

1:45–2:00 — “This is running at our public Cloudways URL. The source and setup are open. Our next step is evaluation on maintainer-labeled PRs. The goal is faster, better-informed human review.”

**Wi-Fi backup:** local UI with recorded inputs and genuine outputs, visibly labeled replay; a short video; hotspot access to the already-live Cloudways deployment.

**9. Risks and quick fixes**

- **No graph line numbers:** file-level matching; cite actual diff lines separately.
- **Stale graph/new symbols:** show SHA mismatch or unmapped additions; return `needs_context`.
- **Gemma rate limits:** cache, respect retry guidance, one bounded retry, then replay or deterministic evidence.
- **Bad JSON:** validate shape and evidence IDs; one repair attempt; otherwise conservative fallback.
- **Cloudways trouble:** inspect build/start settings, port, and runtime secrets; serve React from Express; ask sponsor staff early.
- **GitHub limits:** server-side read token, pagination, cached fixtures, bounded competing-PR scan.
- **Malicious PR instructions:** treat prose/code as data; never execute submitted code or grant model write tools.

**10. Sample artifacts**

The [ready-to-copy system prompt](/home/vivek/Work/code/mlh_hack_comms/resources/pr-reality-check-system-prompt.txt) requires evidence citations, distinguishes relevance from correctness, and abstains when context is insufficient.

The [JSON Schema](/home/vivek/Work/code/mlh_hack_comms/resources/pr-reality-check-evidence.schema.json) passed Draft 2020-12 schema validation. Its structure is:

```text
Server-owned:
  pr, provenance, coverage, metrics, overlaps, evidence[]

Gemma-owned assessment:
  claim, reality
  priority: review_first | needs_context | likely_off_target
  confidence: low | medium | high
  findings[{text, evidenceIds}]
  tests[{kind: existing | proposed, name, reason, evidenceIds}]
  limitations[]
```

Schema validation checks shape; your backend must also verify cited IDs and enforce coverage rules.

```text
src/client/          React page + EvidenceCard
src/server/          github, graph, evidence, gemma, API
schemas/             evidence.schema.json
prompts/             review.txt
data/demo/           graph, manifest, recorded results
tests/               mapping and missing-evidence checks
skills/              optional contributor skill
README.md
LICENSE
.env.example
```

**README:** problem → live demo → architecture → setup → graph generation → fixtures → limitations → validation → deployment → library/model credits → event build disclosure.

PR Reality Check helps open-source maintainers see whether a pull request addresses what it claims. Graphify traces changed code and dependencies; Gemma 4 compares that evidence with the PR and linked issue. A source-linked card highlights mismatches, potential impact, tests to consider, and overlapping PRs. The open-source application runs on Cloudways and keeps every review decision with the maintainer.

**First 3 things to do right now.**

1. At the permitted start time, deploy hello world to Cloudways and get one real Gemma response.
2. Create the expiry-bug demo repository and three PRs.
3. Inspect Graphify’s actual JSON and build one source-linked card end to end.
