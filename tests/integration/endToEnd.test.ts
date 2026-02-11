/**
 * End-to-end integration tests.
 *
 * These tests exercise the full workflow pipeline locally:
 *   Submit -> Validate -> PolicyCheck -> FraudHeuristic -> Decision -> DynamoDB
 *
 * They verify:
 *   - Happy path (APPROVED, REJECTED, NEEDS_MANUAL_REVIEW)
 *   - Negative cases (invalid payload, zero amount, bad category)
 *   - Idempotency (duplicate submission detection)
 *   - Pagination (employee query across multiple pages)
 *   - Correlation ID propagation
 *   - Workflow version tracking
 */

import { handler as validateHandler } from "../../src/handlers/validateExpense";
import { handler as policyHandler } from "../../src/handlers/policyCheck";
import { handler as fraudHandler } from "../../src/handlers/fraudHeuristic";
import { handler as decisionHandler } from "../../src/handlers/decision";
import {
  resetInMemoryStore, storeExpenseDecision,
  getExpense, getExpensesByEmployee,
} from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

// ---------------------------------------------------------------------------
// Workflow runner (mirrors local server)
// ---------------------------------------------------------------------------

async function runWorkflow(input: ExpenseEvent): Promise<ExpenseEvent> {
  const ctx = {};
  let r = await validateHandler(input, ctx);
  if (!r.validation?.passed) return await decisionHandler(r, ctx);
  r = await policyHandler(r, ctx);
  r = await fraudHandler(r, ctx);
  return await decisionHandler(r, ctx);
}

function baseExpense(overrides: Partial<ExpenseEvent> = {}): ExpenseEvent {
  return {
    expenseId: "EXP-E2E-001", employeeId: "EMP-001", amount: 45.0,
    category: "meals", description: "Team lunch at restaurant", receiptProvided: true,
    submittedAt: "2026-02-08T10:00:00Z", correlationId: "corr-e2e-001",
    workflowVersion: "V1", ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("End-to-end happy path", () => {
  beforeEach(() => resetInMemoryStore());

  it("should APPROVE a standard meal expense", async () => {
    const r = await runWorkflow(baseExpense());
    expect(r.decision?.outcome).toBe("APPROVED");
    expect(r.status).toBe("APPROVED");
    expect(r.correlationId).toBe("corr-e2e-001");
    expect(r.workflowVersion).toBe("V1");
    const stored = await getExpense("EXP-E2E-001");
    expect(stored?.status).toBe("APPROVED");
  });

  it("should REJECT over-limit meals expense", async () => {
    const r = await runWorkflow(baseExpense({ expenseId: "EXP-E2E-002", amount: 200 }));
    expect(r.decision?.outcome).toBe("REJECTED");
  });

  it("should flag suspicious expense for MANUAL_REVIEW", async () => {
    const r = await runWorkflow(baseExpense({
      expenseId: "EXP-E2E-003", amount: 24.99, category: "miscellaneous",
      description: "test expense", receiptProvided: false,
    }));
    expect(r.decision?.outcome).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("should APPROVE a large travel expense within limit", async () => {
    const r = await runWorkflow(baseExpense({
      expenseId: "EXP-E2E-004", amount: 1500, category: "travel",
      description: "Business trip flight to conference in NYC", receiptProvided: true,
    }));
    expect(r.decision?.outcome).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// Negative cases
// ---------------------------------------------------------------------------

describe("End-to-end negative cases", () => {
  beforeEach(() => resetInMemoryStore());

  it("REJECT with missing fields", async () => {
    const r = await runWorkflow({ expenseId: "EXP-NEG1", employeeId: "EMP-1", amount: 50 } as ExpenseEvent);
    expect(r.decision?.outcome).toBe("REJECTED");
    expect(r.decision?.reasons.some((re) => re.includes("Missing"))).toBe(true);
  });

  it("REJECT with zero amount", async () => {
    const r = await runWorkflow(baseExpense({ expenseId: "EXP-NEG2", amount: 0 }));
    expect(r.decision?.outcome).toBe("REJECTED");
  });

  it("REJECT with invalid category", async () => {
    const r = await runWorkflow(baseExpense({ expenseId: "EXP-NEG3", category: "gambling" }));
    expect(r.decision?.outcome).toBe("REJECTED");
  });

  it("REJECT with amount exceeding max", async () => {
    const r = await runWorkflow(baseExpense({ expenseId: "EXP-NEG4", amount: 15000 }));
    expect(r.decision?.outcome).toBe("REJECTED");
  });

  it("REJECT with very short description", async () => {
    const r = await runWorkflow(baseExpense({ expenseId: "EXP-NEG5", description: "ab" }));
    expect(r.decision?.outcome).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("End-to-end idempotency", () => {
  beforeEach(() => resetInMemoryStore());

  it("second write with same ID blocked by conditional write", async () => {
    await runWorkflow(baseExpense({ expenseId: "EXP-IDEM-1" }));
    const stored1 = await getExpense("EXP-IDEM-1");
    expect(stored1).not.toBeNull();

    // Running the workflow again with the same ID -- storeExpenseDecision blocks it.
    const r2 = await runWorkflow(baseExpense({ expenseId: "EXP-IDEM-1" }));
    expect(r2.decision?.outcome).toBe("APPROVED");
    // Store has only one record.
    const all = await getExpensesByEmployee("EMP-001");
    const matching = all.expenses.filter((e) => e.expenseId === "EXP-IDEM-1");
    expect(matching).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Employee query + pagination
// ---------------------------------------------------------------------------

describe("End-to-end employee query", () => {
  beforeEach(() => resetInMemoryStore());

  it("retrieves all expenses for an employee after workflow", async () => {
    for (let i = 0; i < 3; i++) {
      await runWorkflow(baseExpense({
        expenseId: `EXP-EMP-${i}`, employeeId: "EMP-QUERY",
        amount: 10 + i, description: `Expense number ${i + 100}`,
      }));
    }
    const r = await getExpensesByEmployee("EMP-QUERY");
    expect(r.expenses).toHaveLength(3);
  });

  it("paginates employee results", async () => {
    // Page size set to 5 in test setup.
    for (let i = 0; i < 7; i++) {
      await storeExpenseDecision(baseExpense({
        expenseId: `EXP-PAG-${i}`, employeeId: "EMP-PG",
        submittedAt: `2026-01-0${i + 1}T10:00:00Z`,
      }));
    }
    const page1 = await getExpensesByEmployee("EMP-PG");
    expect(page1.expenses.length).toBeLessThanOrEqual(5);
    expect(page1.nextToken).toBeDefined();
    const page2 = await getExpensesByEmployee("EMP-PG", page1.nextToken);
    expect(page1.expenses.length + page2.expenses.length).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// FAILED_PROCESSING (compensation path)
// ---------------------------------------------------------------------------

describe("End-to-end compensation", () => {
  beforeEach(() => resetInMemoryStore());

  it("stores FAILED_PROCESSING when error is present", async () => {
    const e = baseExpense({ expenseId: "EXP-FAIL-1" });
    e.error = { Error: "WorkflowError", Cause: "Step failed" };
    const r = await decisionHandler(e, {});
    expect(r.decision?.outcome).toBe("FAILED_PROCESSING");
    const stored = await getExpense("EXP-FAIL-1");
    expect(stored?.status).toBe("FAILED_PROCESSING");
  });
});
