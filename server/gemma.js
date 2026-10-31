// Gemma 4 call, JSON extraction, validation, repair, citation filter and the
// deterministic fallback. The model owns wording only.
import fs from 'node:fs';
import { AssessmentSchema, SCHEMA_HINT, CONFIDENCES } from './schema.js';

export const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
export const TEMPERATURE = 0.2;
// Set GEMMA_THINKING_LEVEL=minimal if live calls take > ~15 s.
export const THINKING_LEVEL = process.env.GEMMA_THINKING_LEVEL || null;
export const CALL_TIMEOUT_MS = Number(process.env.GEMMA_TIMEOUT_MS) || 45000;
export const RETRY_BACKOFF_MS = 2000;

export const SYSTEM_PROMPT = fs.readFileSync(new URL('../prompts/review.txt', import.meta.url), 'utf8').trim();

export const modelName = () => process.env.GEMMA_MODEL || DEFAULT_MODEL;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Client ----------------
/**
 * Real client over @google/genai. Tests inject a fake with the same shape:
 * { model, generate({ system, contents }) -> Promise<string> }
 */
export async function createGemmaClient({ apiKey = process.env.GEMINI_API_KEY, model = modelName() } = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: CALL_TIMEOUT_MS } });
  return {
    model,
    async generate({ system, contents }) {
      const config = { temperature: TEMPERATURE };
      if (system) config.systemInstruction = system;
      if (THINKING_LEVEL) config.thinkingConfig = { thinkingLevel: THINKING_LEVEL };
      // TODO(stretch): read-only tools find_symbol / get_neighbors / get_snippet (HLD §4.8).
      const res = await ai.models.generateContent({ model, contents, config });
      return typeof res.text === 'function' ? res.text() : (res.text ?? '');
    },
  };
}

function errStatus(e) {
  const s = e?.status ?? e?.code ?? e?.error?.code ?? e?.response?.status;
  if (typeof s === 'number') return s;
  const m = String(e?.message ?? '').match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : null;
}
const isRetryable = (e) => {
  const s = errStatus(e);
  return s === 429 || (s != null && s >= 500) || /RESOURCE_EXHAUSTED|UNAVAILABLE|ETIMEDOUT|ECONNRESET|timed? ?out/i.test(String(e?.message));
};
const isSystemInstructionError = (e) => errStatus(e) === 400 && /system|instruction|developer/i.test(String(e?.message));

const state = { noSystemInstruction: false };
export const _resetGemmaState = () => { state.noSystemInstruction = false; };

async function callOnce(client, args, sleep) {
  try {
    return await client.generate(args);
  } catch (e) {
    if (!isRetryable(e)) throw e;
    await sleep(errStatus(e) === 429 ? RETRY_BACKOFF_MS * 2 : RETRY_BACKOFF_MS);
    return client.generate(args);
  }
}

/** One logical model call: systemInstruction first, prepended prompt if the API rejects it. */
export async function callModel(client, contents, { sleep = defaultSleep } = {}) {
  if (!state.noSystemInstruction) {
    try {
      return await callOnce(client, { system: SYSTEM_PROMPT, contents }, sleep);
    } catch (e) {
      if (!isSystemInstructionError(e)) throw e;
      state.noSystemInstruction = true;
    }
  }
  return callOnce(client, { system: null, contents: `${SYSTEM_PROMPT}\n\n---\n\n${contents}` }, sleep);
}

