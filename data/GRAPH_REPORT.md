# Graph Report - pr-reality-check-demo  (2026-10-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 43 nodes · 84 edges · 7 communities (4 shown, 3 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c94cfc38`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6

## God Nodes (most connected - your core abstractions)
1. `validate()` - 6 edges
2. `login()` - 6 edges
3. `dispatch()` - 6 edges
4. `createSession()` - 5 edges
5. `isExpired()` - 5 edges
6. `getSession()` - 4 edges
7. `now()` - 4 edges
8. `clearSessions()` - 4 edges
9. `requireAuth()` - 4 edges
10. `handleProfile()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `validate()` --calls--> `isExpired()`  [EXTRACTED]
  src/auth/authService.js → src/session/sessionStore.js
- `requireAuth()` --calls--> `validate()`  [EXTRACTED]
  src/http/middleware.js → src/auth/authService.js
- `login()` --calls--> `checkPassword()`  [EXTRACTED]
  src/auth/authService.js → src/auth/passwords.js
- `login()` --calls--> `createSession()`  [EXTRACTED]
  src/auth/authService.js → src/session/sessionStore.js
- `handleProfile()` --calls--> `getProfile()`  [EXTRACTED]
  src/http/router.js → src/profile/profileService.js

## Import Cycles
- None detected.

## Communities (7 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.33
Nodes (6): validate(), checkPassword(), users, REQUEST_TIMEOUT_MS, SESSION_TTL_SECONDS, getSession()

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (8): engines, node, name, private, scripts, test, type, version

### Community 2 - "Community 2"
Cohesion: 0.43
Nodes (4): createSession(), isExpired(), sessions, now()

### Community 4 - "Community 4"
Cohesion: 0.60
Nodes (5): login(), withTimeout(), dispatch(), handleLogin(), health()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `login()` connect `Community 4` to `Community 0`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `dispatch()` (e.g. with `handleLogin()` and `handleProfile()`) actually correct?**
  _`dispatch()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Why does `validate()` connect `Community 0` to `Community 2`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `dispatch()` connect `Community 4` to `Community 3`, `Community 6`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._