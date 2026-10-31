import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../../server/graph.js';
import { extractAnchors, matchAnchors } from '../../server/issue.js';
import { issueArea, rulePriority, computeMetrics } from '../../server/evidence.js';
import { computeDeterministic } from '../../server/analyze.js';
import { loadGraph, loadInput } from './helpers.js';

test('extractAnchors: stack frame inside a code fence, backticks, paths', () => {
  const { issue } = loadInput('A');
  const a = extractAnchors(issue);
  const frame = a.find((x) => x.kind === 'frame');
  assert.equal(frame.text, 'validate');
  assert.equal(frame.file, 'src/auth/authService.js');
  assert.equal(frame.line, 13);
  assert.ok(a.some((x) => x.kind === 'path' && x.file === 'src/auth/authService.js'));
  assert.ok(a.some((x) => x.kind === 'code' && x.text === 'isExpired' && x.strength === 'exact'));
  assert.ok(a.some((x) => x.kind === 'code' && x.text === 'createSession'));
});

test('extractAnchors: python frames, foo() calls, fuzzy tokens', () => {
  const a = extractAnchors({ title: 'Crash in parse_config', body: 'Traceback:\n  File "app/config.py", line 42, in load_settings\nCalling reloadAll() fails.' });
  assert.ok(a.some((x) => x.kind === 'frame' && x.text === 'load_settings' && x.file === 'app/config.py'));
  assert.ok(a.some((x) => x.kind === 'call' && x.text === 'reloadAll'));
  assert.ok(a.some((x) => x.kind === 'token' && x.text === 'parse_config' && x.strength === 'fuzzy'));
  assert.deepEqual(extractAnchors(null), []);
});

test('matchAnchors: exact symbols, anchor files only from frames/paths, never file nodes', () => {
  const idx = buildIndex(loadGraph());
  const m = matchAnchors(extractAnchors(loadInput('A').issue), idx);
  const ids = m.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ['authservice_validate', 'sessionstore_createsession', 'sessionstore_isexpired']);
  assert.ok(m.nodes.every((n) => n.tag === 'exact'));
  assert.deepEqual(m.files, ['src/auth/authService.js']);
  // A prose word that happens to be a file basename does not make it an anchor file.
  const m2 = matchAnchors(extractAnchors({ title: 'router is slow', body: 'the dispatchQueue thing' }), idx);
  assert.deepEqual(m2.files, []);
  assert.ok(!m2.nodes.some((n) => n.id.startsWith('src_')));
});

test('issueArea N1: anchors + call-type neighbours + anchor-file symbols, not imports', () => {
  const idx = buildIndex(loadGraph());
  const m = matchAnchors(extractAnchors(loadInput('A').issue), idx);
  const area = issueArea(m, idx);
  for (const id of ['authservice_validate', 'sessionstore_isexpired', 'sessionstore_createsession', 'sessionstore_getsession', 'middleware_requireauth', 'time_now', 'authservice_login']) {
    assert.ok(area.has(id), id);
  }
  for (const id of ['router_dispatch', 'middleware_withtimeout', 'config_request_timeout_ms', 'src_config']) assert.ok(!area.has(id), id);
});

test('null-metrics rule: no linked issue / no anchors / low coverage -> needs_context', () => {
  const noIssue = loadInput('B');
  noIssue.issue = null;
  const d1 = computeDeterministic(noIssue);
  assert.equal(d1.metrics.relevance, null);
  assert.equal(d1.metrics.nullReason, 'no_linked_issue');
  assert.equal(d1.rule.priority, 'needs_context');

  const vague = loadInput('B');
  vague.issue = { ...vague.issue, number: 9, title: 'it is broken', body: 'please help, logging out happens' };
  const d2 = computeDeterministic(vague);
  assert.equal(d2.metrics.nullReason, 'no_issue_anchors');
  assert.equal(d2.rule.priority, 'needs_context');
  assert.ok(d2.metrics.blastRadius > 0, 'structural metrics are still reported');

  const newFiles = loadInput('A');
  newFiles.files = [{ filename: 'src/brand/new.js', status: 'added', patch: '@@ -0,0 +1,3 @@\n+export function a() {}\n+export function b() {}\n+export function c() {}' }];
  const d3 = computeDeterministic(newFiles);
  assert.equal(d3.metrics.nullReason, 'low_coverage');
  assert.equal(d3.rule.priority, 'needs_context');
});

test('rulePriority table', () => {
  const idx = buildIndex(loadGraph());
  const m = (hit, rel) => ({ issueAreaHit: hit, relevance: rel, issueAreaNodes: [], unexplained: [], nullReason: null });
  assert.equal(rulePriority(null, idx).priority, 'needs_context');
  assert.equal(rulePriority(m(true, 0.5), idx).priority, 'review_first');
  assert.equal(rulePriority(m(true, 0.4), idx).priority, 'needs_context');
  assert.equal(rulePriority(m(false, 0), idx).priority, 'likely_off_target');
  assert.equal(rulePriority(m(false, 0.3), idx).priority, 'needs_context');
  assert.equal(rulePriority({ ...m(null, null), nullReason: 'low_coverage' }, idx).priority, 'needs_context');
  assert.equal(typeof computeMetrics, 'function');
});

test('evidence records: ids sequential, GitHub URLs, head vs base side, caps', () => {
  const input = loadInput('B');
  const d = computeDeterministic(input);
  d.evidence.forEach((e, i) => assert.equal(e.id, `E${i + 1}`));
  assert.ok(d.evidence.every((e) => e.url.startsWith('https://github.com/')));
  assert.ok(d.evidence.every((e) => e.text.length <= 600));
  assert.ok(d.evidence.length <= 25);
  const hunk = d.evidence.find((e) => e.kind === 'diff_hunk' && e.file === 'src/http/router.js');
  assert.ok(hunk.url.includes(`/blob/${input.pr.head.sha}/src/http/router.js#L16-L`), 'diff hunks link to head');
  const node = d.evidence.find((e) => e.kind === 'touched_node' && e.node === 'router_dispatch');
  assert.ok(node.url.endsWith(`/blob/${input.manifest.graphCommit}/src/http/router.js#L19`), 'nodes link to graph commit');
  assert.ok(d.evidence.some((e) => e.kind === 'issue_quote' && e.url === input.issue.html_url));
});

test('graphStale when manifest commit differs from PR base', () => {
  const input = loadInput('A');
  input.pr.base.sha = 'ffffffffffffffffffffffffffffffffffffffff';
  const d = computeDeterministic(input);
  assert.equal(d.coverage.graphStale, true);
  assert.ok(d.evidence.some((e) => e.kind === 'coverage_gap' && /Graph built at/.test(e.text)));
});
