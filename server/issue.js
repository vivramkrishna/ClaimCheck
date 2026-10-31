// Issue -> anchors (the symbols/files the issue is about) and anchor matching.
import { cleanPath } from './graph.js';

const STOPWORDS = new Set([
  'error', 'expected', 'steps', 'returns', 'return', 'true', 'false', 'null', 'undefined',
  'function', 'const', 'let', 'var', 'async', 'await', 'this', 'that', 'with', 'from',
  'after', 'before', 'about', 'some', 'when', 'then', 'there', 'their', 'node', 'test', 'tests',
]);
const PATH_RE = /(?:^|[\s(`'"])((?:\.{0,2}\/)?(?:[\w@.-]+\/)+[\w.-]+\.[A-Za-z]{1,5})(?::\d+(?::\d+)?)?/g;
const JS_FRAME_RE = /\bat\s+(?:async\s+)?(?:new\s+)?([\w$.<>[\]]+)\s+\(([^()\s]+?):(\d+)(?::\d+)?\)/g;
const JS_FRAME_ANON_RE = /\bat\s+(?:async\s+)?((?:\.{0,2}\/)?[\w@./-]+\.[A-Za-z]{1,5}):(\d+)(?::\d+)?\b/g;
const PY_FRAME_RE = /File "([^"]+)", line (\d+)(?:, in ([A-Za-z_<>][\w<>]*))?/g;
const BACKTICK_RE = /`([^`\n]{1,120})`/g;
const CALL_RE = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(\)/g;
const CAMEL_RE = /\b(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)\b/g;
const SNAKE_RE = /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g;

const lastSeg = (name) => String(name).replace(/\(\)$/, '').split(/[.#:]/).filter(Boolean).pop() ?? '';

/**
 * Extract anchors from issue title + body. Code fences are kept (stack traces live there);
 * only the ``` marker lines are dropped.
 * Returns [{ text, kind: frame|path|code|call|token, strength: exact|fuzzy, file?, line? }]
 */
export function extractAnchors(issue) {
  if (!issue) return [];
  const text = `${issue.title ?? ''}\n${issue.body ?? ''}`
    .split('\n').filter((l) => !/^\s*(```|~~~)/.test(l)).join('\n');
  const out = [];
  const seen = new Set();
  const add = (a) => {
    const key = `${a.kind}:${a.text.toLowerCase()}:${a.file ?? ''}`;
    if (!a.text || seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };

  for (const m of text.matchAll(JS_FRAME_RE)) {
    const file = cleanPath(m[2]);
    add({ text: lastSeg(m[1]), kind: 'frame', strength: 'exact', file, line: +m[3] });
    add({ text: file, kind: 'path', strength: 'exact', file, line: +m[3] });
  }
  for (const m of text.matchAll(JS_FRAME_ANON_RE)) add({ text: cleanPath(m[1]), kind: 'path', strength: 'exact', file: cleanPath(m[1]), line: +m[2] });
  for (const m of text.matchAll(PY_FRAME_RE)) {
    const file = cleanPath(m[1]);
    if (m[3] && !m[3].startsWith('<')) add({ text: m[3], kind: 'frame', strength: 'exact', file, line: +m[2] });
    add({ text: file, kind: 'path', strength: 'exact', file, line: +m[2] });
  }
  for (const m of text.matchAll(PATH_RE)) {
    const p = cleanPath(m[1]);
    if (/^https?:/.test(p) || p.includes('//')) continue;
    add({ text: p, kind: 'path', strength: 'exact', file: p });
  }
  for (const m of text.matchAll(BACKTICK_RE)) {
    const inner = m[1].trim();
    if (/[\\/]/.test(inner) && /\.[A-Za-z]{1,5}(?::\d+)?$/.test(inner)) {
      const p = cleanPath(inner.replace(/:\d+(?::\d+)?$/, ''));
      add({ text: p, kind: 'path', strength: 'exact', file: p });
      continue;
    }
    const ident = inner.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(\(.*\))?$/);
    if (ident) add({ text: lastSeg(ident[1]), kind: 'code', strength: 'exact' });
  }
  for (const m of text.matchAll(CALL_RE)) add({ text: lastSeg(m[1]), kind: 'call', strength: 'exact' });
  for (const re of [CAMEL_RE, SNAKE_RE]) {
    for (const m of text.matchAll(re)) {
      const t = m[0];
      if (t.length < 4 || STOPWORDS.has(t.toLowerCase())) continue;
      add({ text: t, kind: 'token', strength: 'fuzzy' });
    }
  }
  return out;
}

function fileMatches(indexFile, anchorFile) {
  if (!indexFile || !anchorFile) return false;
  const a = cleanPath(anchorFile);
  return indexFile === a || indexFile.endsWith(`/${a}`) || a.endsWith(`/${indexFile}`);
}

/**
 * Match anchors to graph nodes. Anchor files come only from stack frames and
 * explicit paths. File nodes are never anchors.
 * Returns { nodes: [{id, label, file, line, tag, via}], files: [...], anchors: [...with matched ids] }
 */
export function matchAnchors(anchors, index) {
  const nodes = new Map();
  const files = new Set();
  const symbols = index.nodes.filter((n) => !n.isFile);
  const result = [];
  for (const a of anchors) {
    const matched = [];
    if (a.kind === 'path') {
      for (const f of index.files) if (fileMatches(f, a.file)) { files.add(f); matched.push(`file:${f}`); }
    } else {
      const key = a.text.toLowerCase();
      let cands = symbols.filter((n) => n.name === key || n.normLabel === key || n.normLabel === `${key}()`);
      if (a.file) {
        const inFile = cands.filter((n) => fileMatches(n.file, a.file));
        if (inFile.length) cands = inFile;
      }
      for (const n of cands) {
        matched.push(n.id);
        const prev = nodes.get(n.id);
        // exact beats fuzzy if the same node is hit both ways
        if (!prev || (prev.tag === 'fuzzy' && a.strength === 'exact')) {
          nodes.set(n.id, { id: n.id, label: n.label, file: n.file, line: n.line, tag: a.strength, via: a.kind });
        }
      }
    }
    result.push({ ...a, matched });
  }
  return { nodes: [...nodes.values()], files: [...files].sort(), anchors: result };
}
