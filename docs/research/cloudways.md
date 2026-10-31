# Cloudways: deploy the project and keep it running

Research date: **31 October 2026**. The event-linked cookbook, its repository, relevant helper-script source, and official Cloudways pages were reviewed. No account, token, server, or deployment was created.

## What it is

Cloudways is managed application hosting: it provisions and operates hosting infrastructure while giving you application deployment and operational controls. A server supplies compute resources, an application is the hosted site/service, and a project groups resources. The API and MCP server expose management operations so software or an assistant can inspect and operate the account.

For an AI project, Cloudways can host the web UI and backend that calls Gemma. That does not mean a small Cloudways application server can run a large Gemma model locally. Keep inference on the hosted model endpoint unless you have separately verified suitable inference hardware.

The [event challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18738-a864-2307-402a-4a77d6f8267a) requires the project to run on Cloudways at a public URL during demos. Deployment quality, function, and polish matter; the challenge also mentions operational features such as caching, staging, and scaling.

## Choose the right Cloudways product first

### Flexible: PHP-oriented applications

Use Flexible for the cookbook's WordPress, WooCommerce, Laravel, Magento, and custom-PHP paths. The guide walks through a server, application access, Git deployment, and operational tasks. The main cookbook API examples are written around this server/application model. [Event cookbook](https://cloudways-cookbook-ybd5d.ondigitalocean.app/#t1)

### Velocity: Node.js applications

