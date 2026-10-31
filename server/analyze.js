// Orchestrator: AnalyzeInput -> Card. Never throws.
import { buildIndex, diffToNodes, blastRadius, godNodes, getNode, isTestFile } from './graph.js';
import { extractAnchors, matchAnchors } from './issue.js';
import {
  issueArea, computeMetrics, rulePriority, findOverlaps, buildEvidence, buildCoverage,
} from './evidence.js';
import {
  createGemmaClient, runAssessment, filterCitations, fallbackAssessment, confidenceCap,
  minConfidence, graphContents, diffOnlyContents, modelName,
} from './gemma.js';
import { CardSchema } from './schema.js';

// Bump whenever prompts/review.txt, SCHEMA_HINT or the card shape changes (part of the cache key).
export const PROMPT_VERSION = 'core-v1';

// ---- Graph index memo (keyed by graph commit) ----
const indexCache = new Map();
export function getIndex(input) {
  const key = input.manifest?.graphCommit ?? null;
  if (key && indexCache.has(key) && indexCache.get(key).raw === input.graph) return indexCache.get(key).index;
  const index = buildIndex(input.graph ?? { nodes: [], links: [] });
  if (key) {
    if (indexCache.size >= 2) indexCache.delete(indexCache.keys().next().value);
    indexCache.set(key, { raw: input.graph, index });
  }
  return index;
}

/** Everything the server decides, before any model call. Exported for scripts/check.js. */
export function computeDeterministic(input) {
  const index = getIndex(input);
  const diff = diffToNodes(input.files ?? [], index);
  const anchors = extractAnchors(input.issue);
  const anchorMatch = matchAnchors(anchors, index);
  const area = issueArea(anchorMatch, index);
  const gods = godNodes(index);
  const blast = blastRadius(diff.touchedIds, index);
  const coverage = buildCoverage(diff, input);
  const testsToRun = [...new Set([...blast.testsToRun, ...diff.testsChanged])].filter(isTestFile).sort();
  const metrics = computeMetrics({ input, index, diff, anchorMatch, area, blast, gods });
  const linkedIssue = input.issue?.number ?? null;
  const overlaps = findOverlaps({ input, index, diff, linkedIssue });
  const rule = rulePriority(metrics, index);
  const evidence = buildEvidence({ input, index, diff, anchorMatch, area, metrics, blast, gods, overlaps, coverage, testsToRun });
  return { index, diff, anchors, anchorMatch, area, gods, blast, coverage, testsToRun, metrics, overlaps, rule, evidence };
}

function prInfo(input) {
  const pr = input.pr ?? {};
  return {
    number: Number(pr.number) || 0,
    title: String(pr.title ?? ''),
    author: String(pr.user?.login ?? pr.author ?? 'unknown'),
    headSha: String(pr.head?.sha ?? ''),
    linkedIssue: input.issue?.number ?? null,
  };
}

