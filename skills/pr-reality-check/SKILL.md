---
name: pr-reality-check
description: Before opening or reviewing a pull request, check that the diff actually touches the code the linked issue is about, list unexplained changes, and find callers and tests that may be affected. Use when preparing a PR that claims to fix an issue.
---
# PR Reality Check — contributor self-check
Checks relevance, not correctness. Never claim the PR is correct.
1. Build/refresh the graph on the base branch: `GRAPHIFY_BACKEND=none graphify extract . --code-only` (or `graphify update .`).
2. Diff vs base: `git diff --unified=0 origin/main...HEAD`.
3. From the issue, list anchors: stack-frame functions, backticked names, file paths.
4. For each changed function: `graphify explain "<fn>"` (callers, community).
   For each anchor: `graphify path "<anchor>" "<changed fn>"` (exit code 4 = no path).
5. Report as a table: anchors touched / not touched, unexplained changes, callers within 2 hops, tests to run.
6. If no anchor is touched, tell the contributor what evidence or change is missing before opening the PR.
Optional: `curl https://<cloudways-url>/api/analyze/<pr>` for the hosted card.
