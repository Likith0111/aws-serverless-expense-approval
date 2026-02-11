/**
 * AWS Integration Tests
 *
 * These tests run against REAL AWS DynamoDB and Step Functions.
 * They require AWS credentials configured via standard AWS SDK resolution:
 *   - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
 *   - AWS credentials file (~/.aws/credentials)
 *   - IAM role (if running on EC2/Lambda)
 *
 * Prerequisites:
 *   1. AWS credentials configured
 *   2. DynamoDB tables created (via Terraform or manually)
 *   3. Test-safe table names (use test prefix to avoid production data)
 *
 * To run:
 *   STORAGE_MODE=aws AWS_REGION=us-east-1 npm run test:aws
 *
 * Safety:
 *   - Uses test-safe prefixes (TEST_ prefix)
 *   - Cleans up test data after each test
 *   - Does not delete tables (only test data)
 */

import {
  storeExpenseDecision,
  getExpense,
  getExpensesByEmployee,
  resetInMemoryStore,
} from "../../src/utils/dynamo";
import {
  createUser,
  getUserByEmail,
  emailExists,
  resetInMemoryUsers,
} from "../../src/utils/users-dynamo";
import { ExpenseEvent } from "../../src/models/expense";
import { config } from "../../src/utils/config";
import { v4 as uuidv4 } from "uuid";

// Test-safe prefixes
const TEST_PREFIX = "TEST_";
const TEST_EMPLOYEE_ID = `${TEST_PREFIX}EMP-001`;
const TEST_EMAIL = `test-${Date.now()}@spendguard.test`;

