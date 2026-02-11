/**
 * DynamoDB utility for Users table.
 *
 * Manages user authentication data in DynamoDB:
 *   - User registration (password hashing)
 *   - User lookup by email (GSI)
 *   - User lookup by userId (PK)
 *
 * Supports both DynamoDB Local and in-memory fallback.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("UsersDynamoDB");

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let docClient: DynamoDBDocumentClient | null = null;
const inMemoryUsers = new Map<string, UserRecord>();

interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  role: "EMPLOYEE" | "MANAGER";
  employeeId?: string;
  createdAt: string;
}

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
 * Create a new user record.
 */
export async function createUser(user: UserRecord): Promise<void> {
  const client = getDocClient();

  if (!client) {
    if (inMemoryUsers.has(user.userId)) {
      throw new Error("User already exists");
    }
    inMemoryUsers.set(user.userId, { ...user });
    log.info("Created user in memory", { userId: user.userId, email: user.email });
    return;
  }

  try {
    await client.send(
      new PutCommand({
        TableName: config.usersTable,
        Item: user,
        ConditionExpression: "attribute_not_exists(userId)",
      }),
    );
    log.info("Created user in DynamoDB", { userId: user.userId, email: user.email });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === "ConditionalCheckFailedException"
    ) {
      throw new Error("User already exists");
    }
    throw err;
  }
}

/**
 * Get user by userId (primary key).
 */
export async function getUserById(userId: string): Promise<UserRecord | null> {
  const client = getDocClient();

  if (!client) {
    return inMemoryUsers.get(userId) ?? null;
  }

  const result = await client.send(
    new GetCommand({
      TableName: config.usersTable,
      Key: { userId },
    }),
  );

  return (result.Item as UserRecord) ?? null;
}

/**
 * Get user by email (GSI query).
 */
export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const client = getDocClient();

  if (!client) {
    for (const user of inMemoryUsers.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  const result = await client.send(
    new QueryCommand({
      TableName: config.usersTable,
      IndexName: config.emailIndexName,
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email.toLowerCase() },
      Limit: 1,
    }),
  );

  return (result.Items?.[0] as UserRecord) ?? null;
}

/**
 * Check if email already exists.
 */
export async function emailExists(email: string): Promise<boolean> {
  const user = await getUserByEmail(email);
  return user !== null;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetInMemoryUsers(): void {
  inMemoryUsers.clear();
}

export function getInMemoryUsers(): Map<string, UserRecord> {
  return inMemoryUsers;
}
