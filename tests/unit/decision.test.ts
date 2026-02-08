/**
 * Unit tests for the Decision Lambda handler.
 */

import { handler, makeDecision, mergeParallelResults } from "../../src/handlers/decision";
import { resetInMemoryStore } from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validExpense(): ExpenseEvent {
  return {
    expenseId: "EXP-TEST001",
    employeeId: "EMP-001",
    amount: 45.0,
    category: "meals",
    description: "Team lunch at downtown restaurant",
    receiptProvided: true,
    submittedAt: "2026-02-08T10:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("Decision handler", () => {
  beforeEach(() => resetInMemoryStore());

  it("should APPROVE a valid expense with all checks passed", async () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = { passed: true, violations: [], checkedAt: "" };
    expense.fraudCheck = { riskScore: 10, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };

    const result = await handler(expense, {});

    expect(result.decision?.outcome).toBe("APPROVED");
    expect(result.status).toBe("APPROVED");
    expect(result.decision?.decidedAt).toBeDefined();
    expect(result.decision!.reasons.length).toBeGreaterThan(0);
  });

  it("should REJECT on validation failure", async () => {
    const expense = validExpense();
    expense.validation = { passed: false, errors: ["Missing field: category"], validatedAt: "" };

    const result = await handler(expense, {});
    expect(result.decision?.outcome).toBe("REJECTED");
  });

  it("should REJECT when amount exceeds limit", async () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = {
      passed: false,
      violations: ["Amount $5000.00 exceeds meals limit of $75.00"],
      checkedAt: "",
    };
    expense.fraudCheck = { riskScore: 10, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };

    const result = await handler(expense, {});
    expect(result.decision?.outcome).toBe("REJECTED");
  });

  it("should flag NEEDS_MANUAL_REVIEW on high fraud risk", async () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = { passed: true, violations: [], checkedAt: "" };
    expense.fraudCheck = {
      riskScore: 65,
      riskLevel: "HIGH",
      riskFlags: ["Suspicious pattern"],
      analyzedAt: "",
    };

    const result = await handler(expense, {});
    expect(result.decision?.outcome).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("should flag NEEDS_MANUAL_REVIEW on policy violation", async () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = {
      passed: false,
      violations: [
        "Category 'client_entertainment' requires additional review for amounts over $150.00",
      ],
      checkedAt: "",
    };
    expense.fraudCheck = { riskScore: 10, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };

    const result = await handler(expense, {});
    expect(result.decision?.outcome).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("should handle Parallel state array input", async () => {
    const base = validExpense();
    base.validation = { passed: true, errors: [], validatedAt: "" };

    const branch1 = { ...base, policyCheck: { passed: true, violations: [] as string[], checkedAt: "" } };
    const branch2 = {
      ...base,
      fraudCheck: { riskScore: 5, riskLevel: "LOW" as const, riskFlags: [] as string[], analyzedAt: "" },
    };

    const result = await handler([branch1, branch2], {});
    expect(result.decision?.outcome).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// Core decision logic tests
// ---------------------------------------------------------------------------

describe("makeDecision()", () => {
  it("should APPROVE when all checks pass", () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = { passed: true, violations: [], checkedAt: "" };
    expense.fraudCheck = { riskScore: 0, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };

    const { outcome } = makeDecision(expense);
    expect(outcome).toBe("APPROVED");
  });

  it("should REJECT on validation failure", () => {
    const expense = validExpense();
    expense.validation = { passed: false, errors: ["Invalid amount"], validatedAt: "" };

    const { outcome } = makeDecision(expense);
    expect(outcome).toBe("REJECTED");
  });

  it("should require MANUAL REVIEW for medium fraud risk", () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = { passed: true, violations: [], checkedAt: "" };
    expense.fraudCheck = {
      riskScore: 45,
      riskLevel: "MEDIUM",
      riskFlags: ["Suspicious pattern"],
      analyzedAt: "",
    };

    const { outcome } = makeDecision(expense);
    expect(outcome).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("should REJECT when missing check results", () => {
    const expense = validExpense();
    // No validation, policyCheck, or fraudCheck
    const { outcome } = makeDecision(expense);
    expect(outcome).toBe("REJECTED");
  });

  it("should require MANUAL REVIEW for receipt violation", () => {
    const expense = validExpense();
    expense.validation = { passed: true, errors: [], validatedAt: "" };
    expense.policyCheck = {
      passed: false,
      violations: ["Receipt required for expenses over $25.00"],
      checkedAt: "",
    };
    expense.fraudCheck = { riskScore: 5, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };

    const { outcome } = makeDecision(expense);
    expect(outcome).toBe("NEEDS_MANUAL_REVIEW");
  });
});

// ---------------------------------------------------------------------------
// Parallel merge tests
// ---------------------------------------------------------------------------

describe("mergeParallelResults()", () => {
  it("should merge two dictionaries", () => {
    const result = mergeParallelResults([
      { expenseId: "EXP-1", policyCheck: { passed: true } },
      { expenseId: "EXP-1", fraudCheck: { riskLevel: "LOW" } },
    ]);
    expect(result).toHaveProperty("policyCheck");
    expect(result).toHaveProperty("fraudCheck");
  });

  it("should handle empty array", () => {
    const result = mergeParallelResults([]);
    expect(result).toEqual({});
  });

  it("should skip non-object items", () => {
    const result = mergeParallelResults(["not an object", { key: "value" }]);
    expect(result).toEqual({ key: "value" });
  });
});
