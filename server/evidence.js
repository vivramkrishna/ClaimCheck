// Metrics, duplicates, deterministic priority and numbered evidence records.
// The server owns every number here; the model only words them.
import {
  CALL_RELS, getNode, neighboursOf, diffToNodes, shortestPath, cleanPath,
} from './graph.js';

// ---- Thresholds (HLD §4.4–4.6). Tuned on the idea, not fitted to 3 fixtures. ----
export const REVIEW_FIRST_MIN_RELEVANCE = 0.5;
export const OFF_TARGET_MAX_RELEVANCE = 0.25;
export const MIN_COVERAGE_RATIO = 0.5;
export const DUPLICATE_MIN_JACCARD = 0.3;
export const EVIDENCE_MAX_RECORDS = 25;
export const EVIDENCE_MAX_TOTAL_CHARS = 6000;
export const EVIDENCE_MAX_TEXT = 600;

const round2 = (x) => Math.round(x * 100) / 100;
const truncate = (s, n = EVIDENCE_MAX_TEXT) => {
  const t = String(s ?? '');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};

// ---------------- URLs ----------------
const encPath = (p) => cleanPath(p).split('/').map(encodeURIComponent).join('/');
export function repoBase(input) {
  const o = input.repo?.owner ?? input.pr?.base?.repo?.owner?.login;
  const r = input.repo?.name ?? input.pr?.base?.repo?.name;
  return `https://github.com/${o}/${r}`;
}
export const prUrl = (input) => input.pr?.html_url ?? `${repoBase(input)}/pull/${input.pr?.number}`;
export const prFilesUrl = (input) => `${prUrl(input)}/files`;
export const issueUrl = (input) => input.issue?.html_url ?? `${repoBase(input)}/issues/${input.issue?.number}`;
export function blobUrl(input, sha, file, from, to) {
  const anchor = from ? `#L${from}${to && to !== from ? `-L${to}` : ''}` : '';
  return `${repoBase(input)}/blob/${sha}/${encPath(file)}${anchor}`;
}
/** Base-side link for a graph node (graph is pinned to graphCommit). */
export function nodeUrl(input, node) {
  if (!node?.file) return prFilesUrl(input);
  const sha = input.manifest?.graphCommit ?? input.pr?.base?.sha;
  return blobUrl(input, sha, node.file, node.line, node.endLine ?? null);
}

export function nodeRef(input, index, id) {
  const n = getNode(index, id);
  return { id, label: n?.label ?? id, file: n?.file ?? null, line: n?.line ?? null, url: n ? nodeUrl(input, n) : null };
}

// ---------------- Issue area ----------------
/** N1(A) = anchors ∪ 1-hop call-type neighbours (either direction) ∪ symbols in anchor files. */
export function issueArea(anchorMatch, index) {
  const area = new Set();
  for (const a of anchorMatch.nodes) {
    area.add(a.id);
    for (const nb of neighboursOf(index, a.id, CALL_RELS)) {
      const n = getNode(index, nb.id);
      if (n && !n.isFile) area.add(nb.id);
    }
  }
  for (const f of anchorMatch.files) for (const s of index.byFile.get(f) ?? []) area.add(s.id);
  return area;
}

const communitiesOf = (index, ids) => new Set(ids.map((id) => getNode(index, id)?.community).filter((c) => c != null));

// ---------------- Coverage ----------------
export function buildCoverage(diff, input) {
  const base = input.pr?.base?.sha ?? null;
  const graphCommit = input.manifest?.graphCommit ?? null;
  return {
    precision: diff.precision,
    mappedLines: diff.mappedLines,
    changedLines: diff.changedLines,
    unmappedAdditions: diff.unmappedAdditions,
    graphStale: Boolean(graphCommit && base && graphCommit !== base),
    testsChanged: diff.testsChanged,
  };
}

