/**
 * Core data models for the Expense Approval Workflow.
 *
 * These interfaces define the shape of data flowing through the
 * Step Functions state machine. They are shared across all Lambda
 * handlers, the local development server, and test fixtures.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approved expense categories aligned with corporate policy. */
export const ALLOWED_CATEGORIES = [
  "travel",
  "meals",
  "accommodation",
  "office_supplies",
  "software",
  "training",
  "client_entertainment",
  "transportation",
  "miscellaneous",
] as const;

export type ExpenseCategory = (typeof ALLOWED_CATEGORIES)[number];

/** All possible decision outcomes rendered by the workflow. */
export type DecisionOutcome =
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_MANUAL_REVIEW"
  | "FAILED_PROCESSING";

/** All possible statuses an expense record can have. */
export type ExpenseStatus =
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_MANUAL_REVIEW"
  | "PENDING_REVIEW"
  | "FAILED_PROCESSING";

// ---------------------------------------------------------------------------
// Workflow step results
// ---------------------------------------------------------------------------

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  validatedAt: string;
}

export interface PolicyCheckResult {
  passed: boolean;
  violations: string[];
  checkedAt: string;
}

export interface FraudCheckResult {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskFlags: string[];
  analyzedAt: string;
}

export interface DecisionResult {
  outcome: DecisionOutcome;
  reasons: string[];
  decidedAt: string;
  /** True when a human reviewer overrode the automated decision. */
  manualOverride?: boolean;
  /** Identifier of the reviewer (set only for manual decisions). */
  reviewedBy?: string;
}

/**
 * Error payload attached by Step Functions Catch blocks.
 * The Catch ResultPath merges this into the event so the
 * compensation handler can log and persist the failure.
 */
export interface WorkflowError {
  Error: string;
  Cause: string;
}

// ---------------------------------------------------------------------------
// Main expense event (flows through Step Functions)
// ---------------------------------------------------------------------------

export interface ExpenseEvent {
  expenseId: string;
  employeeId: string;
  amount: number;
  category: string;
  description: string;
  receiptProvided: boolean;
  submittedAt: string;

  /**
   * Unique per-request identifier for distributed tracing.
   * Generated once in the API handler and carried through
   * every Step Functions state. Different from expenseId which
   * is deterministic for idempotency.
   */
  correlationId?: string;

  /**
   * Workflow version that processed this expense ("V1" or "V2").
   * V2 adds a manual approval wait state for NEEDS_MANUAL_REVIEW.
   */
  workflowVersion?: string;

  validation?: ValidationResult;
  policyCheck?: PolicyCheckResult;
  fraudCheck?: FraudCheckResult;
  decision?: DecisionResult;
  status?: string;
  updatedAt?: string;
  storageError?: string;

  /** Error from Step Functions Catch block (compensation flow). */
  error?: WorkflowError;
}

// ---------------------------------------------------------------------------
// API request / response shapes
// ---------------------------------------------------------------------------

export interface ExpenseClaimRequest {
  employeeId: string;
  amount: number;
  category: string;
  description: string;
  receiptProvided: boolean;
}

export interface SubmissionResponse {
  message: string;
  expenseId: string;
  correlationId: string;
  submittedAt: string;
  status: string;
  workflowVersion: string;
}

/**
 * Request body for the manual decision endpoint.
 * Used when a human reviewer approves or rejects an expense
 * that was flagged as NEEDS_MANUAL_REVIEW.
 */
export interface ManualDecisionRequest {
  decision: "APPROVED" | "REJECTED";
  reason: string;
  reviewedBy?: string;
}
