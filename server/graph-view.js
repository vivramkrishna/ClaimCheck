// Graph view for the UI: a compact node/edge list with each node tagged by its
// role for one pull request. Pure function, no I/O.
import { normalizeGraph } from './graph.js';

const MAX_NODES = 180;

/**
 * @param raw   Graphify graph.json
 * @param focus { changed: id[], issueArea: id[], impacted: id[] } or null
 */
export function graphView(raw, focus = null) {
  const g = normalizeGraph(raw ?? { nodes: [], links: [] });
  const changed = new Set(focus?.changed ?? []);
  const area = new Set(focus?.issueArea ?? []);
  const impacted = new Set(focus?.impacted ?? []);

  // Changed file-level hits also light up that file's node.
  const fileIdByPath = new Map(g.nodes.filter((n) => n.isFile && n.file).map((n) => [n.file, n.id]));
  for (const id of [...changed]) {
    if (id.startsWith('file:')) { const real = fileIdByPath.get(id.slice(5)); if (real) changed.add(real); }
  }

  const role = (id) => {
    if (changed.has(id)) return area.size ? (area.has(id) ? 'changed_in_issue' : 'changed_outside') : 'changed';
    if (area.has(id)) return 'issue';
    if (impacted.has(id)) return 'impacted';
    return 'other';
  };

  let nodes = g.nodes;
  const total = nodes.length;
  if (nodes.length > MAX_NODES) {
    const keep = new Set([...changed, ...area, ...impacted]);
    for (const e of g.edges) {
      if (keep.has(e.source)) keep.add(e.target);
      if (keep.has(e.target)) keep.add(e.source);
    }
    const degree = new Map();
    for (const e of g.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const ranked = [...nodes].sort((a, b) => (keep.has(b.id) - keep.has(a.id)) || ((degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)));
    nodes = ranked.slice(0, MAX_NODES);
  }
  const ids = new Set(nodes.map((n) => n.id));
  return {
    total,
    nodes: nodes.map((n) => ({
      id: n.id, label: n.label, file: n.file, line: n.line, isFile: n.isFile,
      group: n.communityName ?? (n.community != null ? `Group ${n.community}` : null),
      role: role(n.id),
    })),
    edges: g.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e) => ({ source: e.source, target: e.target, relation: e.relation })),
  };
}