// ---------------- Metrics ----------------
export function computeMetrics({ input, index, diff, anchorMatch, area, blast, gods }) {
  const T = diff.symbolIds;
  const godSet = new Set(gods);
  const base = {
    blastRadius: blast.count,
    godNodesTouched: diff.touchedIds.filter((id) => godSet.has(id)),
    edgeConfidence: blast.edgeConfidence,
  };
  const ratio = diff.changedLines ? diff.mappedLines / diff.changedLines : 0;
  let nullReason = null;
  if (!input.issue) nullReason = 'no_linked_issue';
  else if (!anchorMatch.nodes.length && !anchorMatch.files.length) nullReason = 'no_issue_anchors';
  else if (diff.changedLines === 0) nullReason = 'no_code_changes';
  else if (ratio < MIN_COVERAGE_RATIO) nullReason = 'low_coverage';
  else if (!T.length) nullReason = 'no_symbol_level_changes';

  const unexplainedIds = [...T.filter((id) => !area.has(id)), ...diff.fileIds.filter((id) => !anchorMatch.files.includes(getNode(index, id)?.file))];
  const unexplained = unexplainedIds.map((id) => nodeRef(input, index, id));

  if (nullReason) {
    return { issueAreaHit: null, issueAreaNodes: [], relevance: null, communityOverlap: null, unexplained, ...base, nullReason };
  }
  const hits = T.filter((id) => area.has(id));
  const commT = communitiesOf(index, T);
  const commA = communitiesOf(index, anchorMatch.nodes.map((n) => n.id));
  const shared = [...commT].filter((c) => commA.has(c));
  return {
    issueAreaHit: hits.length > 0,
    issueAreaNodes: hits,
    relevance: round2(hits.length / T.length),
    communityOverlap: commT.size ? round2(shared.length / commT.size) : null,
    unexplained,
    ...base,
    nullReason: null,
  };
}

// ---------------- Priority rule (HLD §4.6) ----------------
const NULL_REASON_TEXT = {
  no_linked_issue: 'the PR has no linked issue',
  no_issue_anchors: 'the issue names no function, file or stack frame we can find in the graph',
  no_code_changes: 'the PR changes no non-test code',
  low_coverage: 'less than half of the changed lines map onto the code graph',
  no_symbol_level_changes: 'the change maps only to whole files, not functions',
};

export function rulePriority(metrics, index) {
  const label = (id) => getNode(index, id)?.label ?? id;
  if (!metrics || metrics.relevance == null) {
    return { priority: 'needs_context', reason: `Not enough evidence: ${NULL_REASON_TEXT[metrics?.nullReason] ?? 'metrics unavailable'}.` };
  }
  const { issueAreaHit: hit, relevance: rel } = metrics;
  const relS = rel.toFixed(2);
  const outside = metrics.unexplained.length;
  if (hit && rel >= REVIEW_FIRST_MIN_RELEVANCE) {
    return { priority: 'review_first', reason: `Changes code the issue is about (${metrics.issueAreaNodes.map(label).join(', ')}); relevance ${relS}.` };
  }
  if (!hit && rel < OFF_TARGET_MAX_RELEVANCE) {
    return { priority: 'likely_off_target', reason: `Touches none of the issue's code; relevance ${relS}, ${outside} changed item(s) outside the issue area.` };
  }
  return { priority: 'needs_context', reason: `Mixed evidence: relevance ${relS}, issue-area hit ${hit ? 'yes' : 'no'}, ${outside} changed item(s) outside the issue area.` };
}

// ---------------- Duplicates / overlaps (HLD §4.5) ----------------
export function findOverlaps({ input, index, diff, linkedIssue }) {
  const mine = new Set(diff.symbolIds);
  const myComms = communitiesOf(index, diff.symbolIds);
  const out = [];
  for (const other of input.openPRs ?? []) {
    if (other.number === input.pr?.number) continue;
    const od = diffToNodes(other.files ?? [], index);
    const theirs = new Set(od.symbolIds);
    const shared = [...mine].filter((id) => theirs.has(id));
    const union = new Set([...mine, ...theirs]).size;
    const jaccard = union ? round2(shared.length / union) : 0;
    const sameIssue = linkedIssue != null && other.linkedIssue === linkedIssue;
    const commShared = [...communitiesOf(index, od.symbolIds)].some((c) => myComms.has(c));
    let kind = null;
    if (sameIssue && jaccard >= DUPLICATE_MIN_JACCARD) kind = 'possible_duplicate';
    else if (shared.length || commShared) kind = 'coordinate';
    if (kind) out.push({ pr: other.number, kind, jaccard, shared, sameIssue, title: other.title ?? '' });
  }
  out.sort((a, b) => (a.kind === b.kind ? b.jaccard - a.jaccard : a.kind === 'possible_duplicate' ? -1 : 1));
  return out;
}

