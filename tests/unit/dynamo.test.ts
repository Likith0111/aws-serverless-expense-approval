import {
  storeExpenseDecision, getExpense, getExpensesByEmployee,
  deleteExpense, updateExpenseStatus, resetInMemoryStore,
} from "../../src/utils/dynamo";
import { ExpenseEvent } from "../../src/models/expense";

function makeExpense(overrides: Partial<ExpenseEvent> = {}): ExpenseEvent {
  return {
    expenseId: "EXP-D001", employeeId: "EMP-001", amount: 50,
    category: "meals", description: "Test", receiptProvided: true,
    submittedAt: "2026-02-08T10:00:00Z", status: "APPROVED", ...overrides,
  };
}

describe("DynamoDB utility", () => {
  beforeEach(() => resetInMemoryStore());

  describe("storeExpenseDecision()", () => {
    it("stores and returns true", async () => { expect(await storeExpenseDecision(makeExpense())).toBe(true); });
    it("blocks duplicates", async () => {
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-DUP" }));
      expect(await storeExpenseDecision(makeExpense({ expenseId: "EXP-DUP" }))).toBe(false);
    });
  });

  describe("getExpense()", () => {
    it("retrieves stored record", async () => {
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-G1" }));
      const r = await getExpense("EXP-G1");
      expect(r).not.toBeNull();
      expect(r!.expenseId).toBe("EXP-G1");
    });
    it("returns null for missing", async () => { expect(await getExpense("NOPE")).toBeNull(); });
  });

  describe("getExpensesByEmployee() -- pagination", () => {
    it("returns expenses for an employee", async () => {
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-E1", employeeId: "EMP-100" }));
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-E2", employeeId: "EMP-100" }));
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-E3", employeeId: "EMP-200" }));
      const r = await getExpensesByEmployee("EMP-100");
      expect(r.expenses).toHaveLength(2);
    });

    it("returns empty for unknown employee", async () => {
      const r = await getExpensesByEmployee("NOBODY");
      expect(r.expenses).toEqual([]);
    });

    it("paginates when exceeding page size", async () => {
      // PAGE_SIZE is set to 5 in test setup.
      for (let i = 0; i < 8; i++) {
        await storeExpenseDecision(makeExpense({
          expenseId: `EXP-PG-${i}`,
          employeeId: "EMP-PAGINATE",
          submittedAt: `2026-02-0${i + 1}T10:00:00Z`,
        }));
      }
      const page1 = await getExpensesByEmployee("EMP-PAGINATE");
      expect(page1.expenses.length).toBeLessThanOrEqual(5);
      expect(page1.nextToken).toBeDefined();

      const page2 = await getExpensesByEmployee("EMP-PAGINATE", page1.nextToken);
      expect(page2.expenses.length).toBeGreaterThan(0);
      expect(page1.expenses.length + page2.expenses.length).toBe(8);
    });
  });

  describe("updateExpenseStatus()", () => {
    it("updates existing record", async () => {
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-U1", status: "PENDING_REVIEW" }));
      const r = await updateExpenseStatus("EXP-U1", { status: "APPROVED" });
      expect(r).not.toBeNull();
      expect(r!.status).toBe("APPROVED");
      expect(r!.updatedAt).toBeDefined();
    });
    it("returns null for missing", async () => { expect(await updateExpenseStatus("NOPE", { status: "X" })).toBeNull(); });
  });

  describe("deleteExpense()", () => {
    it("deletes existing", async () => {
      await storeExpenseDecision(makeExpense({ expenseId: "EXP-DEL" }));
      expect(await deleteExpense("EXP-DEL")).toBe(true);
      expect(await getExpense("EXP-DEL")).toBeNull();
    });
    it("returns false for missing", async () => { expect(await deleteExpense("GHOST")).toBe(false); });
  });
});
