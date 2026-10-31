// Graph engine: normalize Graphify's graph.json, index it, map a diff onto it,
// compute blast radius and god nodes. Pure functions, no I/O.

// Direction of call-type edges in graph.json. true = edge.source is the caller
// (login --calls--> createSession). Check on the real graph with
// `node scripts/check.js --inspect data/graph.json`. Flip by setting the env var
// EDGE_SOURCE_IS_CALLER=false (no code change) or by editing this default.
export const EDGE_SOURCE_IS_CALLER = process.env.EDGE_SOURCE_IS_CALLER !== 'false';

// Edges that mean "A depends on B's behaviour". imports/contains are structural.
export const CALL_RELS = new Set(['calls', 'uses', 'references', 'inherits']);
export const IMPORT_RELS = new Set(['imports']);
const STRUCTURAL_RELS = new Set(['contains', 'method', 'defines']);

export const BLAST_MAX_DEPTH = 2;
export const BLAST_CAP = 50;

// Test files: a tests/ or spec/ directory, or *.test.* / *.spec.* / test_*.py.
// Tighter than /test|spec/ so "attestation.js" is not a test.
export const TEST_RE = /(^|\/)(tests?|__tests__|specs?)(\/)|\.(test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/i;
export const isTestFile = (f) => TEST_RE.test(f ?? '');

const RELATION_ALIASES = {
  call: 'calls', invokes: 'calls', invoke: 'calls', indirect_call: 'calls', instantiates: 'calls',
  import: 'imports', imports_from: 'imports', import_from: 'imports', re_exports: 'imports',
  use: 'uses', uses_static_prop: 'uses', reference: 'references', refs: 'references',
  references_constant: 'references',
  inherit: 'inherits', extends: 'inherits', implements: 'inherits',
  contain: 'contains', has: 'contains',
};

const CODE_EXT_RE = /\.(m?js|cjs|jsx|tsx?|py|go|rb|java|rs|php|cs|kt|swift|c|cc|cpp|h|hpp)$/i;

export const cleanPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.?\//, '');
const basename = (p) => cleanPath(p).split('/').pop();
const idOf = (end) => (end && typeof end === 'object' ? end.id : end);

// "createSession()" / "SessionStore.get" / "createSession" -> "createsession" / "get"
export function bareName(label) {
  const s = String(label ?? '').trim().replace(/\(.*\)\s*$/, '');
  return s.split(/[.#:]/).filter(Boolean).pop()?.toLowerCase() ?? '';
}

function parseLoc(loc) {
  if (loc == null) return { line: null, endLine: null };
  if (typeof loc === 'number') return { line: loc, endLine: null };
  const m = String(loc).match(/L?(\d+)(?:\s*[-:]\s*L?(\d+))?/);
  if (!m) return { line: null, endLine: null };
  return { line: parseInt(m[1], 10), endLine: m[2] ? parseInt(m[2], 10) : null };
}

function looksLikeFileNode(n, file) {
  const kind = String(n.kind ?? n.node_type ?? n.type ?? '').toLowerCase();
  if (kind === 'file' || kind === 'module') return true;
  const label = String(n.label ?? n.name ?? '');
  if (!file) return CODE_EXT_RE.test(label);
  return label === basename(file) || cleanPath(label) === file || cleanPath(n.id) === file;
}

/** Normalize raw graph.json (networkx node-link) into plain nodes/edges. */
export function normalizeGraph(raw) {
  const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const rawEdges = raw?.links ?? raw?.edges ?? [];
  const nodes = rawNodes.map((n) => {
    const file = cleanPath(n.source_file ?? n.path ?? n.file ?? '');
    const { line, endLine } = parseLoc(n.source_location ?? n.line ?? n.lineno);
    const label = String(n.label ?? n.name ?? n.id);
    return {
      id: String(n.id),
      label,
      name: bareName(label),
      normLabel: String(n.norm_label ?? label).toLowerCase(),
      file: file || null,
      line,
      endLine,
      community: n.community ?? null,
      communityName: n.community_name ?? null,
      type: n.file_type ?? null,
      isFile: looksLikeFileNode(n, file),
    };
  });
  const edges = rawEdges
    .map((e) => {
      const rel = String(e.relation ?? e.type ?? e.label ?? 'unknown').toLowerCase();
      return {
        source: String(idOf(e.source)),
        target: String(idOf(e.target)),
        relation: RELATION_ALIASES[rel] ?? rel,
        confidence: String(e.confidence ?? 'UNKNOWN').toUpperCase(),
      };
    })
    .filter((e) => e.source !== 'undefined' && e.target !== 'undefined');
  return { nodes, edges, edgesKey: raw?.links ? 'links' : raw?.edges ? 'edges' : null, __normalized: true };
}

/** Build lookup indexes. `sourceIsCaller` lets tests flip edge direction. */
export function buildIndex(raw, { sourceIsCaller = EDGE_SOURCE_IS_CALLER } = {}) {
  const g = raw?.__normalized ? raw : normalizeGraph(raw);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const byFile = new Map(); // file -> symbols sorted by line (no file nodes)
  const fileNodes = new Map(); // file -> file node
  for (const n of g.nodes) {
    if (!n.file) continue;
    if (n.isFile) { if (!fileNodes.has(n.file)) fileNodes.set(n.file, n); continue; }
    if (!byFile.has(n.file)) byFile.set(n.file, []);
    byFile.get(n.file).push(n);
  }
  for (const list of byFile.values()) list.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));

  const out = new Map();
  const inn = new Map();
  const degree = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const e of g.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    push(out, e.source, e);
    push(inn, e.target, e);
    if (!STRUCTURAL_RELS.has(e.relation)) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
  }
  const files = new Set([...byFile.keys(), ...fileNodes.keys()]);
  return { nodes: g.nodes, edges: g.edges, edgesKey: g.edgesKey, byId, byFile, fileNodes, files, out, in: inn, degree, sourceIsCaller };
}

