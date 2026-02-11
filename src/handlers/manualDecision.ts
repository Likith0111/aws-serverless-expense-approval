/**
 * ManualDecision Handler
 *
 * Processes human reviewer decisions for expenses flagged as
 * NEEDS_MANUAL_REVIEW. In production (V2 workflow), this would
 * also call Step Functions SendTaskSuccess to resume the paused
 * workflow. Locally, it directly updates the DynamoDB record.
 *
 * Endpoint: POST /expenses/:expenseId/manual-decision
 *
 * This is a local-only development endpoint. In production, manual
 * approvals would flow through a dedicated admin UI that calls
 * the Step Functions API directly with the task token.
 *
 * Preconditions:
 *   - Expense must exist in the database
 *   - Expense status must be NEEDS_MANUAL_REVIEW or PENDING_REVIEW
 *   - Decision must be APPROVED or REJECTED
 */

import { ManualDecisionRequest, ExpenseEvent } from "../models/expense";
import { getExpense, updateExpenseStatus } from "../utils/dynamo";
import { createLogger } from "../utils/logger";

const log = createLogger("ManualDecision");

// ---------------------------------------------------------------------------
// Reviewable statuses
// ---------------------------------------------------------------------------

const REVIEWABLE_STATUSES = ["NEEDS_MANUAL_REVIEW", "PENDING_REVIEW"];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleManualDecision(
  expenseId: string,
  request: ManualDecisionRequest,
): Promise<{ success: boolean; expense?: ExpenseEvent; error?: string }> {
  log.info("Processing manual decision", {
    expenseId,
    decision: request.decision,
    reviewedBy: request.reviewedBy,
  });

  // --- Validate the request ------------------------------------------------
  if (!request.decision || !["APPROVED", "REJECTED"].includes(request.decision)) {
    return { success: false, error: "decision must be APPROVED or REJECTED" };
  }

  if (!request.reason || request.reason.trim().length < 3) {
    return { success: false, error: "reason must be at least 3 characters" };
  }

  // --- Fetch the expense ---------------------------------------------------
  const expense = await getExpense(expenseId);
  if (!expense) {
    return { success: false, error: `Expense ${expenseId} not found` };
  }

  // --- Verify it is in a reviewable state ----------------------------------
  if (!REVIEWABLE_STATUSES.includes(expense.status ?? "")) {
    return {
      success: false,
      error: `Expense ${expenseId} is not pending review (current status: ${expense.status})`,
    };
  }

  // --- Apply the manual decision -------------------------------------------
  const decidedAt = new Date().toISOString();
  const updated = await updateExpenseStatus(expenseId, {
    status: request.decision,
    decision: {
      outcome: request.decision,
      reasons: [request.reason.trim()],
      decidedAt,
      manualOverride: true,
      reviewedBy: request.reviewedBy?.trim() || "unknown",
    },
  });

  if (!updated) {
    return { success: false, error: "Failed to update expense record" };
  }

  log.info("Manual decision applied", {
    expenseId,
    outcome: request.decision,
    reviewedBy: request.reviewedBy,
  });

  return { success: true, expense: updated };
}
