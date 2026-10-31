# AccessRipple: six-hour solo hackathon plan

Research date: 31 October 2026. User constraints: solo, approximately six focused hours, sufficient AI credits; priority is a memorable idea and convincing live demo. This is a proposed product and implementation plan, not a built or tested integration.

## Recommendation

Build **AccessRipple — fix one shared component, verify every affected page**.

An accessibility report can contain repeated symptoms of one source defect. AccessRipple connects a reported browser problem to a shared component, uses Graphify to find candidate consumers, asks Gemma 4 for an evidence-grounded repair proposal, and shows browser-test results before and after a developer-approved fix.

Target user: a maintainer or contributor improving a small open-source React application. The first supported task is an accessible-name defect in one shared dialog close control. Other accessibility issues are outside the initial scope.

The memorable moment: a judge sees a failure on one page, discovers that the same component appears on three pages, then sees the selected checks pass on all three after one source change. Three pages is a planned demo fixture, not a measured result.

## Category strategy

Best Open-Source AI Project and Best Use of Graphify are compatible product directions. Prioritize an original, useful open-source application with a substantive Graphify integration. Use Gemma 4 in the actual product and host it on Cloudways. Ask organizers whether a single project can enter multiple categories; the inspected pages do not resolve that rule.

- Open-source AI: the published challenge permits open-source or open-weight AI as an important part of the project. Release original application code with a license and reproducible instructions.
- Graphify: demonstrate how its real code relationships change the investigation and test selection.
- Gemma: show the actual model ID, evidence input, and generated repair explanation. Hosted Gemma is accessed through the Gemini API; choosing a Gemini model instead would be a different implementation.
- Cloudways: judges must be able to open a public Cloudways deployment. A local demo alone is insufficient for that category.

Sources: [event](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad), [Graphify challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18734-5d1e-859b-ac49-fbc7318412a3), [Cloudways challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18738-a864-2307-402a-4a77d6f8267a). Event and challenge pages were inspected through the Chrome extension. Challenge pages displayed submissions as not yet open; confirm the actual submission route and cutoff on site.

## Why this idea over the alternatives

1. **AccessRipple: strongest demo fit.** Visible user problem, useful graph traversal, narrow model task, and verifiable before/after behavior. Main risk: mapping rendered elements to source.
2. **FirstPatch: safest fallback.** Turn one issue in a pinned repository into a guided reading path, relevant symbols, and a contribution/test checklist. Easier to ship, but closer to existing repository assistants.
3. **PatchProof: good technical alternative.** Explain a proposed change, retrieve candidate consumers, and recommend relevant tests. Strong developer value, but generic PR impact analysis overlaps directly with existing Graphify tools and review products.

These rankings are engineering judgment for this user's constraints, not published judging scores or estimates of winning probability.

## Competitive research and honest differentiation

