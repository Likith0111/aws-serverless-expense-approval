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
  outcome: "APPROVED" | "REJECTED" | "NEEDS_MANUAL_REVIEW";
  reasons: string[];
  decidedAt: string;
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
  validation?: ValidationResult;
  policyCheck?: PolicyCheckResult;
  fraudCheck?: FraudCheckResult;
  decision?: DecisionResult;
  status?: string;
  updatedAt?: string;
  storageError?: string;
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
  submittedAt: string;
  status: string;
}
