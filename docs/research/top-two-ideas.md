# Two buildable hackathon directions: AfterDelete and SignalDesk

Researched 31 October 2026 for Hacktoberfest Hack Day Hyderabad x AI Community Hyderabad. Constraints: one developer, approximately six hours of implementation, good AI credits, strong practical value and a convincing demonstration. Names are working names, not checked trademarks.

## Decision

**First choice: AfterDelete — test whether deleted data stays deleted.** Best fit for a technical audience and substantive Graphify use. It has a clear failure to expose, a bounded experiment, and a compelling final test.

**Second choice: SignalDesk — reconcile scattered requests into a current, reviewable volunteer queue.** Best choice for a social-impact story and a simpler application. Gemma and Cloudways fit naturally; Graphify is not essential and should not be forced into the product.

Both are proposed prototypes. No implementation, benchmark, customer interview, production deployment, or independent validation of competitor products was performed during this research. Existing evidence supports the problem areas, not a claim that these exact products have validated demand or will win.

## What earlier hackathons actually tell us

The GitLab Transcend organizer recap says 70 teams built change-impact tools and more than 30 built onboarding/comprehension aids. It identifies CrossCut as the Potential Impact winner for targeted test selection, and Carver as the Design and Usability winner for migration planning. This is evidence that graph-backed developer workflows can be useful and crowded. It is not evidence that importing a graph guarantees a strong project. [Organizer announcement](https://gitlab-transcend-june-2026.devpost.com/updates/44639-winners-announcement-gitlab-transcend-hackathon-how-the-community-built-on-orbit).

Preview Dog's project page lists a second prize at Daytona HackSprint, July 2026, for issue/PR browser recordings. Repro's page lists a Microsoft award at ShellHacks 2026 for evidence-based diagnosis and repair; it already describes synthetic canaries for privacy findings. Consequently, neither automated reproduction nor canary-based testing is an original invention of this proposal. [Preview Dog](https://devpost.com/software/the-quick-previewer), [Repro](https://devpost.com/software/repro-h6gq70).

BeneFind's listing shows an MLH MongoDB award for benefits/food-support assistance. RePair's listing shows Arm and Lowe's awards at HackNC 2025 for an AI home-repair assistant. These demonstrate that a focused human need can carry a hackathon story, but their implementation and impact claims are author reports. [BeneFind](https://devpost.com/software/benefind), [RePair](https://devpost.com/software/repair-5ebgtw).

ApplyProof already describes application readiness checks with source evidence and uncertainty handling, so a generic scholarship-document checker would overlap closely. A search-visible page was available; its direct fetch failed. I did not establish an award for it. [ApplyProof](https://devpost.com/software/applyproof).

Do not count an “All Participants” badge as competitive winner evidence. Some search results used that label. No such result is used here to justify the final ranking.

## Eight directions screened

1. **AfterDelete:** strongest combined technical demo and sponsor fit. Limited-store adapters are essential to feasibility.
2. **SignalDesk:** strongest social workflow among the narrowed candidates; easy to demonstrate changing information. Real-world effectiveness requires coordinator feedback.
3. **AccessRipple:** credible runner-up from the previous plan. Valuable and visual, but browser-to-source mapping is a significant integration task and AI accessibility repair already has precedents.
4. **General codebase guide / change-impact assistant:** feasible, excellent Graphify fit, weak differentiation without a narrow new task. Existing Graphify functionality and the GitLab recap reinforce this concern.
5. **General bug reproducer / autonomous repair agent:** impressive but already represented by Preview Dog and Repro; arbitrary repository setup and execution are too broad for six hours solo.
6. **Application-document readiness checker:** useful and buildable, but ApplyProof is close to the proposed workflow. A specific local document process could differentiate it after user research.
7. **Scam screenshot detector:** understandable problem and strong image-model fit, but a polished demo can conceal a weak ability to distinguish legitimate messages. A meaningful claim needs independently labeled examples and careful false-positive analysis.
8. **Photo-based repair assistant:** visual and useful, but the proposed broad scope requires reliable device-specific instructions and physical-world validation. RePair provides an existing hackathon precedent. A narrowly sourced assembly tutorial would be more buildable, but weaker Graphify fit.

These are qualitative decisions, not numerical scores, market estimates, or predictions about judging.

## 1. AfterDelete

### User and value

Target a developer maintaining a small SaaS or AI application. They have an account-deletion endpoint, a cache or search copy, and background jobs. Their ordinary endpoint test may check only that the primary row disappeared.

The proposed product asks a more specific question: **after deletion, can an old job put the person's data back?**

Deletion across multiple systems is an established engineering problem; Fides is an existing privacy engineering framework. AWS documents that standard SQS delivery can repeat, establishing why replay is a realistic distributed-systems concern. Those facts motivate the experiment; they do not prove that a particular application resurrects data. [Fides](https://github.com/ethyca/fides), [Ethyca engineering discussion](https://www.ethyca.com/guides/right-to-be-forgotten-erasure-infrastructure), [AWS delivery semantics](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html).

Treat this as software testing, not a privacy-law compliance certificate or proof of physical erasure.

### The 90-second demonstration

1. Let the judge type a synthetic marker for a demo user.
2. Create that user in a small sandbox app and enqueue a delayed indexing job containing its profile.
3. Delete the user. A conventional primary-record assertion passes.
4. AfterDelete displays the worker and storage-related source references retrieved through Graphify. Gemma explains why the delayed write deserves a test.
5. Run the queued job. In the intentionally flawed fixture, the marker reappears in the search copy. The test turns red.
6. Switch to a reviewed, patched fixture revision and repeat. The worker checks current lifecycle state before writing, and cleanup handles the supported stores.
7. Show that the synthetic marker remains absent after replay while a different active user's indexing still succeeds.

The final control matters: disabling the worker altogether must not count as a successful repair.

### Exact implementation scope

Build one small Node application with three explicit subsystems: a primary user store, a search/cache copy, and a controllable job queue. These may use small database tables or clearly labeled local adapters; do not imply they are production SaaS integrations. Use deterministic queue stepping instead of waiting for wall-clock delays.

Build an adapter interface for create, delete, inspect, and replay operations. The application code runs those bounded operations. Gemma can recommend allowed probe IDs, explain evidence, and propose a patch; it should not execute arbitrary generated shell commands.

Extract the fixture with Graphify locally and bundle the real graph plus source locations into the hosted app. A manifest links supported store adapters to their source functions. Clearly distinguish that configured information from Graphify-extracted relationships.

Graphify is a code relationship map, not a complete taint-analysis or personal-data lineage engine. It guides investigation of candidate writers and consumers. Runtime probes determine whether the synthetic value actually survives or returns. If a relevant async connection is absent from the graph, show the missing evidence rather than inventing an edge.

Gemma should consume a bounded subgraph, actual snippets, the chosen operation, and probe outcomes. Return a small validated object: suspected path, supporting source IDs, recommended probe IDs, explanation, and proposed repair. The AI is useful in relating an operation to repository-specific evidence; deterministic assertions decide pass/fail.

Deploy the dashboard and Gemma endpoint on Cloudways. The allowlisted fixture can run in the same application if isolation is adequate; local execution with accurately labeled versioned reports is the simpler fallback. Each browser session needs its own synthetic run ID so one demonstration cannot alter another.

### Minimum three scenarios

- **Incomplete cleanup:** primary row deleted, search copy survives.
- **Resurrection:** immediate cleanup succeeds, old work recreates a copy.
- **Working repair:** cleanup plus lifecycle guard prevents replayed writes; a separate active account still works.

All outcomes must be measured. Seeded defects are acceptable when disclosed. Adding a judge-selected marker helps demonstrate that outcomes are computed rather than hardcoded.

### Six-hour allocation

- **0:00–0:45:** implement the fixture and reproduce the failure with a plain test; make one Gemma request and confirm Cloudways access.
- **0:45–1:30:** extract and inspect Graphify output; implement adapter-to-source mapping and evidence retrieval.
- **1:30–2:30:** integrate Gemma's bounded investigation and report. Complete one live analysis.
- **2:30–3:30:** build the timeline, relevant graph view, probe results, and the repaired revision.
- **3:30–4:30:** deploy the real application, add isolated runs and visible failures, verify the public URL.
- **4:30–5:15:** run all three scenarios, check active-user control, prepare README, attribution, and license.
- **5:15–6:00:** record backup, freeze, rehearse, submit.

### Main failure cases and boundaries

- The code graph may miss dynamic queue relationships. Use a disclosed adapter manifest; do not claim automatic discovery.
- Exact marker searches miss transformed or encrypted copies. Limit the claim to configured probes and representations.
- Passing now does not prove all future jobs will be harmless. Report the tested operation order and replay count.
- Backups, third-party SaaS, logs, arbitrary codebases, distributed races, and model unlearning are outside the prototype.
- Failed inference should leave the executable tests and evidence available.
- No automatic patch execution is required. A reviewed patch and a real rerun are enough.

### Originality and adoption path

The proposed focus is temporal regression testing for deletion: existing copies, late writes, and normal-operation controls in one reproducible report. This is narrower than general privacy management or autonomous repair. It is not a verified global first.

After the hackathon, the plausible product is an open-source CI check with adapters for common stacks. The value hypothesis is fewer deletion regressions and less manual investigation. Ask a maintainer whether they already test delayed jobs after deletion; do not claim willingness to pay without evidence.

Pitch: **“Your delete endpoint passes. Your user's data still comes back. AfterDelete makes that failure reproducible.”**

## 2. SignalDesk

### User and value

Target a volunteer coordinator managing a community supply drive. They receive forwarded messages, screenshots, partial updates, and repeated requests. The operational question is: **what is still needed, and what needs clarification before someone acts?**

This problem class is supported by crisis-information research and existing field workflows. A Hurricane Harvey study found important information gaps in rescue messages. Ushahidi's verification guidance explicitly checks duplicates, corroboration, trusted sources, and unresolved uncertainty. These sources inform the design; a supply-drive prototype is not a deployed emergency response system. [Research](https://arxiv.org/abs/2111.07187), [Ushahidi verification workflow](https://docs.ushahidi.com/uchaguzi-support/digital-response-teams/verification).

### The 90-second demonstration

Use a disclosed synthetic supply-drive scenario with messages such as:

- “School A needs 40 food packets.”
- A screenshot forwarding the same request.
- “We delivered 25 packets to School A.”
- “School A is fully covered.”
- A separate request from a different school with a similar name.

Gemma extracts claims and links candidate duplicates. The application preserves every original source. A reviewer confirms that the forwarded request is the same case and that the delivery applies to it. Only then may the app calculate a remaining quantity of 15.

The unsupported “fully covered” claim creates a conflict for review; it does not silently close the case. A differently located school remains separate. A later confirmed update changes the working queue and retains the history.

This produces a stronger demo than a static summary: the state changes when new evidence arrives, and uncertain information stays visible.

### Exact implementation scope

Support pasted text and a small number of screenshot uploads. Use about 15–20 synthetic messages and five cases. Start in English; add Telugu only if a fluent person can check representative extractions and translations.

Gemma returns structured claims with source IDs, event time if present, location text, resource type, amount, claimed status, and uncertainty. Unknown time or quantity stays unknown. The backend validates the schema and stores immutable claims separately from reviewer-approved case state.

Matching first uses explicit case ID, location, resource, date, and source references. Gemma proposes possible matches when text differs. Similarity alone must not merge cases. Make merges reversible.

The interface needs three views: incoming evidence; proposed changes/conflicts; current cases with history and a draft clarification question. Cloudways hosts the application and Gemma endpoint. A relational database or simple JSON records are enough. No graph database is required.

Graphify does not have an essential product role here. Using it while developing is different from demonstrating a compelling Graphify-powered product. Target the open-source AI, Gemma, and Cloudways categories, subject to organizer rules.

### Six-hour allocation

- **0:00–0:45:** define the claim/case schema, expected outcomes, and synthetic scenario; verify Gemma and hosting access.
- **0:45–1:45:** build text ingestion, extraction, source evidence, and schema validation.
- **1:45–2:45:** implement proposed matching, reviewer decisions, quantity rules, conflicts, and history.
- **2:45–3:45:** add screenshots and a readable three-panel interface; test an unseen wording variation.
- **3:45–4:45:** deploy, verify public interaction, add failure states and resettable demo data.
- **4:45–5:15:** test ambiguous locations, stale claims, repeated forwarding, missing units, and contradictory updates.
- **5:15–6:00:** record, rehearse, document scope, and submit.

### Main failure cases and boundaries

- A newer message is not automatically more trustworthy. Preserve its claim and provenance until reviewed.
- Two people with the same name or two places with similar names must not be automatically combined.
- Delivery quantities can be subtracted only when case identity, units, and event meaning are confirmed.
- A repeated need may be a new request rather than a duplicate. Include the time window and allow review.
- A screenshot can be forged, incomplete, or misread. Extracting its text does not authenticate it.
- A hidden or low-confidence request must remain in an unresolved queue rather than vanish.
- No automatic real-world dispatch, emergency prioritization, aid eligibility decisions, or public exposure of personal contact details.
- Cut WhatsApp API integration, live scraping, maps, route optimization, voice calls, and automatic outbound messages from the MVP.

### Originality and adoption path

Ushahidi and other coordination products already cover reports and verification. The proposed emphasis is a small, multimodal reconciliation workflow: linked claims, contradictions, reviewed updates, and an actionable current queue. Do not market it as the first relief dashboard or a truth detector.

An open-source release could include the claim schema, extraction evaluation set, review UI, and export adapter. A likely next step is an import/export integration for an existing volunteer tool rather than replacing the entire coordination system.

The value hypothesis is faster review with fewer mistaken merges and fewer actions based on outdated requests. Validate by timing a coordinator on the same message set with and without the tool; also record incorrect merges and overlooked requests. A fluent volunteer should review local-language examples before claiming multilingual reliability.

Pitch: **“Forwarded requests keep circulating after the situation changes. SignalDesk helps coordinators see what is still needed and what must be checked.”**

## Final choice and first experiment

Choose **AfterDelete** for this event if substantive Graphify use and a technical live demo are priorities. Its failure can be made unambiguous, its tests can run quickly, and its open-source output can become a reusable developer tool. It requires comfort with backend state and testing.

Choose **SignalDesk** if the preferred story is community impact and the preferred build is an AI web application with a clear review workflow. It is easier to deploy, but its adoption and extraction quality need real coordinator validation.

Spend the first 30–45 minutes proving the central claim, not designing slides. For AfterDelete, make the queued write resurrect a synthetic profile and capture a failing assertion. For SignalDesk, extract and reconcile a tiny set containing a duplicate, a partial fulfillment, and a contradiction. If that core does not work, adjust the scope before polishing.

Use the final presentation to show one user problem, one live sequence, concrete evidence, and one honest limitation. Publish original work with appropriate attribution; earlier hackathons are inspiration, not code or claims to copy. Check the actual event cutoff and multiple-category policy before relying on a full six-hour schedule.
