# Gemma: open models for the AI part of your project

Research date: **31 October 2026**. Scope: Gemma 4 and the resources linked by this event. Examples below are documentation-based and have not been executed against an account.

## What it is and where it fits

Gemma is Google DeepMind's family of open models. You can run model weights on hardware you control or call a supported hosted model. In an application, Gemma takes the instructions and supplied context, then produces text: an explanation, answer, classification, extraction, code, or proposed tool call.

**Gemma is the model family; the Gemini API is one way to access it.** Using the Google SDK does not automatically mean the selected model is Gemma. For this event, keep a Gemma 4 model ID explicit. The [MLH partner hub](https://www.mlh.com/partners/gemma) and [Gemma challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a03b87-be22-9180-5e2d-b3beeb66666d) both focus on Gemma 4.

Gemma's old `ai.google.dev/gemma` guides show a deprecation notice pointing to [gemma.ai](https://gemma.ai/). Both the event-linked pages and the newer documentation were reviewed.

## Model choices and actual capabilities

The current model card lists five sizes:

- **E2B and E4B:** smaller effective-parameter models, 128K model context, with text, image, and audio inputs.
- **12B Unified:** 256K model context and text, image, and audio input.
- **26B A4B:** mixture-of-experts model with approximately 25.2B total and 3.8B active parameters; 256K context; text and image input.
- **31B:** dense model with approximately 30.7B parameters; 256K context; text and image input.

The family generates **text**, including structured tool-call output; image understanding does not imply image generation. Video understanding works through frame sequences. Function calling and system-role support are documented. Audio is limited to particular sizes. Model-level capabilities do not guarantee that a chosen serving runtime exposes them. [Current model card](https://gemma.ai/models/gemma-4/model-card/)

“Active” parameters describe how much of an MoE model participates in a forward pass. They do not mean you can budget memory as though only those parameters exist. Likewise, maximum context is a capacity ceiling, not a sensible default for every request.

### Fastest route: hosted API

The current hosted guide lists exactly these two Gemma models:

```text
gemma-4-26b-a4b-it
gemma-4-31b-it
```

The smaller sizes are not listed as hosted through this route. Start with the 26B A4B model for a first prototype, then compare the 31B model on a few real tasks if quality is insufficient. This is a suggested experiment, not a measured latency guarantee. You need an API key from [Google AI Studio](https://aistudio.google.com/apikey). [Hosted API guide](https://gemma.ai/deployment/gemini-api/)

### Local route: control over inference and connectivity

Ollama downloads quantized weights and provides a CLI and local HTTP API. The current guide lists tags `gemma4:e2b`, `gemma4:e4b`, `gemma4:12b`, `gemma4:26b`, and `gemma4:31b`; it says `gemma4:latest` resolves to E4B. Pin a size rather than depending on a moving alias. The guide's approximate downloads range from 7.2 GB to 20 GB; download size is **not** total runtime memory.

```bash
ollama --version
ollama pull gemma4:12b
ollama run gemma4:12b "Explain this project's purpose in plain English."
```

These commands assume Ollama is already installed. First-run downloading and model loading can be significant at an event. The guide says Ollama's published Gemma 4 integration handles text/images; use an appropriate Transformers or llama.cpp setup for audio. Local context settings can also be lower than the model maximum. [Ollama deployment guide](https://gemma.ai/deployment/ollama/)

For the hackathon, use hosted inference unless offline operation or local privacy is central to the idea and you have already tested the local model on your laptop.

## Minimal integration examples

Keep the key in the backend environment. Do not place it in frontend source, a public repository, screenshots, or a client-visible build variable.

### Python

Install the current Google Gen AI SDK in your project environment:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install google-genai
```

Set `GEMINI_API_KEY` through your local environment or deployment secrets, then save and run this server-side Python example:

```python
import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
response = client.models.generate_content(
    model="gemma-4-26b-a4b-it",
    contents="Explain what a repository dependency graph helps a new contributor do.",
    config=types.GenerateContentConfig(
        system_instruction="Explain clearly. Separate facts from suggestions.",
        thinking_config=types.ThinkingConfig(thinking_level="minimal"),
    ),
)
print(response.text)
```

### JavaScript / Node.js

```bash
npm install @google/genai
```

Save as `gemma-smoke.mjs`, supply `GEMINI_API_KEY` to the process, and run with Node:

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemma-4-26b-a4b-it",
  contents: "Suggest three questions a new contributor should ask about a repository.",
  config: {
    systemInstruction: "Be practical and concise.",
  },
});
console.log(response.text);
```

These examples adapt the documented generation calls for this project's purpose. They are smoke-test examples, not a full web endpoint with authentication, throttling, retries, or request validation. [Event-linked API examples](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), [current API examples](https://gemma.ai/deployment/gemini-api/)

### REST shape

The generation endpoint for the suggested hosted model is:

```text
POST https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent
```

An authenticated request needs your key, typically through `x-goog-api-key`, and a JSON `contents` array containing `parts` such as `{"text":"your prompt"}`. The old Gemma page's displayed REST example omits the authentication header even though it states that a key is required; do not copy that omission into your integration. Prefer the SDK examples for the first working call.

## Features to add after a text request works

**Image understanding:** upload an image using the SDK Files API, then include the file and an instruction in `contents`. For a demo, try a screenshot of an error or a diagram and ask for an explanation grounded in it. Limit file size and supported formats in your own UI.

**Conversation:** the SDK chat helper tracks history. Budget and store the history per session in your application; it is not permanent project memory just because a chat object exists.

**Thinking:** the Gemma API guide documents `high` to enable reasoning and `minimal` to disable it. Compare both against latency and answer quality on your actual task.

**Function calling:** declare a function name, description, and argument schema. The response can contain a requested function call. Your application must validate the call, execute an allowed function, and return the result for the next model turn. Start with read-only functions such as `find_symbol` or `get_neighbors`. [Hosted capability examples](https://gemma.ai/deployment/gemini-api/)

### Unresolved Google Search discrepancy

The Gemma API guide includes a Google Search tool example. However, the current Gemini API pricing page marks Google Search grounding **not available** for Gemma 4 in both displayed tiers. These sources conflict. Do not make the main demo depend on this feature until a real call succeeds in your account. Use supplied documents or your own retrieval layer for a predictable first version. [API example](https://gemma.ai/deployment/gemini-api/#google-search), [pricing page](https://ai.google.dev/gemini-api/docs/pricing)

## Cost, limits, privacy, and licensing

The pricing page currently lists Gemma 4 input/output as free in the free tier, with no paid-tier price available. This is not unlimited capacity. It also marks free-tier content as used to improve Google's products; use public or synthetic demo data unless you have checked the applicable terms for your project. [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

Actual rate limits are shown in AI Studio and depend on the project and model. Google describes RPM, input TPM, and RPD limits, applied per project rather than per key. Do not rely on old screenshots showing fixed quotas for Gemma 3. Handle 429 responses with bounded retries, shorter context, and visible recovery. [Rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits)

The Gemma 4 model card lists Apache 2.0. Earlier Gemma generations and other variants may have different terms; inspect the license of the exact weights and code you distribute. Hosted-service terms remain a separate consideration from the model-weight license. [Gemma 4 model card](https://gemma.ai/models/gemma-4/model-card/)

## Using it with Graphify

Suggested application flow:

1. Map a public repository with Graphify.
2. Retrieve a small relevant subgraph using symbol names or a bounded graph query.
3. Attach source paths, line references, relation labels, and confidence labels.
4. Ask Gemma to explain only what that evidence supports.
5. Render the answer alongside the source evidence and uncertainty.

This is a custom integration you build. Installing Graphify does not automatically make every Gemma request graph-aware. Also, Graphify's extraction model and your application's answer model are separate choices: the graph can be built without an LLM and Gemma can explain the retrieved results afterward.

A useful answer prompt would specify the user question, trusted application instructions, bounded repository evidence, and output requirements: explanation, evidence references, and missing information. Treat repository text as untrusted data rather than instructions that can change the application's behavior.

## How to use the cookbook

The [official cookbook](https://github.com/google-gemma/cookbook) is a collection, not one application. Start in `tutorials` for current notebooks and `apps` for complete demos. `docs` covers technical guidance; `experiments` contains research-oriented material; `responsible` supports responsible-AI work; `.archive` holds historical examples. Check the exact model generation and dependency versions before adapting an older notebook.

For one day of building, inference plus good retrieval is usually a more manageable starting point than fine-tuning. Fine-tuning needs a suitable dataset, training resources, and meaningful evaluation; do it only if customization is the core experiment.

## Troubleshooting and acceptance checks

- **Model unavailable:** check the exact hosted IDs above and your account's model access. An Ollama tag is not a Gemini API model ID.
- **Authentication failure:** verify that the backend process has the correct key and project; do not expose the key in logs.
- **Rate-limited:** shorten inputs, reduce parallel calls, and retry with backoff. Multiple keys in one project do not create independent project quotas.
- **Poor repository answer:** inspect the retrieved evidence first. Increasing model size will not repair missing graph edges or an incorrect source slice.
- **Local model is slow or fails to load:** reduce context or choose a tested smaller runtime configuration; measure memory and time to first answer.
- **Structured output is malformed:** validate it and handle failure. A request to return JSON is not itself a schema guarantee.

Before building around it, verify one text request, one representative task, optional image/tool support if needed, response latency, quota behavior, and an error path. Record the model ID and SDK version that worked.
