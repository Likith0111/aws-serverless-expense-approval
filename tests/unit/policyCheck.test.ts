/**
 * Unit tests for the PolicyCheck Lambda handler.
 */

import { handler, checkPolicy, CATEGORY_LIMITS } from "../../src/handlers/policyCheck";
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

describe("PolicyCheck handler", () => {
  it("should pass a compliant expense", async () => {
    const result = await handler(validExpense(), {});
    expect(result.policyCheck?.passed).toBe(true);
    expect(result.policyCheck?.violations).toEqual([]);
    expect(result.policyCheck?.checkedAt).toBeDefined();
  });

  it("should preserve original fields", async () => {
    const expense = validExpense();
    const result = await handler(expense, {});
    expect(result.employeeId).toBe(expense.employeeId);
  });
});

// ---------------------------------------------------------------------------
// Core policy logic tests
// ---------------------------------------------------------------------------

describe("checkPolicy()", () => {
  it("should pass within category limit", () => {
    const violations = checkPolicy({ amount: 50, category: "meals", receiptProvided: true });
    const limitViolations = violations.filter((v) => v.toLowerCase().includes("exceeds"));
    expect(limitViolations).toHaveLength(0);
  });

  it("should flag amount exceeding category limit", () => {
    const violations = checkPolicy({ amount: 200, category: "meals", receiptProvided: true });
    expect(violations.some((v) => v.includes("exceeds") && v.includes("meals"))).toBe(true);
  });

  it("should require receipt above $25", () => {
    const violations = checkPolicy({ amount: 30, category: "travel", receiptProvided: false });
    expect(violations.some((v) => v.includes("Receipt required"))).toBe(true);
  });

  it("should not require receipt below $25", () => {
    const violations = checkPolicy({ amount: 20, category: "travel", receiptProvided: false });
    expect(violations.some((v) => v.includes("Receipt"))).toBe(false);
  });

  it("should not flag receipt when provided", () => {
    const violations = checkPolicy({ amount: 100, category: "travel", receiptProvided: true });
    expect(violations.some((v) => v.includes("Receipt"))).toBe(false);
  });

  it("should flag high-scrutiny category", () => {
    const violations = checkPolicy({
      amount: 200,
      category: "client_entertainment",
      receiptProvided: true,
    });
    expect(violations.some((v) => v.includes("additional review"))).toBe(true);
  });

  it("should not flag high-scrutiny below threshold", () => {
    const violations = checkPolicy({
      amount: 100,
      category: "client_entertainment",
      receiptProvided: true,
    });
    expect(violations.some((v) => v.includes("additional review"))).toBe(false);
  });

  it("should validate all categories have limits", () => {
    for (const [category, limit] of Object.entries(CATEGORY_LIMITS)) {
      // Within limit
      const withinViolations = checkPolicy({
        amount: limit * 0.5,
        category,
        receiptProvided: true,
      });
      const withinLimit = withinViolations.filter((v) => v.includes("exceeds"));
      expect(withinLimit).toHaveLength(0);

      // Over limit
      const overViolations = checkPolicy({
        amount: limit + 1,
        category,
        receiptProvided: true,
      });
      const overLimit = overViolations.filter((v) => v.includes("exceeds"));
      expect(overLimit.length).toBeGreaterThan(0);
    }
  });

  it("should support multiple simultaneous violations", () => {
    const violations = checkPolicy({
      amount: 200,
      category: "miscellaneous",
      receiptProvided: false,
    });
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});
