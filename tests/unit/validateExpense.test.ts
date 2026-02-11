import { handler, validate } from "../../src/handlers/validateExpense";
import { ExpenseEvent, ALLOWED_CATEGORIES } from "../../src/models/expense";

function validExpense(): ExpenseEvent {
  return {
    expenseId: "EXP-TEST001", employeeId: "EMP-001", amount: 45.0,
    category: "meals", description: "Team lunch at downtown restaurant",
    receiptProvided: true, submittedAt: "2026-02-08T10:00:00Z", correlationId: "corr-001",
  };
}

describe("ValidateExpense handler", () => {
  it("should pass a valid expense", async () => {
    const result = await handler(validExpense(), {});
    expect(result.validation?.passed).toBe(true);
    expect(result.validation?.errors).toEqual([]);
  });

  it("should preserve correlationId", async () => {
    const result = await handler(validExpense(), {});
    expect(result.correlationId).toBe("corr-001");
  });

  it("should fail with missing fields", async () => {
    const expense = { expenseId: "EXP-X", employeeId: "EMP-1", amount: 50 } as ExpenseEvent;
    const result = await handler(expense, {});
    expect(result.validation?.passed).toBe(false);
  });
});

describe("validate()", () => {
  it("should accept all valid fields", () => { expect(validate(validExpense())).toEqual([]); });
  it("should flag missing category", () => {
    const errors = validate({ employeeId: "EMP-001", amount: 50, description: "Some desc", receiptProvided: true });
    expect(errors.some((e) => e.includes("category"))).toBe(true);
  });
  it("should flag negative amount", () => { expect(validate({ ...validExpense(), amount: -10 }).some((e) => e.includes("greater than zero"))).toBe(true); });
  it("should flag zero amount", () => { expect(validate({ ...validExpense(), amount: 0 }).some((e) => e.includes("greater than zero"))).toBe(true); });
  it("should flag amount exceeding max", () => { expect(validate({ ...validExpense(), amount: 15000 }).some((e) => e.includes("exceeds maximum"))).toBe(true); });
  it("should flag invalid category", () => { expect(validate({ ...validExpense(), category: "gambling" }).some((e) => e.includes("Invalid category"))).toBe(true); });
  it("should accept all valid categories", () => { for (const c of ALLOWED_CATEGORIES) expect(validate({ ...validExpense(), category: c })).toEqual([]); });
  it("should flag short description", () => { expect(validate({ ...validExpense(), description: "ab" }).some((e) => e.includes("at least 3"))).toBe(true); });
  it("should flag non-boolean receipt", () => { expect(validate({ ...validExpense(), receiptProvided: "yes" as unknown as boolean }).some((e) => e.includes("boolean"))).toBe(true); });
  it("should flag empty employeeId", () => { expect(validate({ ...validExpense(), employeeId: "" }).some((e) => e.includes("non-empty"))).toBe(true); });
  it("should flag non-numeric amount", () => { expect(validate({ ...validExpense(), amount: "x" as unknown as number }).some((e) => e.includes("must be a number"))).toBe(true); });
});
