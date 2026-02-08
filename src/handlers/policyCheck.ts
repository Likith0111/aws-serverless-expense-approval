/**
 * PolicyCheck Lambda Handler
 *
 * Evaluates an expense claim against corporate expense policies.
 * Runs in parallel with FraudHeuristic inside the Step Functions
 * Parallel state.
 *
 * Policy rules:
 *  - Each category has a per-transaction spending cap.
 *  - Receipts are mandatory for any expense exceeding $25.
 *  - Certain categories trigger additional review above lower thresholds.
 *
 * Architectural note:
 *   Policy constants are defined at the module level. In production,
 *   these could be loaded from a DynamoDB config table for dynamic
 *   policy management without redeployment.
 */

import { ExpenseEvent } from "../models/expense";

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

/** Per-transaction spending limits by category (USD). */
export const CATEGORY_LIMITS: Record<string, number> = {
  travel: 2000,
  meals: 75,
  accommodation: 500,
  office_supplies: 200,
  software: 500,
  training: 1500,
  client_entertainment: 300,
  transportation: 150,
  miscellaneous: 100,
};

/** Amount above which a receipt is always required. */
const RECEIPT_REQUIRED_THRESHOLD = 25;

/** Categories under higher scrutiny -- amounts above the value trigger review. */
const HIGH_SCRUTINY_CATEGORIES: Record<string, number> = {
  client_entertainment: 150,
  miscellaneous: 50,
  meals: 50,
};

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: ExpenseEvent,
  _context: unknown,
): Promise<ExpenseEvent> => {
  console.log(`Running policy check for expense: ${event.expenseId ?? "unknown"}`);

  const violations = checkPolicy(event);

  event.policyCheck = {
    passed: violations.length === 0,
    violations,
    checkedAt: new Date().toISOString(),
  };

  console.log(
    `Policy check ${
      violations.length === 0 ? "passed" : `found ${violations.length} violation(s)`
    } for ${event.expenseId}`,
  );

  return event;
};

// ---------------------------------------------------------------------------
// Core policy logic
// ---------------------------------------------------------------------------

export function checkPolicy(
  expense: Pick<ExpenseEvent, "amount" | "category" | "receiptProvided">,
): string[] {
  const violations: string[] = [];
  const { amount, category, receiptProvided } = expense;

  // --- Category spending limit ----------------------------------------------
  const limit = CATEGORY_LIMITS[category];
  if (limit !== undefined && amount > limit) {
    violations.push(
      `Amount $${amount.toFixed(2)} exceeds ${category} limit of $${limit.toFixed(2)}`,
    );
  }

  // --- Receipt requirement --------------------------------------------------
  if (amount > RECEIPT_REQUIRED_THRESHOLD && !receiptProvided) {
    violations.push(
      `Receipt required for expenses over $${RECEIPT_REQUIRED_THRESHOLD.toFixed(2)}`,
    );
  }

  // --- High-scrutiny category review ----------------------------------------
  const scrutinyThreshold = HIGH_SCRUTINY_CATEGORIES[category];
  if (scrutinyThreshold !== undefined && amount > scrutinyThreshold) {
    violations.push(
      `Category '${category}' requires additional review for amounts over $${scrutinyThreshold.toFixed(2)}`,
    );
  }

  return violations;
}
