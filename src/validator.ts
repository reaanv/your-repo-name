/**
 * Zod schema + fail-closed validation for the LLM's structured review output.
 *
 * The schema here is deliberately built out of JSON-Schema-representable
 * constructs only (objects, enums, nullable primitives — no refinements, no
 * length bounds). That lets the exact same schema be handed to the Anthropic
 * structured-output API *and* used as the local fail-closed gate. Business
 * rules that JSON Schema can't express live in `applyReviewPolicy`.
 */

import { z } from 'zod';

export const SEVERITIES = ['security', 'bug', 'optimization', 'nit'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Lower number = more urgent. Used for ordering and for fail-on thresholds. */
export const SEVERITY_RANK: Record<Severity, number> = {
  security: 0,
  bug: 1,
  optimization: 2,
  nit: 3,
};

export const ReviewCommentSchema = z.object({
  path: z
    .string()
    .describe('Repository-relative file path exactly as it appears in the diff header.'),
  line: z
    .number()
    .nullable()
    .describe(
      'Line number in the NEW version of the file that this comment anchors to. Use null when the finding is file-level rather than line-level.',
    ),
  severity: z
    .enum(SEVERITIES)
    .describe(
      'security = exploitable or leaks data; bug = incorrect behaviour; optimization = correct but wasteful; nit = style or naming.',
    ),
  title: z.string().describe('Short imperative headline, under 80 characters.'),
  body: z
    .string()
    .describe('Markdown explanation: what is wrong, why it matters, and how to fix it.'),
  suggestion: z
    .string()
    .nullable()
    .describe('Replacement code for the flagged lines, or null when no concrete patch applies.'),
  confidence: z
    .number()
    .describe('How certain you are that this is a real problem, from 0 to 1.'),
});

export const ReviewSchema = z.object({
  summary: z.string().describe('Two to four sentence Markdown summary of the changes and their risk.'),
  overall_risk: z.enum(RISK_LEVELS).describe('Overall risk of merging this pull request as-is.'),
  comments: z.array(ReviewCommentSchema).describe('Individual findings. Empty array if the diff is clean.'),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type Review = z.infer<typeof ReviewSchema>;

/** Thrown whenever the model's output cannot be trusted. Always fatal. */
export class ReviewValidationError extends Error {
  readonly issues: string[];
  readonly raw: string | undefined;

  constructor(message: string, issues: string[] = [], raw?: string) {
    super(message);
    this.name = 'ReviewValidationError';
    this.issues = issues;
    this.raw = raw;
  }

  /** Multi-line, log-friendly rendering used by the Action's error output. */
  describe(): string {
    const lines = [this.message];
    if (this.issues.length > 0) {
      lines.push('Schema violations:');
      for (const issue of this.issues) lines.push(`  - ${issue}`);
    }
    if (this.raw !== undefined) {
      const preview = this.raw.length > 800 ? `${this.raw.slice(0, 800)}…` : this.raw;
      lines.push(`Raw model output (first 800 chars):\n${preview}`);
    }
    return lines.join('\n');
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Validates an already-parsed object against the schema.
 * Throws `ReviewValidationError` on any deviation — never returns partial data.
 */
export function validateReview(candidate: unknown): Review {
  const result = ReviewSchema.safeParse(candidate);
  if (!result.success) {
    throw new ReviewValidationError(
      'LLM response failed Zod schema validation.',
      formatIssues(result.error),
      safeStringify(candidate),
    );
  }
  return result.data;
}

/**
 * Parses a raw string from the model and validates it. Tolerates a Markdown
 * code fence around the JSON, but nothing more adventurous than that — anything
 * else is treated as a hallucination and fails closed.
 */
export function parseAndValidateReview(raw: string): Review {
  const stripped = stripCodeFence(raw).trim();
  if (stripped.length === 0) {
    throw new ReviewValidationError('LLM returned an empty response.', [], raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReviewValidationError(`LLM response was not valid JSON: ${detail}`, [], raw);
  }

  return validateReview(parsed);
}

function stripCodeFence(raw: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(raw);
  return fenced?.[1] ?? raw;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface ReviewPolicy {
  /** Drop findings the model is less sure about than this. */
  minConfidence: number;
  /** Hard cap on how many comments get posted. */
  maxComments: number;
  /** Severities allowed through. */
  allowedSeverities: Severity[];
}

export const DEFAULT_POLICY: ReviewPolicy = {
  minConfidence: 0.6,
  maxComments: 25,
  allowedSeverities: [...SEVERITIES],
};

export interface PolicyResult {
  review: Review;
  droppedByConfidence: number;
  droppedBySeverity: number;
  droppedByCap: number;
}

/**
 * Applies the rules JSON Schema can't express: confidence floor, severity
 * filter, comment cap, and urgency ordering. Runs only on already-validated
 * data.
 */
export function applyReviewPolicy(review: Review, policy: ReviewPolicy = DEFAULT_POLICY): PolicyResult {
  const allowed = new Set<Severity>(policy.allowedSeverities);

  let droppedBySeverity = 0;
  let droppedByConfidence = 0;

  const kept = review.comments.filter((comment) => {
    if (!allowed.has(comment.severity)) {
      droppedBySeverity += 1;
      return false;
    }
    // A model that emits an out-of-range confidence is clamped, not trusted.
    const confidence = clamp01(comment.confidence);
    if (confidence < policy.minConfidence) {
      droppedByConfidence += 1;
      return false;
    }
    return true;
  });

  kept.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return clamp01(b.confidence) - clamp01(a.confidence);
  });

  const capped = kept.slice(0, Math.max(0, policy.maxComments));

  return {
    review: {
      ...review,
      comments: capped.map((c) => ({ ...c, confidence: clamp01(c.confidence) })),
    },
    droppedByConfidence,
    droppedBySeverity,
    droppedByCap: kept.length - capped.length,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Highest-urgency severity present, or null for a clean review. */
export function highestSeverity(review: Review): Severity | null {
  let best: Severity | null = null;
  for (const comment of review.comments) {
    if (best === null || SEVERITY_RANK[comment.severity] < SEVERITY_RANK[best]) {
      best = comment.severity;
    }
  }
  return best;
}
