/**
 * End-to-end integration tests for the Expense Approval Workflow.
 *
 * These tests exercise the complete pipeline by chaining all Lambda
 * handlers in sequence, exactly as Step Functions would in production.
 * Each test submits an expense, runs it through every step, and
 * verifies the final decision and all intermediate results.
 */

import { handler as validateHandler } from "../../src/handlers/validateExpense";
import { handler as policyHandler } from "../../src/handlers/policyCheck";
import { handler as fraudHandler } from "../../src/handlers/fraudHeuristic";
import { handler as decisionHandler } from "../../src/handlers/decision";
import { getExpense, resetInMemoryStore } from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

// ---------------------------------------------------------------------------
// Workflow runner (mirrors Step Functions state machine)
// ---------------------------------------------------------------------------

async function runFullWorkflow(input: ExpenseEvent): Promise<ExpenseEvent> {
  const ctx = {};

  let result = await validateHandler(input, ctx);

  if (!result.validation?.passed) {
    result = await decisionHandler(result, ctx);
    return result;
  }

  result = await policyHandler(result, ctx);
  result = await fraudHandler(result, ctx);
  result = await decisionHandler(result, ctx);

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("End-to-end workflow", () => {
  beforeEach(() => resetInMemoryStore());

  // --- APPROVED path -------------------------------------------------------

  it("should APPROVE a standard valid expense", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-001",
      employeeId: "EMP-001",
      amount: 35.5,
      category: "meals",
      description: "Lunch with team at local restaurant",
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    // All check blocks present
    expect(result.validation).toBeDefined();
    expect(result.policyCheck).toBeDefined();
    expect(result.fraudCheck).toBeDefined();
    expect(result.decision).toBeDefined();

    // Final decision
    expect(result.decision!.outcome).toBe("APPROVED");
    expect(result.status).toBe("APPROVED");

    // Persisted to storage
    const stored = await getExpense("EXP-E2E-001");
    expect(stored).not.toBeNull();
    expect(stored!.decision!.outcome).toBe("APPROVED");
  });

  // --- REJECTED: validation failure ----------------------------------------

  it("should REJECT an invalid expense at validation", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-002",
      employeeId: "EMP-002",
      amount: -50,
      category: "meals",
      description: "Invalid negative amount",
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    expect(result.validation!.passed).toBe(false);
    expect(result.decision!.outcome).toBe("REJECTED");

    // Policy and fraud checks should NOT have run
    expect(result.policyCheck).toBeUndefined();
    expect(result.fraudCheck).toBeUndefined();
  });

  // --- REJECTED: over category limit ---------------------------------------

  it("should REJECT an expense exceeding category limit", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-003",
      employeeId: "EMP-003",
      amount: 500,
      category: "meals",
      description: "Very expensive team dinner at luxury venue downtown",
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    expect(result.decision!.outcome).toBe("REJECTED");
    expect(result.decision!.reasons.some((r) => r.toLowerCase().includes("exceeds"))).toBe(true);
  });

  // --- NEEDS_MANUAL_REVIEW: suspicious pattern -----------------------------

  it("should flag a suspicious expense for review", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-004",
      employeeId: "EMP-004",
      amount: 24.99,
      category: "office_supplies",
      description: "test supplies for the office area",
      receiptProvided: false,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    // Threshold gaming + suspicious keyword + no receipt
    expect(["NEEDS_MANUAL_REVIEW", "REJECTED"]).toContain(result.decision!.outcome);
  });

  // --- NEEDS_MANUAL_REVIEW: missing receipt --------------------------------

  it("should flag expense over $25 without receipt", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-005",
      employeeId: "EMP-005",
      amount: 120,
      category: "transportation",
      description: "Uber rides for client visits across the city today",
      receiptProvided: false,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    expect(["NEEDS_MANUAL_REVIEW", "REJECTED"]).toContain(result.decision!.outcome);
  });

  // --- Data integrity -------------------------------------------------------

  it("should preserve all original fields through the pipeline", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-006",
      employeeId: "EMP-006",
      amount: 50,
      category: "office_supplies",
      description: "Printer paper and ink cartridges for the office",
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    expect(result.expenseId).toBe("EXP-E2E-006");
    expect(result.employeeId).toBe("EMP-006");
    expect(result.amount).toBe(50);
    expect(result.category).toBe("office_supplies");
    expect(result.receiptProvided).toBe(true);
  });

  it("should store multiple expenses independently", async () => {
    const expenses: ExpenseEvent[] = Array.from({ length: 3 }, (_, i) => ({
      expenseId: `EXP-MULTI-${i}`,
      employeeId: "EMP-MULTI",
      amount: 30 + i,
      category: "meals",
      description: `Team meal number ${i} at local restaurant`,
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    }));

    for (const e of expenses) {
      await runFullWorkflow(e);
    }

    for (let i = 0; i < 3; i++) {
      const stored = await getExpense(`EXP-MULTI-${i}`);
      expect(stored).not.toBeNull();
      expect(stored!.amount).toBe(30 + i);
      expect(stored!.decision!.outcome).toBe("APPROVED");
    }
  });

  // --- Edge case: at limit --------------------------------------------------

  it("should handle expense exactly at category limit", async () => {
    const expense: ExpenseEvent = {
      expenseId: "EXP-E2E-007",
      employeeId: "EMP-007",
      amount: 2000,
      category: "travel",
      description: "Round-trip flight to San Francisco for annual conference",
      receiptProvided: true,
      submittedAt: "2026-02-08T10:00:00Z",
    };

    const result = await runFullWorkflow(expense);

    // $2000 is exactly at the travel limit (not over).
    // Round-amount heuristic may trigger, so APPROVED or NEEDS_MANUAL_REVIEW.
    expect(["APPROVED", "NEEDS_MANUAL_REVIEW"]).toContain(result.decision!.outcome);
  });
});
