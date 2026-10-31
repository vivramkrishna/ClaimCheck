# Security policy

## Supported version

The `main` branch is the supported release line for this hackathon project.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow. Do not open a public issue containing credentials, private repository content, or an exploitable proof of concept.

Include the affected route or component, reproduction steps, impact, and any suggested mitigation. Maintainers will acknowledge a report as soon as practical and coordinate disclosure after a fix is available.

## Security boundaries

- The service has read-only GitHub access and never changes pull requests.
- API and model credentials stay in environment variables and are never returned by health endpoints.
- Pull-request, issue, code, and model text are untrusted and are rendered with `textContent`.
- Evidence links are restricted to HTTPS GitHub URLs.
- API responses are not browser-cached; requests are rate-limited and carry request IDs.
- Generated graph HTML is served in a sandboxed browser context.

Rotate any credential that is accidentally committed, even if the commit is later rewritten.
