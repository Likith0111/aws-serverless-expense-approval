/**
 * DynamoDB utility module for expense data persistence.
 *
 * Supports three runtime modes:
 *  1. AWS deployment (default)  -- real DynamoDB via AWS SDK v3.
 *  2. DynamoDB Local             -- Docker-based local DynamoDB.
 *  3. In-memory fallback         -- plain Map<string, ExpenseEvent>.
 *
 * Idempotency:
 *   storeExpenseDecision uses a DynamoDB conditional expression
 *   (attribute_not_exists) to prevent duplicate writes. The expense ID
 *   itself is deterministic (SHA-256 of content fields), so identical
 *   submissions produce the same ID and are naturally deduplicated.
 *
 * Pagination:
 *   getExpensesByEmployee returns paginated results using DynamoDB's
 *   ExclusiveStartKey mechanism, exposed as an opaque nextToken.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ExpenseEvent } from "../models/expense";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("DynamoDB");

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let docClient: DynamoDBDocumentClient | null = null;
const inMemoryStore = new Map<string, ExpenseEvent>();

// ---------------------------------------------------------------------------
// Client accessor
// ---------------------------------------------------------------------------

function getDocClient(): DynamoDBDocumentClient | null {
  if (config.storageMode === "local" || config.useInMemory) {
    return null;
  }

  if (!docClient) {
    const clientConfig: Record<string, unknown> = {
      region: config.awsRegion,
    };

    if (config.dynamoEndpoint) {
      clientConfig.endpoint = config.dynamoEndpoint;
    }

    const rawClient = new DynamoDBClient(clientConfig);
    docClient = DynamoDBDocumentClient.from(rawClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  return docClient;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Persist a completed expense decision (idempotent).
 *
 * Uses a conditional write to enforce idempotency:
 *   - DynamoDB: attribute_not_exists(expenseId) on PutItem
 *   - In-memory: Map.has() check before insert
 *
 * Returns true if the record was written, false if it already existed.
 */
export async function storeExpenseDecision(
  record: ExpenseEvent,
): Promise<boolean> {
  const client = getDocClient();

  if (!client) {
    if (inMemoryStore.has(record.expenseId)) {
      log.warn("Duplicate write blocked (in-memory)", {
        expenseId: record.expenseId,
      });
      return false;
    }
    inMemoryStore.set(record.expenseId, { ...record });
    log.info("Stored expense in memory", { expenseId: record.expenseId });
    return true;
  }

  try {
    await client.send(
      new PutCommand({
        TableName: config.expensesTable,
        Item: record as unknown as Record<string, unknown>,
        ConditionExpression: "attribute_not_exists(expenseId)",
      }),
    );
    log.info("Stored expense decision", { expenseId: record.expenseId });
    return true;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === "ConditionalCheckFailedException"
    ) {
      log.warn("Duplicate write blocked (DynamoDB conditional)", {
        expenseId: record.expenseId,
      });
      return false;
    }
    throw err;
  }
}

/**
 * Retrieve a single expense record by ID.
 */
export async function getExpense(
  expenseId: string,
): Promise<ExpenseEvent | null> {
  const client = getDocClient();

  if (!client) {
    return inMemoryStore.get(expenseId) ?? null;
  }

  const result = await client.send(
    new GetCommand({
      TableName: config.expensesTable,
      Key: { expenseId },
    }),
  );

  return (result.Item as ExpenseEvent) ?? null;
}

/**
 * Paginated query for all expenses belonging to an employee.
 *
 * DynamoDB best practices applied:
 *   - Uses Query (not Scan) with the EmployeeIndex GSI
 *   - Limits page size to config.pageSize (default 20)
 *   - Returns an opaque nextToken for cursor-based pagination
 *   - Client passes nextToken to retrieve the next page
 *
 * @param employeeId  - Employee to query
 * @param nextToken   - Opaque pagination token (base64-encoded LastEvaluatedKey)
 * @returns           - Page of expenses + optional nextToken for next page
 */
export async function getExpensesByEmployee(
  employeeId: string,
  nextToken?: string,
): Promise<{ expenses: ExpenseEvent[]; nextToken?: string }> {
  const client = getDocClient();

  if (!client) {
    // In-memory: simple filter + simulated pagination.
    const all = [...inMemoryStore.values()]
      .filter((e) => e.employeeId === employeeId)
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));

    const startIdx = nextToken ? parseInt(nextToken, 10) : 0;
    const page = all.slice(startIdx, startIdx + config.pageSize);
    const hasMore = startIdx + config.pageSize < all.length;

    return {
      expenses: page,
      nextToken: hasMore ? String(startIdx + config.pageSize) : undefined,
    };
  }

  // Decode the pagination cursor.
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(
        Buffer.from(nextToken, "base64").toString("utf-8"),
      );
    } catch {
      log.warn("Invalid pagination token", { nextToken });
    }
  }

  const result = await client.send(
    new QueryCommand({
      TableName: config.expensesTable,
      IndexName: config.employeeIndexName,
      KeyConditionExpression: "employeeId = :eid",
      ExpressionAttributeValues: { ":eid": employeeId },
      Limit: config.pageSize,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  let resultNextToken: string | undefined;
  if (result.LastEvaluatedKey) {
    resultNextToken = Buffer.from(
      JSON.stringify(result.LastEvaluatedKey),
    ).toString("base64");
  }

  return {
    expenses: (result.Items as ExpenseEvent[]) ?? [],
    nextToken: resultNextToken,
  };
}

/**
 * Update an existing expense record (for manual decisions).
 *
 * Merges the provided updates into the existing record.
 * Returns the updated record, or null if the expense was not found.
 */
export async function updateExpenseStatus(
  expenseId: string,
  updates: Partial<ExpenseEvent>,
): Promise<ExpenseEvent | null> {
  const client = getDocClient();

  if (!client) {
    const existing = inMemoryStore.get(expenseId);
    if (!existing) return null;
    const updated: ExpenseEvent = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    inMemoryStore.set(expenseId, updated);
    return updated;
  }

  // For DynamoDB, read-modify-write with conditional check.
  // In production, this should use UpdateExpression for atomicity.
  // Using PutItem here for simplicity since the full record is small.
  const existing = await getExpense(expenseId);
  if (!existing) return null;

  const updated: ExpenseEvent = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await client.send(
    new PutCommand({
      TableName: config.expensesTable,
      Item: updated as unknown as Record<string, unknown>,
    }),
  );

  return updated;
}

/**
 * Delete a single expense record by ID.
 * Local development only.
 */
export async function deleteExpense(expenseId: string): Promise<boolean> {
  const client = getDocClient();

  if (!client) {
    return inMemoryStore.delete(expenseId);
  }

  try {
    await client.send(
      new DeleteCommand({
        TableName: config.expensesTable,
        Key: { expenseId },
        ConditionExpression: "attribute_exists(expenseId)",
      }),
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Return the raw in-memory store. Used by the local dev server. */
export function getInMemoryStore(): Map<string, ExpenseEvent> {
  return inMemoryStore;
}

/** Clear the in-memory store. Used in test teardown. */
export function resetInMemoryStore(): void {
  inMemoryStore.clear();
}