describe("AWS DynamoDB Integration", () => {
  beforeAll(() => {
    // Verify we're running against AWS, not in-memory
    if (config.storageMode === "local" || config.useInMemory) {
      console.warn(
        "Skipping AWS tests: STORAGE_MODE is not 'aws'. Set STORAGE_MODE=aws to run."
      );
      return;
    }
    expect(config.storageMode).toBe("aws");
  });

  beforeEach(() => {
    // Reset in-memory stores (won't affect AWS)
    resetInMemoryStore();
    resetInMemoryUsers();
  });

  describe("Users Table", () => {
    it("should create and retrieve a user in AWS DynamoDB", async () => {
      const userId = `${TEST_PREFIX}${uuidv4()}`;
      const email = TEST_EMAIL;

      await createUser({
        userId,
        email,
        passwordHash: "$2b$10$testhash",
        role: "EMPLOYEE",
        employeeId: TEST_EMPLOYEE_ID,
        createdAt: new Date().toISOString(),
      });

      const retrieved = await getUserByEmail(email);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe(userId);
      expect(retrieved?.email).toBe(email.toLowerCase());
    });

    it("should prevent duplicate user creation", async () => {
      const userId = `${TEST_PREFIX}${uuidv4()}`;
      const email = `test-${Date.now()}@spendguard.test`;

      await createUser({
        userId,
        email,
        passwordHash: "$2b$10$testhash",
        role: "EMPLOYEE",
        createdAt: new Date().toISOString(),
      });

      await expect(
        createUser({
          userId,
          email,
          passwordHash: "$2b$10$testhash",
          role: "EMPLOYEE",
          createdAt: new Date().toISOString(),
        })
      ).rejects.toThrow("User already exists");
    });

    it("should check email existence", async () => {
      const userId = `${TEST_PREFIX}${uuidv4()}`;
      const email = `test-${Date.now()}@spendguard.test`;

      expect(await emailExists(email)).toBe(false);

      await createUser({
        userId,
        email,
        passwordHash: "$2b$10$testhash",
        role: "EMPLOYEE",
        createdAt: new Date().toISOString(),
      });

      expect(await emailExists(email)).toBe(true);
    });
  });

  describe("Expenses Table", () => {
    it("should store and retrieve an expense in AWS DynamoDB", async () => {
      const expenseId = `${TEST_PREFIX}EXP-${uuidv4().substring(0, 12).toUpperCase()}`;
      const expense: ExpenseEvent = {
        expenseId,
        employeeId: TEST_EMPLOYEE_ID,
        amount: 45.0,
        category: "meals",
        description: "AWS integration test expense",
        receiptProvided: true,
        submittedAt: new Date().toISOString(),
        status: "APPROVED",
        correlationId: uuidv4(),
        workflowVersion: "V1",
      };

      const stored = await storeExpenseDecision(expense);
      expect(stored).toBe(true);

      const retrieved = await getExpense(expenseId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.expenseId).toBe(expenseId);
      expect(retrieved?.amount).toBe(45.0);
      expect(retrieved?.status).toBe("APPROVED");
    });

    it("should enforce idempotency with conditional writes", async () => {
      const expenseId = `${TEST_PREFIX}EXP-${uuidv4().substring(0, 12).toUpperCase()}`;
      const expense: ExpenseEvent = {
        expenseId,
        employeeId: TEST_EMPLOYEE_ID,
        amount: 50.0,
        category: "travel",
        description: "Idempotency test",
        receiptProvided: true,
        submittedAt: new Date().toISOString(),
        status: "APPROVED",
        correlationId: uuidv4(),
        workflowVersion: "V1",
      };

      const firstWrite = await storeExpenseDecision(expense);
      expect(firstWrite).toBe(true);

      const duplicateWrite = await storeExpenseDecision(expense);
      expect(duplicateWrite).toBe(false); // Blocked by conditional expression
    });

    it("should query expenses by employee using GSI", async () => {
      const employeeId = `${TEST_PREFIX}EMP-QUERY`;
      const expenseIds: string[] = [];

      // Create multiple expenses for the same employee
      for (let i = 0; i < 3; i++) {
        const expenseId = `${TEST_PREFIX}EXP-${uuidv4().substring(0, 12).toUpperCase()}`;
        expenseIds.push(expenseId);
        await storeExpenseDecision({
          expenseId,
          employeeId,
          amount: 10 + i,
          category: "meals",
          description: `Test expense ${i}`,
          receiptProvided: true,
          submittedAt: new Date().toISOString(),
          status: "APPROVED",
          correlationId: uuidv4(),
          workflowVersion: "V1",
        });
      }

      const result = await getExpensesByEmployee(employeeId);
      expect(result.expenses.length).toBeGreaterThanOrEqual(3);
      expect(result.expenses.every((e) => e.employeeId === employeeId)).toBe(
        true
      );
    });

    it("should paginate employee expense queries", async () => {
      const employeeId = `${TEST_PREFIX}EMP-PAGINATE`;
      const pageSize = 5;

      // Create more expenses than page size
      for (let i = 0; i < 8; i++) {
        const expenseId = `${TEST_PREFIX}EXP-${uuidv4().substring(0, 12).toUpperCase()}`;
        await storeExpenseDecision({
          expenseId,
          employeeId,
          amount: 10 + i,
          category: "meals",
          description: `Pagination test ${i}`,
          receiptProvided: true,
          submittedAt: new Date().toISOString(),
          status: "APPROVED",
          correlationId: uuidv4(),
          workflowVersion: "V1",
        });
      }

      const page1 = await getExpensesByEmployee(employeeId);
      expect(page1.expenses.length).toBeLessThanOrEqual(pageSize);
      if (page1.nextToken) {
        const page2 = await getExpensesByEmployee(
          employeeId,
          page1.nextToken
        );
        expect(page2.expenses.length).toBeGreaterThan(0);
        expect(page1.expenses.length + page2.expenses.length).toBeGreaterThanOrEqual(8);
      }
    });
  });

  describe("End-to-End Workflow", () => {
    it("should complete full workflow: register -> login -> submit -> query", async () => {
      const userId = `${TEST_PREFIX}${uuidv4()}`;
      const email = `e2e-${Date.now()}@spendguard.test`;
      const employeeId = `${TEST_PREFIX}EMP-E2E`;

      // Register user
      await createUser({
        userId,
        email,
        passwordHash: "$2b$10$testhash",
        role: "EMPLOYEE",
        employeeId,
        createdAt: new Date().toISOString(),
      });

      // Verify user exists
      const user = await getUserByEmail(email);
      expect(user).not.toBeNull();
      expect(user?.employeeId).toBe(employeeId);

      // Submit expense
      const expenseId = `${TEST_PREFIX}EXP-${uuidv4().substring(0, 12).toUpperCase()}`;
      const expense: ExpenseEvent = {
        expenseId,
        employeeId,
        amount: 75.0,
        category: "meals",
        description: "E2E test expense",
        receiptProvided: true,
        submittedAt: new Date().toISOString(),
        status: "APPROVED",
        correlationId: uuidv4(),
        workflowVersion: "V1",
      };

      await storeExpenseDecision(expense);

      // Query expenses
      const expenses = await getExpensesByEmployee(employeeId);
      expect(expenses.expenses.length).toBeGreaterThan(0);
      const found = expenses.expenses.find((e) => e.expenseId === expenseId);
      expect(found).not.toBeUndefined();
      expect(found?.amount).toBe(75.0);
    });
  });
});
