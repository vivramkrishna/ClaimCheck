# MLH Hacktoberfest Hyderabad: product research

Researched on **31 October 2026 (IST)** for [Hacktoberfest Hack Day Hyderabad x AI Community Hyderabad](https://events.mlh.com/events/15275).

This folder explains the products linked by the event, how to start using them, where each fits in a project, and what needs verification before committing to a build.

## Start here

1. [Event and challenges](event.md): venue, schedule, prize requirements, all ten event resource links, and unresolved logistics.
2. [Gemma](gemma.md): open AI models, hosted and local inference, model selection, Python/JavaScript examples, capabilities, quotas, and limitations.
3. [Graphify](graphify.md): repository knowledge graphs, local extraction, coding-agent skills, MCP, query behavior, privacy, and integration ideas.
4. [Cloudways](cloudways.md): hosting choices, deployment, Access Tokens, API v2, MCP, event offer, and cookbook script caveats.
5. [DigitalOcean](digitalocean.md): additional resource linked from the open-source AI challenge; how its infrastructure and inference services differ from Cloudways.
6. [Build options](build-options.md): practical ways to combine the products, with a suggested first prototype and demo plan.

## How the products fit together

- **Gemma generates and interprets:** text answers, code explanations, image understanding, and tool-call proposals.
- **Graphify finds code relationships:** symbols, dependencies, callers, paths, and evidence for repository questions.
- **Cloudways runs the application:** a live site or API, deployment, operational controls, and monitoring.
- **DigitalOcean offers broader cloud infrastructure:** managed application hosting, virtual machines, and inference services. It is an additional path, not a prerequisite for using all three above.

For a project combining the three main resources, a sensible starting point is an open-source repository explainer: Graphify supplies evidence, Gemma explains it, and Cloudways hosts the interface. This is a research recommendation, not an organizer-prescribed project.

## Evidence and scope

Reviewed the event page, all ten Links & Resources entries and their destinations, the four challenge detail pages, the related Chrome tabs, official vendor documentation, and the event-linked Cloudways cookbook. Sources are linked next to the relevant claims throughout these files.

The original event resource section contains **three product groups**, not ten independent products. DigitalOcean appears in the challenge resources, so it has a separate supplementary guide. General site-footer links and every historical notebook in the Gemma cookbook are outside this product-focused review.

These are researched implementation notes. **No accounts were created, products installed, models downloaded, API credentials used, deployments made, or paid resources provisioned.** Code examples were checked against documentation and reviewed for syntax; they have not been tested against live product accounts. Recommendations and proposed integrations are identified separately from documented capabilities.

Important uncertainties to resolve early: actual Gemma account quota, Google Search availability for Gemma, Cloudways offer eligibility, Graphify version differences, and the event's submission opening/deadline and inconsistent schedule.