Graphify already supplies repository graphs and PR-oriented impact/triage tools. A graph dashboard or a general repository chatbot would reuse much of its existing surface. [Graphify repository](https://github.com/Graphify-Labs/graphify), [MCP reference](https://docs.graphify.com/open-source/mcp-server).

React Grab already connects a selected browser element to a component stack and source location. It is useful precedent or an optional integration, not an invention to claim. Its documented installation examples are development-only; do not assume source discovery works on an arbitrary production build. [React Grab](https://github.com/aidenybai/react-grab).

Axe-core already detects common accessibility defects. CodeA11y research already explores AI assistance for accessible web development, including manual validation reminders. AccessRipple should therefore be pitched as a specific workflow connecting repeated runtime findings, shared source, graph evidence, and verification—not as the first AI accessibility tool. This research is not an exhaustive novelty search. [axe-core](https://github.com/dequelabs/axe-core), [CodeA11y paper](https://arxiv.org/abs/2502.10884).

## The exact MVP

Use a small public React fixture that you own, with three routes: Events, Tickets, and Profile. Each imports the same shared dialog. Seed and disclose one defect: its icon-only close button lacks an accessible name.

Provide four steps in the application:

1. **Observe:** select a route and show the real accessibility finding, relevant DOM snippet, and screenshot.
2. **Trace:** resolve the selected element to its source component and show the actual Graphify relationships to candidate consumer modules.
3. **Propose:** Gemma reads the source, DOM finding, screenshot, and bounded graph context; it explains the user impact and proposes a small diff plus verification steps.
4. **Verify:** a developer reviews/applies the fix locally; actual browser checks run against the changed fixture; the report shows results tied to the tested revision.

A suitable fix is a clear accessible name on the close button. Context matters: for generic controls, text must come from the caller rather than a single universal hardcoded label. Keep this demo to a shared dialog close control so its action is unambiguous.

Use an explicit mapping for the supported fixture, such as stable `data-component` identifiers plus a small manifest from identifier to source path/symbol and route. Label this as instrumentation. Graphify must supply the real code relationships after the seed symbol is identified. The manifest must not pretend to be automatically discovered graph evidence.

Represent static relationships as **candidate impact**. An import path does not prove that a route renders a component in every state. Opening each dialog and executing the tests establishes what was observed for that route and state.

Do not require an arbitrary screenshot to reveal an exact source line. A screenshot alone cannot establish the accessible name or runtime accessibility semantics. Use the DOM/accessibility finding for those facts; use the screenshot to give Gemma visual context and explain the control's purpose.

## Implementation shape

- **Application:** React with a small Node backend, or Next.js if already familiar. One screen with the finding, relevant graph, patch, and test report is enough.
- **Graphify:** extract the fixture locally; pin package version and source commit; bundle its graph with the deployed app. Read the actual schema before implementing the adapter. Start with import relationships if JSX-specific relationships are incomplete.
- **Gemma:** call `gemma-4-26b-a4b-it` or `gemma-4-31b-it` server-side. Choose after a representative trial; model size alone does not establish response latency. Validate generated output and reject source references outside supplied evidence.
- **Verification:** use axe through Playwright and a focused assertion that the visible close button has the intended accessible name and closes the dialog. Check all three routes in their open-dialog state.
- **Hosting:** deploy the application and graph/report artifacts on Cloudways Velocity. The official deployment guide documents Node.js, build/start settings, and runtime environment variables.
- **Test runner:** keep Playwright and Graphify extraction on your laptop for the MVP. Export versioned reports to the hosted application. The public site can provide live Gemma analysis and report exploration without needing to run untrusted code or browser workers on the hosting plan.

Sources: [Gemma hosted API](https://gemma.ai/deployment/gemini-api/), [Cloudways deployment guide](https://support.cloudways.com/en/articles/16187473-how-to-manage-deployments-for-your-application-on-cloudways-velocity), [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).

A live test rerun may be demonstrated from your laptop. If the hosted UI displays a recorded run, label it with its timestamp and tested revision. A button named “Run tests” must actually invoke tests; otherwise call it “View verification report.”

## Evidence contract

Each report should contain the repository and commit, model ID, Graphify version, source mapping method, relevant graph edges and their confidence labels, tested route/state, test timestamp, checks performed, and pass/fail results.

Use clear statuses:

- Observed: browser scan or explicit assertion found it.
- Proposed: Gemma suggested a repair or explanation.
- Candidate consumer: graph relationship suggests this module deserves checking.
- Verified for this check: the specified test passed on the stated revision.
- Unknown: source mapping or graph evidence was insufficient.

Passing selected tests does not certify overall accessibility. Playwright's guide explicitly recommends combining automated checks with manual assessments and inclusive user testing.

## Six-hour schedule

### 00:00–00:30 — prove the risky connections

Make a real Gemma request; extract a graph of the tiny fixture; confirm a usable shared-component/import relationship; confirm Cloudways access and deploy a minimal page. Check the real event cutoff immediately. Six available hours do not guarantee six hours before judging.

**Decision gate:** if element-to-source mapping is taking too long, use the disclosed fixture manifest. If Graphify cannot produce useful code relationships after a short investigation, reduce the fixture to simple explicit imports and module-level impact. If that still fails, select FirstPatch with a supported repository.

### 00:30–01:30 — working end-to-end analysis

Create the three-route fixture and reproducible finding. Wire mapping, real graph traversal, and one Gemma proposal. Have a plain but complete Observe → Trace → Propose flow before polishing visuals.

### 01:30–02:30 — verification

Run the selected checks on the broken revision. Review/apply the minimal repair, rerun on the fixed revision, and export real reports. Check that all three routes refer to the same source component. Preserve both revisions or immutable artifacts for repeatable demos.

### 02:30–03:30 — product presentation

Build a compact evidence view: screenshot/finding on the left, a small readable graph in the middle, patch and results on the right or in sequential tabs. Show only relevant nodes. Make the tool's own UI keyboard usable.

### 03:30–04:30 — real deployment

Deploy the real backend and frontend to Cloudways. Test a live Gemma request from the public URL. Use a server-side key, explicit failure states, and caching keyed by source revision plus finding. Display when a response is cached.

### 04:30–05:15 — evaluation and submission materials

Evaluate three supported examples and one unknown component. Record source-link correctness, relevant consumer discovery, actual test outcomes, and latency. Write README, setup steps, scope, license, attribution, and a concise project description. Confirm submission method and category eligibility.

### 05:15–06:00 — freeze and rehearse

Stop feature work. Record a two-minute backup demo. Rehearse twice. Check the public URL on another device. Keep known-good example IDs and versioned reports ready. If the actual deadline arrives earlier, compress the schedule and reserve at least 30 minutes for submission and rehearsal.

## What to cut first

Cut automatic GitHub PR creation, accounts, arbitrary repository ingestion, autonomous patch execution, live cloud browser workers, huge graph visualizations, fine-tuning, and a newly built Chrome extension.

The Chrome extension was used for this research as requested. Building your own extension is a separate optional product feature, not a requirement inferred from that request. Add a browser capture extension only after the complete demo works; it is unnecessary for a six-hour MVP with a fixture.

If behind schedule, keep the live analysis and real saved verification reports. Human-reviewed patch application is acceptable. Clearly distinguish automated steps, manual steps, precomputed graphs, and recorded runs.

## Two-minute demo sequence

- **0:00–0:20:** Show the unnamed close button in the fixture and the corresponding accessibility finding. Explain the difficulty for someone using assistive technology.
- **0:20–0:45:** Trace it to the shared component. Reveal the three candidate route consumers from the Graphify output, with source links.
- **0:45–1:10:** Show Gemma's source-grounded explanation and proposed minimal change. Point to the exact model and evidence.
- **1:10–1:40:** Show the reviewed source change and run the checks, or explicitly open the recorded verification results for that revision. Compare the supported checks across all three routes.
- **1:40–2:00:** Open the public Cloudways URL, show the open-source repository and reproducible fixture, and state the current scope and next extension.

Never claim “all accessibility issues fixed.” Say “the missing-name check and close interaction passed on these three routes.” Never announce measurements until you have collected them.

## Suggested pitch

“One shared component can repeat the same accessibility bug across an application. AccessRipple helps maintainers trace a reported problem to that component, find the other places that need checking, and verify a repair. Gemma explains the evidence and proposes the change; Graphify supplies the code relationships; browser tests establish what passed. Our first version supports an instrumented React app and one defect class, with a live Cloudways interface and reproducible results.”

## Questions judges may ask

**Why not just use axe?** Axe supplies findings. This project adds source attribution, grouping around shared components, graph-guided consumer selection, and a versioned repair report.

**Why not just ask an AI coding assistant?** It can help, but this tool packages a repeatable maintainer workflow with explicit evidence and verification. Demonstrate a concrete improvement rather than asserting superiority over all coding assistants.

**Is Graphify necessary?** For the supported demo, it must retrieve additional consumer modules beyond the seed component. If the result would be identical without it, the integration is too shallow.

**Does this work on every website?** No. The prototype supports an instrumented fixture at known revisions. Production source mapping and arbitrary repository ingestion are future work.

**Is this new?** The constituent technologies and AI accessibility assistance already exist. The proposed contribution is this focused integration and reproducible workflow; no global first claim is justified.

**What is open source?** Release the application, graph adapter, fixture, tests, report format, and setup instructions. Respect dependency licenses and attribute upstream tools. No paid account or infrastructure was provisioned as part of this research.