// ---------------- Parsing / validation ----------------
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/```(?:json|JSON)?/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const slice = s.slice(a, b + 1);
  for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, '$1')]) {
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  return null;
}

const lc = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_') : v);
const toIds = (v) => {
  if (Array.isArray(v)) return v.flatMap(toIds);
  if (typeof v === 'string') return v.match(/E\d+/gi)?.map((x) => x.toUpperCase()) ?? [];
  return [];
};
/** Light coercion of near-miss model output before strict validation. */
export function normalizeAssessmentShape(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const o = { ...obj };
  o.suggested_priority = lc(o.suggested_priority ?? o.priority);
  o.confidence = lc(o.confidence);
  if (Array.isArray(o.findings)) {
    o.findings = o.findings.map((f) => (typeof f === 'string' ? { text: f, severity: 'info', evidence: toIds(f) } : { ...f, severity: lc(f?.severity) ?? 'info', evidence: toIds(f?.evidence ?? f?.evidence_ids ?? f?.citations) }));
  }
  if (Array.isArray(o.tests)) o.tests = o.tests.map((t) => ({ ...t, kind: lc(t?.kind), evidence: toIds(t?.evidence) }));
  for (const k of ['questions_for_contributor', 'limitations']) if (typeof o[k] === 'string') o[k] = [o[k]];
  return o;
}

export function validateAssessment(obj) {
  const r = AssessmentSchema.safeParse(normalizeAssessmentShape(obj));
  if (r.success) return { ok: true, value: r.data };
  const issues = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return { ok: false, error: obj == null ? 'output was not a JSON object' : issues };
}

// ---------------- Citation filter / confidence cap ----------------
/**
 * Graph mode: every finding and test must cite >=1 evidence id and all its ids must exist.
 * "existing" tests must name a test from the server's list. Returns null if no finding survives.
 */
export function filterCitations(assessment, evidenceIds, knownTests = []) {
  const ids = new Set(evidenceIds);
  const cites = (x) => x.evidence.length > 0 && x.evidence.every((e) => ids.has(e));
  const findings = assessment.findings.filter(cites);
  const tests = assessment.tests.filter((t) => cites(t) && (t.kind !== 'existing' || knownTests.some((k) => k.includes(t.name) || t.name.includes(k))));
  const dropped = (assessment.findings.length - findings.length) + (assessment.tests.length - tests.length);
  if (!findings.length) return { assessment: null, dropped };
  return { assessment: { ...assessment, findings, tests }, dropped };
}

const rank = (c) => CONFIDENCES.indexOf(c);
export const minConfidence = (a, b) => (rank(a) <= rank(b) ? a : b);

/** Server-side ceiling on confidence, from coverage. */
export function confidenceCap({ coverage, metrics, anchorMatch }) {
  if (!coverage || !metrics || metrics.relevance == null) return 'low';
  if (coverage.precision === 'file' || coverage.graphStale) return 'low';
  const ratio = coverage.changedLines ? coverage.mappedLines / coverage.changedLines : 0;
  const exact = anchorMatch?.nodes?.some((n) => n.tag === 'exact');
  return ratio >= 0.8 && exact ? 'high' : 'medium';
}

// ---------------- Prompt contents ----------------
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…[truncated]` : t; };

export function graphContents({ input, evidence, metrics, coverage, testsToRun, overlaps }) {
  return JSON.stringify({
    mode: 'graph',
    claim: { pr: input.pr?.number, title: input.pr?.title ?? '', description: clip(input.pr?.body, 1500), linkedIssue: input.issue?.number ?? null },
    issue: input.issue ? { number: input.issue.number, title: input.issue.title ?? '', body: clip(input.issue.body, 1500) } : null,
    evidence: evidence.map(({ id, kind, text }) => ({ id, kind, text })),
    metrics: metrics && {
      issueAreaHit: metrics.issueAreaHit, relevance: metrics.relevance, communityOverlap: metrics.communityOverlap,
      blastRadius: metrics.blastRadius, godNodesTouched: metrics.godNodesTouched, unexplained: metrics.unexplained.map((u) => u.label), nullReason: metrics.nullReason,
    },
    coverage,
    testsToRun,
    overlaps: overlaps.map(({ pr, kind, jaccard }) => ({ pr, kind, jaccard })),
    schema: SCHEMA_HINT,
  });
}

export function diffOnlyContents(input) {
  let budget = 10000;
  const diff = [];
  for (const f of input.files ?? []) {
    const p = clip(f.patch ?? '(no patch: binary or too large)', Math.max(0, Math.min(3000, budget)));
    budget -= p.length;
    diff.push({ file: f.filename, status: f.status, patch: p });
    if (budget <= 0) break;
  }
  return JSON.stringify({
    mode: 'diffonly',
    note: 'DIFF-ONLY MODE: there is no evidence pack and no issue text. Judge only from the PR description and the diff. Findings may have empty "evidence" arrays in this mode.',
    claim: { pr: input.pr?.number, title: input.pr?.title ?? '', description: clip(input.pr?.body, 1500) },
    diff,
    schema: SCHEMA_HINT,
  });
}

// ---------------- Main entry ----------------
/**
 * Call the model, validate, one repair round. Returns { assessment, error, attempts }.
 * assessment is null when the model failed or stayed invalid (caller falls back).
 */
export async function runAssessment({ client, contents, sleep }) {
  let attempts = 0;
  let raw;
  try {
    attempts++;
    raw = await callModel(client, contents, { sleep });
    const first = validateAssessment(extractJson(raw));
    if (first.ok) return { assessment: first.value, error: null, attempts };
    attempts++;
    const repair = `${contents}\n\nYour previous output failed validation: ${first.error}\nPrevious output (truncated): ${clip(raw, 2000)}\nReturn ONLY the corrected JSON object.`;
    raw = await callModel(client, repair, { sleep });
    const second = validateAssessment(extractJson(raw));
    if (second.ok) return { assessment: second.value, error: null, attempts };
    return { assessment: null, error: `invalid model output after repair: ${second.error}`, attempts };
  } catch (e) {
    return { assessment: null, error: `model call failed: ${clip(e?.message ?? e, 200)}`, attempts };
  }
}

