export const SEVERITIES = ['security', 'bug', 'optimization', 'nit'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REVIEW_STATUSES = ['passed', 'changes-requested', 'running', 'failed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  path: string;
  line: number | null;
  suggestion: string | null;
  confidence: number;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface PullRequestReview {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  status: ReviewStatus;
  risk: RiskLevel;
  /** ISO timestamp, always relative to `NOW` so rendering is deterministic. */
  createdAt: string;
  durationMs: number;
  summary: string;
  findings: Finding[];
  diff: string;
  tokens: TokenUsage;
  filesChanged: number;
  additions: number;
  deletions: number;
  /** Secrets stripped by the sanitizer before the payload reached the model. */
  redactions: number;
}

export interface RuleConfig {
  enforceSecurityChecks: boolean;
  blockOnCriticalFindings: boolean;
  redactSecrets: boolean;
  skipGeneratedFiles: boolean;
  autoApproveCleanDiffs: boolean;
  notifyOnFailure: boolean;
  strictness: 'lenient' | 'balanced' | 'strict';
  minConfidence: number;
  maxComments: number;
  maxDiffChars: number;
  failOnSeverity: Severity | 'none';
  enabledSeverities: Severity[];
  customRules: string;
}

export const DEFAULT_RULES: RuleConfig = {
  enforceSecurityChecks: true,
  blockOnCriticalFindings: true,
  redactSecrets: true,
  skipGeneratedFiles: true,
  autoApproveCleanDiffs: false,
  notifyOnFailure: true,
  strictness: 'balanced',
  minConfidence: 0.6,
  maxComments: 25,
  maxDiffChars: 180000,
  failOnSeverity: 'none',
  enabledSeverities: ['security', 'bug', 'optimization', 'nit'],
  customRules: 'Flag any new direct database query that is not wrapped in a transaction.\nRequire a unit test alongside every new exported function.',
};
