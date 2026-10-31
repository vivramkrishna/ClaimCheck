import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGraph, buildIndex, walkPatch, diffToNodes, blastRadius, godNodes,
  dependentsOf, CALL_RELS, isTestFile, definedName,
} from '../../server/graph.js';
import { loadGraph } from './helpers.js';

test('walkPatch: old-side line walker with mixed + - context', () => {
  const patch = [
    '@@ -10,6 +10,7 @@ function foo() {',
    ' a',          // old 10
    '-b',          // old 11 recorded
    '+B',          // insertion after old 11 -> max(12-1,1) = 11
    ' c',          // old 12
    '+new1',       // insertion after old 12 -> 12
    '+new2',       // -> 12
    ' d',          // old 13
    '-e',          // old 14
    ' f',          // old 15
  ].join('\n');
  const [h] = walkPatch(patch);
  assert.deepEqual(h.lines.map((l) => [l.type, l.old]), [['-', 11], ['+', 11], ['+', 12], ['+', 12], ['-', 14]]);
  assert.equal(h.oldStart, 10);
  assert.equal(h.newStart, 10);
  assert.equal(h.header, 'function foo() {');
  // '+' at the very top of a file maps to line 1, not 0
  const [top] = walkPatch('@@ -1,2 +1,3 @@\n+// header\n a\n b');
  assert.equal(top.lines[0].old, 1);
});

test('normalizeGraph accepts "links" or "edges" and strips ./ from paths', () => {
  const nodes = [{ id: 'a', label: 'a()', source_file: './src/x.js', source_location: 'L3' }, { id: 'b', label: 'b()', source_file: 'src/x.js', source_location: 'L9-L12' }];
  const viaLinks = normalizeGraph({ nodes, links: [{ source: 'a', target: 'b', relation: 'calls' }] });
  const viaEdges = normalizeGraph({ nodes, edges: [{ source: 'a', target: 'b', relation: 'call' }] });
  assert.equal(viaLinks.edges.length, 1);
  assert.equal(viaEdges.edges[0].relation, 'calls'); // alias normalized
  assert.equal(viaLinks.edgesKey, 'links');
  assert.equal(viaEdges.edgesKey, 'edges');
  assert.equal(viaLinks.nodes[0].file, 'src/x.js');
  assert.equal(viaLinks.nodes[0].line, 3);
  assert.equal(viaLinks.nodes[1].endLine, 12);
  assert.equal(viaLinks.nodes[0].name, 'a');
});

test('edge-direction flag flips caller/callee interpretation', () => {
  const raw = loadGraph();
  const normal = buildIndex(raw, { sourceIsCaller: true });
  const flipped = buildIndex(raw, { sourceIsCaller: false });
  const callersNormal = dependentsOf(normal, 'sessionstore_createsession', CALL_RELS).map((d) => d.id);
  const callersFlipped = dependentsOf(flipped, 'sessionstore_createsession', CALL_RELS).map((d) => d.id);
  assert.deepEqual(callersNormal, ['authservice_login']);
  assert.deepEqual(callersFlipped, ['time_now']);
});

test('diffToNodes maps a constant change to its own symbol, not the preceding one', () => {
  const idx = buildIndex(loadGraph());
  const files = [{ filename: 'src/config.js', status: 'modified', patch: '@@ -1,2 +1,2 @@\n export const SESSION_TTL_SECONDS = 3600;\n-export const REQUEST_TIMEOUT_MS = 5000;\n+export const REQUEST_TIMEOUT_MS = 30000;' }];
  const d = diffToNodes(files, idx);
  assert.deepEqual(d.symbolIds, ['config_request_timeout_ms']);
  // When the constant is not a graph node, fall back to the file node (never the previous constant).
  const g2 = loadGraph();
  g2.nodes = g2.nodes.filter((n) => n.id !== 'config_request_timeout_ms');
  g2.links = g2.links.filter((e) => e.source !== 'config_request_timeout_ms' && e.target !== 'config_request_timeout_ms');
  const d2 = diffToNodes(files, buildIndex(g2));
  assert.deepEqual(d2.symbolIds, []);
  assert.deepEqual(d2.fileIds, ['src_config']);
  assert.deepEqual(d2.unmappedAdditions, ['REQUEST_TIMEOUT_MS']);
});

test('diffToNodes: new top-level function goes to unmappedAdditions; test files split out; renamed/added/no-patch handled', () => {
  const idx = buildIndex(loadGraph());
  const d = diffToNodes([
    { filename: 'src/utils/time.js', status: 'modified', patch: '@@ -1,3 +1,6 @@\n export function now() {\n   return Date.now();\n }\n+export function toMs(s) {\n+  return s * 1000;\n+}' },
    { filename: 'tests/session.test.js', status: 'modified', patch: '@@ -1,1 +1,2 @@\n x\n+y' },
    { filename: 'src/new/thing.js', status: 'added', patch: '@@ -0,0 +1,2 @@\n+export function brandNew() {\n+}' },
    { filename: 'src/session/store2.js', previous_filename: 'src/session/sessionStore.js', status: 'renamed', patch: '@@ -17,1 +17,1 @@\n-  return now() > session.expiresAt;\n+  return now() >= session.expiresAt;' },
    { filename: 'src/profile/profileService.js', status: 'modified' },
  ], idx);
  assert.ok(d.unmappedAdditions.includes('toMs'));
  assert.ok(d.unmappedAdditions.includes('brandNew'));
  assert.ok(!d.symbolIds.includes('time_now'), 'new function body must not map to now()');
  assert.deepEqual(d.testsChanged, ['tests/session.test.js']);
  assert.ok(d.symbolIds.includes('sessionstore_isexpired'), 'renamed file uses previous_filename');
  assert.ok(d.fileIds.includes('src_profile_profileservice'), 'no patch -> file-level');
  assert.equal(d.precision, 'file');
  assert.ok(d.mappedLines < d.changedLines, 'added file lines are unmapped');
});

test('isTestFile is not fooled by "attestation"', () => {
  assert.ok(isTestFile('tests/a.js'));
  assert.ok(isTestFile('src/a.test.js'));
  assert.ok(isTestFile('pkg/test_x.py'));
  assert.ok(!isTestFile('src/attestation.js'));
  assert.ok(!isTestFile('src/contest/score.js'));
});

test('definedName only catches top-level definitions', () => {
  assert.equal(definedName('export async function dispatch(req) {'), 'dispatch');
  assert.equal(definedName('export const X_MS = 5;'), 'X_MS');
  assert.equal(definedName('  const timer = 1;'), null);
  assert.equal(definedName('    def method(self):'), 'method');
});

test('blastRadius: reverse BFS over call edges + importers, depth <= 2', () => {
  const idx = buildIndex(loadGraph());
  const b = blastRadius(['sessionstore_createsession'], idx);
  const ids = b.dependents.map((d) => d.id);
  assert.ok(ids.includes('authservice_login'));      // caller, d1
  assert.ok(ids.includes('router_handlelogin'));     // caller of caller, d2
  assert.ok(!ids.includes('router_dispatch'));       // d3: out of range
  assert.deepEqual(b.testsToRun, ['tests/auth.test.js', 'tests/session.test.js']);
  assert.ok(b.dependents.every((d) => d.depth <= 2));
  assert.equal(blastRadius(['sessionstore_createsession'], idx, { cap: 2 }).count, 2);
});

test('godNodes: top 3 by degree on a small graph, hub included', () => {
  const g = godNodes(buildIndex(loadGraph()));
  assert.equal(g.length, 3);
  assert.ok(g.includes('router_dispatch'));
});
