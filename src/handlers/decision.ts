/**
 * Decision Lambda Handler
 *
 * Aggregates results from all upstream workflow steps and renders
 * a final approval decision. Also persists the record to DynamoDB.
 *
 * Decision matrix:
 *   FAILED_PROCESSING       -- Workflow error (from Catch block compensation).
 *   REJECTED                -- Validation failed or amount exceeds category limit.
 *   NEEDS_MANUAL_REVIEW     -- Non-critical policy violations or medium/high fraud risk.
 *   APPROVED                -- All checks passed with low fraud risk.
 *
 * Compensation logic:
 *   When a Step Functions Catch block fires, it sets event.error with the
 *   Error and Cause fields. This handler detects that condition and stores
 *   a FAILED_PROCESSING record so the failure is visible to operators and
 *   auditable in the expense table.
 *
 * Dead code note (hasReceiptViolation):
 *   A previous version had a separate receipt-violation check after the
 *   general policy/fraud review block. This was unreachable because receipt
 *   violations set policyCheck.passed = false, which is already caught by
 *   the general needsReview block. The dead code has been removed.
 */

import { ExpenseEvent, DecisionOutcome } from "../models/expense";
import { storeExpenseDecision } from "../utils/dynamo";
import { createLogger } from "../utils/logger";

const log = createLogger("Decision");

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: ExpenseEvent | ExpenseEvent[],
  _context: unknown,
): Promise<ExpenseEvent> => {
  // Step Functions Parallel state outputs an array -- merge it first.
  let expense: ExpenseEvent;
  if (Array.isArray(event)) {
    log.info("Merging parallel state outputs", { branchCount: event.length });
    expense = mergeParallelResults(event);
  } else {
    expense = event;
  }

  log.info("Rendering decision", {
    expenseId: expense.expenseId,
    correlationId: expense.correlationId,
    employeeId: expense.employeeId,
    hasError: !!expense.error,
  });

  const { outcome, reasons } = makeDecision(expense);

  const decidedAt = new Date().toISOString();
  expense.decision = { outcome, reasons, decidedAt };
  expense.status = outcome;
  expense.updatedAt = decidedAt;

  try {
    await storeExpenseDecision(expense);
    log.info("Decision persisted", {
      expenseId: expense.expenseId,
      correlationId: expense.correlationId,
      outcome,
    });
  } catch (err) {
    log.error("Failed to persist decision to DynamoDB", {
      expenseId: expense.expenseId,
      correlationId: expense.correlationId,
      error: String(err),
    });
    expense.storageError = String(err);
  }

  return expense;
};

// ---------------------------------------------------------------------------
// Parallel-state merger
// ---------------------------------------------------------------------------

export function mergeParallelResults(outputs: unknown[]): ExpenseEvent {
  const merged: Record<string, unknown> = {};
  for (const output of outputs) {
    if (output && typeof output === "object" && !Array.isArray(output)) {
      Object.assign(merged, output);
    }
  }
  return merged as unknown as ExpenseEvent;
}

// ---------------------------------------------------------------------------
// Core decision logic
// ---------------------------------------------------------------------------

/**
 * Determine the final approval outcome.
 *
 * Decision priority (first match wins):
 *   0. Workflow error (Catch block)  -> FAILED_PROCESSING
 *   1. Validation failure            -> REJECTED
 *   2. Amount exceeds category limit -> REJECTED
 *   3. Policy violations or fraud    -> NEEDS_MANUAL_REVIEW
 *   4. All clear                     -> APPROVED
 */
export function makeDecision(
  expense: ExpenseEvent,
): { outcome: DecisionOutcome; reasons: string[] } {
  const reasons: string[] = [];

  // --- Priority 0: Workflow error (compensation) ----------------------------
  if (expense.error) {
    reasons.push(`Workflow execution error: ${expense.error.Error}`);
    reasons.push(expense.error.Cause || "Unknown cause");
    return { outcome: "FAILED_PROCESSING", reasons };
  }

  // Extract check results with safe defaults.
  const validation = expense.validation ?? { passed: false, errors: [] };
  const policyCheck = expense.policyCheck ?? { passed: true, violations: [] };
  const fraudCheck = expense.fraudCheck ?? {
    riskScore: 0,
    riskLevel: "LOW" as const,
    riskFlags: [],
  };

  // --- Priority 1: Validation failure -> reject immediately -----------------
  if (!validation.passed) {
    reasons.push("Expense failed validation checks");
    reasons.push(...validation.errors);
    return { outcome: "REJECTED", reasons };
  }

  // --- Priority 2: Hard limit violation -> reject ---------------------------
  const hasLimitViolation = policyCheck.violations.some((v) =>
    v.toLowerCase().includes("exceeds"),
  );
  if (hasLimitViolation) {
    reasons.push("Expense exceeds category spending limit");
    reasons.push(...policyCheck.violations);
    return { outcome: "REJECTED", reasons };
  }

  // --- Priority 3: Soft policy issues or elevated fraud -> review -----------
  let needsReview = false;

  if (!policyCheck.passed) {
    needsReview = true;
    reasons.push("Policy violations require manual review");
    reasons.push(...policyCheck.violations);
  }

  if (fraudCheck.riskLevel === "MEDIUM" || fraudCheck.riskLevel === "HIGH") {
    needsReview = true;
    reasons.push(
      `Fraud risk level: ${fraudCheck.riskLevel} (score: ${fraudCheck.riskScore})`,
    );
    reasons.push(...fraudCheck.riskFlags);
  }

  if (needsReview) {
    return { outcome: "NEEDS_MANUAL_REVIEW", reasons };
  }

  // --- Priority 4: All clear -----------------------------------------------
  reasons.push("All validation, policy, and fraud checks passed");
  return { outcome: "APPROVED", reasons };
}
