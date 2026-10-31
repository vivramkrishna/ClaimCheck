# Graphify: a queryable map of a codebase

Research date: **31 October 2026**. No Graphify package or agent integration was installed during research.

## What it does

Graphify turns code and related materials into a knowledge graph: nodes represent symbols or concepts, and edges represent relationships such as imports, calls, inheritance, or references. An assistant can retrieve a relevant part of that graph before reading source or answering a repository question. The open-source engine uses local tree-sitter parsing for code and optional model-based semantic extraction for documents and media. It does not require an embedding database for its core graph workflow. [Project repository](https://github.com/Graphify-Labs/graphify)

Practical uses include onboarding to an unfamiliar repository, locating a subsystem, tracing dependencies, exploring change impact, and supplying evidence to coding agents. It does not prove that a proposed code change is correct, eliminate the need to inspect source, or guarantee that every dynamic dependency is represented.

## Three distinct ways to use it

1. **Standalone local CLI:** build and query a graph from the terminal or a pipeline. Code-only extraction needs no API key.
2. **Local assistant skill:** install instructions for your coding agent so it can drive Graphify and consult the graph during work.
3. **MCP connection:** expose an existing local graph as tools, or connect to Graphify's hosted service, which indexes repositories remotely.

The hosted endpoint is `https://api.graphify.com/mcp`, with sign-in and repository indexing. It is distinct from a local `graphify-mcp` process. Installing the skill does not establish a hosted MCP connection. [Integration overview](https://docs.graphify.com/integrations/overview)

For today's project, start with **local code-only extraction**. It makes the data flow easy to understand and avoids requiring another model provider just to build the graph.

## Installation and prerequisites

The documented minimum is Python 3.10+. `uv` or `pipx` provides an isolated installation. The official package has **two y's**, `graphifyy`; the command remains `graphify`.

```bash
uv tool install graphifyy
graphify --help
```

Alternative: `pipx install graphifyy`. If the command is missing, use `uv tool update-shell` or `pipx ensurepath`, then open a new terminal. Optional extras include `mcp`, `watch`, `pdf`, `sql`, `terraform`, `office`, `ollama`, and `leiden`; install only what you need. For example, `uv tool install "graphifyy[mcp]"`. An existing uv tool installation may require `--reinstall` to change extras. [Installation guide](https://docs.graphify.com/open-source/installation)

## First graph: deterministic local route

Run from the root of the code repository you want to inspect:

```bash
GRAPHIFY_BACKEND=none graphify extract . --code-only
GRAPHIFY_BACKEND=none graphify cluster-only . --no-label
graphify god-nodes --top 5
```

The first command extracts code. The second produces the report and HTML without LLM-based community labeling. `GRAPHIFY_BACKEND=none` explicitly disables model backends; `--code-only` skips document/media semantic extraction. This workspace initially contains research notes, so use an actual code repository when trying this workflow. [CLI quickstart](https://docs.graphify.com/open-source/cli-quickstart), [backend controls](https://docs.graphify.com/open-source/configuration/environment-variables)

Important output files are:

```text
graphify-out/
  graph.json        machine-readable graph
  graph.html        interactive browser view
  GRAPH_REPORT.md   graph overview and notable structure
  manifest.json    extraction bookkeeping
  cache/           cached work
```

The skill quickstart documents this output layout. The repository notes that `graph.schema_version` and `graph.graphify_version` identify format and producer versions. Check these before writing a consumer of `graph.json`; do not assume an old example's schema is permanent. [Skill quickstart](https://docs.graphify.com/open-source/quickstart), [repository README](https://github.com/Graphify-Labs/graphify)

## Questions and queries that actually work

Illustrative commands below use symbols that must exist in your chosen repository:

```bash
graphify query "AuthService SessionStore" --budget 1500
graphify explain "SessionStore"
graphify path "AuthService" "Database"
graphify update .
```

The CLI quickstart describes query matching against words in node labels, followed by graph traversal. Consequently, a specific symbol or filename is often more reliable than a vague full-sentence question. An agent can translate natural language into candidate symbol queries and explain the results.

- Breadth-first traversal explores nearby relationships; `--dfs` follows chains more deeply.
- A token budget limits the returned context. A truncated result is not the whole graph.
- Exit code **3** can indicate ambiguous matches; **4** can indicate no matches.
- If a directed path is absent, `--undirected` explores connectivity without respecting direction. Label that distinction in your result.
- For overloaded function names, include parentheses or a more specific symbol reference.

These behaviors and troubleshooting steps are documented in the [CLI quickstart](https://docs.graphify.com/open-source/cli-quickstart).

### Confidence labels

- `EXTRACTED`: relationship explicitly read from source.
- `INFERRED`: relationship derived by a resolver or inference process.
- `AMBIGUOUS`: multiple candidate targets remain.

An inferred edge is not necessarily an LLM guess; resolution can also infer relationships deterministically. Preserve these labels in your own UI. “No path found” only means no path was found in the available graph under that query; it does not establish that no runtime relationship exists. [CLI confidence description](https://docs.graphify.com/open-source/cli-quickstart), [repository explanations](https://github.com/Graphify-Labs/graphify)

## Use as a coding-agent skill

Choose the target explicitly because the README and quickstart differ on the default installer behavior:

```bash
graphify install --project --platform codex
```

This is an example of Graphify's installer targeting a repository-local agent integration. Review the files it creates before committing. Depending on the platform and version, registration can write skill files, instructions, or hooks. It does not give the agent extra permissions. [Installation](https://docs.graphify.com/open-source/installation), [integrations](https://docs.graphify.com/integrations/overview)

In an assistant that supports the slash invocation:

```text
/graphify .
/graphify query "how does authentication reach the database"
/graphify . --update
/graphify . --wiki
```

Client discovery varies; if the slash command is absent, refresh the client and explicitly ask it to use the installed Graphify skill. The skill can use the assistant's model for non-code materials. Do not assume that a skill invocation on a mixed folder is entirely offline. [Skill quickstart](https://docs.graphify.com/open-source/quickstart)

## Expose a local graph through MCP

MCP is a protocol that lets an assistant call named tools. Here the tools read graph data; the model is still responsible for deciding how to use the returned evidence.

After building the graph and installing the MCP extra, a local stdio server can be started with:

```bash
graphify-mcp /absolute/path/to/repo/graphify-out/graph.json
```

Use an absolute path in a GUI client's configuration because its working directory may differ from your terminal's. The documented tools include `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, and PR-oriented tools. A first connection test is `graph_stats`, followed by a small `query_graph` request. [Local MCP guide](https://docs.graphify.com/open-source/mcp-server)

For an HTTP server, the documented form is:

```bash
graphify-mcp /absolute/path/to/repo/graphify-out/graph.json \
  --transport http --port 8099 --api-key "$GRAPHIFY_API_KEY"
```

It binds to localhost by default. HTTP clients authenticate using a bearer token or `X-API-Key`. This example assumes you have supplied a strong server key in the environment; it is not a command to expose the graph publicly. A local server does not eliminate disclosure to a remote assistant if that assistant receives the query results.

## Documents, models, exclusions, and privacy

Code parsing is local. The semantic pass over documents, PDFs, and images can use a remote provider or local Ollama. The backend can be auto-selected from available credentials, so explicitly set `GRAPHIFY_BACKEND` when data residency matters. `none` disables model calls; `ollama` selects the local backend when correctly configured. [Environment settings](https://docs.graphify.com/open-source/configuration/environment-variables), [repository privacy section](https://github.com/Graphify-Labs/graphify)

For a first demo, use public source code and a code-only graph. Exclude secrets, generated files, dependencies, and irrelevant large assets. Graphify documents `.gitignore`, `.graphifyignore`, and exclusion controls. Check graph outputs before sharing: a graph can still reveal source paths, internal names, comments, and architectural details. [Ignoring files](https://docs.graphify.com/open-source/configuration/ignoring-files)

Useful settings include `GRAPHIFY_OUT` for a separate output folder, `GRAPHIFY_MAX_WORKERS` for parsing concurrency, and `GRAPHIFY_MAX_OUTPUT_TOKENS` for model-call output. `.graphifyrc` handles project-specific settings such as `language.inc=php` when an extension is ambiguous. [Environment settings](https://docs.graphify.com/open-source/configuration/environment-variables), [project settings](https://docs.graphify.com/reference/configuration)

### Documentation conflicts worth knowing

- **Default installer target:** the quickstart says Claude Code; installation/README describe detection. Use `--platform` explicitly.
- **Query logging:** the README describes default local query logging, while the environment reference says logging is opt-in. Set `GRAPHIFY_QUERY_LOG_DISABLE=1` if you require it off, and verify your installed version.
- **HTML limits:** sources differ on whether large graphs are skipped or rendered as community aggregates. Treat `graph.json` as the primary data artifact and verify rendering behavior for your installed version.
- **Clustering:** the README says Leiden is used when installed, with a Louvain fallback otherwise. Community assignments can therefore change across environments.

Sources: [README](https://github.com/Graphify-Labs/graphify), [quickstart](https://docs.graphify.com/open-source/quickstart), [environment reference](https://docs.graphify.com/open-source/configuration/environment-variables). Pin the working package version and record the source commit when reproducibility matters.

## Cost and open-source status

Local code-only extraction requires no LLM API spend, but still uses your hardware. Document extraction may consume the chosen provider's quota. The current documentation advertises a hosted free plan of up to three repositories and paid-plan trials; account eligibility and current limits must be checked before relying on them. [Current installation page](https://docs.graphify.com/open-source/installation)

The repository currently shows an Apache-2.0 license and a retained MIT license file. Inspect `LICENSE`, `LICENSE-MIT`, and `NOTICE` at the version you reuse rather than assuming the older project's license summary applies unchanged. [Repository license files](https://github.com/Graphify-Labs/graphify)

## Building a product with it

For a custom repository assistant, there are two practical designs:

1. **Precomputed graph:** build a graph locally, package an approved public graph with your app, and use it for a fixed demo repository. This is the simplest same-day deployment.
2. **Graph service:** run the CLI/MCP server in a supported Python environment and have your app request relevant subgraphs. This supports more dynamic use, but adds process management, authentication, and resource limits.

Do not assume a Node.js hosting plan also supports a persistent Python MCP process. Validate that separately or use precomputed output. If your app invokes a CLI, use fixed allowed arguments, timeouts, and a safe process API; do not concatenate a user's question into a shell command.

Example demo: ask which callers could be affected by a change, show the actual graph path with confidence labels, and let Gemma summarize the evidence. Measure answer quality and retrieved context size on the same questions before making token-saving claims.

## First-session acceptance checklist

- Build a code-only graph of one small real repository.
- Confirm important symbols exist and graph source locations match the checked-out commit.
- Run one exact-symbol query, one path query, and one intentionally missing-symbol query.
- Inspect the HTML and report, but keep the JSON available even if HTML rendering is limited.
- Change one source file and verify `graphify update .` updates the relevant data.
- Record the package version, graph schema/version, model backend if any, and exclusions.

For contribution ideas, investigate a reproducible extraction gap, improve a worked example, or document a verified integration. Read the repository contribution guide before implementing. The [event challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18734-5d1e-859b-ac49-fbc7318412a3) emphasizes useful code understanding, not merely producing a graph screenshot.
