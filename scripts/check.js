#!/usr/bin/env node
// Debug CLI for the core engine.
//   node scripts/check.js <prNumber> [--mode graph|diffonly] [--no-llm] [--json]
//   node scripts/check.js --input test/core/fixtures/input.B.json [--no-llm]
//   node scripts/check.js --inspect data/graph.json      (11:25 graph.json checklist)
import fs from 'node:fs';
import path from 'node:path';

try { await import('dotenv/config'); } catch { /* dotenv optional here */ }

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--mode', '--input', '--inspect'].includes(args[i - 1]));

const { buildIndex, normalizeGraph, getNode, godNodes } = await import('../server/graph.js');

function inspectGraph(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const g = normalizeGraph(raw);
  const idx = buildIndex(raw);
  const syms = g.nodes.filter((n) => !n.isFile);
  const withLine = syms.filter((n) => n.line != null);
  const rels = {};
  for (const e of g.edges) rels[e.relation] = (rels[e.relation] ?? 0) + 1;
  const conf = {};
  for (const e of g.edges) conf[e.confidence] = (conf[e.confidence] ?? 0) + 1;
  const files = [...new Set(g.nodes.map((n) => n.file).filter(Boolean))];
  const filesWithNode = files.filter((f) => idx.fileNodes.has(f));
  const absPaths = files.filter((f) => f.startsWith('/') || /^[A-Za-z]:/.test(f));
  console.log(`Edges key: ${g.edgesKey ?? 'MISSING (neither "links" nor "edges")'}`);
  console.log(`Nodes: ${g.nodes.length} (${syms.length} symbols, ${g.nodes.length - syms.length} file nodes)`);
  console.log(`Edges: ${g.edges.length}; relations: ${JSON.stringify(rels)}; confidence: ${JSON.stringify(conf)}`);
  console.log(`\n[1] Line numbers: ${withLine.length}/${syms.length} symbols have source_location ${withLine.length ? 'OK' : '-> NONE: precision will be "file"'}`);
  console.log(`    sample: ${syms.slice(0, 4).map((n) => `${n.label} @ ${n.file}:${n.line}`).join(' | ')}`);
  // Direction: look for login -> createSession (demo repo), else show a few call edges.
  const login = syms.find((n) => n.name === 'login');
  const cs = syms.find((n) => n.name === 'createsession');
  const callEdges = g.edges.filter((e) => e.relation === 'calls');
  console.log('\n[2] Edge direction (call edges):');
  if (login && cs) {
    const fwd = g.edges.find((e) => e.source === login.id && e.target === cs.id);
    const back = g.edges.find((e) => e.source === cs.id && e.target === login.id);
    if (fwd) console.log(`    found ${login.id} -> ${cs.id} (${fwd.relation}): source = CALLER. Keep EDGE_SOURCE_IS_CALLER=true.`);
    else if (back) console.log(`    found ${cs.id} -> ${login.id} (${back.relation}): source = CALLEE. Set EDGE_SOURCE_IS_CALLER=false in .env / Cloudways env.`);
    else console.log('    no edge between login and createSession found — inspect the samples below by hand.');
  }
  for (const e of callEdges.slice(0, 5)) console.log(`    ${getNode(idx, e.source)?.label ?? e.source} -> ${getNode(idx, e.target)?.label ?? e.target}`);
  console.log(`\n[3] Paths: ${absPaths.length ? `ABSOLUTE paths found (${absPaths[0]}) -> they will not match PR filenames; re-run graphify from the repo root` : 'relative OK'}; sample: ${files.slice(0, 4).join(', ')}`);
  console.log(`\n[4] File nodes: ${filesWithNode.length}/${files.length} files have a file-level node ${filesWithNode.length ? 'OK' : '(none: virtual file nodes will be used; import edges may target symbols)'}`);
  const imports = g.edges.filter((e) => e.relation === 'imports').slice(0, 3);
  for (const e of imports) console.log(`    import: ${getNode(idx, e.source)?.file ?? e.source} -> ${getNode(idx, e.target)?.label ?? e.target}`);
  console.log(`\nGod nodes: ${godNodes(idx).map((id) => getNode(idx, id)?.label ?? id).join(', ')}`);
  const unknown = Object.keys(rels).filter((r) => !['calls', 'uses', 'references', 'inherits', 'imports', 'contains', 'method', 'defines'].includes(r));
  if (unknown.length) console.log(`\nUnknown relations (not used for call/impact traversal): ${unknown.join(', ')} -> add aliases in RELATION_ALIASES (server/graph.js) if they mean calls/imports.`);
}