// ---------------- Deterministic fallback ----------------
/** Assessment built only from server evidence (no model text). */
export function fallbackAssessment({ input, mode, evidence = [], metrics, coverage, testsToRun = [], overlaps = [], rule, labelOf = (x) => x, reason }) {
  const why = `Model output unavailable${reason ? ` (${reason})` : ''}; this assessment was built from deterministic evidence only.`;
  const claimText = String(input.pr?.title ?? '').trim();
  if (mode === 'diffonly') {
    return {
      claim_summary: `PR title: "${claimText}"`,
      reality_summary: 'Diff-only model review unavailable.',
      findings: [], tests: [], questions_for_contributor: [],
      suggested_priority: 'needs_context', confidence: 'low', limitations: [why],
    };
  }
  const idOf = (kind, pred = () => true) => evidence.find((e) => e.kind === kind && pred(e))?.id;
  const metricId = idOf('metric');
  const findings = [];
  const add = (text, severity, ids) => { const ev = ids.filter(Boolean); if (ev.length) findings.push({ text, severity, evidence: ev }); };

  if (metrics?.relevance != null) {
    const sev = rule.priority === 'review_first' ? 'info' : rule.priority === 'likely_off_target' ? 'risk' : 'warn';
    add(rule.reason, sev, [metricId, idOf('issue_quote')]);
  } else {
    add(rule.reason, 'warn', [metricId, idOf('coverage_gap'), idOf('issue_quote')]);
  }
  if (metrics?.unexplained?.length) {
    add(`Changes outside the issue area: ${metrics.unexplained.map((u) => u.label).join(', ')}.`, 'warn', [metricId, ...evidence.filter((e) => e.kind === 'touched_node' && metrics.unexplained.some((u) => u.id === e.node)).slice(0, 3).map((e) => e.id)]);
  }
  for (const g of metrics?.godNodesTouched ?? []) {
    add(`Changes ${labelOf(g)}, one of the most connected symbols; ${metrics.blastRadius} dependent(s) may be affected.`, 'warn', [idOf('touched_node', (e) => e.node === g), idOf('blast_radius')]);
  }
  for (const o of overlaps) {
    add(`${o.kind === 'possible_duplicate' ? 'Possible duplicate of' : 'Overlaps with'} PR #${o.pr} (Jaccard ${o.jaccard}).`, o.kind === 'possible_duplicate' ? 'warn' : 'info', [idOf('overlap', (e) => e.url.endsWith(`/pull/${o.pr}`))]);
  }
  if (coverage?.unmappedAdditions?.length) add(`New symbols not in the base graph: ${coverage.unmappedAdditions.join(', ')}.`, 'info', [idOf('coverage_gap')]);
  if (!findings.length && evidence[0]) findings.push({ text: rule.reason, severity: 'warn', evidence: [evidence[0].id] });

  const blastId = idOf('blast_radius');
  const tests = blastId ? testsToRun.map((t) => ({ kind: 'existing', name: t, reason: 'Depends on changed code (within 2 hops) or was changed by this PR.', evidence: [blastId] })) : [];

  const questions = [];
  if (rule.priority === 'likely_off_target' && input.issue) {
    const anchors = metrics?.issueAreaNodes?.length ? metrics.issueAreaNodes : [];
    questions.push(`How does this change address issue #${input.issue.number}${anchors.length ? '' : ', given it does not touch the code the issue points at'}?`);
  }
  if (coverage?.unmappedAdditions?.length) questions.push(`What is the role of the new code (${coverage.unmappedAdditions.join(', ')}) in fixing the issue?`);
  for (const o of overlaps.filter((x) => x.kind === 'possible_duplicate')) questions.push(`Have you seen PR #${o.pr}, which changes the same code for the same issue?`);
  if (!coverage?.testsChanged?.length && rule.priority !== 'needs_context') questions.push('Can you add a test that fails before this change and passes after it?');

  return {
    claim_summary: `PR #${input.pr?.number} says: "${claimText}"`,
    reality_summary: rule.reason,
    findings,
    tests,
    questions_for_contributor: questions,
    suggested_priority: rule.priority,
    confidence: 'low',
    limitations: [why],
  };
}
