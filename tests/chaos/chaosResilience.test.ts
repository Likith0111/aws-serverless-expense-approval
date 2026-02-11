/**
 * Chaos resilience tests.
 *
 * These tests verify that the workflow handles transient failures
 * correctly by exercising:
 *   1. FraudHeuristic chaos injection (amounts ending in .13)
 *   2. Retry logic in the local workflow runner
 *   3. Compensation (FAILED_PROCESSING) when retries are exhausted
 *
 * The chaos mode is deterministic: the same input always produces
 * the same failure, making tests repeatable.
 */

import { handler as fraudHandler } from "../../src/handlers/fraudHeuristic";
import { handler as validateHandler } from "../../src/handlers/validateExpense";
import { handler as policyHandler } from "../../src/handlers/policyCheck";
import { handler as decisionHandler } from "../../src/handlers/decision";
import { resetInMemoryStore, getExpense } from "../../src/utils/dynamo";
import { config } from "../../src/utils/config";
import { ExpenseEvent } from "../../src/models/expense";

function chaosExpense(amount: number): ExpenseEvent {
  return {
    expenseId: `EXP-CHAOS-${amount}`, employeeId: "EMP-CHAOS",
    amount, category: "travel", description: "Business trip for testing chaos",
    receiptProvided: true, submittedAt: "2026-02-08T10:00:00Z",
    correlationId: "corr-chaos", workflowVersion: "V1",
  };
}

// ---------------------------------------------------------------------------
// Retry helper (mirrors server.ts)
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, max: number): Promise<T> {
  let last: Error | undefined;
  for (let i = 1; i <= max; i++) {
    try { return await fn(); } catch (e) { last = e instanceof Error ? e : new Error(String(e)); }
  }
  throw last;
}

async function runWorkflowWithChaos(input: ExpenseEvent): Promise<ExpenseEvent> {
  const ctx = {};
  try {
    let r = await validateHandler(input, ctx);
    if (!r.validation?.passed) return await decisionHandler(r, ctx);
    r = await policyHandler(r, ctx);
    r = await withRetry(() => fraudHandler(r, ctx), 3);
    return await decisionHandler(r, ctx);
  } catch (err) {
    input.error = { Error: "WorkflowExecutionError", Cause: String(err) };
    return await decisionHandler(input, ctx);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Chaos resilience", () => {
  const origChaos = (config as Record<string, unknown>).chaosEnabled;

  beforeEach(() => {
    resetInMemoryStore();
    (config as Record<string, unknown>).chaosEnabled = true;
  });

  afterEach(() => {
    (config as Record<string, unknown>).chaosEnabled = origChaos;
  });

  it("FraudHeuristic throws on .13 amounts when chaos enabled", async () => {
    await expect(fraudHandler(chaosExpense(100.13), {})).rejects.toThrow("CHAOS_INJECTION");
  });

  it("FraudHeuristic succeeds on normal amounts in chaos mode", async () => {
    const r = await fraudHandler(chaosExpense(100.50), {});
    expect(r.fraudCheck).toBeDefined();
  });

  it("FAILED_PROCESSING after all retries exhausted", async () => {
    // Amount .13 triggers chaos. 3 retries in withRetry -> all fail -> compensation.
    const r = await runWorkflowWithChaos(chaosExpense(100.13));
    expect(r.decision?.outcome).toBe("FAILED_PROCESSING");
    expect(r.status).toBe("FAILED_PROCESSING");
    const stored = await getExpense(`EXP-CHAOS-${100.13}`);
    expect(stored?.status).toBe("FAILED_PROCESSING");
  });

  it("non-.13 amounts process normally even in chaos mode", async () => {
    const r = await runWorkflowWithChaos(chaosExpense(100.50));
    expect(r.decision?.outcome).toBe("APPROVED");
  });

  it("chaos disabled does not fail .13 amounts", async () => {
    (config as Record<string, unknown>).chaosEnabled = false;
    const r = await fraudHandler(chaosExpense(100.13), {});
    expect(r.fraudCheck).toBeDefined();
  });

  it("retry succeeds if failure is intermittent (simulated)", async () => {
    // Manually simulate: first call fails, second succeeds.
    let calls = 0;
    const intermittentFn = async () => {
      calls++;
      if (calls === 1) throw new Error("Transient failure");
      return "success";
    };
    const result = await withRetry(intermittentFn, 3);
    expect(result).toBe("success");
    expect(calls).toBe(2);
  });
});