async function loadInput() {
  if (opt('--input')) {
    const p = path.resolve(opt('--input'));
    const input = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (opt('--mode')) input.mode = opt('--mode');
    return input;
  }
  const n = Number(positional[0]);
  if (!Number.isInteger(n) || n <= 0) {
    console.error('Usage: node scripts/check.js <prNumber> [--mode graph|diffonly] [--no-llm] [--json]\n       node scripts/check.js --input <AnalyzeInput.json> [--no-llm]\n       node scripts/check.js --inspect <graph.json>');
    process.exit(2);
  }
  let buildInput;
  try { ({ buildInput } = await import('../server/input.js')); } catch (e) {
    console.error(`Cannot load server/input.js (Codex's module): ${e.message}\nUse --input <file.json> until it is merged.`);
    process.exit(2);
  }
  return buildInput(n, opt('--mode') ?? 'graph');
}

function printDeterministic(d) {
  const label = (id) => getNode(d.index, id)?.label ?? id;
  const line = (k, v) => console.log(`${k.padEnd(18)} ${v}`);
  line('Touched nodes', d.diff.touched.map((t) => `${label(t.id)} [old L${t.lines.join(',') || '-'}]`).join(', ') || 'none');
  line('Unmapped adds', d.diff.unmappedAdditions.join(', ') || 'none');
  line('Coverage', `${d.coverage.mappedLines}/${d.coverage.changedLines} lines, precision=${d.coverage.precision}, graphStale=${d.coverage.graphStale}`);
  line('Tests changed', d.coverage.testsChanged.join(', ') || 'none');
  line('Blast radius', `${d.blast.count}: ${d.blast.dependents.map((x) => `${x.label}(d${x.depth},${x.confidence})`).join(', ') || 'none'}`);
  line('Tests to run', d.testsToRun.join(', ') || 'none');
  line('Anchors', d.anchorMatch.anchors.map((a) => `${a.text}<${a.kind}/${a.strength}>${a.matched.length ? '✓' : '✗'}`).join(', ') || 'none');
  line('Anchor nodes', d.anchorMatch.nodes.map((n) => `${n.label}[${n.tag}]`).join(', ') || 'none');
  line('Anchor files', d.anchorMatch.files.join(', ') || 'none');
  line('Issue area N1', [...d.area].map(label).join(', ') || 'empty');
  const m = d.metrics;
  line('Metrics', `issueAreaHit=${m.issueAreaHit} relevance=${m.relevance} communityOverlap=${m.communityOverlap} blastRadius=${m.blastRadius} nullReason=${m.nullReason}`);
  line('God nodes touched', m.godNodesTouched.map(label).join(', ') || 'none');
  line('Unexplained', m.unexplained.map((u) => `${u.label}${u.file ? ` (${u.file}:${u.line ?? '-'})` : ''}`).join(', ') || 'none');
  line('Edge confidence', JSON.stringify(m.edgeConfidence));
  line('Overlaps', d.overlaps.map((o) => `#${o.pr} ${o.kind} J=${o.jaccard}`).join(', ') || 'none');
  line('RULE PRIORITY', `${d.rule.priority} — ${d.rule.reason}`);
  console.log('\nEvidence:');
  for (const e of d.evidence) console.log(`  ${e.id} [${e.kind}] ${e.url}\n     ${e.text.split('\n').slice(0, 4).join('\n     ')}`);
}

if (opt('--inspect')) { inspectGraph(opt('--inspect')); process.exit(0); }

const input = await loadInput();
const { analyze, computeDeterministic } = await import('../server/analyze.js');
if ((input.mode ?? 'graph') === 'graph') {
  console.log(`PR #${input.pr?.number}: ${input.pr?.title}  (mode=graph, linked issue ${input.issue?.number ?? 'none'})\n`);
  printDeterministic(computeDeterministic(input));
}
if (!flag('--no-llm') || flag('--json')) {
  const card = await analyze(input, { noLlm: flag('--no-llm') });
  console.log(`\n--- Card (assessment: ${card.provenance.assessmentSource}) ---`);
  console.log(JSON.stringify(card, null, 2));
}
