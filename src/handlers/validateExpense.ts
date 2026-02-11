/**
 * ValidateExpense Lambda Handler
 *
 * First step in the Step Functions workflow. Acts as a gatekeeper --
 * invalid claims are short-circuited to rejection without consuming
 * resources on downstream checks.
 *
 * Validation rules:
 *  - All required fields must be present and non-null.
 *  - Amount must be a positive number within reasonable bounds.
 *  - Category must be from the approved corporate list.
 *  - Description must be meaningful (>= 3 characters after sanitization).
 *  - receiptProvided must be a boolean.
 *
 * Architectural note:
 *   This handler is stateless and performs no I/O beyond logging.
 *   This ensures fast execution and minimal Lambda cost.
 */

import { ExpenseEvent, ALLOWED_CATEGORIES } from "../models/expense";
import { createLogger } from "../utils/logger";

const log = createLogger("ValidateExpense");

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Maximum single expense amount (USD). */
const MAX_EXPENSE_AMOUNT = 10_000;

/** Fields every expense claim must include. */
const REQUIRED_FIELDS: (keyof ExpenseEvent)[] = [
  "employeeId",
  "amount",
  "category",
  "description",
  "receiptProvided",
];

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: ExpenseEvent,
  _context: unknown,
): Promise<ExpenseEvent> => {
  log.info("Starting expense validation", {
    expenseId: event.expenseId,
    correlationId: event.correlationId,
    employeeId: event.employeeId,
  });

  const errors = validate(event);

  event.validation = {
    passed: errors.length === 0,
    errors,
    validatedAt: new Date().toISOString(),
  };

  if (errors.length > 0) {
    log.warn("Validation failed", {
      expenseId: event.expenseId,
      correlationId: event.correlationId,
      errorCount: errors.length,
      errors,
    });
  } else {
    log.info("Validation passed", {
      expenseId: event.expenseId,
      correlationId: event.correlationId,
    });
  }

  return event;
};

// ---------------------------------------------------------------------------
// Core validation logic (separated for unit-testability)
// ---------------------------------------------------------------------------

export function validate(expense: Record<string, unknown> | ExpenseEvent): string[] {
  const e = expense as Record<string, unknown>;
  const errors: string[] = [];

  // --- Required fields ------------------------------------------------------
  for (const field of REQUIRED_FIELDS) {
    if (!(field in e) || e[field] === null || e[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return errors;

  // --- employeeId -----------------------------------------------------------
  const employeeId = e.employeeId;
  if (typeof employeeId !== "string" || employeeId.trim().length === 0) {
    errors.push("employeeId must be a non-empty string");
  }

  // --- amount ---------------------------------------------------------------
  const amount = e.amount;
  if (typeof amount !== "number") {
    errors.push("amount must be a number");
  } else if (amount <= 0) {
    errors.push("amount must be greater than zero");
  } else if (amount > MAX_EXPENSE_AMOUNT) {
    errors.push(`amount exceeds maximum allowed (${MAX_EXPENSE_AMOUNT})`);
  }

  // --- category -------------------------------------------------------------
  const category = e.category as string;
  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    errors.push(
      `Invalid category '${category}'. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
    );
  }

  // --- description ----------------------------------------------------------
  const description = e.description;
  if (typeof description !== "string" || description.trim().length < 3) {
    errors.push("description must be at least 3 characters");
  }

  // --- receiptProvided ------------------------------------------------------
  const receipt = e.receiptProvided;
  if (typeof receipt !== "boolean") {
    errors.push("receiptProvided must be a boolean");
  }

  return errors;
}
