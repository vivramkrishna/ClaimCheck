// Generates the synthetic graph + AnalyzeInput fixtures for PRs A/B/C.
// Run: node test/core/fixtures/build-fixtures.js --write
// (node --test also loads every .js under test/, so writing is opt-in.)
// The graph mimics Graphify's networkx node-link output for the demo repo (HLD §3).
import fs from 'node:fs';

const dir = new URL('./', import.meta.url);
const OWNER = 'demo-owner';
const REPO = 'pr-reality-check-demo';
const BASE = 'b45e0000000000000000000000000000000000aa';

// ---------- Graph ----------
const C = { auth: [0, 'Session & Auth'], http: [1, 'HTTP Routing'], util: [2, 'Config & Utils'], test: [3, 'Tests'] };
const nodes = [];
const links = [];
const file = (id, path, c) => nodes.push({ id, label: path.split('/').pop(), source_file: path, source_location: 'L1', community: C[c][0], community_name: C[c][1], file_type: 'code', norm_label: path.split('/').pop().toLowerCase() });
const sym = (id, label, path, line, c) => {
  nodes.push({ id, label, source_file: path, source_location: `L${line}`, community: C[c][0], community_name: C[c][1], file_type: 'code', norm_label: label.toLowerCase() });
  links.push({ source: fileIdOf(path), target: id, relation: 'contains', confidence: 'EXTRACTED', source_file: path });
};
const fileIds = {};
const fileIdOf = (p) => fileIds[p];
const F = (id, path, c) => { fileIds[path] = id; file(id, path, c); };
const edge = (s, t, relation, confidence = 'EXTRACTED') => links.push({ source: s, target: t, relation, confidence, source_file: '' });

F('src_config', 'src/config.js', 'util');
F('src_utils_time', 'src/utils/time.js', 'util');
F('src_session_sessionstore', 'src/session/sessionStore.js', 'auth');
F('src_auth_passwords', 'src/auth/passwords.js', 'auth');
F('src_auth_authservice', 'src/auth/authService.js', 'auth');
F('src_http_middleware', 'src/http/middleware.js', 'http');
F('src_http_router', 'src/http/router.js', 'http');
F('src_profile_profileservice', 'src/profile/profileService.js', 'util');
F('tests_session_test', 'tests/session.test.js', 'test');
F('tests_auth_test', 'tests/auth.test.js', 'test');
F('tests_router_test', 'tests/router.test.js', 'test');

sym('config_session_ttl_seconds', 'SESSION_TTL_SECONDS', 'src/config.js', 1, 'auth');
sym('config_request_timeout_ms', 'REQUEST_TIMEOUT_MS', 'src/config.js', 2, 'http');
sym('time_now', 'now()', 'src/utils/time.js', 1, 'util');
sym('sessionstore_createsession', 'createSession()', 'src/session/sessionStore.js', 6, 'auth');
sym('sessionstore_getsession', 'getSession()', 'src/session/sessionStore.js', 12, 'auth');
sym('sessionstore_isexpired', 'isExpired()', 'src/session/sessionStore.js', 16, 'auth');
sym('passwords_checkpassword', 'checkPassword()', 'src/auth/passwords.js', 3, 'auth');
sym('authservice_login', 'login()', 'src/auth/authService.js', 5, 'auth');
sym('authservice_validate', 'validate()', 'src/auth/authService.js', 10, 'auth');
sym('middleware_requireauth', 'requireAuth()', 'src/http/middleware.js', 4, 'http');
sym('middleware_withtimeout', 'withTimeout()', 'src/http/middleware.js', 9, 'http');
sym('router_handlelogin', 'handleLogin()', 'src/http/router.js', 5, 'http');
sym('router_handleprofile', 'handleProfile()', 'src/http/router.js', 10, 'http');
sym('router_health', 'health()', 'src/http/router.js', 15, 'http');
sym('router_dispatch', 'dispatch()', 'src/http/router.js', 19, 'http');
sym('profileservice_getprofile', 'getProfile()', 'src/profile/profileService.js', 1, 'util');

