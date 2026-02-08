/**
 * Decision Lambda Handler
 *
 * Aggregates results from all upstream workflow steps and renders
 * a final approval decision. Also persists the record to DynamoDB.
 *
 * Decision matrix:
 *   REJECTED             -- Validation failed or amount exceeds category limit.
 *   NEEDS_MANUAL_REVIEW  -- Non-critical policy violations, missing receipt,
 *                           or medium/high fraud risk.
 *   APPROVED             -- All checks passed with low fraud risk.
 *
 * Architectural note:
 *   The handler accepts both a single object (normal flow) and an array
 *   (output from Step Functions Parallel state). This dual-format support
 *   is required because PolicyCheck and FraudHeuristic run in parallel,
 *   producing an array output that must be merged before decision logic.
 */

import { ExpenseEvent } from "../models/expense";
import { storeExpenseDecision } from "../utils/dynamo";

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
    console.log("Merging parallel state outputs");
    expense = mergeParallelResults(event);
  } else {
    expense = event;
  }

  console.log(`Making decision for expense: ${expense.expenseId ?? "unknown"}`);

  const { outcome, reasons } = makeDecision(expense);

  const decidedAt = new Date().toISOString();
  expense.decision = { outcome, reasons, decidedAt };
  expense.status = outcome;
  expense.updatedAt = decidedAt;

  // Persist to DynamoDB. If storage fails we still return the decision.
  try {
    await storeExpenseDecision(expense);
    console.log(`Decision stored: ${expense.expenseId} -> ${outcome}`);
  } catch (err) {
    console.error(`Failed to store decision in DynamoDB: ${err}`);
    expense.storageError = String(err);
  }

  return expense;
};

// ---------------------------------------------------------------------------
// Parallel-state merger
// ---------------------------------------------------------------------------

/**
 * Merge results from a Step Functions Parallel state.
 *
 * The Parallel state emits an array where each element is the output
 * of one branch. We merge them into a single object so downstream
 * logic can access all check results uniformly.
 */
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
 *   1. Validation failure            -> REJECTED
 *   2. Amount exceeds category limit -> REJECTED
 *   3. Policy violations / fraud     -> NEEDS_MANUAL_REVIEW
 *   4. All clear                     -> APPROVED
 */
export function makeDecision(
  expense: ExpenseEvent,
): { outcome: "APPROVED" | "REJECTED" | "NEEDS_MANUAL_REVIEW"; reasons: string[] } {
  const reasons: string[] = [];

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

  const hasReceiptViolation = policyCheck.violations.some((v) =>
    v.toLowerCase().includes("receipt"),
  );

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

  if (hasReceiptViolation && !needsReview) {
    needsReview = true;
    reasons.push("Missing receipt for expense over threshold");
  }

  if (needsReview) {
    return { outcome: "NEEDS_MANUAL_REVIEW", reasons };
  }

  // --- Priority 4: All clear -----------------------------------------------
  reasons.push("All validation, policy, and fraud checks passed");
  return { outcome: "APPROVED", reasons };
}
