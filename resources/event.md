# Event, challenges, and resource map

Research date: **31 October 2026, IST**.

## Event facts

**Hacktoberfest Hack Day Hyderabad x AI Community Hyderabad** takes place on Saturday, 31 October 2026. The stated focus is building and contributing around open-source AI tools and open-weight models. The location is The Commons Hall, Phoenix Equinox Campus, 1st Floor, Tower 4, Nagarjuna Residency Driveway, Diamond Hills, Lumbini Avenue, Gachibowli, Hyderabad, Telangana 500032. The event explicitly says registration alone does not confirm attendance; selected attendees receive confirmation by email. [Official event page](https://events.mlh.com/events/15275)

### Schedule discrepancy

The same page presents different time ranges:

- Header: **9:00 AM–5:30 PM IST**.
- Description: **10:30 AM–5:30 PM IST**.
- Detailed schedule: check-in **9:30 AM**; welcome **10:00–10:30 AM**; hacking begins **10:30 AM**; lunch **1:30–2:30 PM**; judging **4:00–5:30 PM**; prizes/photos **6:00 PM**.

Treat the detailed schedule as a planning reference and confirm it against the attendee email or on-site announcement. In particular, do not interpret 5:30 PM as guaranteed departure time or as the submission deadline. A sensible internal target is to have a working deployment before judging begins. [Schedule source](https://events.mlh.com/events/15275)

## Four published prize categories

### Best Open-Source AI Project

Build an original project where open-source or open-weight AI plays a substantial role. The examples include agent skills, large or small open-weight models, and model harnesses. The page lists an exclusive Hacktoberfest 2026 Winner DEV Badge and MLH Swag Bag. It links to DigitalOcean resources, but the displayed challenge text does not explicitly require a DigitalOcean deployment. [Challenge detail](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a0d987-0c41-12ea-13ac-5b85755dc2f3)

### Best Use of Gemma 4

The challenge specifically names **Gemma 4**, including access through the Gemini API. It suggests text/image experiences and focused tools for learning, creativity, productivity, or community use. A generic Gemini model call is not evidence that you used Gemma 4: preserve the actual model identifier in your implementation and demo notes. [Challenge detail](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a03b87-be22-9180-5e2d-b3beeb66666d)

### Best Use of Graphify

The challenge emphasizes connecting Graphify to coding agents, mapping repositories, exploring code relationships, and querying the resulting graphs. A compelling demo should show a concrete improvement in understanding or navigating a repository. [Challenge detail](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18734-5d1e-859b-ac49-fbc7318412a3)

### Best Use of Cloudways

The project must be deployed on Cloudways and accessible to judges through a **public URL at demo time**. The page also emphasizes deployment quality, working functionality, polish, lasting usefulness, and operational features such as caching, staging, or scaling. A local demo alone does not meet the stated live-deployment requirement. [Challenge detail](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18738-a864-2307-402a-4a77d6f8267a)

At research time, all four detail pages displayed **“Submissions aren’t open for this event.”** This is a snapshot, not a prediction about later today. The pages read did not establish the submission cutoff, team-size limit, detailed scoring weights, or whether one project may enter multiple categories. Confirm these with the organizers before relying on them. [Challenge index](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges)

## All ten entries from Links & Resources

These are the event's labels, followed by the checked destination and the local guide covering them.

1. **Gemma 4 Resources** — [event short link](https://mlh.link/gemma) → [MLH Gemma partner hub](https://www.mlh.com/partners/gemma). Overview and learning resources. Covered in [gemma.md](gemma.md).
2. **Gemma Quickstart** — [event short link](https://mlh.link/gemma-quickstart) → [Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api). Hosted inference examples. The page now points to [the newer API guide](https://gemma.ai/deployment/gemini-api/).
3. **Gemma API Docs** — [event short link](https://mlh.link/gemma-docs) → [Get started with Gemma models](https://ai.google.dev/gemma/docs/get_started). Despite the event label, the destination is a getting-started overview, not a full endpoint reference.
4. **Gemma Beginner Guide** — [event short link](https://mlh.link/gemma-beginnerguide) → [google-gemma/cookbook](https://github.com/google-gemma/cookbook). Tutorials, application examples, and supporting materials rather than one linear beginner lesson.
5. **Graphify Installation Guide** — [original event link](https://docs.graphify.com/installation) → [current installation guide](https://docs.graphify.com/open-source/installation). Covered in [graphify.md](graphify.md).
6. **Graphify on GitHub** — [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify). Source, README, issues, examples, and contribution guidance.
7. **Give Your AI Coding Agent a Map** — [integration overview](https://docs.graphify.com/integrations/overview#local-skill). Both hosted MCP and local skill paths are now described on this page; follow the Graphify CLI section for local setup.
8. **Graphify Quickstart** — [original event link](https://docs.graphify.com/quickstart) → [current skill quickstart](https://docs.graphify.com/open-source/quickstart).
9. **Shipping on Cloudways** — [rendered cookbook](https://cloudways-cookbook-ybd5d.ondigitalocean.app/). Five tutorials covering launch, deployment, API, MCP, and operations. Covered in [cloudways.md](cloudways.md).
10. **Cloudways Cookbook** — [source repository](https://github.com/AshutoshKr17/cloudways-cookbook/tree/main). The source of the same guide, with Python helpers and notebooks; not a separate hosting product.

The challenge pages additionally expose [DigitalOcean's partner resource hub](https://www.mlh.com/partners/digitalocean), covered in [digitalocean.md](digitalocean.md), and a [Graphify Discord invitation](https://discord.gg/graphify).

## Evidence to prepare for a demo

The following is a recommended preparation list, not an official submission schema:

- A short statement of the user problem and one working end-to-end task.
- Repository URL, setup instructions, project license, and attribution for reused components.
- Exact Gemma model ID and an example input/output showing why it is useful.
- Graphify graph/report, a useful query, and source-file references supporting the answer.
- Public Cloudways URL, evidence of the deployment, and a tested way to recover from a failed release.
- A short recording or clearly labeled cached example in case event connectivity fails.
- Actual latency and failure observations from your own tests, rather than vendor benchmark claims.

Building a hackathon project and having a contribution qualify for Hacktoberfest are separate questions. The event pages reviewed do not establish that any particular PR will count toward Hacktoberfest; consult the relevant current contribution rules and maintainers if that is part of your objective.