// calls (source = caller)
edge('sessionstore_createsession', 'time_now', 'calls');
edge('sessionstore_isexpired', 'time_now', 'calls');
edge('authservice_login', 'passwords_checkpassword', 'calls');
edge('authservice_login', 'sessionstore_createsession', 'calls');
edge('authservice_login', 'config_session_ttl_seconds', 'uses');
edge('authservice_validate', 'sessionstore_getsession', 'calls');
edge('authservice_validate', 'sessionstore_isexpired', 'calls');
edge('middleware_requireauth', 'authservice_validate', 'calls');
edge('middleware_withtimeout', 'config_request_timeout_ms', 'uses');
edge('router_handlelogin', 'authservice_login', 'calls');
edge('router_handleprofile', 'middleware_requireauth', 'calls');
edge('router_handleprofile', 'profileservice_getprofile', 'calls', 'INFERRED');
edge('router_dispatch', 'router_handlelogin', 'calls');
edge('router_dispatch', 'router_handleprofile', 'calls');
edge('router_dispatch', 'router_health', 'calls');
edge('router_dispatch', 'middleware_withtimeout', 'calls');
// imports (file -> file, source = importer)
edge('src_session_sessionstore', 'src_utils_time', 'imports');
edge('src_auth_authservice', 'src_session_sessionstore', 'imports');
edge('src_auth_authservice', 'src_auth_passwords', 'imports');
edge('src_auth_authservice', 'src_config', 'imports');
edge('src_http_middleware', 'src_auth_authservice', 'imports');
edge('src_http_middleware', 'src_config', 'imports');
edge('src_http_router', 'src_auth_authservice', 'imports');
edge('src_http_router', 'src_http_middleware', 'imports');
edge('src_http_router', 'src_profile_profileservice', 'imports');
edge('tests_session_test', 'src_session_sessionstore', 'imports');
edge('tests_auth_test', 'src_auth_authservice', 'imports');
edge('tests_router_test', 'src_http_router', 'imports');

const graph = { directed: true, multigraph: false, graph: {}, nodes, links };

// ---------- Issue ----------
const issue = {
  number: 1,
  title: 'Users are logged out a few seconds after logging in',
  body: [
    'Steps: POST /login (test account) → GET /profile after ~5 s. Expected 200, got:',
    '',
    '```',
    'Error: 401 Session expired',
    '    at validate (src/auth/authService.js:13)',
    '```',
    '',
    'Looks like `isExpired` returns true right after `createSession`.',
  ].join('\n'),
  html_url: `https://github.com/${OWNER}/${REPO}/issues/1`,
  updated_at: '2026-10-31T05:20:00Z',
  state: 'open',
};

// ---------- Patches ----------
const patchA_store = `@@ -4,7 +4,7 @@ import { now } from '../utils/time.js';
 const sessions = new Map();

 export function createSession(userId, ttlSeconds) {
-  const session = { id: crypto.randomUUID(), userId, expiresAt: now() + ttlSeconds };
+  const session = { id: crypto.randomUUID(), userId, expiresAt: now() + ttlSeconds * 1000 };
   sessions.set(session.id, session);
   return session;
 }`;
const patchA_test = `@@ -11,3 +11,8 @@ test('isExpired is false for a fresh session', () => {
   const s = createSession('demo', 3600);
   assert.equal(isExpired(s), false);
 });
+
+test('session TTL is in seconds (regression for #1)', () => {
+  const s = createSession('demo', 60);
+  assert.ok(s.expiresAt - Date.now() > 59_000);
+});`;

const patchB_config = `@@ -1,2 +1,2 @@
 export const SESSION_TTL_SECONDS = 3600;
-export const REQUEST_TIMEOUT_MS = 5000;
+export const REQUEST_TIMEOUT_MS = 30000;`;
const patchB_mw = `@@ -9,7 +9,9 @@ export function requireAuth(req) {
 export function withTimeout(handler) {
   return async (req) => {
-    const timer = new Promise((_, reject) =>
-      setTimeout(() => reject(new Error('504 Timeout')), REQUEST_TIMEOUT_MS));
-    return Promise.race([handler(req), timer]);
+    let timeoutId;
+    const timer = new Promise((_, reject) => {
+      timeoutId = setTimeout(() => reject(new Error('504 Timeout')), REQUEST_TIMEOUT_MS);
+    });
+    return Promise.race([handler(req), timer]).finally(() => clearTimeout(timeoutId));
   };
 }`;