/** File node for a path; synthesizes a virtual one if the graph has none. */
export function fileNode(index, file) {
  const f = cleanPath(file);
  if (index.fileNodes.has(f)) return index.fileNodes.get(f);
  return { id: `file:${f}`, label: basename(f), name: basename(f).toLowerCase(), normLabel: f.toLowerCase(), file: f, line: null, endLine: null, community: null, communityName: null, type: null, isFile: true, virtual: true };
}

export const getNode = (index, id) => index.byId.get(id) ?? (id.startsWith('file:') ? fileNode(index, id.slice(5)) : null);

// ---- The one place edge direction is interpreted ----
/** Nodes that depend on `id` (its callers / importers) over the given relations. */
export function dependentsOf(index, id, rels) {
  const edges = (index.sourceIsCaller ? index.in : index.out).get(id) ?? [];
  return edges.filter((e) => rels.has(e.relation))
    .map((e) => ({ id: index.sourceIsCaller ? e.source : e.target, relation: e.relation, confidence: e.confidence }));
}
/** Nodes that `id` depends on (its callees / imports). */
export function dependenciesOf(index, id, rels) {
  const edges = (index.sourceIsCaller ? index.out : index.in).get(id) ?? [];
  return edges.filter((e) => rels.has(e.relation))
    .map((e) => ({ id: index.sourceIsCaller ? e.target : e.source, relation: e.relation, confidence: e.confidence }));
}
/** Undirected neighbours over the given relations. */
export function neighboursOf(index, id, rels) {
  return [...dependentsOf(index, id, rels), ...dependenciesOf(index, id, rels)];
}

// ---------------- Diff -> touched nodes ----------------

