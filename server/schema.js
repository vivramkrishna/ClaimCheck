// Contract-in-code for the evidence card (HLD §5.2 + shared contract §3).
// Written to work with zod v3 and v4 (only the common API is used).
import { z } from 'zod';

export const PRIORITIES = ['review_first', 'needs_context', 'likely_off_target'];
export const SEVERITIES = ['info', 'warn', 'risk'];
export const CONFIDENCES = ['low', 'medium', 'high'];
export const TEST_KINDS = ['existing', 'proposed'];
export const OVERLAP_KINDS = ['possible_duplicate', 'coordinate'];
export const EVIDENCE_KINDS = [
  'issue_quote', 'diff_hunk', 'touched_node', 'graph_path',
  'blast_radius', 'overlap', 'metric', 'coverage_gap',
];

const Priority = z.enum(PRIORITIES);
const EvidenceIds = z.array(z.string());

// ---------- Gemma-owned part ----------
export const FindingSchema = z.object({
  text: z.string().min(1),
  severity: z.enum(SEVERITIES),
  evidence: EvidenceIds.default([]),
});

export const TestSchema = z.object({
  kind: z.enum(TEST_KINDS),
  name: z.string().min(1),
  reason: z.string().default(''),
  evidence: EvidenceIds.default([]),
});

export const AssessmentSchema = z.object({
  claim_summary: z.string(),
  reality_summary: z.string(),
  findings: z.array(FindingSchema),
  tests: z.array(TestSchema).default([]),
  questions_for_contributor: z.array(z.string()).default([]),
  suggested_priority: Priority,
  confidence: z.enum(CONFIDENCES),
  limitations: z.array(z.string()).default([]),
});

// ---------- Server-owned part ----------
const NodeRef = z.object({
  id: z.string(),
  label: z.string(),
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  url: z.string().nullable(),
});

export const EvidenceSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  kind: z.enum(EVIDENCE_KINDS),
  url: z.string(),
  text: z.string(),
  file: z.string().optional(),
  lines: z.string().optional(),
  node: z.string().optional(),
});

export const CoverageSchema = z.object({
  precision: z.enum(['symbol', 'file']),
  mappedLines: z.number().int(),
  changedLines: z.number().int(),
  unmappedAdditions: z.array(z.string()),
  graphStale: z.boolean(),
  testsChanged: z.array(z.string()).default([]),
});

// Issue-dependent metrics (issueAreaHit, relevance, communityOverlap) are null
// when there is not enough evidence; nullReason says why.
export const MetricsSchema = z.object({
  issueAreaHit: z.boolean().nullable(),
  issueAreaNodes: z.array(z.string()).default([]),
  relevance: z.number().nullable(),
  communityOverlap: z.number().nullable(),
  unexplained: z.array(NodeRef).default([]),
  blastRadius: z.number().int(),
  godNodesTouched: z.array(z.string()),
  edgeConfidence: z.record(z.string(), z.number()),
  nullReason: z.string().nullable().default(null),
});

export const OverlapSchema = z.object({
  pr: z.number().int(),
  kind: z.enum(OVERLAP_KINDS),
  jaccard: z.number(),
  shared: z.array(z.string()),
  sameIssue: z.boolean().optional(),
});

export const CardSchema = z.object({
  mode: z.enum(['graph', 'diffonly']),
  pr: z.object({
    number: z.number().int(),
    title: z.string(),
    author: z.string(),
    headSha: z.string(),
    linkedIssue: z.number().int().nullable(),
  }),
  provenance: z.object({
    mode: z.enum(['live', 'cached', 'replay']),
    model: z.string(),
    assessmentSource: z.enum(['model', 'fallback']),
    graphCommit: z.string().nullable(),
    graphifyVersion: z.string().nullable(),
    promptVersion: z.string(),
    generatedAt: z.string(),
  }),
  coverage: CoverageSchema.nullable(),
  metrics: MetricsSchema.nullable(),
  testsToRun: z.array(z.string()),
  overlaps: z.array(OverlapSchema),
  evidence: z.array(EvidenceSchema),
  rulePriority: Priority.nullable(),
  assessment: AssessmentSchema,
  finalPriority: Priority,
  priorityReason: z.string(),
});

// Compact shape description sent to the model inside the user content.
export const SCHEMA_HINT = `Return ONE JSON object with exactly these keys:
{
  "claim_summary": string,            // what the PR says it does (1-2 sentences)
  "reality_summary": string,          // what the evidence shows the change touches (1-2 sentences)
  "findings": [ { "text": string, "severity": "info"|"warn"|"risk", "evidence": ["E1", ...] } ],
  "tests": [ { "kind": "existing"|"proposed", "name": string, "reason": string, "evidence": ["E5"] } ],
  "questions_for_contributor": [string],
  "suggested_priority": "review_first"|"needs_context"|"likely_off_target",
  "confidence": "low"|"medium"|"high",
  "limitations": [string]
}
Priority guide: "review_first" = the change touches the code the issue is about;
"likely_off_target" = the change touches none of the issue's code;
"needs_context" = evidence is mixed, thin or missing.
"existing" tests must be names taken from the evidence; every finding cites at least one evidence id.`;
