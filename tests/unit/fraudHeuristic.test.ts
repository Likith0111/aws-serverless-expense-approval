/**
 * Unit tests for the FraudHeuristic Lambda handler.
 */

import { handler, analyzeFraudRisk } from "../../src/handlers/fraudHeuristic";
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

describe("FraudHeuristic handler", () => {
  it("should return a fraudCheck block", async () => {
    const result = await handler(validExpense(), {});
    expect(result.fraudCheck).toBeDefined();
    expect(result.fraudCheck!.riskScore).toBeDefined();
    expect(result.fraudCheck!.riskLevel).toBeDefined();
    expect(result.fraudCheck!.riskFlags).toBeDefined();
    expect(result.fraudCheck!.analyzedAt).toBeDefined();
  });

  it("should preserve original fields", async () => {
    const expense = validExpense();
    const result = await handler(expense, {});
    expect(result.amount).toBe(expense.amount);
    expect(result.category).toBe(expense.category);
  });

  it("should return a valid risk level", async () => {
    const result = await handler(validExpense(), {});
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.fraudCheck!.riskLevel);
  });
});

// ---------------------------------------------------------------------------
// Core heuristic logic tests
// ---------------------------------------------------------------------------

describe("analyzeFraudRisk()", () => {
  it("should assign low risk to a normal expense", () => {
    const { riskScore, riskFlags } = analyzeFraudRisk({
      amount: 45.5,
      description: "Team lunch at restaurant downtown with colleagues",
      category: "meals",
      receiptProvided: true,
    });
    expect(riskScore).toBeLessThan(30);
    expect(riskFlags).toHaveLength(0);
  });

  it("should flag round amounts", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 500.0,
      description: "Office supplies for the quarter from vendor",
      category: "office_supplies",
      receiptProvided: true,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("round amount"))).toBe(true);
  });

  it("should detect threshold gaming", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 24.99,
      description: "Supplies from the office supply store nearby",
      category: "office_supplies",
      receiptProvided: false,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("threshold"))).toBe(true);
  });

  it("should flag suspicious keywords", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 45.5,
      description: "test expense for testing purposes only",
      category: "meals",
      receiptProvided: true,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("keyword"))).toBe(true);
  });

  it("should flag short descriptions", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 45.5,
      description: "lunch",
      category: "meals",
      receiptProvided: true,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("short"))).toBe(true);
  });

  it("should flag high amounts without receipt", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 250,
      description: "Transportation for client meeting across town today",
      category: "transportation",
      receiptProvided: false,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("without receipt"))).toBe(true);
  });

  it("should not flag low amounts without receipt", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 15,
      description: "Small office supply purchase from store nearby",
      category: "office_supplies",
      receiptProvided: false,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("without receipt"))).toBe(false);
  });

  it("should elevate score with multiple flags", () => {
    const { riskScore, riskFlags } = analyzeFraudRisk({
      amount: 500.0,
      description: "test expense",
      category: "miscellaneous",
      receiptProvided: false,
    });
    expect(riskScore).toBeGreaterThanOrEqual(30);
    expect(riskFlags.length).toBeGreaterThanOrEqual(2);
  });

  it("should cap risk score at 100", () => {
    const { riskScore } = analyzeFraudRisk({
      amount: 500.0,
      description: "test",
      category: "meals",
      receiptProvided: false,
    });
    expect(riskScore).toBeLessThanOrEqual(100);
  });

  it("should flag category-amount mismatch", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 200,
      description: "Expensive meal for one person at high-end restaurant",
      category: "meals",
      receiptProvided: true,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("typical"))).toBe(true);
  });

  it("should not flag categories without defined norms", () => {
    const { riskFlags } = analyzeFraudRisk({
      amount: 1500,
      description: "Flight and hotel for conference attendance this month",
      category: "travel",
      receiptProvided: true,
    });
    expect(riskFlags.some((f) => f.toLowerCase().includes("typical"))).toBe(false);
  });
});