// ---------------- Evidence records (HLD §4.7) ----------------
/**
 * Build E1..En. Priority order: issue quotes, metric, touched nodes, diff hunks,
 * graph paths, blast radius, overlaps, coverage gaps. Capped by count and chars.
 */
export function buildEvidence({ input, index, diff, anchorMatch, area, metrics, blast, gods, overlaps, coverage, testsToRun }) {
  const recs = [];
  const add = (r) => recs.push({ ...r, text: truncate(r.text) });
  const label = (id) => getNode(index, id)?.label ?? id;
  const godSet = new Set(gods);
  const headSha = input.pr?.head?.sha;

  // 1. Issue quotes
  if (input.issue) {
    const iu = issueUrl(input);
    const body = String(input.issue.body ?? '').replace(/\r/g, '');
    add({ kind: 'issue_quote', url: iu, text: `Issue #${input.issue.number}: ${input.issue.title ?? ''}\n${body.slice(0, 400)}` });
    const anchorLines = body.split('\n').filter((l) => /\bat\s+\S+\s+\(|File "|`[^`]+`/.test(l)).map((l) => l.trim());
    if (anchorLines.length && body.length > 400) add({ kind: 'issue_quote', url: iu, text: anchorLines.join('\n') });
    const anchorList = anchorMatch.nodes.map((a) => `${a.label} [${a.tag}]`).concat(anchorMatch.files.map((f) => `${f} [file]`));
    add({ kind: 'issue_quote', url: iu, text: `Issue anchors found in the graph: ${anchorList.length ? anchorList.join(', ') : 'none'}` });
  }

  // 2. Metric summary
  if (metrics) {
    const m = metrics;
    const lines = [
      `issueAreaHit=${m.issueAreaHit}; relevance=${m.relevance}; communityOverlap=${m.communityOverlap}`,
      `changed symbols (non-test): ${diff.symbolIds.map(label).join(', ') || 'none'}`,
      `in issue area: ${m.issueAreaNodes.map(label).join(', ') || 'none'}`,
      `outside issue area: ${m.unexplained.map((u) => u.label).join(', ') || 'none'}`,
    ];
    if (m.nullReason) lines.push(`metrics withheld: ${m.nullReason}`);
    add({ kind: 'metric', url: prFilesUrl(input), text: lines.join('\n') });
  }

  // 3. Touched nodes
  for (const id of diff.touchedIds.slice(0, 8)) {
    const n = getNode(index, id);
    if (!n) continue;
    const bits = [
      `${n.isFile ? 'File-level change' : 'Changed symbol'} ${n.label}`,
      n.file ? `in ${n.file}${n.line ? `:${n.line}` : ''}` : '',
      n.communityName || n.community != null ? `community ${n.communityName ?? n.community}` : '',
      `degree ${index.degree.get(id) ?? 0}${godSet.has(id) ? ' (GOD NODE: among the most connected symbols)' : ''}`,
      area.has(id) ? 'IN the issue area' : 'NOT in the issue area',
    ].filter(Boolean);
    add({ kind: 'touched_node', url: nodeUrl(input, n), node: id, file: n.file ?? undefined, lines: n.line ? `L${n.line}` : undefined, text: bits.join('; ') });
  }

  // 4. Diff hunks (head side)
  for (const h of diff.hunks.slice(0, 8)) {
    add({
      kind: 'diff_hunk', file: h.file, lines: `L${h.newStart}-L${h.newEnd}`, node: h.nodes[0],
      url: blobUrl(input, headSha, h.file, h.newStart, h.newEnd),
      text: `${h.file} (maps to: ${h.nodes.map(label).join(', ') || 'unmapped'})\n${h.text}`,
    });
  }
  if (diff.testsChanged.length) add({ kind: 'diff_hunk', url: prFilesUrl(input), text: `Test files changed: ${diff.testsChanged.join(', ')}` });

  // 5. Graph paths from each changed symbol to the issue anchors
  const anchorIds = new Set(anchorMatch.nodes.map((a) => a.id));
  if (anchorIds.size) {
    for (const id of diff.symbolIds.slice(0, 5)) {
      const path = shortestPath(index, id, anchorIds, 4);
      const n = getNode(index, id);
      const text = path
        ? (path.length === 1 ? `${label(id)} is itself an issue anchor.` : `Call-graph path from ${label(id)} to issue anchor ${label(path.at(-1))}: ${path.map(label).join(' — ')} (${path.length - 1} hop(s)).`)
        : `No call-graph path within 4 hops from ${label(id)} to any issue anchor.`;
      add({ kind: 'graph_path', node: id, url: nodeUrl(input, n), text });
    }
  }

  // 6. Blast radius
  if (blast) {
    const dep = blast.dependents.slice(0, 12).map((d) => `${d.label}${d.file ? ` (${d.file})` : ''} d${d.depth}`).join(', ');
    add({
      kind: 'blast_radius', url: prFilesUrl(input),
      text: `${blast.count} dependent(s) within 2 hops may be affected${blast.truncated ? ' (capped)' : ''}: ${dep || 'none'}.\nTests to run: ${testsToRun.join(', ') || 'none found'}.\nEdge confidence: ${Object.entries(blast.edgeConfidence).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'}.`,
    });
  }

  // 7. Overlaps
  for (const o of overlaps.slice(0, 4)) {
    add({
      kind: 'overlap', url: `${repoBase(input)}/pull/${o.pr}`,
      text: `${o.kind === 'possible_duplicate' ? 'Possible duplicate' : 'Coordinate'}: PR #${o.pr}${o.title ? ` "${o.title}"` : ''}; ${o.sameIssue ? 'same linked issue; ' : ''}shared symbols: ${o.shared.map(label).join(', ') || 'none (same community)'}; Jaccard ${o.jaccard}.`,
    });
  }

  // 8. Coverage gaps
  const gaps = [];
  if (coverage.unmappedAdditions.length) gaps.push(`New symbols not in the base graph: ${coverage.unmappedAdditions.join(', ')}`);
  if (coverage.mappedLines < coverage.changedLines) gaps.push(`${coverage.changedLines - coverage.mappedLines} of ${coverage.changedLines} changed lines are in files the graph does not know`);
  if (coverage.precision === 'file') gaps.push('Some changes map only at file level (no line numbers)');
  if (coverage.graphStale) gaps.push(`Graph built at ${input.manifest?.graphCommit?.slice(0, 7)} but PR base is ${input.pr?.base?.sha?.slice(0, 7)}`);
  if (!anchorMatch.nodes.length) gaps.push('The issue names no symbol found in the graph');
  if (gaps.length) add({ kind: 'coverage_gap', url: prFilesUrl(input), text: gaps.join('.\n') + '.' });

  // Cap: keep order, stop at count/char budget (always keep the first two records).
  const kept = [];
  let chars = 0;
  for (const r of recs) {
    if (kept.length >= EVIDENCE_MAX_RECORDS) break;
    if (kept.length >= 2 && chars + r.text.length > EVIDENCE_MAX_TOTAL_CHARS) continue;
    kept.push(r);
    chars += r.text.length;
  }
  return kept.map((r, i) => {
    const rec = { id: `E${i + 1}`, kind: r.kind, url: r.url, text: r.text };
    if (r.file) rec.file = r.file;
    if (r.lines) rec.lines = r.lines;
    if (r.node) rec.node = r.node;
    return rec;
  });
}
