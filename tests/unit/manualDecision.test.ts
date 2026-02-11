import { handleManualDecision } from "../../src/handlers/manualDecision";
import { storeExpenseDecision, resetInMemoryStore } from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

function pendingExpense(overrides: Partial<ExpenseEvent> = {}): ExpenseEvent {
  return {
    expenseId: "EXP-MAN001", employeeId: "EMP-001", amount: 75.0,
    category: "client_entertainment", description: "Dinner with client",
    receiptProvided: true, submittedAt: "2026-02-08T10:00:00Z",
    status: "NEEDS_MANUAL_REVIEW", correlationId: "corr-manual",
    decision: { outcome: "NEEDS_MANUAL_REVIEW", reasons: ["High fraud risk"], decidedAt: "2026-02-08T10:01:00Z" },
    ...overrides,
  };
}

describe("ManualDecision handler", () => {
  beforeEach(() => resetInMemoryStore());

  it("should approve a pending expense", async () => {
    await storeExpenseDecision(pendingExpense());
    const r = await handleManualDecision("EXP-MAN001", { decision: "APPROVED", reason: "Verified with employee", reviewedBy: "mgr@co.com" });
    expect(r.success).toBe(true);
    expect(r.expense?.status).toBe("APPROVED");
    expect(r.expense?.decision?.manualOverride).toBe(true);
    expect(r.expense?.decision?.reviewedBy).toBe("mgr@co.com");
  });

  it("should reject a pending expense", async () => {
    await storeExpenseDecision(pendingExpense());
    const r = await handleManualDecision("EXP-MAN001", { decision: "REJECTED", reason: "Receipt is forged" });
    expect(r.success).toBe(true);
    expect(r.expense?.status).toBe("REJECTED");
  });

  it("should work with PENDING_REVIEW status (V2)", async () => {
    await storeExpenseDecision(pendingExpense({ status: "PENDING_REVIEW" }));
    const r = await handleManualDecision("EXP-MAN001", { decision: "APPROVED", reason: "Looks good" });
    expect(r.success).toBe(true);
  });

  it("should fail for non-existent expense", async () => {
    const r = await handleManualDecision("EXP-GHOST", { decision: "APPROVED", reason: "test" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("not found");
  });

  it("should fail for already approved expense", async () => {
    await storeExpenseDecision(pendingExpense({ status: "APPROVED" }));
    const r = await handleManualDecision("EXP-MAN001", { decision: "REJECTED", reason: "too late" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("not pending review");
  });

  it("should reject invalid decision value", async () => {
    await storeExpenseDecision(pendingExpense());
    const r = await handleManualDecision("EXP-MAN001", { decision: "MAYBE" as "APPROVED", reason: "unsure" });
    expect(r.success).toBe(false);
  });

  it("should reject empty reason", async () => {
    await storeExpenseDecision(pendingExpense());
    const r = await handleManualDecision("EXP-MAN001", { decision: "APPROVED", reason: "" });
    expect(r.success).toBe(false);
  });
});
