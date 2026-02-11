import { handler, analyzeFraudRisk } from "../../src/handlers/fraudHeuristic";
import { ExpenseEvent } from "../../src/models/expense";

function validExpense(): ExpenseEvent {
  return {
    expenseId: "EXP-TEST001", employeeId: "EMP-001", amount: 45.0,
    category: "meals", description: "Team lunch at downtown restaurant",
    receiptProvided: true, submittedAt: "2026-02-08T10:00:00Z", correlationId: "corr-001",
  };
}

describe("FraudHeuristic handler", () => {
  it("should return fraudCheck block", async () => {
    const r = await handler(validExpense(), {});
    expect(r.fraudCheck).toBeDefined();
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(r.fraudCheck!.riskLevel);
  });
  it("should preserve correlationId", async () => {
    expect((await handler(validExpense(), {})).correlationId).toBe("corr-001");
  });
});

describe("analyzeFraudRisk()", () => {
  it("low risk for normal expense", () => { const { riskScore } = analyzeFraudRisk({ amount: 45.5, description: "Team lunch at restaurant downtown", category: "meals", receiptProvided: true }); expect(riskScore).toBeLessThan(30); });
  it("flags round amounts", () => { expect(analyzeFraudRisk({ amount: 500.0, description: "Office supplies for the quarter", category: "office_supplies", receiptProvided: true }).riskFlags.some((f) => f.includes("round"))).toBe(true); });
  it("detects threshold gaming", () => { expect(analyzeFraudRisk({ amount: 24.99, description: "Supplies from store nearby", category: "office_supplies", receiptProvided: false }).riskFlags.some((f) => f.includes("threshold"))).toBe(true); });
  it("flags suspicious keywords", () => { expect(analyzeFraudRisk({ amount: 45.5, description: "test expense for testing", category: "meals", receiptProvided: true }).riskFlags.some((f) => f.includes("keyword"))).toBe(true); });
  it("flags short descriptions", () => { expect(analyzeFraudRisk({ amount: 45.5, description: "lunch", category: "meals", receiptProvided: true }).riskFlags.some((f) => f.includes("short"))).toBe(true); });
  it("flags high amount without receipt", () => { expect(analyzeFraudRisk({ amount: 250, description: "Transportation for client meeting today", category: "transportation", receiptProvided: false }).riskFlags.some((f) => f.includes("without receipt"))).toBe(true); });
  it("caps at 100", () => { expect(analyzeFraudRisk({ amount: 500.0, description: "test", category: "meals", receiptProvided: false }).riskScore).toBeLessThanOrEqual(100); });
  it("flags category mismatch", () => { expect(analyzeFraudRisk({ amount: 200, description: "Expensive meal for one person high-end", category: "meals", receiptProvided: true }).riskFlags.some((f) => f.includes("typical"))).toBe(true); });
});