function provenance(input, assessmentSource) {
  return {
    mode: 'live',
    model: modelName(),
    assessmentSource,
    graphCommit: input.manifest?.graphCommit ?? null,
    graphifyVersion: input.manifest?.graphifyVersion ?? null,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

const publicOverlaps = (overlaps) => overlaps.map(({ pr, kind, jaccard, shared, sameIssue }) => ({ pr, kind, jaccard, shared, sameIssue }));

async function getClient(opts) {
  if (opts.client) return { client: opts.client };
  if (opts.noLlm) return { error: 'LLM disabled (--no-llm)' };
  if (!process.env.GEMINI_API_KEY) return { error: 'GEMINI_API_KEY not set' };
  try { return { client: await createGemmaClient() }; } catch (e) { return { error: `could not create Gemma client: ${e.message}` }; }
}

// ---------------- Graph mode ----------------
async function analyzeGraph(input, opts) {
  const d = computeDeterministic(input);
  const labelOf = (id) => getNode(d.index, id)?.label ?? id;
  const cap = confidenceCap(d);
  const serverLimitations = [];
  if (d.coverage.graphStale) serverLimitations.push('The code graph was built from a different commit than this PR\'s base; mappings may be off.');
  if (d.coverage.precision === 'file') serverLimitations.push('Some changes could only be mapped to whole files, not functions.');
  if (d.metrics.nullReason) serverLimitations.push(`Relevance not computed: ${d.metrics.nullReason}.`);
  serverLimitations.push('Relevance is not correctness: this card does not say whether the change works.');

  const { client, error: clientErr } = await getClient(opts);
  let assessment = null;
  let source = 'fallback';
  let failReason = clientErr ?? null;
  let dropped = 0;
  if (client) {
    const res = await runAssessment({ client, contents: graphContents({ input, ...d }), sleep: opts.sleep });
    if (res.assessment) {
      const knownTests = [...d.testsToRun, ...d.coverage.testsChanged];
      const filtered = filterCitations(res.assessment, d.evidence.map((e) => e.id), knownTests);
      dropped = filtered.dropped;
      if (filtered.assessment) { assessment = filtered.assessment; source = 'model'; }
      else failReason = 'no model finding cited valid evidence';
    } else failReason = res.error;
  }
  if (!assessment) {
    assessment = fallbackAssessment({ input, mode: 'graph', ...d, labelOf, reason: failReason });
    assessment.confidence = cap;
  } else {
    assessment.confidence = minConfidence(assessment.confidence, cap);
    if (dropped) assessment.limitations = [...assessment.limitations, `${dropped} model statement(s) were dropped because they did not cite valid evidence.`];
  }
  assessment.limitations = [...new Set([...assessment.limitations, ...serverLimitations])];

  // Priority: the rule decides; the model can only pull it down to needs_context by disagreeing.
  let finalPriority = d.rule.priority;
  let priorityReason = d.rule.reason;
  if (source === 'model' && assessment.suggested_priority !== d.rule.priority) {
    finalPriority = 'needs_context';
    priorityReason = `Rule says ${d.rule.priority}: ${d.rule.reason} The model suggested ${assessment.suggested_priority}: ${assessment.reality_summary} They disagree, so a maintainer should look.`;
  }

  return {
    mode: 'graph',
    pr: prInfo(input),
    provenance: provenance(input, source),
    coverage: d.coverage,
    metrics: d.metrics,
    testsToRun: d.testsToRun,
    overlaps: publicOverlaps(d.overlaps),
    evidence: d.evidence,
    rulePriority: d.rule.priority,
    assessment,
    finalPriority,
    priorityReason,
  };
}

// ---------------- Diff-only mode ----------------
async function analyzeDiffOnly(input, opts) {
  const { client, error: clientErr } = await getClient(opts);
  let assessment = null;
  let source = 'fallback';
  let failReason = clientErr ?? null;
  if (client) {
    const res = await runAssessment({ client, contents: diffOnlyContents(input), sleep: opts.sleep });
    if (res.assessment) { assessment = res.assessment; source = 'model'; } else failReason = res.error;
  }
  if (!assessment) assessment = fallbackAssessment({ input, mode: 'diffonly', reason: failReason });
  return {
    mode: 'diffonly',
    pr: prInfo(input),
    provenance: provenance(input, source),
    coverage: null,
    metrics: null,
    testsToRun: [],
    overlaps: [],
    evidence: [],
    rulePriority: null,
    assessment,
    finalPriority: assessment.suggested_priority,
    priorityReason: 'Diff-only: model suggestion, no graph check',
  };
}

/** Minimal valid card when something unexpected went wrong. */
export function errorCard(input, mode, err) {
  return {
    mode: mode === 'diffonly' ? 'diffonly' : 'graph',
    pr: prInfo(input ?? {}),
    provenance: provenance(input ?? {}, 'fallback'),
    coverage: null,
    metrics: null,
    testsToRun: [],
    overlaps: [],
    evidence: [],
    rulePriority: mode === 'diffonly' ? null : 'needs_context',
    assessment: {
      claim_summary: `PR title: "${input?.pr?.title ?? ''}"`,
      reality_summary: 'Analysis could not be completed.',
      findings: [], tests: [], questions_for_contributor: [],
      suggested_priority: 'needs_context', confidence: 'low',
      limitations: [`Analysis error: ${String(err?.message ?? err).slice(0, 200)}`],
    },
    finalPriority: 'needs_context',
    priorityReason: 'Analysis error; no verdict.',
  };
}

/**
 * @param input AnalyzeInput (shared contract §3)
 * @param opts  { client?, noLlm?, sleep? } — test/CLI hooks; the app calls analyze(input).
 */
export async function analyze(input, opts = {}) {
  const mode = input?.mode === 'diffonly' ? 'diffonly' : 'graph';
  try {
    const card = mode === 'diffonly' ? await analyzeDiffOnly(input, opts) : await analyzeGraph(input, opts);
    const parsed = CardSchema.safeParse(card);
    if (parsed.success) return parsed.data;
    console.error('[analyze] card failed schema:', parsed.error.issues.slice(0, 5));
    return errorCard(input, mode, new Error('card failed schema validation'));
  } catch (e) {
    console.error('[analyze] error:', e);
    return errorCard(input, mode, e);
  }
}