The official Velocity page describes managed Node.js hosting with presets for Next.js, Remix, React, Express, Fastify, Astro, Nuxt, Svelte, Vite, Angular, and n8n. It supports Git-based deployment, environment variables, logs, and PostgreSQL provisioning. At research time, the displayed Starter plan was **$20/month**, with **2 GB RAM, 2 vCPU, and five apps**; Professional was **$30/month**, with **4 GB RAM and eight apps**. Prices and inclusions are a dated snapshot, not a quote for your account. [Official Velocity page](https://www.cloudways.com/en/velocity.php)

For a JavaScript-based hackathon app, Velocity is the more direct product to investigate. A React static frontend alone cannot safely hold a Gemma key; pair it with a server-side endpoint. Verify your chosen framework's actual build/start settings in the deployment UI.

### Autonomous: managed WordPress use cases

Cloudways positions Autonomous for managed, autoscaling WordPress workloads. It is unlikely to be the first choice for a custom repository-analysis service unless the product itself is WordPress-based. [Official product descriptions in Cloudways' API announcement](https://www.cloudways.com/blog/introducing-cloudways-api-v2/)

**Do not assume the Flexible API examples, Git UI, SSH workflow, or MCP tools apply unchanged to Velocity or Autonomous.** Confirm product support for the particular operation before making it part of the app.

## Event offer: what the linked guide actually says

The event-linked guide advertises this [hackathon signup link with `CWFEST20`](https://unified.cloudways.com/signup?coupon=CWFEST20):

- Without adding a card: a trial path for Flexible/Autonomous on a 2 GB or 4 GB server, or Velocity Starter at 2 GB.
- Adding a card after signup through that link: **$20 worth of credits**.
- Winners: **Velocity Starter for three months**, according to the guide.

These are **claims from the event-linked community cookbook**, not an offer verified inside your account. Confirm eligibility, expiry, eligible services, and post-trial billing before relying on them. The official challenge page reviewed does not specify the winner-redemption mechanics. [Cookbook offer section](https://cloudways-cookbook-ybd5d.ondigitalocean.app/)

The guide describes a three-day Flexible trial. Do not generalize hourly billing language from Flexible to Velocity's displayed flat monthly plans. Read the actual selected plan and trial terms before provisioning.

## Deployment path A: a JavaScript AI application

Suggested procedure using the documented Velocity capabilities:

1. Build a small app with a server-side `/api/ask` route and a visible loading/error state.
2. Make a local Gemma request succeed using `GEMINI_API_KEY` in the backend environment.
3. Put the application in a repository with its lockfile and explicit build/start scripts.
4. Connect the repository in Velocity and review the detected framework, branch, build command, start command, and required runtime.
5. Add the API key as a runtime secret/environment variable. Avoid exposing it through frontend-prefixed variables or build output.
6. Deploy, inspect build/runtime logs, and open the public URL from another browser or device.
7. Test the real AI route after deployment, not only the home page. Verify timeouts, quota errors, and a reload.

The deployment settings are application-specific; this is an implementation plan rather than a tested configuration for a repository that already exists. [Velocity capabilities](https://www.cloudways.com/en/velocity.php)

If using Graphify, the least complicated initial deployment is a fixed, precomputed graph of an approved public repository. Running Graphify extraction or MCP as a Python service needs a separately verified hosting path.

## Deployment path B: Flexible and Git

The cookbook documents this flow:

1. Create the application and locate its access details.
2. Under Deployment via Git, generate the application's deploy key.
3. Add that public key to the source repository as a deploy key.
4. Use the repository's **SSH URL**, choose the branch and deploy path, and start deployment.
5. Pull later changes through the deployment UI or a verified API workflow.

The guide says HTTPS repository URLs are not supported for this Flexible Git integration. Its generated deploy key is for console deployments; manual Git use over SSH is a separate credential/key workflow. Application SSH may need enabling. [Cookbook deployment tutorial](https://cloudways-cookbook-ybd5d.ondigitalocean.app/#t2), [official Git deployment guide](https://support.cloudways.com/using-git-for-deployment/)

For Laravel, point the webroot at the application's `public` directory, configure the app environment and database, and run appropriate dependency/build/migration steps. Do not blindly rerun a sample that recreates `.env` or changes `APP_KEY` on an existing app. A deployment plan must preserve the existing configuration and data.

For automatic deployment, establish a successful manual deployment first. The cookbook describes a webhook/CI call to the Git pull API. Keep credentials outside the public webroot, authenticate the webhook, and limit the deployment branch. A Git pull is not proof that dependencies, migrations, or a Node build completed.

## Current authentication: Access Tokens and API v2

Cloudways' official Access Token guide schedules the legacy email/API-key mechanism for retirement on **15 October 2026**. New integrations should use Access Tokens. The guide says the primary account owner creates tokens; tokens have expiry and access scopes. A token is displayed once, so store it in a secret store or local environment. [Official Access Token guide](https://support.cloudways.com/en/articles/5136065-how-to-create-and-manage-cloudways-api-access-tokens)

Use a read-only token for initial inventory. For deployment, limit access to the operations you actually require. The current API base used by the cookbook is:

```text
https://api.cloudways.com/api/v2
```

API v1 is deprecated; the official migration announcement directs clients toward v2 and notes deprecated endpoints. Replacing the version in a URL is not a substitute for checking the schema of a particular mutation. [Official API v2 announcement](https://www.cloudways.com/blog/introducing-cloudways-api-v2/)

### First read-only request

After securely setting `CLOUDWAYS_TOKEN` in your environment:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CLOUDWAYS_TOKEN" \
  -H "Accept: application/json" \
  https://api.cloudways.com/api/v2/server
```

The cookbook also uses `/providers` to discover available providers. Discover valid region/size/application values through the API's Lists operations instead of copying a sample combination. The [API Playground](https://developers.cloudways.com/play) is the place to inspect request and response schemas; its requests operate on the real account.

## Cookbook repository and helper scripts

The [repository](https://github.com/AshutoshKr17/cloudways-cookbook/tree/main) contains numbered tutorials, Python helpers, a notebook, a combined `GUIDE.md`, and the generated website. Its `.do/app.yaml` deploys the **guide website to DigitalOcean App Platform**; it is not a Cloudways deployment template for your own project.

The following were inspected as source, not executed:

- [`scripts/cw.py`](https://github.com/AshutoshKr17/cloudways-cookbook/blob/main/scripts/cw.py): standard-library HTTP client; reads `CLOUDWAYS_TOKEN`; defaults to v2; sends form-encoded POST bodies unless `as_json=True`; includes basic error handling and operation polling.
- [`scripts/git_deploy.py`](https://github.com/AshutoshKr17/cloudways-cookbook/blob/main/scripts/git_deploy.py): clone/pull helper. Pull fields include `server_id`, `app_id`, `git_url`, `branch_name`, and optional `deploy_path`. The script explicitly labels the clone-body equivalence as requiring verification.
- [`scripts/create_server.py`](https://github.com/AshutoshKr17/cloudways-cookbook/blob/main/scripts/create_server.py): prints a dry-run payload by default; `--yes` triggers creation. Its own comments say fields originated with v1 and must be verified for v2.
- [`scripts/app_backup.py`](https://github.com/AshutoshKr17/cloudways-cookbook/blob/main/scripts/app_backup.py): uses an app backup endpoint and fields explicitly marked for v2 verification.

The repo also provides `scripts/list_servers.py` for inventory, as described in its README; that file was not separately source-reviewed.

### Script limitations that affect a demo

`cw.wait_for_operation()` documents its expected response shape as an unverified assumption. It checks `is_completed` and returns the operation; it does not separately establish successful completion from a failure field. Consequently, a printed completion message is not sufficient evidence that a deployment or backup succeeded. Verify the operation outcome and the actual app state.

The client does not implement a production retry strategy for transient failures or 429 rate limits. It exits on HTTP errors, and its body encoding must match the endpoint schema. Treat these scripts as learning helpers, then validate and harden only the operations your project needs. These findings come from reading the [client source](https://github.com/AshutoshKr17/cloudways-cookbook/blob/main/scripts/cw.py).

The guide explicitly labels some examples “verify,” and calls itself an unofficial community guide. Its rendered page says checked on 30 October; the README's disclaimer still says 21 October. Use official docs plus a real test for the final integration.

## Cloudways MCP: let an assistant operate hosting tools

The MCP server translates named tools into Cloudways operations. This can be useful for inventory, monitoring, deployment assistance, or an operations demo. It is separate from serving your application's end users.

Current connection details in the official setup page:

```text
Endpoint: https://mcp.cloudways.com/mcp/
Header: X-Access-Token: <your token>
Header: X-Mcp-Host: <your client identifier>
```

Use the trailing slash. REST API calls use `Authorization: Bearer`; this MCP configuration uses the documented `X-Access-Token` header. Client configuration syntax varies, so use the appropriate client section rather than copying another client's JSON. The official article includes updated Access Token examples alongside stale email/API-key prose. Follow the updated token mechanism. [Official MCP setup](https://support.cloudways.com/en/articles/14654372-how-to-use-cloudways-mcp-server-for-ai-based-server-management)

The cookbook describes toolset discovery through `list_available_toolsets`, `get_toolset_tools`, and `execute_tool`; consult the current server's tool list rather than assuming a fixed count. Useful first prompts are to list servers, inspect service status, and retrieve monitoring information for a specific server ID. [Cookbook MCP tutorial](https://cloudways-cookbook-ybd5d.ondigitalocean.app/#t4), [official tool reference](https://support.cloudways.com/en/articles/15798823-cloudways-mcp-server-tools)

Suggested application design: Gemma may summarize read-only operational data, but the backend should decide which tools are allowed. Do not pass a broad Cloudways token or unrestricted destructive tools to a public chat interface. A change should identify the exact server/app and be reviewed before execution.

## Operations that help the entry

Choose one or two demonstrable operational features instead of enabling everything:

- **A working public URL and HTTPS:** verify the exact URL a judge will open.
- **Fresh backup and a recovery plan:** confirm the backup completed; know the restore or redeployment path.
- **Staging:** try a change away from the demo instance if the selected product supports it.
- **Monitoring:** show application/server health and explain an actual metric.
- **Caching:** cache appropriate repeated reads, but keep private or per-user AI responses isolated.

These areas correspond to the cookbook's operational tutorial and the challenge's emphasis on a working, polished deployment. Availability and menu names vary by product. [Operations tutorial](https://cloudways-cookbook-ybd5d.ondigitalocean.app/#t5), [challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18738-a864-2307-402a-4a77d6f8267a)

## Common failure paths

- **401:** check token validity, expiry, and the authentication header for REST versus MCP.
- **403:** inspect token scope and account permissions.
- **422:** compare fields and provider/region/size choices against the current Playground schema.
- **Git permission failure:** check the deploy key, repository authorization, branch, and SSH URL for the Flexible workflow.
- **Laravel blank page:** inspect webroot, app logs, environment, and dependencies.
- **Frontend works but AI fails:** inspect runtime secret availability, backend route logs, outbound connectivity, and Gemma quota.
- **Operation accepted but app unchanged:** inspect the final operation result, deployment logs, and the public app itself.
- **MCP tools missing:** refresh/reconnect the client; the setup guide notes that clients cache tool lists.

Before judging, test the public app from a fresh browser session, record the working revision, and verify the main interaction twice with representative inputs. Track the trial end and resources you intend to retain; after the event, revoke temporary tokens and review unused resources through the account dashboard.