const patchB_router = `@@ -16,12 +16,24 @@ export function handleProfile(req) {
   return { status: 200, body: { ok: true } };
 }

+async function retryDispatch(handler, req, attempts = 2) {
+  let lastErr;
+  for (let i = 0; i < attempts; i++) {
+    try {
+      return await withTimeout(handler)(req);
+    } catch (err) {
+      lastErr = err;
+    }
+  }
+  throw lastErr;
+}
+
 export async function dispatch(req) {
   const routes = { 'POST /login': handleLogin, 'GET /profile': handleProfile, 'GET /health': health };
   const handler = routes[\`\${req.method} \${req.path}\`];
   if (!handler) return { status: 404, body: { error: 'Not found' } };
   try {
-    return await withTimeout(handler)(req);
+    return await retryDispatch(handler, req);
   } catch (err) {
     return { status: Number.parseInt(err.message, 10) || 500, body: { error: err.message } };
   }`;

const patchC_time = `@@ -1,3 +1,7 @@
 export function now() {
   return Date.now();
 }
+
+export function toMs(seconds) {
+  return seconds * 1000;
+}`;
const patchC_store = `@@ -1,10 +1,10 @@
 import crypto from 'node:crypto';
-import { now } from '../utils/time.js';
+import { now, toMs } from '../utils/time.js';

 const sessions = new Map();

 export function createSession(userId, ttlSeconds) {
-  const session = { id: crypto.randomUUID(), userId, expiresAt: now() + ttlSeconds };
+  const session = { id: crypto.randomUUID(), userId, expiresAt: now() + toMs(ttlSeconds) };
   sessions.set(session.id, session);
   return session;
 }`;

const f = (filename, patch, additions, deletions) => ({ filename, status: 'modified', additions, deletions, changes: additions + deletions, patch });
const PRS = {
  A: {
    number: 2, title: 'Fix session TTL units', branch: 'fix/session-ttl-ms', author: 'alice-dev', head: 'a0a0000000000000000000000000000000000002',
    body: 'Fixes #1. TTL was added as seconds to a ms timestamp. Multiply by 1000 and add a regression test.',
    files: [f('src/session/sessionStore.js', patchA_store, 1, 1), f('tests/session.test.js', patchA_test, 5, 0)],
  },
  B: {
    number: 3, title: 'Fix login timeout on slow networks', branch: 'fix/login-timeout', author: 'bob-dev', head: 'b0b0000000000000000000000000000000000003',
    body: 'Fixes #1. Root cause: the 5 s request timeout aborts the session handshake on slow networks, so users get logged out. Raised the timeout to 30 s and added retry-safe dispatch. All tests pass.',
    files: [f('src/config.js', patchB_config, 1, 1), f('src/http/middleware.js', patchB_mw, 5, 3), f('src/http/router.js', patchB_router, 13, 1)],
  },
  C: {
    number: 4, title: 'Convert session expiry to milliseconds', branch: 'fix-expiry-units', author: 'carol-dev', head: 'c0c0000000000000000000000000000000000004',
    body: 'Fixes #1',
    files: [f('src/utils/time.js', patchC_time, 4, 0), f('src/session/sessionStore.js', patchC_store, 2, 2)],
  },
};

const prJson = (p) => ({
  number: p.number, title: p.title, body: p.body, state: 'open',
  html_url: `https://github.com/${OWNER}/${REPO}/pull/${p.number}`,
  issue_url: `https://api.github.com/repos/${OWNER}/${REPO}/issues/${p.number}`,
  user: { login: p.author },
  head: { sha: p.head, ref: p.branch },
  base: { sha: BASE, ref: 'main', repo: { name: REPO, owner: { login: OWNER } } },
});
const manifest = { repo: `${OWNER}/${REPO}`, graphCommit: BASE, graphifyVersion: 'synthetic' };

const inputFor = (key, mode = 'graph') => {
  const p = PRS[key];
  return {
    _synthetic: true,
    repo: { owner: OWNER, name: REPO },
    pr: prJson(p),
    files: p.files,
    issue,
    linkedIssueSource: 'body_regex',
    openPRs: Object.entries(PRS).filter(([k]) => k !== key).map(([, o]) => ({
      number: o.number, title: o.title, author: o.author, headSha: o.head, linkedIssue: 1, files: o.files,
    })),
    graph,
    manifest,
    mode,
  };
};

if (process.argv.includes('--write')) {
fs.writeFileSync(new URL('graph.synthetic.json', dir), `${JSON.stringify(graph, null, 2)}\n`);
for (const k of ['A', 'B', 'C']) fs.writeFileSync(new URL(`input.${k}.json`, dir), `${JSON.stringify(inputFor(k), null, 2)}\n`);
console.log('wrote graph.synthetic.json, input.A.json, input.B.json, input.C.json');
}
