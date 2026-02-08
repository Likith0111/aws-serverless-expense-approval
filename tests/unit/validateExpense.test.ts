/**
 * Unit tests for the ValidateExpense Lambda handler.
 */

import { handler, validate } from "../../src/handlers/validateExpense";
import { ExpenseEvent, ALLOWED_CATEGORIES } from "../../src/models/expense";

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

describe("ValidateExpense handler", () => {
  it("should pass a valid expense", async () => {
    const result = await handler(validExpense(), {});
    expect(result.validation?.passed).toBe(true);
    expect(result.validation?.errors).toEqual([]);
    expect(result.validation?.validatedAt).toBeDefined();
  });

  it("should preserve original fields", async () => {
    const expense = validExpense();
    const result = await handler(expense, {});
    expect(result.expenseId).toBe(expense.expenseId);
    expect(result.amount).toBe(expense.amount);
    expect(result.category).toBe(expense.category);
  });

  it("should fail an expense with missing fields", async () => {
    const expense = { expenseId: "EXP-X", employeeId: "EMP-1", amount: 50 } as ExpenseEvent;
    const result = await handler(expense, {});
    expect(result.validation?.passed).toBe(false);
    expect(result.validation!.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Core validation logic tests
// ---------------------------------------------------------------------------

describe("validate()", () => {
  it("should accept all valid fields", () => {
    expect(validate(validExpense())).toEqual([]);
  });

  it("should flag missing category", () => {
    const exp: Record<string, unknown> = {
      employeeId: "EMP-001",
      amount: 50,
      description: "Some description here",
      receiptProvided: true,
    };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("should flag missing multiple fields", () => {
    const exp: Record<string, unknown> = { employeeId: "EMP-001", amount: 50 };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("category"))).toBe(true);
    expect(errors.some((e) => e.includes("description"))).toBe(true);
    expect(errors.some((e) => e.includes("receiptProvided"))).toBe(true);
  });

  it("should flag negative amount", () => {
    const exp = { ...validExpense(), amount: -10 };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("greater than zero"))).toBe(true);
  });

  it("should flag zero amount", () => {
    const exp = { ...validExpense(), amount: 0 };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("greater than zero"))).toBe(true);
  });

  it("should flag amount exceeding maximum", () => {
    const exp = { ...validExpense(), amount: 15000 };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("exceeds maximum"))).toBe(true);
  });

  it("should flag invalid category", () => {
    const exp = { ...validExpense(), category: "gambling" };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("Invalid category"))).toBe(true);
  });

  it("should accept all valid categories", () => {
    for (const category of ALLOWED_CATEGORIES) {
      const exp = { ...validExpense(), category };
      expect(validate(exp)).toEqual([]);
    }
  });

  it("should flag short description", () => {
    const exp = { ...validExpense(), description: "ab" };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("at least 3 characters"))).toBe(true);
  });

  it("should flag non-boolean receiptProvided", () => {
    const exp = { ...validExpense(), receiptProvided: "yes" as unknown as boolean };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("boolean"))).toBe(true);
  });

  it("should flag empty employeeId", () => {
    const exp = { ...validExpense(), employeeId: "" };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("non-empty"))).toBe(true);
  });

  it("should flag non-numeric amount", () => {
    const exp = { ...validExpense(), amount: "fifty" as unknown as number };
    const errors = validate(exp);
    expect(errors.some((e) => e.includes("must be a number"))).toBe(true);
  });
});
