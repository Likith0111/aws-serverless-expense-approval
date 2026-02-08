/**
 * DynamoDB utility module for expense data persistence.
 *
 * Transparently supports three runtime modes:
 *  1. AWS deployment (default)  -- real DynamoDB via AWS SDK v3.
 *  2. DynamoDB Local             -- Docker-based local DynamoDB.
 *  3. In-memory fallback         -- plain Map<string, ExpenseEvent>.
 *
 * The DynamoDB Document Client is lazily initialized and reused
 * across invocations within the same Lambda container.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ExpenseEvent } from "../models/expense";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let docClient: DynamoDBDocumentClient | null = null;
const inMemoryStore = new Map<string, ExpenseEvent>();

// ---------------------------------------------------------------------------
// Client accessor
// ---------------------------------------------------------------------------

function getDocClient(): DynamoDBDocumentClient | null {
  if (process.env.USE_IN_MEMORY === "true") {
    return null; // Signal to use in-memory store
  }

  if (!docClient) {
    const clientConfig: Record<string, unknown> = {};

    if (process.env.DYNAMODB_ENDPOINT) {
      clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
      clientConfig.region = process.env.AWS_REGION ?? "us-east-1";
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
 * Persist a completed expense decision.
 *
 * In production this writes to DynamoDB; locally it stores
 * the record in an in-memory Map.
 */
export async function storeExpenseDecision(
  record: ExpenseEvent,
): Promise<void> {
  const client = getDocClient();

  if (!client) {
    inMemoryStore.set(record.expenseId, { ...record });
    console.log(`Stored expense ${record.expenseId} in memory`);
    return;
  }

  const tableName = process.env.EXPENSES_TABLE ?? "ExpenseApprovals";

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: record as unknown as Record<string, unknown>,
    }),
  );

  console.log(`Stored expense decision: ${record.expenseId}`);
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

  const tableName = process.env.EXPENSES_TABLE ?? "ExpenseApprovals";

  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { expenseId },
    }),
  );

  return (result.Item as ExpenseEvent) ?? null;
}

/**
 * Query all expenses for an employee via the GSI.
 */
export async function getExpensesByEmployee(
  employeeId: string,
): Promise<ExpenseEvent[]> {
  const client = getDocClient();

  if (!client) {
    return [...inMemoryStore.values()].filter(
      (e) => e.employeeId === employeeId,
    );
  }

  const tableName = process.env.EXPENSES_TABLE ?? "ExpenseApprovals";

  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "EmployeeIndex",
      KeyConditionExpression: "employeeId = :eid",
      ExpressionAttributeValues: { ":eid": employeeId },
    }),
  );

  return (result.Items as ExpenseEvent[]) ?? [];
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