// Top-level definitions only (column 0), so locals inside a function body are
// not mistaken for new symbols. Python defs may be indented (methods).
const DEF_RES = [
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*class\s+([A-Za-z_]\w*)\s*[(:]/,
];
export function definedName(text) {
  for (const re of DEF_RES) { const m = text.match(re); if (m) return m[1]; }
  return null;
}
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/**
 * Walk a unified-diff patch. Returns hunks with old-side line records:
 * '-' records the old line; '+' records the insertion point max(old-1, 1).
 */
export function walkPatch(patch) {
  const hunks = [];
  let h = null;
  let oldLn = 0;
  let newLn = 0;
  for (const raw of String(patch ?? '').split('\n')) {
    const m = raw.match(HUNK_RE);
    if (m) {
      oldLn = parseInt(m[1], 10);
      newLn = parseInt(m[3], 10);
      h = { oldStart: oldLn, newStart: newLn, newEnd: newLn, header: m[5] ?? '', lines: [], raw: [raw] };
      hunks.push(h);
      continue;
    }
    if (!h) continue;
    h.raw.push(raw);
    const tag = raw[0];
    const text = raw.slice(1);
    if (tag === ' ' || raw === '') { oldLn++; newLn++; }
    else if (tag === '-') { h.lines.push({ type: '-', old: oldLn, new: null, text }); oldLn++; }
    else if (tag === '+') { h.lines.push({ type: '+', old: Math.max(oldLn - 1, 1), new: newLn, text }); h.newEnd = newLn; newLn++; }
    // '\ No newline at end of file' and anything else: ignore
  }
  for (const hk of hunks) if (hk.newEnd < hk.newStart) hk.newEnd = hk.newStart;
  return hunks;
}

function nearestSymbol(symbols, line) {
  let best = null;
  for (const s of symbols) {
    if (s.line == null) continue;
    if (s.line <= line) best = s; else break;
  }
  if (best && best.endLine != null && line > best.endLine) return null;
  return best;
}

/**
 * Map PR files onto base-graph nodes.
 * Returns touched symbol/file ids, per-hunk info, coverage numbers and test files.
 */
export function diffToNodes(files, index) {
  const touched = new Map(); // id -> { id, lines:Set, files:Set }
  const hunksOut = [];
  const unmappedAdditions = new Set();
  const testsChanged = new Set();
  let changedLines = 0;
  let mappedLines = 0;
  let fileLevel = false;
  const touch = (node, line) => {
    if (!touched.has(node.id)) touched.set(node.id, { id: node.id, lines: new Set() });
    if (line != null) touched.get(node.id).lines.add(line);
  };

  for (const f of files ?? []) {
    const newPath = cleanPath(f.filename);
    const oldPath = cleanPath(f.status === 'renamed' && f.previous_filename ? f.previous_filename : f.filename);
    if (isTestFile(newPath) || isTestFile(oldPath)) { testsChanged.add(newPath); continue; }

    const symbols = index.byFile.get(oldPath) ?? [];
    const inGraph = index.files.has(oldPath) && f.status !== 'added';
    const hasLines = symbols.some((s) => s.line != null);
    const fnode = fileNode(index, oldPath);

    if (!f.patch) {
      // Binary, too large, or removed without patch: file-level only.
      const n = (f.changes ?? ((f.additions ?? 0) + (f.deletions ?? 0))) || 1;
      changedLines += n;
      if (inGraph) {
        mappedLines += n; fileLevel = true; touch(fnode, null);
        if (f.status === 'removed') for (const s of symbols) touch(s, null);
      }
      continue;
    }

    for (const hk of walkPatch(f.patch)) {
      const hunkNodes = new Set();
      let inNewDef = false;
      // Function context git puts after @@ (used when the file has no line numbers).
      const ctxName = definedName(hk.header.trim()) ?? hk.header.match(/([A-Za-z_$][\w$]*)\s*\(/)?.[1] ?? null;
      for (const ln of hk.lines) {
        if (!ln.text.trim()) continue; // blank lines carry no meaning
        changedLines++;
        const def = definedName(ln.text);
        if (ln.type === '+') {
          if (def) inNewDef = false;
        } else inNewDef = false;
        if (!inGraph) {
          if (ln.type === '+' && def) unmappedAdditions.add(def);
          continue;
        }
        mappedLines++;
        let node = null;
        if (def) {
          node = symbols.find((s) => s.name === def.toLowerCase()) ?? null;
          if (!node) {
            node = fnode;
            if (ln.type === '+') { unmappedAdditions.add(def); inNewDef = true; }
          }
        } else if (ln.type === '+' && inNewDef) {
          node = fnode;
        } else if (hasLines) {
          node = nearestSymbol(symbols, ln.old) ?? fnode;
        } else {
          fileLevel = true;
          node = (ctxName && symbols.find((s) => s.name === ctxName.toLowerCase())) || fnode;
        }
        touch(node, ln.old);
        hunkNodes.add(node.id);
      }
      hunksOut.push({
        file: newPath, oldFile: oldPath, oldStart: hk.oldStart, newStart: hk.newStart, newEnd: hk.newEnd,
        header: hk.header, text: hk.raw.join('\n'), nodes: [...hunkNodes],
      });
    }
    if (inGraph && !hasLines && symbols.length) fileLevel = true;
  }

  const touchedList = [...touched.values()].map((t) => ({ id: t.id, lines: [...t.lines].sort((a, b) => a - b) }));
  return {
    touched: touchedList,
    touchedIds: touchedList.map((t) => t.id),
    symbolIds: touchedList.map((t) => t.id).filter((id) => { const n = getNode(index, id); return n && !n.isFile; }),
    fileIds: touchedList.map((t) => t.id).filter((id) => { const n = getNode(index, id); return !n || n.isFile; }),
    hunks: hunksOut,
    unmappedAdditions: [...unmappedAdditions],
    testsChanged: [...testsChanged].sort(),
    changedLines,
    mappedLines,
    precision: fileLevel ? 'file' : 'symbol',
  };
}

// ---------------- Blast radius ----------------

/** Reverse BFS from touched ids over call-type edges + importers of touched files. */
export function blastRadius(touchedIds, index, { maxDepth = BLAST_MAX_DEPTH, cap = BLAST_CAP } = {}) {
  const start = new Set(touchedIds);
  const seen = new Map(); // id -> { depth, via, relation, confidence }
  const edgeConfidence = {};
  let frontier = [...start];
  let truncated = false;
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = [];
    for (const id of frontier) {
      const node = getNode(index, id);
      const cands = dependentsOf(index, id, CALL_RELS);
      // Importers of this node's file (edges may target the file node or a symbol in it).
      if (node?.file) {
        const targets = [fileNode(index, node.file).id, ...(index.byFile.get(node.file) ?? []).map((s) => s.id)];
        for (const t of new Set(targets)) {
          for (const d of dependentsOf(index, t, IMPORT_RELS)) {
            const imp = getNode(index, d.id);
            cands.push({ ...d, id: imp?.file ? fileNode(index, imp.file).id : d.id });
          }
        }
      }
      for (const c of cands) {
        if (start.has(c.id) || seen.has(c.id)) continue;
        if (seen.size >= cap) { truncated = true; break; }
        seen.set(c.id, { depth, via: id, relation: c.relation, confidence: c.confidence });
        edgeConfidence[c.confidence] = (edgeConfidence[c.confidence] ?? 0) + 1;
        next.push(c.id);
      }
    }
    frontier = next;
  }
  const dependents = [...seen.entries()].map(([id, v]) => {
    const n = getNode(index, id);
    return { id, label: n?.label ?? id, file: n?.file ?? null, line: n?.line ?? null, ...v };
  });
  const testsToRun = [...new Set(dependents.map((d) => d.file).filter((f) => f && isTestFile(f)))].sort();
  return { dependents, count: dependents.length, testsToRun, edgeConfidence, truncated };
}

/** Highest-degree symbols: top 3 when the graph is small, else top 5%. */
export function godNodes(index) {
  const syms = index.nodes.filter((n) => !n.isFile && (index.degree.get(n.id) ?? 0) > 0);
  syms.sort((a, b) => (index.degree.get(b.id) ?? 0) - (index.degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const k = index.nodes.length < 100 ? 3 : Math.max(1, Math.ceil(syms.length * 0.05));
  return syms.slice(0, k).map((n) => n.id);
}

/** Shortest undirected path over call-type edges from `from` to any id in `targets`. */
export function shortestPath(index, from, targets, maxDepth = 4) {
  if (targets.has(from)) return [from];
  const prev = new Map([[from, null]]);
  let frontier = [from];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const id of frontier) {
      for (const nb of neighboursOf(index, id, CALL_RELS)) {
        if (prev.has(nb.id)) continue;
        prev.set(nb.id, id);
        if (targets.has(nb.id)) {
          const path = [nb.id];
          for (let p = id; p != null; p = prev.get(p)) path.unshift(p);
          return path;
        }
        next.push(nb.id);
      }
    }
    frontier = next;
  }
  return null;
}
