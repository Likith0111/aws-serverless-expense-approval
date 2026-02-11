import { handler, makeDecision, mergeParallelResults } from "../../src/handlers/decision";
import { resetInMemoryStore } from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

function validExpense(): ExpenseEvent {
  return {
    expenseId: "EXP-TEST001", employeeId: "EMP-001", amount: 45.0,
    category: "meals", description: "Team lunch", receiptProvided: true,
    submittedAt: "2026-02-08T10:00:00Z", correlationId: "corr-001",
  };
}

describe("Decision handler", () => {
  beforeEach(() => resetInMemoryStore());

  it("should APPROVE valid expense", async () => {
    const e = validExpense();
    e.validation = { passed: true, errors: [], validatedAt: "" };
    e.policyCheck = { passed: true, violations: [], checkedAt: "" };
    e.fraudCheck = { riskScore: 10, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };
    const r = await handler(e, {});
    expect(r.decision?.outcome).toBe("APPROVED");
    expect(r.status).toBe("APPROVED");
  });

  it("should REJECT on validation failure", async () => {
    const e = validExpense();
    e.validation = { passed: false, errors: ["Missing field"], validatedAt: "" };
    expect((await handler(e, {})).decision?.outcome).toBe("REJECTED");
  });

  it("should REJECT on limit violation", async () => {
    const e = validExpense();
    e.validation = { passed: true, errors: [], validatedAt: "" };
    e.policyCheck = { passed: false, violations: ["Amount $5000 exceeds meals limit"], checkedAt: "" };
    e.fraudCheck = { riskScore: 10, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };
    expect((await handler(e, {})).decision?.outcome).toBe("REJECTED");
  });

  it("should NEEDS_MANUAL_REVIEW on high fraud", async () => {
    const e = validExpense();
    e.validation = { passed: true, errors: [], validatedAt: "" };
    e.policyCheck = { passed: true, violations: [], checkedAt: "" };
    e.fraudCheck = { riskScore: 65, riskLevel: "HIGH", riskFlags: ["Suspicious"], analyzedAt: "" };
    expect((await handler(e, {})).decision?.outcome).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("should FAILED_PROCESSING on workflow error", async () => {
    const e = validExpense();
    e.error = { Error: "TestError", Cause: "Simulated failure" };
    const r = await handler(e, {});
    expect(r.decision?.outcome).toBe("FAILED_PROCESSING");
    expect(r.status).toBe("FAILED_PROCESSING");
  });

  it("should handle Parallel state array input", async () => {
    const base = validExpense();
    base.validation = { passed: true, errors: [], validatedAt: "" };
    const b1 = { ...base, policyCheck: { passed: true, violations: [] as string[], checkedAt: "" } };
    const b2 = { ...base, fraudCheck: { riskScore: 5, riskLevel: "LOW" as const, riskFlags: [] as string[], analyzedAt: "" } };
    expect((await handler([b1, b2], {})).decision?.outcome).toBe("APPROVED");
  });

  it("should enforce idempotency", async () => {
    const e = validExpense();
    e.expenseId = "EXP-IDEM";
    e.validation = { passed: true, errors: [], validatedAt: "" };
    e.policyCheck = { passed: true, violations: [], checkedAt: "" };
    e.fraudCheck = { riskScore: 0, riskLevel: "LOW", riskFlags: [], analyzedAt: "" };
    await handler(e, {});
    const r2 = await handler({ ...e }, {});
    expect(r2.decision?.outcome).toBe("APPROVED");
  });
});

describe("makeDecision()", () => {
  it("APPROVE all clear", () => { const e = validExpense(); e.validation = { passed: true, errors: [], validatedAt: "" }; e.policyCheck = { passed: true, violations: [], checkedAt: "" }; e.fraudCheck = { riskScore: 0, riskLevel: "LOW", riskFlags: [], analyzedAt: "" }; expect(makeDecision(e).outcome).toBe("APPROVED"); });
  it("REJECT missing checks (safe defaults)", () => { expect(makeDecision(validExpense()).outcome).toBe("REJECTED"); });
  it("FAILED_PROCESSING on error", () => { const e = validExpense(); e.error = { Error: "Err", Cause: "Test" }; expect(makeDecision(e).outcome).toBe("FAILED_PROCESSING"); });
});

describe("mergeParallelResults()", () => {
  it("merges two dicts", () => { const r = mergeParallelResults([{ expenseId: "1", policyCheck: { passed: true } }, { expenseId: "1", fraudCheck: { riskLevel: "LOW" } }]); expect(r).toHaveProperty("policyCheck"); expect(r).toHaveProperty("fraudCheck"); });
  it("handles empty array", () => { expect(mergeParallelResults([])).toEqual({}); });
  it("skips non-objects", () => { expect(mergeParallelResults(["str", { key: "val" }])).toEqual({ key: "val" }); });
});
