import { handler, checkPolicy, CATEGORY_LIMITS } from "../../src/handlers/policyCheck";
import { ExpenseEvent } from "../../src/models/expense";

function validExpense(): ExpenseEvent {
  return {
    expenseId: "EXP-TEST001", employeeId: "EMP-001", amount: 45.0,
    category: "meals", description: "Team lunch", receiptProvided: true,
    submittedAt: "2026-02-08T10:00:00Z", correlationId: "corr-001",
  };
}

describe("PolicyCheck handler", () => {
  it("should pass a compliant expense", async () => {
    const result = await handler(validExpense(), {});
    expect(result.policyCheck?.passed).toBe(true);
    expect(result.policyCheck?.violations).toEqual([]);
  });
});

describe("checkPolicy()", () => {
  it("should pass within limit", () => { expect(checkPolicy({ amount: 50, category: "meals", receiptProvided: true }).filter((v) => v.includes("exceeds"))).toHaveLength(0); });
  it("should flag over limit", () => { expect(checkPolicy({ amount: 200, category: "meals", receiptProvided: true }).some((v) => v.includes("exceeds"))).toBe(true); });
  it("should require receipt above $25", () => { expect(checkPolicy({ amount: 30, category: "travel", receiptProvided: false }).some((v) => v.includes("Receipt"))).toBe(true); });
  it("should not require receipt below $25", () => { expect(checkPolicy({ amount: 20, category: "travel", receiptProvided: false }).some((v) => v.includes("Receipt"))).toBe(false); });
  it("should flag high-scrutiny category", () => { expect(checkPolicy({ amount: 200, category: "client_entertainment", receiptProvided: true }).some((v) => v.includes("additional review"))).toBe(true); });
  it("should validate all categories have limits", () => {
    for (const [cat, lim] of Object.entries(CATEGORY_LIMITS)) {
      expect(checkPolicy({ amount: lim * 0.5, category: cat, receiptProvided: true }).filter((v) => v.includes("exceeds"))).toHaveLength(0);
      expect(checkPolicy({ amount: lim + 1, category: cat, receiptProvided: true }).filter((v) => v.includes("exceeds")).length).toBeGreaterThan(0);
    }
  });
  it("should support multiple violations", () => { expect(checkPolicy({ amount: 200, category: "miscellaneous", receiptProvided: false }).length).toBeGreaterThanOrEqual(2); });
});
